import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/v1/videos/:videoId/comments — 댓글 목록
router.get("/:videoId/comments", async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.videoId as string);
    if (isNaN(videoId)) {
      res.status(400).json({ success: false, error: { message: "잘못된 영상 ID" } });
      return;
    }

    const comments = await prisma.comment.findMany({
      where: { videoId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nickname: true,
        content: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: comments });
  } catch (err) {
    console.error("Comments list error:", err);
    res.status(500).json({ success: false, error: { message: "댓글 조회 실패" } });
  }
});

// POST /api/v1/videos/:videoId/comments — 댓글 작성
router.post("/:videoId/comments", async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.videoId as string);
    if (isNaN(videoId)) {
      res.status(400).json({ success: false, error: { message: "잘못된 영상 ID" } });
      return;
    }

    const { nickname, content } = req.body;
    if (!nickname || !content) {
      res.status(400).json({ success: false, error: { message: "닉네임과 내용은 필수입니다" } });
      return;
    }

    if (nickname.length > 50) {
      res.status(400).json({ success: false, error: { message: "닉네임은 50자 이하로 입력하세요" } });
      return;
    }

    if (content.length > 1000) {
      res.status(400).json({ success: false, error: { message: "댓글은 1000자 이하로 입력하세요" } });
      return;
    }

    // Verify video exists
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
      res.status(404).json({ success: false, error: { message: "영상을 찾을 수 없습니다" } });
      return;
    }

    const comment = await prisma.comment.create({
      data: { videoId, nickname: nickname.trim(), content: content.trim() },
      select: { id: true, nickname: true, content: true, createdAt: true },
    });

    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    console.error("Comment create error:", err);
    res.status(500).json({ success: false, error: { message: "댓글 작성 실패" } });
  }
});

export default router;
