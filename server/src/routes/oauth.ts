import { Router, Request, Response } from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
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

const router = Router();

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
    if (!["google", "microsoft"].includes(provider)) {
      res.status(400).json({ ok: false, error: "Invalid provider" });
      return;
    }

    await revokeToken(req.user!.userId, provider);
    res.json({ ok: true, data: { disconnected: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Store OAuth client credentials in server .env and reload config at runtime */
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

    // Map provider to env var names
    const envVars: Record<string, { id: string; secret: string; configId: string; configSecret: string }> = {
      google: {
        id: "GOOGLE_CLIENT_ID",
        secret: "GOOGLE_CLIENT_SECRET",
        configId: "googleClientId",
        configSecret: "googleClientSecret",
      },
      microsoft: {
        id: "MICROSOFT_CLIENT_ID",
        secret: "MICROSOFT_CLIENT_SECRET",
        configId: "microsoftClientId",
        configSecret: "microsoftClientSecret",
      },
    };

    const vars = envVars[provider];

    // Read existing server .env file
    const envPath = join(__dirname, "../../.env");
    let envContent = "";
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf-8");
    }

    // Update or add each env var
    const updates: Record<string, string> = {
      [vars.id]: clientId.trim(),
      [vars.secret]: clientSecret.trim(),
    };

    const lines = envContent.split("\n");
    const found: Record<string, boolean> = {};

    const updatedLines = lines.map((line) => {
      const trimmed = line.trim();
      for (const [key, value] of Object.entries(updates)) {
        if (trimmed.startsWith(key + "=") || trimmed.startsWith("export " + key + "=")) {
          found[key] = true;
          return `${key}=${value}`;
        }
      }
      return line;
    });

    // Append any vars that weren't found
    for (const [key, value] of Object.entries(updates)) {
      if (!found[key]) {
        updatedLines.push(`${key}=${value}`);
      }
    }

    // Write back
    const finalContent =
      updatedLines
        .filter((l, i, arr) => !(i === arr.length - 1 && l.trim() === ""))
        .join("\n") + "\n";

    writeFileSync(envPath, finalContent, "utf-8");

    // Update runtime config so server doesn't need restart
    config[vars.configId] = clientId.trim();
    config[vars.configSecret] = clientSecret.trim();
    // Also update process.env so googleapis picks it up
    process.env[vars.id] = clientId.trim();
    process.env[vars.secret] = clientSecret.trim();

    res.json({ ok: true, data: { saved: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
