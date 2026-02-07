import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  getMicrosoftAuthUrl,
  handleMicrosoftCallback,
  getOAuthStatus,
  revokeToken,
} from "../services/oauth.service";
import { config } from "../config";
import { gateway } from "../gateway/connection";

const router = Router();

// ─── Helpers ────────────────────────────────────────────

/** Patch gateway config with retry on hash conflict */
async function patchConfig(
  updateFn: (cfg: any) => any,
  maxRetries = 2
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const current = (await gateway.send("config.get", {})) as any;
    const hash = current?.hash;
    if (!hash) throw new Error("Could not get config hash");

    const merged = updateFn(current?.config || {});
    try {
      return await gateway.send("config.patch", {
        raw: JSON.stringify(merged, null, 2),
        baseHash: hash,
      });
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
    }
  }
}

// ─── Google OAuth ──────────────────────────────────────────

/** Get Google consent URL (requires auth) */
router.get("/google/auth-url", authMiddleware, (req: AuthRequest, res: Response) => {
  if (!config.googleClientId) {
    res.status(400).json({
      ok: false,
      error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env",
    });
    return;
  }

  const url = getGoogleAuthUrl(req.user!.userId);
  res.json({ ok: true, data: { url } });
});

/** Google OAuth callback — state JWT has userId, no auth middleware needed */
router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(
      `${config.corsOrigin}/dashboard/connections?oauth=error&provider=google&message=${encodeURIComponent(String(error))}`
    );
    return;
  }

  if (!code || !state) {
    res.redirect(
      `${config.corsOrigin}/dashboard/connections?oauth=error&provider=google&message=${encodeURIComponent("Missing code or state")}`
    );
    return;
  }

  const result = await handleGoogleCallback(String(code), String(state));

  if (result.success) {
    res.redirect(`${config.corsOrigin}/dashboard/connections?oauth=success&provider=google`);
  } else {
    res.redirect(
      `${config.corsOrigin}/dashboard/connections?oauth=error&provider=google&message=${encodeURIComponent(result.error || "Unknown error")}`
    );
  }
});

// ─── Microsoft OAuth ──────────────────────────────────────

/** Get Microsoft consent URL (requires auth) */
router.get("/microsoft/auth-url", authMiddleware, (req: AuthRequest, res: Response) => {
  if (!config.microsoftClientId) {
    res.status(400).json({
      ok: false,
      error: "Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in .env",
    });
    return;
  }

  const url = getMicrosoftAuthUrl(req.user!.userId);
  res.json({ ok: true, data: { url } });
});

/** Microsoft OAuth callback — state JWT has userId, no auth middleware needed */
router.get("/microsoft/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const msg = error_description || error;
    res.redirect(
      `${config.corsOrigin}/dashboard/connections?oauth=error&provider=microsoft&message=${encodeURIComponent(String(msg))}`
    );
    return;
  }

  if (!code || !state) {
    res.redirect(
      `${config.corsOrigin}/dashboard/connections?oauth=error&provider=microsoft&message=${encodeURIComponent("Missing code or state")}`
    );
    return;
  }

  const result = await handleMicrosoftCallback(String(code), String(state));

  if (result.success) {
    res.redirect(`${config.corsOrigin}/dashboard/connections?oauth=success&provider=microsoft`);
  } else {
    res.redirect(
      `${config.corsOrigin}/dashboard/connections?oauth=error&provider=microsoft&message=${encodeURIComponent(result.error || "Unknown error")}`
    );
  }
});

// ─── Shared ──────────────────────────────────────────────

/** Get OAuth status for all providers (requires auth) */
router.get("/status", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const status = await getOAuthStatus(req.user!.userId);
    res.json({ ok: true, data: status });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Disconnect a provider (requires auth) */
router.post("/disconnect/:provider", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { provider } = req.params;
    if (!["google", "microsoft"].includes(provider as string)) {
      res.status(400).json({ ok: false, error: "Invalid provider" });
      return;
    }

    await revokeToken(req.user!.userId, provider as string);
    res.json({ ok: true, data: { disconnected: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Store OAuth client credentials in gateway config and update runtime */
router.post("/store-credentials", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { provider, clientId, clientSecret } = req.body;

    if (!provider || !["google", "microsoft"].includes(provider)) {
      res.status(400).json({ ok: false, error: "Invalid provider (google or microsoft)" });
      return;
    }
    if (!clientId || !clientSecret) {
      res.status(400).json({ ok: false, error: "clientId and clientSecret are required" });
      return;
    }

    // Map provider to config key names
    const configMap: Record<string, { configId: string; configSecret: string }> = {
      google: {
        configId: "googleClientId",
        configSecret: "googleClientSecret",
      },
      microsoft: {
        configId: "microsoftClientId",
        configSecret: "microsoftClientSecret",
      },
    };

    const vars = configMap[provider];

    // Store in gateway config so any Jarvis instance can read them
    await patchConfig((cfg) => {
      if (!cfg.jarvis) cfg.jarvis = {};
      if (!cfg.jarvis.oauth) cfg.jarvis.oauth = {};
      cfg.jarvis.oauth[provider] = {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      };
      return cfg;
    });

    // Update runtime config so this server instance picks it up immediately
    config[vars.configId] = clientId.trim();
    config[vars.configSecret] = clientSecret.trim();

    res.json({ ok: true, data: { saved: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
