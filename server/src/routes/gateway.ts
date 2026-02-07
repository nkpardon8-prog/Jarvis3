import { Router, Response } from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
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

router.post("/configure", async (req: AuthRequest, res: Response) => {
  try {
    const { url, token } = req.body;

    if (!url && !token) {
      res.status(400).json({ ok: false, error: "Provide url and/or token" });
      return;
    }

    // Read existing server .env file
    const envPath = join(__dirname, "../../.env");
    let envContent = "";
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf-8");
    }

    const updates: Record<string, string> = {};
    if (url) updates["OPENCLAW_GATEWAY_URL"] = url.trim();
    if (token) updates["OPENCLAW_AUTH_TOKEN"] = token.trim();

    const lines = envContent.split("\n");
    const found: Record<string, boolean> = {};

    const updatedLines = lines.map((line) => {
      const trimmed = line.trim();
      for (const [key, value] of Object.entries(updates)) {
        if (
          trimmed.startsWith(key + "=") ||
          trimmed.startsWith("export " + key + "=")
        ) {
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

    const finalContent =
      updatedLines
        .filter((l, i, arr) => !(i === arr.length - 1 && l.trim() === ""))
        .join("\n") + "\n";

    writeFileSync(envPath, finalContent, "utf-8");

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
      // Config was saved even if reconnect fails
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
