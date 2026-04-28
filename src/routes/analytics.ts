import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// POST /api/v1/analytics/pageview — 페이지뷰 기록
router.post("/pageview", async (req: Request, res: Response) => {
  try {
    const { page, videoId } = req.body;
    if (!page) {
      res.status(400).json({ success: false, error: { message: "page is required" } });
      return;
    }

    await prisma.pageView.create({
      data: {
        page,
        videoId: videoId ? parseInt(videoId) : null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Analytics pageview error:", err);
    res.status(500).json({ success: false, error: { message: "페이지뷰 기록 실패" } });
  }
});

export default router;
