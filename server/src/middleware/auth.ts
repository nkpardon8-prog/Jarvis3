import { Response, NextFunction } from "express";
import { verifyJWT } from "../services/auth.service";
import { AuthRequest } from "../types";
import { config } from "../config";

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  // Try cookie first, then Authorization header
  const token =
    req.cookies?.[config.cookieName] ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ ok: false, error: "Authentication required" });
    return;
  }

  const payload = verifyJWT(token);
  if (!payload) {
    res.status(401).json({ ok: false, error: "Invalid or expired token" });
    return;
  }

  req.user = payload;
  next();
}
