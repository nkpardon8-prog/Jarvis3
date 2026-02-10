import { Response, NextFunction } from "express";
import { createHash } from "crypto";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";

/**
 * Middleware for proxy API token authentication.
 * Extracts Bearer token from Authorization header, SHA-256 hashes it,
 * and looks up the hash in the ProxyApiToken table.
 */
export async function proxyAuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  if (!token) {
    res.status(401).json({ ok: false, error: "Empty bearer token" });
    return;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    // Look up by hash directly — indexed, multi-user safe
    const record = await prisma.proxyApiToken.findFirst({
      where: { tokenHash },
    });

    if (!record) {
      res.status(401).json({ ok: false, error: "Invalid proxy token" });
      return;
    }

    req.user = {
      userId: record.userId,
      username: "",
      role: "proxy",
    };

    next();
  } catch (err: any) {
    console.error("[GmailProxy] Auth error:", err.message);
    res.status(500).json({ ok: false, error: "Authentication error" });
  }
}
