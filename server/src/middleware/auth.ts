import { Response, NextFunction } from "express";
import { verifyJWT } from "../services/auth.service";
import { AuthRequest } from "../types";
import { config } from "../config";

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const token =
    req.cookies?.[config.cookieName] ||
    req.headers.authorization?.replace("Bearer ", "");

  if (token) {
    const payload = verifyJWT(token);
    if (payload) {
      req.user = payload;
    }
  }

  if (!req.user) {
    res.status(401).json({ ok: false, error: "Authentication required" });
    return;
  }

  next();
}
