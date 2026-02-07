import { Router, Response } from "express";
import { prisma } from "../services/prisma";
import {
  hashPassword,
  verifyPassword,
  generateJWT,
} from "../services/auth.service";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { config } from "../config";

const router = Router();

// Check if any users exist (public endpoint for first-time setup detection)
router.get("/status", async (_req, res: Response) => {
  const count = await prisma.user.count();
  res.json({ ok: true, data: { hasUsers: count > 0 } });
});

// Register first user (only works when no users exist)
router.post("/register", async (req, res: Response) => {
  const { username, password, displayName } = req.body;

  if (!username || !password) {
    res.status(400).json({ ok: false, error: "Username and password are required" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    return;
  }

  // Only allow registration if no users exist (first-time setup)
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    res.status(403).json({
      ok: false,
      error: "Registration is closed. An admin user already exists.",
    });
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      displayName: displayName || username,
      role: "admin",
      gatewayToken: config.openclawAuthToken || null,
    },
  });

  // Create onboarding progress record
  await prisma.onboardingProgress.create({
    data: { userId: user.id },
  });

  const token = generateJWT({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: false, // localhost in dev
    sameSite: "lax",
    maxAge: config.cookieMaxAge,
    path: "/",
  });

  res.json({
    ok: true,
    data: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
});

// Login
router.post("/login", async (req, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ ok: false, error: "Username and password are required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    res.status(401).json({ ok: false, error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ ok: false, error: "Invalid credentials" });
    return;
  }

  const token = generateJWT({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: config.cookieMaxAge,
    path: "/",
  });

  res.json({
    ok: true,
    data: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
});

// Logout
router.post("/logout", (_req, res: Response) => {
  res.clearCookie(config.cookieName, { path: "/" });
  res.json({ ok: true });
});

// Get socket token (returns the JWT for Socket.io handshake auth)
router.get("/socket-token", authMiddleware, (req: AuthRequest, res: Response) => {
  const token = req.cookies?.[config.cookieName];
  if (!token) {
    res.status(401).json({ ok: false, error: "No token found" });
    return;
  }
  res.json({ ok: true, data: { token } });
});

// Get current user
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      createdAt: true,
      onboardingProgress: {
        select: { step: true, completed: true },
      },
    },
  });

  if (!user) {
    res.status(404).json({ ok: false, error: "User not found" });
    return;
  }

  res.json({ ok: true, data: user });
});

export default router;
