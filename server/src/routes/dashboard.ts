import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { gateway } from "../gateway/connection";

const router = Router();

router.use(authMiddleware);

// Aggregated dashboard status
router.get("/status", async (_req: AuthRequest, res: Response) => {
  try {
    // Call multiple gateway methods in parallel
    const results = await Promise.allSettled([
      gateway.send("health", {}),
      gateway.send("channels.status", {}),
      gateway.send("models.list", {}),
      gateway.send("cron.status", {}),
      gateway.send("sessions.list", {}),
      gateway.send("skills.status", {}),
      gateway.send("usage.status", {}),
    ]);

    const extract = (r: PromiseSettledResult<unknown>) =>
      r.status === "fulfilled" ? r.value : null;

    const health = extract(results[0]) as any;
    const channels = extract(results[1]) as any;
    const models = extract(results[2]) as any;
    const cron = extract(results[3]) as any;
    const sessions = extract(results[4]) as any;
    const skills = extract(results[5]) as any;
    const usage = extract(results[6]) as any;

    res.json({
      ok: true,
      data: {
        gateway: {
          connected: gateway.isConnected,
          protocol: gateway.info?.protocol,
          serverVersion: gateway.info?.server?.version,
          methods: gateway.availableMethods?.length || 0,
        },
        health,
        channels,
        models,
        cron,
        sessions,
        skills,
        usage,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
