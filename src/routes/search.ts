import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/v1/search?q=키워드&page=1&limit=12
router.get("/", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || "").trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit as string) || 12));

    if (!q) {
      res.status(400).json({ success: false, error: { message: "검색어를 입력해주세요 (q 파라미터)" } });
      return;
    }

    // PostgreSQL ILIKE 검색 (제목, 채널명, 태그, 설명)
    const searchPattern = `%${q}%`;
    const where = {
      isActive: true,
      OR: [
        { title: { contains: q, mode: "insensitive" as const } },
        { description: { contains: q, mode: "insensitive" as const } },
        { tags: { has: q } },
        { channel: { name: { contains: q, mode: "insensitive" as const } } },
      ],
    };

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          channel: {
            select: { id: true, name: true, thumbnailUrl: true },
          },
          category: {
            select: { id: true, name: true, slug: true, icon: true, color: true },
          },
        },
      }),
      prisma.video.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        query: q,
        videos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    console.error("Error searching videos:", err);
    res.status(500).json({ success: false, error: { message: "검색 중 오류가 발생했습니다" } });
  }
});

export default router;
