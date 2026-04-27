/**
 * 한국어 AI 채널 추가 수집
 * 
 * 기존: 한국어 2개 / 영어 35개 → 목표: 한국어 ~25개 / 영어 ~35개
 * 
 * 사용법: npx tsx scripts/add-korean-channels.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const API_BASE = "https://www.googleapis.com/youtube/v3";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

// 한국어 AI 채널 목록 (YouTube 채널 handle로 검색해서 ID 확인)
const KOREAN_CHANNELS = [
  // 🔥 AI 트렌드
  { handle: "@nomadcoders", slug: "ai-trend", difficulty: "beginner", lang: "ko" },       // 노마드 코더
  { handle: "@bbanghyong", slug: "ai-trend", difficulty: "beginner", lang: "ko" },        // 빵형의 개발도상국
  { handle: "@woowahan_tech", slug: "ai-trend", difficulty: "intermediate", lang: "ko" }, // 우아한테크
  // 🔧 AI 활용
  { handle: "@jocoding", slug: "ai-usage", difficulty: "beginner", lang: "ko" },          // 조코딩
  { handle: "@minjuko_ai", slug: "ai-usage", difficulty: "beginner", lang: "ko" },        // 민쥬코 AI  
  { handle: "@AIExplainer", slug: "ai-usage", difficulty: "beginner", lang: "ko" },       // AI 해설자
  // 📚 AI 학습
  { handle: "@TeddyNoteAI", slug: "ai-learning", difficulty: "intermediate", lang: "ko" },// 테디노트
  { handle: "@todaycodingOfficial", slug: "ai-learning", difficulty: "beginner", lang: "ko" }, // 오늘코드
  { handle: "@SungKimAI", slug: "ai-learning", difficulty: "intermediate", lang: "ko" },  // 성킴
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

// handle로 채널 ID 찾기
async function resolveChannelByHandle(handle: string): Promise<YTChannelDetail | null> {
  try {
    // @handle 형식으로 검색
    const data = await ytFetch<{ items: YTChannelDetail[] }>("channels", {
      part: "snippet,statistics",
      forHandle: handle.replace("@", ""),
    });
    if (data.items?.length) return data.items[0];

    // 실패 시 search로 폴백
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
  console.log("🇰🇷 한국어 AI 채널 영상 수집 시작...\n");

  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map(c => [c.slug, c.id]));

  let totalNew = 0;

  for (const ch of KOREAN_CHANNELS) {
    try {
      // 1. 채널 정보 조회
      const chDetail = await resolveChannelByHandle(ch.handle);
      if (!chDetail) {
        console.log(`  ⚠️ ${ch.handle} — 채널을 찾을 수 없음, 건너뜀`);
        continue;
      }

      // 이미 있는 채널에 영상이 있으면 건너뜀
      const existing = await prisma.channel.findUnique({ where: { youtubeId: chDetail.id } });
      if (existing) {
        const count = await prisma.video.count({ where: { channelId: existing.id } });
        if (count >= 3) {
          console.log(`✅ ${chDetail.snippet.title} — 이미 ${count}개 영상, 건너뜀`);
          continue;
        }
      }

      console.log(`📺 ${chDetail.snippet.title} (${ch.handle}) 수집 중...`);

      // 2. 채널 저장
      const dbChannel = await prisma.channel.upsert({
        where: { youtubeId: chDetail.id },
        update: {
          name: chDetail.snippet.title,
          thumbnailUrl: chDetail.snippet.thumbnails.default.url,
          subscriberCount: parseInt(chDetail.statistics.subscriberCount || "0"),
        },
        create: {
          youtubeId: chDetail.id,
          name: chDetail.snippet.title,
          description: chDetail.snippet.description?.slice(0, 500),
          thumbnailUrl: chDetail.snippet.thumbnails.default.url,
          subscriberCount: parseInt(chDetail.statistics.subscriberCount || "0"),
          language: ch.lang,
          defaultCategoryId: catMap.get(ch.slug)!,
        },
      });

      // 3. 영상 검색 (AI 관련)
      const searchData = await ytFetch<{ items: YTSearchItem[] }>("search", {
        part: "snippet",
        channelId: chDetail.id,
        type: "video",
        order: "date",
        maxResults: "8",
        q: "AI OR 인공지능 OR GPT OR LLM OR 딥러닝 OR ChatGPT OR 코파일럿 OR 클로드 OR 제미나이",
      });
      const items = searchData.items || [];
      const videoIds = items.map(v => v.id.videoId);

      if (!videoIds.length) {
        console.log(`  ⚠️ 검색 결과 없음`);
        continue;
      }

      // 4. 상세 정보
      const detailData = await ytFetch<{ items: YTVideoDetail[] }>("videos", {
        part: "contentDetails,statistics",
        id: videoIds.join(","),
      });
      const detailMap = new Map((detailData.items || []).map(d => [d.id, d]));

      // 5. 저장
      let channelCount = 0;
      for (const item of items) {
        const detail = detailMap.get(item.id.videoId);
        if (!detail) continue;

        const duration = parseDuration(detail.contentDetails.duration);
        if (duration < 60 || duration > 7200) continue; // 1분~2시간

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
          channelCount++;
          totalNew++;
          console.log(`  ✅ ${item.snippet.title.slice(0, 50)}...`);
        } catch {
          // 중복 무시
        }
      }
      console.log(`  → ${channelCount}개 저장`);

      await new Promise(r => setTimeout(r, 600));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ❌ ${ch.handle}: ${msg.slice(0, 120)}`);
    }
  }

  // 6. 새 영상에 템플릿 요약 생성
  const unsummarized = await prisma.video.findMany({
    where: { summary: null },
    include: { channel: true },
  });

  for (const video of unsummarized) {
    const allText = `${video.title} ${video.description || ""}`.toLowerCase();
    const keywords: string[] = [];
    const kwMap: Record<string, string[]> = {
      AI: ["ai", "인공지능"], GPT: ["gpt", "chatgpt", "openai"], LLM: ["llm", "언어모델"],
      "딥러닝": ["deep learning", "딥러닝"], "머신러닝": ["machine learning", "머신러닝"],
      코딩: ["coding", "코딩", "프로그래밍"], Claude: ["claude", "클로드"],
      Gemini: ["gemini", "제미나이"], "프롬프트": ["prompt", "프롬프트"],
    };
    for (const [kw, patterns] of Object.entries(kwMap)) {
      if (patterns.some(p => allText.includes(p))) keywords.push(kw);
    }
    if (!keywords.length) keywords.push("AI", "기술");

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

  // 7. featured 재설정
  await prisma.video.updateMany({ data: { isFeatured: false } });
  const top = await prisma.video.findMany({ orderBy: { viewCount: "desc" }, take: 4 });
  for (const v of top) {
    await prisma.video.update({ where: { id: v.id }, data: { isFeatured: true } });
  }

  // 최종 통계
  const koCount = await prisma.video.count({ where: { language: "ko" } });
  const enCount = await prisma.video.count({ where: { language: "en" } });
  const total = koCount + enCount;
  console.log(`\n✅ 완료: 새로 ${totalNew}개 추가`);
  console.log(`📊 한국어 ${koCount}개 (${Math.round(koCount/total*100)}%) / 영어 ${enCount}개 (${Math.round(enCount/total*100)}%)`);
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
