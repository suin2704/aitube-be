/**
 * AI 요약 일괄 생성 스크립트
 * Gemini API로 모든 영상의 요약을 생성합니다.
 * 
 * 사용법: npx tsx scripts/generate-ai-summaries.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateSummary } from "../src/services/summaryService";
import { getTranscript } from "../src/services/transcriptService";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🤖 AI 요약 일괄 생성 시작...\n");

  const videos = await prisma.video.findMany({
    include: { channel: true, category: true, summary: true },
    orderBy: { id: "asc" },
  });

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const video of videos) {
    // 이미 AI 요약이 있으면 건너뜀 (template-v1이 아닌 경우)
    if (video.summary && video.summary.modelUsed && video.summary.modelUsed !== "template-v1") {
      console.log(`⏭️  ${video.title.slice(0, 50)} — 이미 AI 요약 있음`);
      skipped++;
      continue;
    }

    try {
      console.log(`📝 [${video.id}] ${video.title.slice(0, 50)}...`);

      // 1. 자막 추출
      const transcript = await getTranscript(video.youtubeId, video.description || undefined);
      console.log(`   자막: ${transcript.source} (${transcript.text.length}자)`);

      // 2. AI 요약 생성
      const result = await generateSummary(
        video.title,
        video.description || "",
        transcript.text || undefined,
      );

      // 3. DB 저장
      await prisma.videoSummary.upsert({
        where: { videoId: video.id },
        update: {
          summary: result.summary,
          keyPoints: result.keyPoints,
          keywords: result.keywords,
          difficulty: result.difficulty,
          estimatedTime: result.estimatedTime,
          aiCategory: result.aiCategory,
          modelUsed: "gemini-2.0-flash",
        },
        create: {
          videoId: video.id,
          summary: result.summary,
          keyPoints: result.keyPoints,
          keywords: result.keywords,
          difficulty: result.difficulty,
          estimatedTime: result.estimatedTime,
          aiCategory: result.aiCategory,
          modelUsed: "gemini-2.0-flash",
        },
      });

      console.log(`   ✅ 요약 완료: ${result.summary.slice(0, 60)}...`);
      success++;

      // API 속도 제한 방지 (1초 대기)
      await new Promise(r => setTimeout(r, 1000));
    } catch (err: any) {
      console.error(`   ❌ 실패: ${err.message}`);
      failed++;

      // 429 에러 시 대기
      if (err.message?.includes("429") || err.message?.includes("quota")) {
        console.log("   ⏳ API 할당량 초과, 30초 대기...");
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`✅ 완료: 성공 ${success}개, 건너뜀 ${skipped}개, 실패 ${failed}개`);
  console.log("=".repeat(50));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
