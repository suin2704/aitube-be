/**
 * 실패/누락 한국어 채널 보충 수집
 * - 핸들 오류로 실패한 채널 재시도 (검색 기반)
 * - 우아한테크 등 추가 채널
 * 
 * 사용법: npx tsx scripts/supplement-korean.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const API_BASE = "https://www.googleapis.com/youtube/v3";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

// 채널명으로 검색해서 추가 (핸들 대신 이름 검색)
const CHANNELS_BY_NAME = [
  { searchQuery: "우아한테크", slug: "ai-trend", difficulty: "intermediate" },
  { searchQuery: "AI 프렌즈 AI Friends", slug: "ai-trend", difficulty: "advanced" },
  { searchQuery: "딥러닝 호형", slug: "ai-learning", difficulty: "intermediate" },
  { searchQuery: "네이버 D2", slug: "ai-learning", difficulty: "advanced" },
  { searchQuery: "캐치파이브 AI", slug: "ai-trend", difficulty: "beginner" },
  { searchQuery: "코딩애플", slug: "ai-usage", difficulty: "beginner" },
  { searchQuery: "생활코딩", slug: "ai-learning", difficulty: "beginner" },
  { searchQuery: "나도코딩", slug: "ai-usage", difficulty: "beginner" },
];

interface YTSearchItem {
  id: { videoId: string };
  snippet: { title: string; description: string; channelId: string; channelTitle: string; publishedAt: string };
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
  return parseInt(match[1] || "0") * 3600 + parseInt(match[2] || "0") * 60 + parseInt(match[3] || "0");
}

async function ytFetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set("key", YOUTUBE_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function main() {
  console.log("🔄 보충 한국어 채널 수집 시작...\n");

  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map(c => [c.slug, c.id]));
  let totalNew = 0;

  for (const ch of CHANNELS_BY_NAME) {
    try {
      // 1. 채널명으로 검색
      const searchResult = await ytFetch<{ items: Array<{ snippet: { channelId: string; channelTitle: string } }> }>("search", {
        part: "snippet",
        q: ch.searchQuery,
        type: "channel",
        maxResults: "1",
        regionCode: "KR",
      });

      if (!searchResult.items?.length) {
        console.log(`  ❌ "${ch.searchQuery}" — 채널 검색 실패`);
        continue;
      }

      const channelId = searchResult.items[0].snippet.channelId;

      // 이미 있는 채널인지 확인
      const existing = await prisma.channel.findUnique({ where: { youtubeId: channelId } });
      if (existing) {
        const vCount = await prisma.video.count({ where: { channelId: existing.id } });
        if (vCount >= 3) {
          console.log(`✅ ${searchResult.items[0].snippet.channelTitle} — 이미 ${vCount}개 영상, 건너뜀`);
          continue;
        }
      }

      // 2. 채널 상세 정보
      const chData = await ytFetch<{ items: YTChannelDetail[] }>("channels", {
        part: "snippet,statistics",
        id: channelId,
      });
      const chDetail = chData.items?.[0];
      if (!chDetail) continue;

      console.log(`📺 ${chDetail.snippet.title} 수집 중...`);

      // 3. 채널 저장
      const dbChannel = await prisma.channel.upsert({
        where: { youtubeId: channelId },
        update: { name: chDetail.snippet.title },
        create: {
          youtubeId: channelId,
          name: chDetail.snippet.title,
          description: chDetail.snippet.description?.slice(0, 500),
          thumbnailUrl: chDetail.snippet.thumbnails.default.url,
          subscriberCount: parseInt(chDetail.statistics.subscriberCount || "0"),
          language: "ko",
          defaultCategoryId: catMap.get(ch.slug)!,
        },
      });

      // 4. AI 관련 영상 검색
      const videoSearch = await ytFetch<{ items: YTSearchItem[] }>("search", {
        part: "snippet",
        channelId: channelId,
        type: "video",
        order: "date",
        maxResults: "5",
        q: "AI OR 인공지능 OR GPT OR LLM OR 딥러닝 OR ChatGPT OR 코파일럿 OR 클로드 OR 제미나이 OR Gemini OR 생성형 OR 프롬프트 OR 머신러닝",
      });
      let items = videoSearch.items || [];

      if (!items.length) {
        // 최신 영상으로 대체
        const fallback = await ytFetch<{ items: YTSearchItem[] }>("search", {
          part: "snippet",
          channelId: channelId,
          type: "video",
          order: "date",
          maxResults: "3",
        });
        items = fallback.items || [];
      }

      const videoIds = items.map(v => v.id.videoId).filter(Boolean);
      if (!videoIds.length) {
        console.log(`  ⚠️ 영상 없음`);
        continue;
      }

      // 5. 상세 정보
      const detailData = await ytFetch<{ items: YTVideoDetail[] }>("videos", {
        part: "contentDetails,statistics",
        id: videoIds.join(","),
      });
      const detailMap = new Map((detailData.items || []).map(d => [d.id, d]));

      // 6. 저장
      let count = 0;
      for (const item of items) {
        const detail = detailMap.get(item.id.videoId);
        if (!detail) continue;
        const duration = parseDuration(detail.contentDetails.duration);
        if (duration < 60 || duration > 7200) continue;

        try {
          const video = await prisma.video.create({
            data: {
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
              language: "ko",
              difficulty: ch.difficulty,
              tags: ["AI"],
              isFeatured: count === 0,
            },
          });

          // 요약도 함께 생성
          await prisma.videoSummary.create({
            data: {
              videoId: video.id,
              summary: `## 영상 개요\n\n**${item.snippet.title}**\n\n${chDetail.snippet.title} 채널의 영상입니다.\n\n## 주요 내용\n\n- AI 기술 및 트렌드 설명\n- 실무 활용 사례와 팁\n\n> AI가 생성한 상세 요약은 곧 업데이트됩니다.`,
              keyPoints: ["AI 관련 핵심 내용", "최신 트렌드 소개", "실무 활용 관점"],
              modelUsed: "template-v1",
            },
          });

          count++;
          console.log(`  ✅ ${item.snippet.title.slice(0, 60)}...`);
        } catch (e: any) {
          if (e.code === "P2002") continue;
          throw e;
        }
      }
      totalNew += count;
      console.log(`  → ${count}개 저장\n`);
    } catch (err: any) {
      console.error(`  ❌ "${ch.searchQuery}" 오류: ${err.message}`);
    }
  }

  // 최종 결과
  const totalVideos = await prisma.video.count();
  const totalChannels = await prisma.channel.count();
  console.log("\n" + "=".repeat(50));
  console.log(`✅ 보충 완료! 새로 ${totalNew}개 추가`);
  console.log(`📺 총 채널: ${totalChannels}개`);
  console.log(`🎬 총 영상: ${totalVideos}개 (전체 한국어)`);
  console.log("=".repeat(50));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
