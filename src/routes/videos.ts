import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";

const router = Router();

// GET /api/v1/videos — 영상 목록 조회
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit as string) || 12));
    const category = req.query.category as string | undefined;
    const difficulty = req.query.difficulty as string | undefined;
    const language = req.query.language as string | undefined;
    const sort = (req.query.sort as string) || "latest";
    const featured = req.query.featured === "true";

    const where: Prisma.VideoWhereInput = { isActive: true };

    if (category) {
      where.category = { slug: category };
    }
    if (difficulty) {
      where.difficulty = difficulty;
    }
    if (language) {
      where.language = language;
    }
    if (featured) {
      where.isFeatured = true;
    }

    const orderBy: Prisma.VideoOrderByWithRelationInput =
      sort === "popular"
        ? { viewCount: "desc" }
        : sort === "views"
        ? { viewCount: "desc" }
        : { publishedAt: "desc" };

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy,
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
    console.error("Error fetching videos:", err);
    res.status(500).json({ success: false, error: { message: "Failed to fetch videos" } });
  }
});

// GET /api/v1/videos/:id — 영상 상세 조회
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: "Invalid video ID" } });
      return;
    }

    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        channel: true,
        category: true,
        summary: true,
      },
    });

    if (!video) {
      res.status(404).json({ success: false, error: { message: "Video not found" } });
      return;
    }

    res.json({ success: true, data: video });
  } catch (err) {
    console.error("Error fetching video:", err);
    res.status(500).json({ success: false, error: { message: "Failed to fetch video" } });
  }
});

// GET /api/v1/videos/:id/related — 관련 영상 조회
router.get("/:id/related", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const limit = Math.min(12, parseInt(req.query.limit as string) || 8);

    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: "Invalid video ID" } });
      return;
    }

    const video = await prisma.video.findUnique({
      where: { id },
      select: { categoryId: true },
    });

    if (!video) {
      res.status(404).json({ success: false, error: { message: "Video not found" } });
      return;
    }

    const related = await prisma.video.findMany({
      where: {
        categoryId: video.categoryId,
        id: { not: id },
        isActive: true,
      },
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: {
        channel: {
          select: { id: true, name: true, thumbnailUrl: true },
        },
        category: {
          select: { id: true, name: true, slug: true, icon: true, color: true },
        },
      },
    });

    res.json({ success: true, data: related });
  } catch (err) {
    console.error("Error fetching related videos:", err);
    res.status(500).json({ success: false, error: { message: "Failed to fetch related videos" } });
  }
});

export default router;
