import { Router, Request, Response } from "express";
import { gateway } from "../gateway/connection";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  let gatewayHealth: Record<string, unknown> = {
    connected: gateway.isConnected,
  };

  // Try to get gateway health if connected
  if (gateway.isConnected) {
    try {
      const start = Date.now();
      const health = await gateway.send("health", {}, 5000);
      gatewayHealth = {
        connected: true,
        latencyMs: Date.now() - start,
        health,
      };
    } catch {
      gatewayHealth = {
        connected: true,
        healthCheckFailed: true,
      };
    }
  }

  // Include server info if available
  if (gateway.info) {
    gatewayHealth.serverVersion = gateway.info.server?.version;
    gatewayHealth.protocol = gateway.info.protocol;
    gatewayHealth.methods = gateway.availableMethods?.length || 0;
    gatewayHealth.uptimeMs = gateway.info.snapshot?.uptimeMs;
  }

  res.json({
    ok: true,
    data: {
      server: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      gateway: gatewayHealth,
    },
  });
});

export default router;
