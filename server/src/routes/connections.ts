import { Router, Response } from "express";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { gateway } from "../gateway/connection";

const router = Router();

router.use(authMiddleware);

// ─── Helpers ────────────────────────────────────────────

/** Send a prompt to the agent and wait for full response (gateway-only) */
async function agentExec(prompt: string, timeoutMs = 60000): Promise<any> {
  const defaults = gateway.sessionDefaults;
  const agentId = defaults?.defaultAgentId || "main";
  const mainKey = defaults?.mainKey || "main";
  const sessionKey = `agent:${agentId}:${mainKey}`;

  return gateway.send(
    "chat.send",
    {
      sessionKey,
      message: prompt,
      deliver: true,
      thinking: "low",
      idempotencyKey: `conn-${Date.now()}-${randomUUID().slice(0, 8)}`,
    },
    timeoutMs
  );
}

/** Patch gateway config with retry on hash conflict */
async function patchConfig(
  updateFn: (config: any) => any,
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
      // Hash conflict — retry with fresh config
    }
  }
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

const PROVIDER_TO_ENV_VAR: Record<string, string> = Object.fromEntries(
  Object.entries(ENV_VAR_TO_PROVIDER).map(([k, v]) => [v, k])
);

/**
 * Detect which provider API keys are configured by asking the agent
 * to read ~/.openclaw/.env through the gateway. Falls back to checking
 * config.get models.providers for stored apiKey values.
 */
async function detectProviderKeys(): Promise<{
  providerKeys: Record<string, boolean>;
  envKeys: Record<string, boolean>;
}> {
  const providerKeys: Record<string, boolean> = {};
  const envKeys: Record<string, boolean> = {};

  // Method 1: Check gateway config for stored provider keys
  try {
    const configResult = (await gateway.send("config.get", {})) as any;
    const providers = configResult?.config?.models?.providers || {};
    for (const [providerId, providerConf] of Object.entries(providers)) {
      if ((providerConf as any)?.apiKey) {
        providerKeys[providerId] = true;
        const ev = PROVIDER_TO_ENV_VAR[providerId];
        if (ev) envKeys[ev] = true;
      }
    }

    // Check storedEnvKeys from config (we store these during credential saves)
    const storedEnv = configResult?.config?.storedEnvKeys || {};
    for (const [key, value] of Object.entries(storedEnv)) {
      if (value) {
        envKeys[key] = true;
        const provider = ENV_VAR_TO_PROVIDER[key];
        if (provider) providerKeys[provider] = true;
      }
    }
  } catch {
    // Gateway not available
  }

  // Method 2: Ask agent to check which env vars are set (more reliable)
  try {
    const envVarsToCheck = Object.keys(ENV_VAR_TO_PROVIDER);
    const allKnownEnvVars = [
      ...envVarsToCheck,
      "NOTION_API_KEY",
      "GOOGLE_PLACES_API_KEY",
      "TRELLO_API_KEY",
      "TRELLO_TOKEN",
      "ELEVENLABS_API_KEY",
      "GEMINI_API_KEY",
    ];

    const result = (await agentExec(
      `Check which of these environment variables are set (have non-empty values) in the file ~/.openclaw/.env. Return ONLY a JSON object where each key is the env var name and the value is true if set, false if not set or missing. Do not include the actual values. Variables to check:\n${allKnownEnvVars.join("\n")}\n\nReturn ONLY the JSON object, no other text.`,
      15000
    )) as any;

    // Parse the agent response
    const responseText =
      typeof result === "string"
        ? result
        : result?.message?.content?.[0]?.text || result?.text || "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      for (const [key, value] of Object.entries(parsed)) {
        if (value) {
          envKeys[key] = true;
          const provider = ENV_VAR_TO_PROVIDER[key];
          if (provider) providerKeys[provider] = true;
        }
      }
    }
  } catch {
    // Agent check failed — rely on config method only
  }

  return { providerKeys, envKeys };
}

// ─── Routes ─────────────────────────────────────────────

// Get full connection status (config + channels + models)
router.get("/status", async (_req: AuthRequest, res: Response) => {
  try {
    const [config, channels, models, keyStatus] = await Promise.all([
      gateway.send("config.get", {}),
      gateway.send("channels.status", { probe: true }),
      gateway.send("models.list", {}),
      detectProviderKeys(),
    ]);

    res.json({
      ok: true,
      data: {
        config,
        channels,
        models,
        providerKeys: keyStatus.providerKeys,
        envKeys: keyStatus.envKeys,
      },
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

    await patchConfig((config) => {
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      if (!config.agents.defaults.model) config.agents.defaults.model = {};
      config.agents.defaults.model.primary = model;
      return config;
    });

    res.json({ ok: true, data: { saved: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Store a provider API key — pipes through gateway agent to write ~/.openclaw/.env
router.post("/store-credential", async (req: AuthRequest, res: Response) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider || !apiKey) {
      res.status(400).json({ ok: false, error: "provider and apiKey are required" });
      return;
    }

    const envVar = PROVIDER_TO_ENV_VAR[provider];
    if (!envVar) {
      res.status(400).json({ ok: false, error: `Unknown provider: ${provider}` });
      return;
    }

    // Store via agent prompt → writes to ~/.openclaw/.env on the OpenClaw host
    await agentExec(
      `Update the file ~/.openclaw/.env: if a line starting with "${envVar}=" exists, replace it with "${envVar}=${apiKey}". Otherwise, append the line "${envVar}=${apiKey}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`,
      30000
    );

    // Also store in gateway config for redundancy + faster reads
    try {
      await patchConfig((config) => {
        if (!config.models) config.models = {};
        if (!config.models.providers) config.models.providers = {};
        if (!config.models.providers[provider]) config.models.providers[provider] = {};
        config.models.providers[provider].apiKey = apiKey;

        // Track which env vars have been stored (for status checks)
        if (!config.storedEnvKeys) config.storedEnvKeys = {};
        config.storedEnvKeys[envVar] = true;
        return config;
      });
    } catch {
      // Config fallback is non-critical
    }

    res.json({ ok: true, data: { saved: true, envVar } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Store a service/skill API key — pipes through gateway agent
router.post("/store-service-key", async (req: AuthRequest, res: Response) => {
  try {
    const { envVar, value } = req.body;
    if (!envVar || typeof envVar !== "string" || !value) {
      res.status(400).json({ ok: false, error: "envVar (string) and value are required" });
      return;
    }

    // Store via agent prompt → writes to ~/.openclaw/.env on the OpenClaw host
    await agentExec(
      `Update the file ~/.openclaw/.env: if a line starting with "${envVar}=" exists, replace it with "${envVar}=${value}". Otherwise, append the line "${envVar}=${value}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`,
      30000
    );

    // Track in config for faster status reads
    try {
      await patchConfig((config) => {
        if (!config.storedEnvKeys) config.storedEnvKeys = {};
        config.storedEnvKeys[envVar] = true;
        return config;
      });
    } catch {
      // Non-critical
    }

    res.json({ ok: true, data: { saved: true, envVar } });
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
