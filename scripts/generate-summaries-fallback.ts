/**
 * Gemini API 할당량 소진 시 템플릿 기반으로 요약 생성
 * Gemini가 다시 사용 가능해지면 generate-summaries.ts로 AI 요약으로 교체
 *
 * 사용법: npx tsx scripts/generate-summaries-fallback.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

function generateTemplateSummary(
  title: string,
  description: string,
  channelTitle: string
) {
  // 제목에서 키워드 추출
  const allText = `${title} ${description}`.toLowerCase();
  const keywordMap: Record<string, string[]> = {
    AI: ["AI", "인공지능", "artificial intelligence"],
    "머신러닝": ["machine learning", "머신러닝", "ML"],
    "딥러닝": ["deep learning", "딥러닝", "neural"],
    GPT: ["gpt", "chatgpt", "openai"],
    LLM: ["llm", "large language model", "언어모델"],
    코딩: ["coding", "코딩", "programming", "개발"],
    NVIDIA: ["nvidia", "엔비디아", "gpu"],
    Google: ["google", "구글", "deepmind", "gemini"],
    수학: ["math", "수학", "theorem", "transform", "laplace"],
    웹개발: ["web dev", "typescript", "npm", "react", "tanstack"],
    MCP: ["mcp"],
    "컴퓨터 비전": ["image", "vision", "computer use", "딥페이크"],
    "과학": ["science", "scientific", "연구"],
  };

  const detectedKeywords: string[] = [];
  for (const [keyword, patterns] of Object.entries(keywordMap)) {
    if (patterns.some((p) => allText.includes(p.toLowerCase()))) {
      detectedKeywords.push(keyword);
    }
  }
  if (detectedKeywords.length === 0) detectedKeywords.push("기술", "트렌드");

  const keywords = detectedKeywords.slice(0, 5);

  // 간단한 요약 생성
  const cleanTitle = title
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  const summary = `${channelTitle} 채널에서 제공하는 "${cleanTitle}" 영상입니다. ${
    keywords.includes("AI") || keywords.includes("GPT") || keywords.includes("LLM")
      ? "최신 AI 기술 동향과 활용 방법에 대해 다루고 있습니다."
      : keywords.includes("수학")
      ? "수학적 개념과 원리를 시각적으로 설명하는 교육 콘텐츠입니다."
      : keywords.includes("웹개발") || keywords.includes("코딩")
      ? "프로그래밍과 개발 관련 실용적인 내용을 다루고 있습니다."
      : "기술 트렌드와 관련된 유익한 콘텐츠입니다."
  } AI와 기술에 관심있는 분들에게 추천합니다.`;

  const keyPoints = [
    `${cleanTitle.slice(0, 30)}에 대한 핵심 내용을 다룹니다`,
    `${channelTitle}의 전문적인 관점에서 설명합니다`,
    `${keywords[0]} 관련 최신 동향을 파악할 수 있습니다`,
  ];

  return { summary, keyPoints, keywords };
}

async function main() {
  console.log("📝 템플릿 기반 요약 생성 시작...\n");

  const videos = await prisma.video.findMany({
    where: {
      summary: null,
      youtubeId: { not: { startsWith: "seed_" } },
    },
    include: { channel: true },
    orderBy: { viewCount: "desc" },
  });

  if (videos.length === 0) {
    console.log("✅ 요약할 영상이 없습니다.");
    await prisma.$disconnect();
    return;
  }

  console.log(`📝 ${videos.length}개 영상 요약 생성\n`);

  let success = 0;

  for (const video of videos) {
    try {
      const result = generateTemplateSummary(
        video.title,
        video.description || "",
        video.channel.name
      );

      await prisma.videoSummary.upsert({
        where: { videoId: video.id },
        update: {
          summary: result.summary,
          keyPoints: result.keyPoints,
          keywords: result.keywords,
          modelUsed: "template-v1",
          status: "completed",
        },
        create: {
          videoId: video.id,
          summary: result.summary,
          keyPoints: result.keyPoints,
          keywords: result.keywords,
          modelUsed: "template-v1",
          status: "completed",
        },
      });

      await prisma.video.update({
        where: { id: video.id },
        data: { tags: result.keywords },
      });

      success++;
      console.log(`  ✅ ${video.title.slice(0, 50)}...`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ❌ ${video.title.slice(0, 30)}: ${msg.slice(0, 80)}`);
    }
  }

  console.log(`\n✅ 완료: ${success}/${videos.length}개 요약 생성`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
