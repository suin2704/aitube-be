/**
 * BTS 등 비AI 영상 제거 + 올바른 AI 채널로 재수집
 * 
 * 사용법: npx tsx scripts/fix-channels.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const API_BASE = "https://www.googleapis.com/youtube/v3";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

// ===== 올바른 AI 채널 목록 =====
const CORRECT_CHANNELS = [
  // 🔥 AI 트렌드 (AI 뉴스, 최신 동향)
  { youtubeId: "UCkRfAYGBiQMnYIsLOcMRG1g", slug: "ai-trend", difficulty: "beginner", lang: "ko" },     // 노마드 코더 Nomad Coders (실제 ID)
  { youtubeId: "UCNhGqMWDRnIKMb3OGBQdsIA", slug: "ai-trend", difficulty: "beginner", lang: "ko" },     // 빵형의 개발도상국 (실제 ID)
  { youtubeId: "UC9PB9nKYqKEx_N3KM-JVTpg", slug: "ai-trend", difficulty: "intermediate", lang: "en" }, // Two Minute Papers
  
  // 🔧 AI 활용 (실전 활용법)
  { youtubeId: "UCos1rSDdSPd4PBXm0dgFgqQ", slug: "ai-usage", difficulty: "beginner", lang: "ko" },     // 조코딩 JoCoding (실제 ID)
  { youtubeId: "UCVyRiMvfUNMA1UPlDPzG5Ow", slug: "ai-usage", difficulty: "intermediate", lang: "en" }, // ByeongKyu Park / Fireship
  { youtubeId: "UCsBjURrPoezykLs9EqgamOA", slug: "ai-usage", difficulty: "intermediate", lang: "en" }, // Fireship
  
  // 📚 AI 학습 (교육 콘텐츠)
  { youtubeId: "UCt_0mYwL0_4sW73O7GjhN_A", slug: "ai-learning", difficulty: "intermediate", lang: "ko" }, // 테디노트 TeddyNote (실제 ID)
  { youtubeId: "UCYO_jab_esuFRV4b17AJtAw", slug: "ai-learning", difficulty: "beginner", lang: "en" },    // 3Blue1Brown
  { youtubeId: "UCZHmQk67mSJgfCCTn7xBfew", slug: "ai-learning", difficulty: "advanced", lang: "en" },    // Yannic Kilcher
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
  console.log("🔧 채널 수정 + 비AI 영상 제거 시작...\n");

  // 1. BTS/비AI 영상 삭제 (BANGTANTV 채널)
  const btsChannel = await prisma.channel.findFirst({ where: { name: { contains: "BANGTAN" } } });
  if (btsChannel) {
    // 관련 요약 먼저 삭제
    const btsVideos = await prisma.video.findMany({ where: { channelId: btsChannel.id }, select: { id: true } });
    for (const v of btsVideos) {
      await prisma.videoSummary.deleteMany({ where: { videoId: v.id } });
    }
    const deleted = await prisma.video.deleteMany({ where: { channelId: btsChannel.id } });
    console.log(`🗑️ BANGTANTV(BTS) 영상 ${deleted.count}개 삭제`);
    await prisma.channel.delete({ where: { id: btsChannel.id } });
    console.log(`🗑️ BANGTANTV 채널 삭제`);
  }

  // 2. 카테고리 매핑
  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map(c => [c.slug, c.id]));

  // 3. 새 채널에서 수집
  let totalNew = 0;

  for (const ch of CORRECT_CHANNELS) {
    try {
      // 채널 정보 조회
      const data = await ytFetch<{ items: YTChannelDetail[] }>("channels", { part: "snippet,statistics", id: ch.youtubeId });
      const chDetail = data.items?.[0];
      
      if (!chDetail) {
        console.log(`  ⚠️ ${ch.youtubeId} 채널 없음, 건너뜀`);
        continue;
      }

      // 이미 있는 채널이면 건너뜀 (이미 영상이 있는 경우)
      const existingChannel = await prisma.channel.findUnique({ where: { youtubeId: ch.youtubeId } });
      if (existingChannel) {
        const videoCount = await prisma.video.count({ where: { channelId: existingChannel.id } });
        if (videoCount > 0) {
          console.log(`✅ ${chDetail.snippet.title} — 이미 ${videoCount}개 영상 있음, 건너뜀`);
          continue;
        }
      }

      console.log(`📺 ${chDetail.snippet.title} (${ch.slug}) 수집 중...`);

      // 채널 저장
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

      // 영상 검색
      const searchData = await ytFetch<{ items: YTSearchItem[] }>("search", {
        part: "snippet",
        channelId: ch.youtubeId,
        type: "video",
        order: "date",
        maxResults: "5",
        q: "AI OR 인공지능 OR GPT OR LLM OR 딥러닝 OR machine learning",
      });
      const searchResults = searchData.items || [];
      const videoIds = searchResults.map(v => v.id.videoId);

      if (videoIds.length === 0) {
        console.log(`  ⚠️ 검색 결과 없음`);
        continue;
      }

      // 영상 상세 정보
      const detailData = await ytFetch<{ items: YTVideoDetail[] }>("videos", {
        part: "contentDetails,statistics",
        id: videoIds.join(","),
      });
      const detailMap = new Map((detailData.items || []).map(d => [d.id, d]));

      // 저장
      for (const item of searchResults) {
        const detail = detailMap.get(item.id.videoId);
        if (!detail) continue;

        const duration = parseDuration(detail.contentDetails.duration);
        if (duration < 60) continue;

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
          totalNew++;
          console.log(`  ✅ ${item.snippet.title.slice(0, 50)}...`);
        } catch {
          // 중복 무시
        }
      }

      await new Promise(r => setTimeout(r, 500));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ❌ ${ch.youtubeId}: ${msg.slice(0, 100)}`);
    }
  }

  // 4. 새 영상에 템플릿 요약 생성
  const unsummarized = await prisma.video.findMany({
    where: { summary: null },
    include: { channel: true },
  });

  for (const video of unsummarized) {
    const allText = `${video.title} ${video.description || ""}`.toLowerCase();
    const keywords: string[] = [];
    
    const kwMap: Record<string, string[]> = {
      AI: ["ai", "인공지능"], GPT: ["gpt", "chatgpt", "openai"], LLM: ["llm", "언어모델"],
      "딥러닝": ["deep learning", "딥러닝", "neural"], "머신러닝": ["machine learning", "머신러닝"],
      코딩: ["coding", "코딩", "programming"], NVIDIA: ["nvidia"], Google: ["google", "deepmind"],
      수학: ["math", "수학", "theorem"], "웹개발": ["web dev", "typescript", "react"],
    };
    for (const [kw, patterns] of Object.entries(kwMap)) {
      if (patterns.some(p => allText.includes(p))) keywords.push(kw);
    }
    if (keywords.length === 0) keywords.push("AI", "기술");

    const summary = `${video.channel.name} 채널의 "${video.title.replace(/&#?\w+;/g, "")}" 영상입니다. AI 기술과 관련된 유익한 콘텐츠를 제공합니다.`;

    await prisma.videoSummary.create({
      data: {
        videoId: video.id,
        summary,
        keyPoints: [`${video.title.slice(0, 30)}에 대한 내용`, `${video.channel.name}의 전문적 설명`, `${keywords[0]} 관련 최신 정보`],
        keywords: keywords.slice(0, 5),
        modelUsed: "template-v1",
        status: "completed",
      },
    });
    await prisma.video.update({ where: { id: video.id }, data: { tags: keywords.slice(0, 5) } });
  }

  if (unsummarized.length > 0) {
    console.log(`\n📝 ${unsummarized.length}개 새 영상 요약 생성 완료`);
  }

  // 5. featured 재설정 (상위 4개)
  await prisma.video.updateMany({ data: { isFeatured: false } });
  const top = await prisma.video.findMany({ orderBy: { viewCount: "desc" }, take: 4 });
  for (const v of top) {
    await prisma.video.update({ where: { id: v.id }, data: { isFeatured: true } });
  }

  const total = await prisma.video.count();
  console.log(`\n✅ 완료: 새로 ${totalNew}개 추가, 총 ${total}개 영상`);
  console.log(`⭐ 상위 4개 추천 설정`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
