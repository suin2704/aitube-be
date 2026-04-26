import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/v1/categories — 카테고리 목록 조회
router.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: { videos: true },
        },
      },
    });

    const data = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      icon: cat.icon,
      color: cat.color,
      videoCount: cat._count.videos,
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ success: false, error: { message: "Failed to fetch categories" } });
  }
});

export default router;
