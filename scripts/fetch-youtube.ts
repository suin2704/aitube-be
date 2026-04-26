/**
 * YouTube Data API v3로 실제 AI 관련 영상을 수집하여 DB에 저장
 *
 * 사용법: npx tsx scripts/fetch-youtube.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const API_BASE = "https://www.googleapis.com/youtube/v3";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

// 수집할 채널 목록 (채널ID, 기본 카테고리, 난이도)
const TARGET_CHANNELS = [
  // 🔥 AI 트렌드
  { youtubeId: "UCUehqvOOaI7cL4Ccoqg0k3Q", slug: "ai-trend", difficulty: "beginner", lang: "ko" },   // 노마드 코더
  { youtubeId: "UCUpJs89fSBXNolQGOYKn0YQ", slug: "ai-trend", difficulty: "beginner", lang: "ko" },   // 안될공학
  { youtubeId: "UC9PB9nKYqKEx_N3KM-JVTpg", slug: "ai-trend", difficulty: "intermediate", lang: "en" }, // Two Minute Papers
  // 🔧 AI 활용
  { youtubeId: "UCmyxyV6hON0n5OMG5oFUfZQ", slug: "ai-usage", difficulty: "beginner", lang: "ko" },   // 조코딩
  { youtubeId: "UCFbNIlppjAuEX4znoulh0Cw", slug: "ai-usage", difficulty: "intermediate", lang: "en" }, // Web Dev Simplified
  { youtubeId: "UCLkAepWjdylmXSltofFvsYQ", slug: "ai-usage", difficulty: "intermediate", lang: "en" }, // CNET
  // 📚 AI 학습
  { youtubeId: "UCWN3xxRkmTPphYnPVCprXKw", slug: "ai-learning", difficulty: "intermediate", lang: "ko" }, // 테디노트
  { youtubeId: "UCYO_jab_esuFRV4b17AJtAw", slug: "ai-learning", difficulty: "beginner", lang: "en" },    // 3Blue1Brown
  { youtubeId: "UCbfYPyITQ-7l4upoX8nvctg", slug: "ai-learning", difficulty: "advanced", lang: "en" },    // Two Minute Papers (alt: Yannic Kilcher)
];

interface YTSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: { high: { url: string } };
  };
}

interface YTVideoDetail {
  id: string;
  contentDetails: { duration: string };
  statistics: { viewCount: string; likeCount?: string };
}

interface YTChannelDetail {
  id: string;
  snippet: { title: string; description: string; thumbnails: { default: { url: string } } };
  statistics: { subscriberCount: string };
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  return h * 3600 + m * 60 + s;
}

async function ytFetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set("key", YOUTUBE_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function fetchChannelDetails(channelId: string): Promise<YTChannelDetail | null> {
  const data = await ytFetch<{ items: YTChannelDetail[] }>("channels", {
    part: "snippet,statistics",
    id: channelId,
  });
  return data.items?.[0] ?? null;
}

async function searchVideos(channelId: string, maxResults = 5): Promise<YTSearchItem[]> {
  const data = await ytFetch<{ items: YTSearchItem[] }>("search", {
    part: "snippet",
    channelId,
    type: "video",
    order: "date",
    maxResults: String(maxResults),
    q: "AI OR 인공지능 OR GPT OR LLM OR 딥러닝 OR machine learning",
  });
  return data.items || [];
}

async function getVideoDetails(videoIds: string[]): Promise<YTVideoDetail[]> {
  if (videoIds.length === 0) return [];
  const data = await ytFetch<{ items: YTVideoDetail[] }>("videos", {
    part: "contentDetails,statistics",
    id: videoIds.join(","),
  });
  return data.items || [];
}

async function main() {
  console.log("🎬 YouTube 영상 수집 시작...\n");

  // 카테고리 가져오기
  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map((c) => [c.slug, c.id]));

  // 기존 시드 데이터 삭제
  await prisma.video.deleteMany({ where: { youtubeId: { startsWith: "seed_" } } });

  let totalImported = 0;

  for (const ch of TARGET_CHANNELS) {
    try {
      // 1. 채널 정보 가져오기
      const chDetail = await fetchChannelDetails(ch.youtubeId);
      if (!chDetail) {
        console.log(`  ⚠️ 채널 ${ch.youtubeId} 정보를 가져올 수 없음, 건너뜀`);
        continue;
      }

      console.log(`📺 ${chDetail.snippet.title} (${ch.slug})`);

      // 2. 채널 DB 저장/업데이트
      const dbChannel = await prisma.channel.upsert({
        where: { youtubeId: ch.youtubeId },
        update: {
          name: chDetail.snippet.title,
          description: chDetail.snippet.description?.slice(0, 500),
          thumbnailUrl: chDetail.snippet.thumbnails.default.url,
          subscriberCount: parseInt(chDetail.statistics.subscriberCount || "0"),
        },
        create: {
          youtubeId: ch.youtubeId,
          name: chDetail.snippet.title,
          description: chDetail.snippet.description?.slice(0, 500),
          thumbnailUrl: chDetail.snippet.thumbnails.default.url,
          subscriberCount: parseInt(chDetail.statistics.subscriberCount || "0"),
          language: ch.lang,
          defaultCategoryId: catMap.get(ch.slug)!,
        },
      });

      // 3. 최근 영상 검색
      const searchResults = await searchVideos(ch.youtubeId, 5);
      const videoIds = searchResults.map((v) => v.id.videoId);

      // 4. 영상 상세 정보
      const details = await getVideoDetails(videoIds);
      const detailMap = new Map(details.map((d) => [d.id, d]));

      // 5. DB에 저장
      for (const item of searchResults) {
        const detail = detailMap.get(item.id.videoId);
        if (!detail) continue;

        const duration = parseDuration(detail.contentDetails.duration);
        if (duration < 60) continue; // 1분 미만 shorts 제외

        try {
          await prisma.video.upsert({
            where: { youtubeId: item.id.videoId },
            update: {
              title: item.snippet.title,
              viewCount: parseInt(detail.statistics.viewCount || "0"),
              likeCount: parseInt(detail.statistics.likeCount || "0"),
            },
            create: {
              youtubeId: item.id.videoId,
              channelId: dbChannel.id,
              categoryId: catMap.get(ch.slug)!,
              title: item.snippet.title,
              description: item.snippet.description?.slice(0, 1000),
              thumbnailUrl: `https://img.youtube.com/vi/${item.id.videoId}/maxresdefault.jpg`,
              duration,
              viewCount: parseInt(detail.statistics.viewCount || "0"),
              likeCount: parseInt(detail.statistics.likeCount || "0"),
              publishedAt: new Date(item.snippet.publishedAt),
              language: ch.lang,
              difficulty: ch.difficulty,
              tags: [],
              isFeatured: false,
            },
          });
          totalImported++;
          console.log(`  ✅ ${item.snippet.title.slice(0, 50)}...`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ⚠️ 중복 또는 오류: ${msg.slice(0, 80)}`);
        }
      }

      // API rate limit 방지
      await new Promise((r) => setTimeout(r, 500));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ❌ 채널 ${ch.youtubeId} 처리 실패: ${msg.slice(0, 100)}`);
    }
  }

  // 인기 영상 중 상위 4개를 featured로 설정
  const topVideos = await prisma.video.findMany({
    where: { youtubeId: { not: { startsWith: "seed_" } } },
    orderBy: { viewCount: "desc" },
    take: 4,
  });
  for (const v of topVideos) {
    await prisma.video.update({ where: { id: v.id }, data: { isFeatured: true } });
  }

  console.log(`\n✅ 수집 완료: 총 ${totalImported}개 영상 저장됨`);
  console.log(`⭐ 상위 ${topVideos.length}개 영상 추천 설정`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
