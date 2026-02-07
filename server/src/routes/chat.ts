import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { gateway } from "../gateway/connection";

const router = Router();

// All chat routes require authentication
router.use(authMiddleware);

// List sessions
router.get("/sessions", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await gateway.send("sessions.list", {});
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get chat history for a session
router.get("/history/:sessionKey", async (req: AuthRequest, res: Response) => {
  try {
    const sessionKey = decodeURIComponent(String(req.params.sessionKey));
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await gateway.send("chat.history", { sessionKey, limit });
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reset a session
router.post("/sessions/:sessionKey/reset", async (req: AuthRequest, res: Response) => {
  try {
    const sessionKey = decodeURIComponent(String(req.params.sessionKey));
    const result = await gateway.send("sessions.reset", { key: sessionKey });
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a session
router.delete("/sessions/:sessionKey", async (req: AuthRequest, res: Response) => {
  try {
    const sessionKey = decodeURIComponent(String(req.params.sessionKey));
    const result = await gateway.send("sessions.delete", { key: sessionKey });
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get the default session key
router.get("/default-session", async (_req: AuthRequest, res: Response) => {
  const defaults = gateway.sessionDefaults;
  const agentId = defaults?.defaultAgentId || "main";
  const mainKey = defaults?.mainKey || "main";
  // Full session key format is "agent:{agentId}:{mainKey}"
  const sessionKey = `agent:${agentId}:${mainKey}`;
  res.json({
    ok: true,
    data: {
      sessionKey,
      agentId,
    },
  });
});

export default router;
