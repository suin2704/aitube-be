import { Router, Response } from "express";
import { prisma } from "../../lib/prisma";
import { adminAuth, AdminRequest } from "../../middleware/adminAuth";

const router = Router();
router.use(adminAuth);

// GET /api/v1/admin/videos — 전체 영상 목록 (관리용)
router.get("/", async (req: AdminRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string || "").trim();

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { channel: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          channel: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, slug: true } },
          summary: { select: { id: true, modelUsed: true, status: true } },
        },
      }),
      prisma.video.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        videos,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    console.error("Admin videos list error:", err);
    res.status(500).json({ success: false, error: { message: "영상 목록 조회 실패" } });
  }
});

// PATCH /api/v1/admin/videos/:id — 영상 수정
router.patch("/:id", async (req: AdminRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: "잘못된 ID" } });
      return;
    }

    const { title, description, categoryId, difficulty, language, tags, isFeatured, isActive } = req.body;
    const data: Record<string, unknown> = {};

    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (difficulty !== undefined) data.difficulty = difficulty;
    if (language !== undefined) data.language = language;
    if (tags !== undefined) data.tags = tags;
    if (isFeatured !== undefined) data.isFeatured = isFeatured;
    if (isActive !== undefined) data.isActive = isActive;

    const video = await prisma.video.update({
      where: { id },
      data,
      include: {
        channel: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    res.json({ success: true, data: video });
  } catch (err) {
    console.error("Admin video update error:", err);
    res.status(500).json({ success: false, error: { message: "영상 수정 실패" } });
  }
});

// PATCH /api/v1/admin/videos/:id/featured — 추천 토글
router.patch("/:id/featured", async (req: AdminRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: "잘못된 ID" } });
      return;
    }

    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) {
      res.status(404).json({ success: false, error: { message: "영상을 찾을 수 없습니다" } });
      return;
    }

    const updated = await prisma.video.update({
      where: { id },
      data: { isFeatured: !video.isFeatured },
    });

    res.json({ success: true, data: { id: updated.id, isFeatured: updated.isFeatured } });
  } catch (err) {
    console.error("Admin featured toggle error:", err);
    res.status(500).json({ success: false, error: { message: "추천 토글 실패" } });
  }
});

// DELETE /api/v1/admin/videos/:id — 영상 삭제 (soft delete)
router.delete("/:id", async (req: AdminRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: "잘못된 ID" } });
      return;
    }

    await prisma.video.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ success: true, data: { message: "영상이 비활성화되었습니다" } });
  } catch (err) {
    console.error("Admin video delete error:", err);
    res.status(500).json({ success: false, error: { message: "영상 삭제 실패" } });
  }
});

export default router;
