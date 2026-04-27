import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "aitube-admin-secret-2026";
const JWT_EXPIRES_IN = "7d";

// POST /api/v1/admin/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ success: false, error: { message: "비밀번호를 입력해주세요" } });
      return;
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      res.status(500).json({ success: false, error: { message: "서버 설정 오류" } });
      return;
    }

    // bcrypt 해시가 설정되어 있으면 비교, 아니면 평문 비교
    let valid = false;
    if (adminPassword.startsWith("$2")) {
      valid = await bcrypt.compare(password, adminPassword);
    } else {
      valid = password === adminPassword;
    }

    if (!valid) {
      res.status(401).json({ success: false, error: { message: "비밀번호가 일치하지 않습니다" } });
      return;
    }

    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      success: true,
      data: { token, expiresIn: JWT_EXPIRES_IN },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, error: { message: "로그인 처리 중 오류" } });
  }
});

// GET /api/v1/admin/me — 토큰 유효성 확인
router.get("/me", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: { message: "인증이 필요합니다" } });
    return;
  }

  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as { role: string };
    res.json({ success: true, data: { role: decoded.role } });
  } catch {
    res.status(401).json({ success: false, error: { message: "토큰이 만료되었습니다" } });
  }
});

export default router;
