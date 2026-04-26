import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    await prisma.category.count();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      db: "connected",
    });
  } catch {
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      db: "disconnected",
    });
  }
});

export default router;
