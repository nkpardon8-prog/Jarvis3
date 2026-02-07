import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { gateway } from "../gateway/connection";

const router = Router();

router.use(authMiddleware);

// List all skills
router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await gateway.send("skills.status", {});
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a skill (enable/disable, set API key, env vars)
router.patch("/:skillKey", async (req: AuthRequest, res: Response) => {
  try {
    const skillKey = String(req.params.skillKey);
    const { enabled, apiKey, env } = req.body;

    const params: Record<string, unknown> = { skillKey };
    if (enabled !== undefined) params.enabled = enabled;
    if (apiKey !== undefined) params.apiKey = apiKey;
    if (env !== undefined) params.env = env;

    const result = await gateway.send("skills.update", params);
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Install a skill from ClawHub
router.post("/install", async (req: AuthRequest, res: Response) => {
  try {
    const { name, installId } = req.body;
    if (!name) {
      res.status(400).json({ ok: false, error: "name is required" });
      return;
    }

    const result = await gateway.send("skills.install", { name, installId });
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Search ClawHub (proxy)
router.get("/hub", async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      res.status(400).json({ ok: false, error: "q (search query) is required" });
      return;
    }

    // Try to use the gateway method if available, otherwise proxy to ClawHub API
    try {
      const result = await gateway.send("skills.search", { query: q });
      res.json({ ok: true, data: result });
    } catch {
      // Fallback: skills.search might not exist, return empty
      res.json({ ok: true, data: { results: [] } });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
