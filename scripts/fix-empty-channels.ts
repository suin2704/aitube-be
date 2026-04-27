import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const API_BASE = "https://www.googleapis.com/youtube/v3";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

interface YTSearchItem {
  id: { videoId: string };
  snippet: { title: string; description: string; channelId: string; channelTitle: string; publishedAt: string };
}
interface YTVideoDetail {
  id: string;
  contentDetails: { duration: string };
  statistics: { viewCount: string; likeCount?: string };
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
  // 0개 영상 채널 삭제 (에이블유니버스, AI FACTORY)
  const emptyChs = await prisma.channel.findMany({
    include: { _count: { select: { videos: true } } },
  });
  for (const ch of emptyChs) {
    if (ch._count.videos === 0 && ch.name !== "조코딩 JoCoding") {
      await prisma.channel.delete({ where: { id: ch.id } });
      console.log(`삭제: ${ch.name} (0개 영상)`);
    }
  }

  // 조코딩 채널 — 최신 영상으로 수집 (AI 키워드 없이)
  const jocoding = await prisma.channel.findFirst({ where: { name: { contains: "조코딩" } } });
  if (jocoding) {
    console.log(`\n📺 조코딩 최신 영상 수집...`);
    const categories = await prisma.category.findMany();
    const catMap = new Map(categories.map(c => [c.slug, c.id]));

    const searchData = await ytFetch<{ items: YTSearchItem[] }>("search", {
      part: "snippet",
      channelId: jocoding.youtubeId,
      type: "video",
      order: "date",
      maxResults: "5",
    });
    const items = searchData.items || [];
    const videoIds = items.map(v => v.id.videoId).filter(Boolean);

    if (videoIds.length) {
      const detailData = await ytFetch<{ items: YTVideoDetail[] }>("videos", {
        part: "contentDetails,statistics",
        id: videoIds.join(","),
      });
      const detailMap = new Map((detailData.items || []).map(d => [d.id, d]));

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
              channelId: jocoding.id,
              categoryId: catMap.get("ai-usage")!,
              title: item.snippet.title,
              description: item.snippet.description?.slice(0, 1000),
              thumbnailUrl: `https://img.youtube.com/vi/${item.id.videoId}/maxresdefault.jpg`,
              duration,
              viewCount: parseInt(detail.statistics.viewCount || "0"),
              likeCount: parseInt(detail.statistics.likeCount || "0"),
              publishedAt: new Date(item.snippet.publishedAt),
              language: "ko",
              difficulty: "beginner",
              tags: ["AI"],
              isFeatured: count === 0,
            },
          });
          await prisma.videoSummary.create({
            data: {
              videoId: video.id,
              summary: `## 영상 개요\n\n**${item.snippet.title}**\n\n조코딩 채널의 영상입니다.\n\n> AI가 생성한 상세 요약은 곧 업데이트됩니다.`,
              keyPoints: ["AI/코딩 관련 내용", "초보자 친화적 설명"],
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
      console.log(`  → ${count}개 저장`);
    }
  }

  const total = await prisma.video.count();
  const channels = await prisma.channel.count();
  console.log(`\n최종: 채널 ${channels}개, 영상 ${total}개`);
  
  const allCh = await prisma.channel.findMany({
    include: { _count: { select: { videos: true } } },
    orderBy: { id: "asc" },
  });
  for (const c of allCh) {
    console.log(`  ${c.name} — ${c._count.videos}개`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
