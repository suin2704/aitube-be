/**
 * AI 요약 자동 생성 서비스
 * - template-v1 요약만 있는 영상에 대해 Gemini AI 요약 생성
 * - 분당 15회 제한을 고려하여 딜레이 적용
 */
import { prisma } from "../lib/prisma";
import { generateSummary } from "./summaryService";
import { getTranscript } from "./transcriptService";

const BATCH_SIZE = 10;
const DELAY_MS = 5000; // 5초 딜레이 (분당 12회)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAutoSummary(): Promise<{
  processed: number;
  success: number;
  failed: number;
  errors: string[];
}> {
  // template-v1 요약만 있는 활성 영상 조회
  const videos = await prisma.video.findMany({
    where: {
      isActive: true,
      summary: {
        modelUsed: "template-v1",
      },
    },
    include: {
      channel: true,
      category: true,
      summary: true,
    },
    take: BATCH_SIZE,
    orderBy: { createdAt: "desc" },
  });

  if (!videos.length) {
    return { processed: 0, success: 0, failed: 0, errors: [] };
  }

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const video of videos) {
    try {
      // 자막 가져오기
      let transcript: string | undefined;
      try {
        const result = await getTranscript(video.youtubeId, video.description || undefined);
        if (result.source !== "none") {
          transcript = result.text;
        }
      } catch {
        // 자막 없으면 제목+설명으로 진행
      }

      const result = await generateSummary(
        video.title,
        video.description || "",
        transcript
      );

      // 기존 template 요약을 AI 요약으로 업데이트
      await prisma.videoSummary.update({
        where: { videoId: video.id },
        data: {
          summary: result.summary,
          keyPoints: result.keyPoints,
          keywords: result.keywords,
          modelUsed: "gemini-2.0-flash",
        },
      });

      // 영상의 난이도/카테고리도 AI 결과로 업데이트
      const categoryMap: Record<string, number> = {
        "ai-usage": 1,
        "ai-learning": 2,
        "ai-trend": 3,
      };

      await prisma.video.update({
        where: { id: video.id },
        data: {
          difficulty: result.difficulty,
          aiCategory: result.aiCategory,
          categoryId: categoryMap[result.aiCategory] || video.categoryId,
        },
      });

      success++;
      console.log(`  🤖 AI 요약 완료: ${video.title.slice(0, 40)}...`);

      // Rate limit 딜레이
      await sleep(DELAY_MS);
    } catch (err) {
      failed++;
      const msg = `${video.title.slice(0, 30)}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error(`  ❌ AI 요약 실패: ${msg}`);

      // 429 에러면 중단
      if (err instanceof Error && err.message.includes("429")) {
        console.warn("  ⚠️ Gemini 할당량 초과 — 자동 요약 중단");
        break;
      }

      await sleep(DELAY_MS);
    }
  }

  return { processed: videos.length, success, failed, errors };
}
