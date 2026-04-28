import { Router, Response } from "express";
import { prisma } from "../../lib/prisma";
import { adminAuth, AdminRequest } from "../../middleware/adminAuth";

const router = Router();
router.use(adminAuth);

// GET /api/v1/admin/analytics — 방문자 통계
router.get("/", async (req: AdminRequest, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(todayStart);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [todayViews, weekViews, monthViews, totalViews, topPages, dailyStats] = await Promise.all([
      prisma.pageView.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.pageView.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.pageView.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.pageView.count(),
      // 인기 페이지 TOP 10
      prisma.$queryRaw<{ page: string; count: bigint }[]>`
        SELECT page, COUNT(*) as count
        FROM page_views
        WHERE created_at >= ${monthAgo}
        GROUP BY page
        ORDER BY count DESC
        LIMIT 10
      `,
      // 최근 7일 일별 방문수
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM page_views
        WHERE created_at >= ${weekAgo}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
    ]);

    res.json({
      success: true,
      data: {
        todayViews,
        weekViews,
        monthViews,
        totalViews,
        topPages: topPages.map((p) => ({ page: p.page, count: Number(p.count) })),
        dailyStats: dailyStats.map((d) => ({ date: String(d.date), count: Number(d.count) })),
      },
    });
  } catch (err) {
    console.error("Admin analytics error:", err);
    res.status(500).json({ success: false, error: { message: "방문자 통계 조회 실패" } });
  }
});

export default router;
