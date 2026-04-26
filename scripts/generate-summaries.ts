/**
 * Gemini API로 YouTube 영상의 AI 요약을 생성하여 DB에 저장
 *
 * 사용법: npx tsx scripts/generate-summaries.ts
 */
import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function generateSummary(title: string, description: string): Promise<{
  summary: string;
  keyPoints: string[];
  keywords: string[];
}> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `당신은 AI 교육 콘텐츠 전문 큐레이터입니다. 아래 YouTube 영상 정보를 보고 한국어로 요약해주세요.

제목: ${title}
설명: ${description || "(설명 없음)"}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이 순수 JSON만):
{
  "summary": "3-4문장으로 된 핵심 요약 (한국어)",
  "keyPoints": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "keywords": ["키워드1", "키워드2", "키워드3"]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // JSON 블록 추출 (```json ... ``` 감싸진 경우 처리)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Invalid Gemini response: ${text.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]);
}

async function main() {
  console.log("🤖 AI 요약 생성 시작...\n");

  // 요약이 없는 영상 가져오기
  const videos = await prisma.video.findMany({
    where: {
      summary: null,
      youtubeId: { not: { startsWith: "seed_" } },
    },
    orderBy: { viewCount: "desc" },
    take: 30,
  });

  if (videos.length === 0) {
    console.log("✅ 요약할 영상이 없습니다.");
    await prisma.$disconnect();
    return;
  }

  console.log(`📝 ${videos.length}개 영상 요약 생성 예정\n`);

  let success = 0;
  let failed = 0;

  for (const video of videos) {
    try {
      console.log(`🔄 ${video.title.slice(0, 50)}...`);

      const result = await generateSummary(video.title, video.description || "");

      await prisma.videoSummary.upsert({
        where: { videoId: video.id },
        update: {
          summary: result.summary,
          keyPoints: result.keyPoints,
          keywords: result.keywords,
          modelUsed: "gemini-2.0-flash",
          status: "completed",
        },
        create: {
          videoId: video.id,
          summary: result.summary,
          keyPoints: result.keyPoints,
          keywords: result.keywords,
          modelUsed: "gemini-2.0-flash",
          status: "completed",
        },
      });

      // 키워드를 영상 tags에도 저장
      await prisma.video.update({
        where: { id: video.id },
        data: { tags: result.keywords },
      });

      success++;
      console.log(`  ✅ 완료: ${result.summary.slice(0, 60)}...`);

      // Gemini rate limit 방지 (분당 15회 제한)
      await new Promise((r) => setTimeout(r, 4500));
    } catch (e: unknown) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ❌ 실패: ${msg.slice(0, 100)}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`\n✅ AI 요약 완료: 성공 ${success}개, 실패 ${failed}개`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
