import { Router, Response } from "express";
import { prisma } from "../../lib/prisma";
import { adminAuth, AdminRequest } from "../../middleware/adminAuth";

const router = Router();
router.use(adminAuth);

// GET /api/v1/admin/dashboard — 대시보드 통계
router.get("/", async (_req: AdminRequest, res: Response) => {
  try {
    const [
      totalVideos,
      activeVideos,
      totalChannels,
      activeChannels,
      totalSummaries,
      aiSummaries,
      categories,
      recentVideos,
      channelStats,
    ] = await Promise.all([
      prisma.video.count(),
      prisma.video.count({ where: { isActive: true } }),
      prisma.channel.count(),
      prisma.channel.count({ where: { isActive: true } }),
      prisma.videoSummary.count(),
      prisma.videoSummary.count({ where: { modelUsed: { not: "template-v1" } } }),
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          icon: true,
          _count: { select: { videos: true } },
        },
      }),
      prisma.video.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          createdAt: true,
          channel: { select: { name: true } },
        },
      }),
      prisma.channel.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          lastFetchedAt: true,
          _count: { select: { videos: true } },
        },
        orderBy: { lastFetchedAt: { sort: "desc", nulls: "last" } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalVideos,
          activeVideos,
          totalChannels,
          activeChannels,
          totalSummaries,
          aiSummaries,
          templateSummaries: totalSummaries - aiSummaries,
        },
        categories: categories.map((c) => ({
          ...c,
          videoCount: c._count.videos,
        })),
        recentVideos,
        channelStats: channelStats.map((c) => ({
          ...c,
          videoCount: c._count.videos,
        })),
      },
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).json({ success: false, error: { message: "대시보드 데이터 조회 실패" } });
  }
});

export default router;
