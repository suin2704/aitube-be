/**
 * 자동 크롤링 서비스
 * - 등록된 활성 채널에서 새 영상을 주기적으로 수집
 * - 이미 DB에 있는 영상(youtubeId)은 건너뜀
 * - 채널별 lastFetchedAt 갱신
 */
import { prisma } from "../lib/prisma";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const API_BASE = "https://www.googleapis.com/youtube/v3";

const AI_KEYWORDS =
  "AI OR 인공지능 OR GPT OR LLM OR 딥러닝 OR ChatGPT OR 코파일럿 OR 클로드 OR 제미나이 OR Gemini OR 생성형 OR 프롬프트";

interface YTSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
  };
}

interface YTVideoDetail {
  id: string;
  contentDetails: { duration: string };
  statistics: { viewCount: string; likeCount?: string };
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (
    parseInt(match[1] || "0") * 3600 +
    parseInt(match[2] || "0") * 60 +
    parseInt(match[3] || "0")
  );
}

async function ytFetch<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<T> {
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set("key", YOUTUBE_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/**
 * 단일 채널에서 새 영상 수집
 */
async function crawlChannel(channel: {
  id: number;
  youtubeId: string;
  name: string;
  defaultCategoryId: number | null;
  language: string;
  lastFetchedAt: Date | null;
}): Promise<number> {
  // publishedAfter: lastFetchedAt 이후만 검색 (없으면 30일 전부터)
  const after = channel.lastFetchedAt
    ? channel.lastFetchedAt.toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const searchData = await ytFetch<{ items?: YTSearchItem[] }>("search", {
    part: "snippet",
    channelId: channel.youtubeId,
    type: "video",
    order: "date",
    maxResults: "10",
    q: AI_KEYWORDS,
    publishedAfter: after,
  });

  const items = searchData.items || [];
  if (!items.length) return 0;

  // DB에 이미 있는 youtubeId 확인
  const videoIds = items.map((v) => v.id.videoId).filter(Boolean);
  const existing = await prisma.video.findMany({
    where: { youtubeId: { in: videoIds } },
    select: { youtubeId: true },
  });
  const existingSet = new Set(existing.map((e) => e.youtubeId));

  const newItems = items.filter((i) => !existingSet.has(i.id.videoId));
  if (!newItems.length) return 0;

  // 상세 정보 조회
  const newIds = newItems.map((i) => i.id.videoId);
  const detailData = await ytFetch<{ items?: YTVideoDetail[] }>("videos", {
    part: "contentDetails,statistics",
    id: newIds.join(","),
  });
  const detailMap = new Map(
    (detailData.items || []).map((d) => [d.id, d])
  );

  const categoryId = channel.defaultCategoryId || 1;
  let added = 0;

  for (const item of newItems) {
    const detail = detailMap.get(item.id.videoId);
    if (!detail) continue;

    const duration = parseDuration(detail.contentDetails.duration);
    // 1분~2시간 사이만
    if (duration < 60 || duration > 7200) continue;

    try {
      await prisma.video.create({
        data: {
          youtubeId: item.id.videoId,
          channelId: channel.id,
          categoryId,
          title: item.snippet.title,
          description: item.snippet.description?.slice(0, 1000) || null,
          thumbnailUrl: `https://img.youtube.com/vi/${item.id.videoId}/maxresdefault.jpg`,
          duration,
          viewCount: parseInt(detail.statistics.viewCount || "0"),
          likeCount: parseInt(detail.statistics.likeCount || "0"),
          publishedAt: new Date(item.snippet.publishedAt),
          language: channel.language || "ko",
          difficulty: "beginner",
          tags: ["AI"],
          isFeatured: false,
        },
      });
      added++;
    } catch (e: unknown) {
      // P2002 = unique constraint (중복) → 무시
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") continue;
      console.error(`  영상 저장 실패 (${item.id.videoId}):`, e);
    }
  }

  // 템플릿 요약 생성
  if (added > 0) {
    const newVideos = await prisma.video.findMany({
      where: { youtubeId: { in: newIds } },
      include: { channel: true, category: true },
    });
    for (const video of newVideos) {
      const hasSummary = await prisma.videoSummary.findUnique({
        where: { videoId: video.id },
      });
      if (hasSummary) continue;

      await prisma.videoSummary.create({
        data: {
          videoId: video.id,
          summary: `**${video.title}**\n\n${video.channel.name} 채널의 ${video.category.name} 영상입니다.\n\n> 💡 AI 상세 요약은 곧 업데이트됩니다.`,
          keyPoints: [
            "AI 관련 핵심 내용",
            "최신 트렌드 소개",
            "실무 활용 관점",
          ],
          modelUsed: "template-v1",
        },
      });
    }
  }

  return added;
}

/**
 * 전체 활성 채널 크롤링 실행
 */
export async function runCrawl(): Promise<{
  channelsProcessed: number;
  newVideos: number;
  errors: string[];
}> {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    orderBy: { lastFetchedAt: { sort: "asc", nulls: "first" } },
  });

  let totalNew = 0;
  const errors: string[] = [];

  for (const channel of channels) {
    try {
      const added = await crawlChannel(channel);
      totalNew += added;

      // lastFetchedAt 갱신
      await prisma.channel.update({
        where: { id: channel.id },
        data: { lastFetchedAt: new Date() },
      });

      if (added > 0) {
        console.log(`✅ ${channel.name}: ${added}개 새 영상`);
      } else {
        console.log(`⏭️  ${channel.name}: 새 영상 없음`);
      }
    } catch (err: unknown) {
      const msg = `${channel.name}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error(`❌ ${msg}`);
    }
  }

  return {
    channelsProcessed: channels.length,
    newVideos: totalNew,
    errors,
  };
}
