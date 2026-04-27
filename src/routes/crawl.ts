import { Router, Request, Response } from "express";
import { runCrawl } from "../services/crawlService";

const router = Router();

// POST /api/v1/crawl/run — 수동 크롤링 트리거 (cron 또는 관리자용)
router.post("/run", async (req: Request, res: Response) => {
  // 간단한 시크릿 키 보호
  const secret = req.headers["x-cron-secret"] || req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    res.status(401).json({ success: false, error: { message: "Unauthorized" } });
    return;
  }

  try {
    console.log("🔄 크롤링 시작 (API 트리거)...");
    const result = await runCrawl();
    console.log(`✅ 크롤링 완료: ${result.newVideos}개 새 영상`);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("크롤링 오류:", err);
    res.status(500).json({
      success: false,
      error: { message: "크롤링 중 오류가 발생했습니다" },
    });
  }
});

// GET /api/v1/crawl/status — 마지막 크롤링 상태
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const { prisma } = await import("../lib/prisma");
    const channels = await prisma.channel.findMany({
      where: { isActive: true },
      select: {
        name: true,
        lastFetchedAt: true,
        _count: { select: { videos: true } },
      },
      orderBy: { lastFetchedAt: { sort: "desc", nulls: "last" } },
    });

    const totalVideos = await prisma.video.count({ where: { isActive: true } });

    res.json({
      success: true,
      data: {
        totalVideos,
        channels: channels.map((c) => ({
          name: c.name,
          videoCount: c._count.videos,
          lastFetched: c.lastFetchedAt,
        })),
      },
    });
  } catch (err) {
    console.error("크롤링 상태 조회 오류:", err);
    res.status(500).json({ success: false, error: { message: "상태 조회 실패" } });
  }
});

export default router;
