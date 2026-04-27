/**
 * 한국어 추천 채널만으로 영상 DB 재구축
 * - 기존 영어 채널/영상 전체 삭제
 * - 기존 한국어 영상도 삭제 (깨끗하게 재수집)
 * - PRD 추천 한국어 15개 채널에서 AI 관련 영상 수집
 * 
 * 사용법: npx tsx scripts/rebuild-korean-only.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const API_BASE = "https://www.googleapis.com/youtube/v3";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

// PRD 추천 한국어 15개 채널
const KOREAN_CHANNELS = [
  // 🔥 AI 트렌드 (5개)
  { handle: "@nomadcoders", name: "노마드 코더", slug: "ai-trend", difficulty: "beginner" },
  { handle: "@linedevlog", name: "라인개발실록", slug: "ai-trend", difficulty: "intermediate" },
  { handle: "@kakaotech", name: "카카오테크", slug: "ai-trend", difficulty: "intermediate" },
  { handle: "@aifriends2890", name: "AI 프렌즈", slug: "ai-trend", difficulty: "advanced" },
  { handle: "@catchfiveai", name: "캐치파이브 AI", slug: "ai-trend", difficulty: "beginner" },
  // 🔧 AI 활용 (5개)
  { handle: "@jocoding", name: "조코딩", slug: "ai-usage", difficulty: "beginner" },
  { handle: "@bbanghyong", name: "빵형의 개발도상국", slug: "ai-usage", difficulty: "beginner" },
  { handle: "@hanyohan", name: "한요한", slug: "ai-usage", difficulty: "intermediate" },
  { handle: "@aifactory_official", name: "AI 팩토리", slug: "ai-usage", difficulty: "intermediate" },
  { handle: "@codelessprogram", name: "코드없는 프로그래밍", slug: "ai-usage", difficulty: "beginner" },
  // 📚 AI 학습 (5개)
  { handle: "@teddynote", name: "테디노트", slug: "ai-learning", difficulty: "intermediate" },
  { handle: "@modulabs", name: "모두의연구소", slug: "ai-learning", difficulty: "advanced" },
  { handle: "@goldenrabbit", name: "골든래빗", slug: "ai-learning", difficulty: "beginner" },
  { handle: "@deeplearninghohyung", name: "딥러닝 호형", slug: "ai-learning", difficulty: "intermediate" },
  { handle: "@navaboratory", name: "네이버 D2", slug: "ai-learning", difficulty: "advanced" },
];

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

async function resolveChannel(handle: string): Promise<YTChannelDetail | null> {
  try {
    // forHandle로 직접 조회
    const data = await ytFetch<{ items: YTChannelDetail[] }>("channels", {
      part: "snippet,statistics",
      forHandle: handle.replace("@", ""),
    });
    if (data.items?.length) return data.items[0];

    // 실패 시 search 폴백
    const search = await ytFetch<{ items: Array<{ snippet: { channelId: string } }> }>("search", {
      part: "snippet",
      q: handle,
      type: "channel",
      maxResults: "1",
    });
    if (!search.items?.length) return null;

    const chData = await ytFetch<{ items: YTChannelDetail[] }>("channels", {
      part: "snippet,statistics",
      id: search.items[0].snippet.channelId,
    });
    return chData.items?.[0] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("🔄 한국어 추천 채널로 DB 재구축 시작...\n");

  // ========= 1단계: 기존 데이터 전체 삭제 =========
  console.log("🗑️  기존 데이터 삭제 중...");
  await prisma.videoSummary.deleteMany();
  await prisma.video.deleteMany();
  await prisma.channel.deleteMany();
  console.log("  ✅ 기존 영상/채널/요약 전체 삭제 완료\n");

  // ========= 2단계: 카테고리 맵 =========
  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map(c => [c.slug, c.id]));

  // ========= 3단계: 채널별 영상 수집 =========
  let totalVideos = 0;
  const failedChannels: string[] = [];

  for (const ch of KOREAN_CHANNELS) {
    try {
      // 채널 ID 확인
      const chDetail = await resolveChannel(ch.handle);
      if (!chDetail) {
        console.log(`  ❌ ${ch.name} (${ch.handle}) — 채널 찾기 실패`);
        failedChannels.push(ch.name);
        continue;
      }

      console.log(`📺 ${chDetail.snippet.title} (${ch.handle}) 수집 중...`);

      // 채널 저장
      const dbChannel = await prisma.channel.create({
        data: {
          youtubeId: chDetail.id,
          name: chDetail.snippet.title,
          description: chDetail.snippet.description?.slice(0, 500),
          thumbnailUrl: chDetail.snippet.thumbnails.default.url,
          subscriberCount: parseInt(chDetail.statistics.subscriberCount || "0"),
          language: "ko",
          defaultCategoryId: catMap.get(ch.slug)!,
        },
      });

      // AI 관련 영상 검색 (최대 5개)
      const searchData = await ytFetch<{ items: YTSearchItem[] }>("search", {
        part: "snippet",
        channelId: chDetail.id,
        type: "video",
        order: "date",
        maxResults: "5",
        q: "AI OR 인공지능 OR GPT OR LLM OR 딥러닝 OR ChatGPT OR 코파일럿 OR 클로드 OR 제미나이 OR Gemini OR 생성형 OR 프롬프트",
      });
      const items = searchData.items || [];

      if (!items.length) {
        // AI 키워드 검색 실패 시, 최신 영상 가져오기
        console.log(`  ⚠️ AI 키워드 결과 없음, 최신 영상으로 대체`);
        const fallback = await ytFetch<{ items: YTSearchItem[] }>("search", {
          part: "snippet",
          channelId: chDetail.id,
          type: "video",
          order: "date",
          maxResults: "5",
        });
        items.push(...(fallback.items || []));
      }

      const videoIds = items.map(v => v.id.videoId).filter(Boolean);
      if (!videoIds.length) {
        console.log(`  ⚠️ 영상 없음, 건너뜀`);
        continue;
      }

      // 상세 정보
      const detailData = await ytFetch<{ items: YTVideoDetail[] }>("videos", {
        part: "contentDetails,statistics",
        id: videoIds.join(","),
      });
      const detailMap = new Map((detailData.items || []).map(d => [d.id, d]));

      // 저장
      let channelCount = 0;
      for (const item of items) {
        const detail = detailMap.get(item.id.videoId);
        if (!detail) continue;

        const duration = parseDuration(detail.contentDetails.duration);
        if (duration < 60 || duration > 7200) continue;

        try {
          await prisma.video.create({
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
              isFeatured: channelCount === 0, // 각 채널 첫 번째 영상을 추천
            },
          });
          channelCount++;
          console.log(`  ✅ ${item.snippet.title.slice(0, 60)}...`);
        } catch (e: any) {
          if (e.code === "P2002") continue; // 중복
          throw e;
        }
      }
      totalVideos += channelCount;
      console.log(`  → ${channelCount}개 저장\n`);
    } catch (err: any) {
      console.error(`  ❌ ${ch.name} 오류: ${err.message}`);
      failedChannels.push(ch.name);
    }
  }

  // ========= 4단계: 템플릿 요약 생성 =========
  console.log("\n📝 템플릿 요약 생성 중...");
  const videos = await prisma.video.findMany({
    include: { channel: true, category: true },
  });

  for (const video of videos) {
    await prisma.videoSummary.upsert({
      where: { videoId: video.id },
      update: {},
      create: {
        videoId: video.id,
        summary: `## 영상 개요\n\n**${video.title}**\n\n${video.channel.name} 채널에서 제공하는 ${video.category.name} 카테고리 영상입니다.\n\n## 주요 내용\n\n- AI 기술 및 트렌드에 대한 설명\n- 실무 활용 사례와 팁\n- 최신 AI 도구 및 서비스 소개\n\n> 💡 AI가 생성한 상세 요약은 곧 업데이트됩니다.`,
        keyPoints: [
          "AI 관련 핵심 내용 다루기",
          "최신 트렌드 및 기술 소개",
          "실무 활용 관점 설명",
        ],
        modelUsed: "template-v1",
      },
    });
  }

  // ========= 5단계: 결과 =========
  const finalCount = await prisma.video.count();
  const channelCount = await prisma.channel.count();

  console.log("\n" + "=".repeat(50));
  console.log(`✅ 재구축 완료!`);
  console.log(`📺 채널: ${channelCount}개`);
  console.log(`🎬 영상: ${finalCount}개 (전체 한국어)`);
  if (failedChannels.length) {
    console.log(`⚠️ 실패 채널: ${failedChannels.join(", ")}`);
  }
  console.log("=".repeat(50));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
