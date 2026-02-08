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
  storeUserOAuthCredentials,
  deleteUserOAuthCredentials,
} from "../services/oauth.service";
import { config } from "../config";

const router = Router();

// ─── Google OAuth ──────────────────────────────────────────

/** Get Google consent URL (requires auth) */
router.get("/google/auth-url", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const url = await getGoogleAuthUrl(req.user!.userId);
    res.json({ ok: true, data: { url } });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
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
router.get("/microsoft/auth-url", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const url = await getMicrosoftAuthUrl(req.user!.userId);
    res.json({ ok: true, data: { url } });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
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

    const deleteCredentials = req.query.deleteCredentials === "true";

    if (deleteCredentials) {
      // Revoke tokens + delete stored credentials
      await deleteUserOAuthCredentials(req.user!.userId, provider as string);
    } else {
      // Revoke tokens only — keeps credentials for easy reconnect
      await revokeToken(req.user!.userId, provider as string);
    }

    res.json({ ok: true, data: { disconnected: true, credentialsDeleted: deleteCredentials } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Store OAuth client credentials per-user in DB (encrypted) */
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

    await storeUserOAuthCredentials(
      req.user!.userId,
      provider,
      clientId.trim(),
      clientSecret.trim()
    );

    res.json({ ok: true, data: { saved: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
