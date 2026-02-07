import { Router, Response } from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { gateway } from "../gateway/connection";

const router = Router();

router.use(authMiddleware);

// Read ~/.openclaw/.env to determine which env vars are configured
function readEnvKeys(): Record<string, boolean> {
  const envPath = join(homedir(), ".openclaw", ".env");
  const result: Record<string, boolean> = {};

  try {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^(?:export\s+)?([A-Z_]+)=(.+)$/);
        if (match) {
          const [, key, value] = match;
          if (value.trim()) {
            result[key] = true;
          }
        }
      }
    }
  } catch {
    // ignore read errors
  }
  return result;
}

// Map env vars to provider ids
const ENV_VAR_TO_PROVIDER: Record<string, string> = {
  OPENAI_API_KEY: "openai",
  ANTHROPIC_API_KEY: "anthropic",
  GEMINI_API_KEY: "google",
  OPENROUTER_API_KEY: "openrouter",
  XAI_API_KEY: "xai",
  MISTRAL_API_KEY: "mistral",
  GROQ_API_KEY: "groq",
};

function readProviderKeys(): Record<string, boolean> {
  const envKeys = readEnvKeys();
  const result: Record<string, boolean> = {};
  for (const [envVar, provider] of Object.entries(ENV_VAR_TO_PROVIDER)) {
    if (envKeys[envVar]) {
      result[provider] = true;
    }
  }
  return result;
}

// Get full connection status (config + channels + models)
router.get("/status", async (_req: AuthRequest, res: Response) => {
  try {
    const [config, channels, models] = await Promise.all([
      gateway.send("config.get", {}),
      gateway.send("channels.status", { probe: true }),
      gateway.send("models.list", {}),
    ]);

    // Read env keys from .env file
    const allEnvKeys = readEnvKeys();
    const providerKeys = readProviderKeys();

    res.json({
      ok: true,
      data: { config, channels, models, providerKeys, envKeys: allEnvKeys },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get current config (includes hash for patching)
router.get("/config", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await gateway.send("config.get", {});
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Patch config — accepts a JSON patch object + applies it via gateway
// The gateway requires: { raw: JSON string of full config, baseHash: current config hash }
router.patch("/config", async (req: AuthRequest, res: Response) => {
  try {
    const { patch } = req.body;
    if (!patch || typeof patch !== "object") {
      res.status(400).json({ ok: false, error: "patch (JSON object) is required" });
      return;
    }

    // Get current config with hash
    const current = (await gateway.send("config.get", {})) as any;
    const hash = current?.hash;
    if (!hash) {
      res.status(500).json({ ok: false, error: "Could not get config hash" });
      return;
    }

    // Deep merge patch into current config
    const currentConfig = current?.config || {};
    const merged = deepMerge(currentConfig, patch);

    // Send the full merged config as raw JSON string with the baseHash
    const result = await gateway.send("config.patch", {
      raw: JSON.stringify(merged, null, 2),
      baseHash: hash,
    });

    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get channels status
router.get("/channels", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await gateway.send("channels.status", { probe: true });
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get available models
router.get("/models", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await gateway.send("models.list", {});
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Set the active model
router.post("/set-model", async (req: AuthRequest, res: Response) => {
  try {
    const { model } = req.body;
    if (!model || typeof model !== "string") {
      res.status(400).json({ ok: false, error: "model (string like 'openai/gpt-5.2') is required" });
      return;
    }

    // Get current config with hash
    const current = (await gateway.send("config.get", {})) as any;
    const hash = current?.hash;
    const currentConfig = current?.config || {};

    // Update model
    if (!currentConfig.agents) currentConfig.agents = {};
    if (!currentConfig.agents.defaults) currentConfig.agents.defaults = {};
    if (!currentConfig.agents.defaults.model) currentConfig.agents.defaults.model = {};
    currentConfig.agents.defaults.model.primary = model;

    const result = await gateway.send("config.patch", {
      raw: JSON.stringify(currentConfig, null, 2),
      baseHash: hash,
    });

    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Store a provider API key in ~/.openclaw/.env
// OpenClaw reads these via shell env fallback on startup
router.post("/store-credential", async (req: AuthRequest, res: Response) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider || !apiKey) {
      res.status(400).json({ ok: false, error: "provider and apiKey are required" });
      return;
    }

    // Map provider id to the env var name OpenClaw expects
    const envVarMap: Record<string, string> = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      google: "GEMINI_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
      xai: "XAI_API_KEY",
      mistral: "MISTRAL_API_KEY",
      groq: "GROQ_API_KEY",
    };

    const envVar = envVarMap[provider];
    if (!envVar) {
      res.status(400).json({ ok: false, error: `Unknown provider: ${provider}` });
      return;
    }

    // Read existing .env file, update or add the key
    const envPath = join(homedir(), ".openclaw", ".env");
    let envContent = "";
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf-8");
    }

    // Parse existing env vars
    const lines = envContent.split("\n");
    let found = false;
    const updatedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith(envVar + "=") || trimmed.startsWith("export " + envVar + "=")) {
        found = true;
        return `${envVar}=${apiKey}`;
      }
      return line;
    });

    if (!found) {
      updatedLines.push(`${envVar}=${apiKey}`);
    }

    // Write back, ensuring no trailing blank lines pile up
    const finalContent = updatedLines.filter((l, i, arr) => {
      // Remove empty trailing lines
      if (i === arr.length - 1 && l.trim() === "") return false;
      return true;
    }).join("\n") + "\n";

    writeFileSync(envPath, finalContent, "utf-8");

    // Also try to store in config under models.providers.<provider>.apiKey
    // This is a lower-priority fallback that OpenClaw also checks
    try {
      const current = (await gateway.send("config.get", {})) as any;
      const hash = current?.hash;
      const currentConfig = current?.config || {};

      if (!currentConfig.models) currentConfig.models = {};
      if (!currentConfig.models.providers) currentConfig.models.providers = {};
      if (!currentConfig.models.providers[provider]) currentConfig.models.providers[provider] = {};
      currentConfig.models.providers[provider].apiKey = apiKey;

      await gateway.send("config.patch", {
        raw: JSON.stringify(currentConfig, null, 2),
        baseHash: hash,
      });
    } catch {
      // Config path may not be valid for all providers; .env is the primary store
    }

    res.json({ ok: true, data: { saved: true, envVar, envPath } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Store a service/skill API key or env var in ~/.openclaw/.env
router.post("/store-service-key", async (req: AuthRequest, res: Response) => {
  try {
    const { envVar, value } = req.body;
    if (!envVar || typeof envVar !== "string" || !value) {
      res.status(400).json({ ok: false, error: "envVar (string) and value are required" });
      return;
    }

    // Write to .env file
    const envPath = join(homedir(), ".openclaw", ".env");
    let envContent = "";
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf-8");
    }

    const lines = envContent.split("\n");
    let found = false;
    const updatedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith(envVar + "=") || trimmed.startsWith("export " + envVar + "=")) {
        found = true;
        return `${envVar}=${value}`;
      }
      return line;
    });

    if (!found) {
      updatedLines.push(`${envVar}=${value}`);
    }

    const finalContent = updatedLines.filter((l, i, arr) => {
      if (i === arr.length - 1 && l.trim() === "") return false;
      return true;
    }).join("\n") + "\n";

    writeFileSync(envPath, finalContent, "utf-8");

    res.json({ ok: true, data: { saved: true, envVar, envPath } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

// Deep merge utility
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
