import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { config } from "../config";
import { gateway } from "../gateway/connection";

const router = Router();

router.use(authMiddleware);

// ─── Gateway status ──────────────────────────────────────

router.get("/status", async (_req: AuthRequest, res: Response) => {
  try {
    let latencyMs: number | null = null;

    if (gateway.isConnected) {
      const start = Date.now();
      try {
        await gateway.send("health", {}, 5000);
        latencyMs = Date.now() - start;
      } catch {
        latencyMs = null;
      }
    }

    res.json({
      ok: true,
      data: {
        connected: gateway.isConnected,
        url: config.openclawGatewayUrl,
        hasToken: !!config.openclawAuthToken,
        latencyMs,
        methods: gateway.isConnected ? gateway.availableMethods.length : 0,
        serverVersion: gateway.info?.server?.version || null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Configure gateway ──────────────────────────────────
// Updates runtime config and reconnects.
// The gateway URL + token are the one "local" config for this Jarvis instance
// (they define WHERE to connect, which is inherently per-deployment).

router.post("/configure", async (req: AuthRequest, res: Response) => {
  try {
    const { url, token } = req.body;

    if (!url && !token) {
      res.status(400).json({ ok: false, error: "Provide url and/or token" });
      return;
    }

    // Update runtime config
    if (url) {
      config.openclawGatewayUrl = url.trim();
      process.env.OPENCLAW_GATEWAY_URL = url.trim();
    }
    if (token) {
      config.openclawAuthToken = token.trim();
      process.env.OPENCLAW_AUTH_TOKEN = token.trim();
    }

    // Reconnect gateway with new config
    try {
      await gateway.reconnect();
      res.json({
        ok: true,
        data: {
          saved: true,
          connected: gateway.isConnected,
          methods: gateway.availableMethods.length,
        },
      });
    } catch (err: any) {
      // Config was updated even if reconnect fails
      res.json({
        ok: true,
        data: {
          saved: true,
          connected: false,
          reconnectError: err.message,
        },
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
