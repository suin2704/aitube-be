import { Router, Response } from "express";
import { prisma } from "../../lib/prisma";
import { adminAuth, AdminRequest } from "../../middleware/adminAuth";

const router = Router();
router.use(adminAuth);

// GET /api/v1/admin/channels — 채널 목록
router.get("/", async (req: AdminRequest, res: Response) => {
  try {
    const channels = await prisma.channel.findMany({
      orderBy: { name: "asc" },
      include: {
        defaultCategory: { select: { id: true, name: true, slug: true } },
        _count: { select: { videos: true } },
      },
    });

    res.json({ success: true, data: channels });
  } catch (err) {
    console.error("Admin channels list error:", err);
    res.status(500).json({ success: false, error: { message: "채널 목록 조회 실패" } });
  }
});

// POST /api/v1/admin/channels — 채널 추가
router.post("/", async (req: AdminRequest, res: Response) => {
  try {
    const { youtubeId, name, description, thumbnailUrl, subscriberCount, defaultCategoryId, language } = req.body;

    if (!youtubeId || !name) {
      res.status(400).json({ success: false, error: { message: "youtubeId와 name은 필수입니다" } });
      return;
    }

    const channel = await prisma.channel.create({
      data: {
        youtubeId,
        name,
        description: description || null,
        thumbnailUrl: thumbnailUrl || null,
        subscriberCount: subscriberCount || 0,
        defaultCategoryId: defaultCategoryId || null,
        language: language || "ko",
      },
    });

    res.status(201).json({ success: true, data: channel });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      res.status(409).json({ success: false, error: { message: "이미 등록된 채널입니다" } });
      return;
    }
    console.error("Admin channel create error:", err);
    res.status(500).json({ success: false, error: { message: "채널 추가 실패" } });
  }
});

// PATCH /api/v1/admin/channels/:id — 채널 수정
router.patch("/:id", async (req: AdminRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: "잘못된 ID" } });
      return;
    }

    const { name, description, defaultCategoryId, language, isActive } = req.body;
    const data: Record<string, unknown> = {};

    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (defaultCategoryId !== undefined) data.defaultCategoryId = defaultCategoryId;
    if (language !== undefined) data.language = language;
    if (isActive !== undefined) data.isActive = isActive;

    const channel = await prisma.channel.update({
      where: { id },
      data,
    });

    res.json({ success: true, data: channel });
  } catch (err) {
    console.error("Admin channel update error:", err);
    res.status(500).json({ success: false, error: { message: "채널 수정 실패" } });
  }
});

// DELETE /api/v1/admin/channels/:id — 채널 비활성화
router.delete("/:id", async (req: AdminRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: "잘못된 ID" } });
      return;
    }

    await prisma.channel.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ success: true, data: { message: "채널이 비활성화되었습니다" } });
  } catch (err) {
    console.error("Admin channel delete error:", err);
    res.status(500).json({ success: false, error: { message: "채널 삭제 실패" } });
  }
});

export default router;
