import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";
import { encrypt, decrypt } from "../services/crypto.service";
import { automationExec, AutomationNotConfiguredError } from "../services/automation.service";

const router = Router();

router.use(authMiddleware);

// ─── Get automation settings ─────────────────────────────────
router.get("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const settings = await prisma.automationSettings.findUnique({ where: { userId } });

    if (!settings) {
      res.json({ ok: true, data: { configured: false } });
      return;
    }

    res.json({
      ok: true,
      data: {
        configured: true,
        provider: settings.provider,
        modelId: settings.modelId,
        apiKeyRedacted: "••••" + decrypt(settings.apiKey).slice(-4),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Save automation settings ─────────────────────────────────
router.post("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { provider, modelId, apiKey } = req.body;

    if (!provider || !modelId || !apiKey) {
      res.status(400).json({ ok: false, error: "provider, modelId, and apiKey are required" });
      return;
    }

    const validProviders = ["openai", "anthropic", "google"];
    if (!validProviders.includes(provider)) {
      res.status(400).json({ ok: false, error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` });
      return;
    }

    const encryptedKey = encrypt(apiKey);

    await prisma.automationSettings.upsert({
      where: { userId },
      update: { provider, modelId, apiKey: encryptedKey },
      create: { userId, provider, modelId, apiKey: encryptedKey },
    });

    res.json({ ok: true, data: { configured: true, provider, modelId } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Delete automation settings ───────────────────────────────
router.delete("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    await prisma.automationSettings.deleteMany({ where: { userId } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Test automation connection ───────────────────────────────
router.post("/test", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = await automationExec(userId, "Reply with exactly: Automation AI connected successfully.");

    res.json({ ok: true, data: { response: result } });
  } catch (err: any) {
    if (err instanceof AutomationNotConfiguredError) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── General-purpose AI assist ────────────────────────────────
router.post("/assist", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({ ok: false, error: "prompt is required" });
      return;
    }

    const result = await automationExec(userId, prompt);
    res.json({ ok: true, data: { response: result } });
  } catch (err: any) {
    if (err instanceof AutomationNotConfiguredError) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
