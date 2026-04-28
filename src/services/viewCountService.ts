/**
 * 조회수/좋아요 업데이트 서비스
 * - 활성 영상의 YouTube 조회수/좋아요를 최신값으로 갱신
 * - 50개씩 배치 처리 (YouTube API는 id 파라미터 최대 50개)
 */
import { prisma } from "../lib/prisma";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const API_BASE = "https://www.googleapis.com/youtube/v3";
const BATCH_SIZE = 50;

interface YTVideoStats {
  id: string;
  statistics: {
    viewCount: string;
    likeCount?: string;
  };
}

export async function runViewCountUpdate(): Promise<{
  updated: number;
  errors: string[];
}> {
  const videos = await prisma.video.findMany({
    where: { isActive: true },
    select: { id: true, youtubeId: true },
    orderBy: { updatedAt: "asc" },
    take: 200, // 최대 200개 (API 호출 4회)
  });

  if (!videos.length) {
    return { updated: 0, errors: [] };
  }

  let updated = 0;
  const errors: string[] = [];

  // 50개씩 배치 처리
  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batch = videos.slice(i, i + BATCH_SIZE);
    const ids = batch.map((v) => v.youtubeId).join(",");

    try {
      const url = new URL(`${API_BASE}/videos`);
      url.searchParams.set("key", YOUTUBE_API_KEY);
      url.searchParams.set("part", "statistics");
      url.searchParams.set("id", ids);

      const res = await fetch(url.toString());
      if (!res.ok) {
        errors.push(`YouTube API ${res.status}`);
        continue;
      }

      const data = (await res.json()) as { items?: YTVideoStats[] };
      const statsMap = new Map(
        (data.items || []).map((item) => [item.id, item.statistics])
      );

      for (const video of batch) {
        const stats = statsMap.get(video.youtubeId);
        if (!stats) continue;

        await prisma.video.update({
          where: { id: video.id },
          data: {
            viewCount: parseInt(stats.viewCount || "0"),
            likeCount: parseInt(stats.likeCount || "0"),
          },
        });
        updated++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      console.error(`❌ 조회수 업데이트 실패: ${msg}`);
    }
  }

  return { updated, errors };
}
