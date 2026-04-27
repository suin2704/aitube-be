import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "aitube-admin-secret-2026";

export interface AdminRequest extends Request {
  admin?: { role: string };
}

export function adminAuth(req: AdminRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: { message: "인증이 필요합니다" } });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: { message: "유효하지 않은 토큰입니다" } });
  }
}
