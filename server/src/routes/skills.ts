import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { gateway } from "../gateway/connection";

const router = Router();

router.use(authMiddleware);

// --- Helpers ---

interface NormalizedSkill {
  key: string;
  name: string;
  displayName: string;
  description: string;
  emoji: string;
  source: string;
  enabled: boolean;
  eligible: boolean;
  installed: boolean;
  status: "active" | "inactive";
  inactiveReason?: "disabled" | "blocked" | "not_installed";
  missingRequirements?: { bins?: string[]; env?: string[]; config?: string[] };
  requires?: { bins?: string[]; env?: string[]; config?: string[] };
}

interface SkillCounts {
  total: number;
  active: number;
  inactive: number;
}

function computeStatus(skill: any): { status: NormalizedSkill["status"]; reason?: NormalizedSkill["inactiveReason"] } {
  if (skill.installed === false) return { status: "inactive", reason: "not_installed" };
  if (skill.enabled === false) return { status: "inactive", reason: "disabled" };
  // Default eligible to true if field is absent (backward compat)
  if (skill.eligible === false) return { status: "inactive", reason: "blocked" };
  return { status: "active" };
}

function normalizeSkill(raw: any): NormalizedSkill {
  const { status, reason } = computeStatus(raw);
  const result: NormalizedSkill = {
    key: raw.key || raw.name || "",
    name: raw.name || raw.key || "",
    displayName: raw.displayName || raw.name || raw.key || "Unknown",
    description: raw.description || "",
    emoji: raw.emoji || "\u{1F527}",
    source: raw.source || raw.type || "bundled",
    enabled: raw.enabled !== false,
    eligible: raw.eligible !== false,
    installed: raw.installed !== false,
    status,
  };

  if (reason) result.inactiveReason = reason;

  // Include missing requirements when blocked
  if (raw.missingRequirements || raw.missing) {
    const mr = raw.missingRequirements || raw.missing;
    result.missingRequirements = {
      ...(mr.bins ? { bins: mr.bins } : {}),
      ...(mr.env ? { env: mr.env } : {}),
      ...(mr.config ? { config: mr.config } : {}),
    };
  }

  // Include requires so client knows what env vars to prompt for
  if (raw.requires) {
    result.requires = {
      ...(raw.requires.bins ? { bins: raw.requires.bins } : {}),
      ...(raw.requires.env ? { env: raw.requires.env } : {}),
      ...(raw.requires.config ? { config: raw.requires.config } : {}),
    };
  }

  return result;
}

function computeCounts(skills: NormalizedSkill[]): SkillCounts {
  let total = 0;
  let active = 0;
  let inactive = 0;
  for (const s of skills) {
    total++;
    if (s.status === "active") active++;
    else inactive++;
  }
  return { total, active, inactive };
}

function extractSkillArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.skills)) return result.skills;
  if (Array.isArray(result?.installed)) return result.installed;
  return [];
}

/** Retry-safe config.patch helper */
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

// --- Routes ---

// List all skills (normalized)
router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const result = (await gateway.send("skills.status", {})) as any;
    const rawSkills = extractSkillArray(result);
    const skills = rawSkills.map(normalizeSkill);
    const counts = computeCounts(skills);

    res.json({ ok: true, data: { skills, counts } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a skill (enable/disable, set API key, env vars)
router.patch("/:skillKey", async (req: AuthRequest, res: Response) => {
  try {
    const skillKey = String(req.params.skillKey);
    const { enabled, apiKey, env } = req.body;

    const params: Record<string, unknown> = { skillKey };
    if (enabled !== undefined) params.enabled = enabled;
    if (apiKey !== undefined) params.apiKey = apiKey;
    if (env !== undefined) params.env = env;

    await gateway.send("skills.update", params);

    // Re-fetch to return refreshed state
    const result = (await gateway.send("skills.status", {})) as any;
    const rawSkills = extractSkillArray(result);
    const updated = rawSkills.find((s: any) => (s.key || s.name) === skillKey);

    res.json({
      ok: true,
      data: updated ? normalizeSkill(updated) : { skillKey, updated: true },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Store skill credentials securely via config.patch
router.post("/:skillKey/credentials", async (req: AuthRequest, res: Response) => {
  try {
    const skillKey = String(req.params.skillKey);
    const { apiKey, env } = req.body;

    if (!apiKey && !env) {
      res.status(400).json({
        ok: false,
        error: "At least one of apiKey or env is required",
      });
      return;
    }

    // Validate env values are strings
    if (env && typeof env === "object") {
      for (const [k, v] of Object.entries(env)) {
        if (typeof v !== "string") {
          res.status(400).json({
            ok: false,
            error: `env.${k} must be a string`,
          });
          return;
        }
      }
    }

    await patchConfig((cfg) => {
      const skills = cfg.skills || {};
      const entries = skills.entries || {};
      const entry = entries[skillKey] || {};

      if (apiKey) {
        entry.apiKey = apiKey;
      }
      if (env && typeof env === "object") {
        entry.env = { ...(entry.env || {}), ...env };
      }

      entries[skillKey] = entry;
      skills.entries = entries;
      return { ...cfg, skills };
    });

    // Never echo back secrets
    res.json({ ok: true, data: { saved: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Install a skill from ClawHub
router.post("/install", async (req: AuthRequest, res: Response) => {
  try {
    const { name, installId } = req.body;
    if (!name) {
      res.status(400).json({ ok: false, error: "name is required" });
      return;
    }

    const result = await gateway.send("skills.install", { name, installId });
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Resolve a ClawHub URL to a skill slug
const ALLOWED_HOSTS = ["clawhub.ai", "clawhub.com", "www.clawhub.ai", "www.clawhub.com"];

router.post("/resolve-url", async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ ok: false, error: "url is required" });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      res.status(400).json({ ok: false, error: "Invalid URL format" });
      return;
    }

    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      res.status(400).json({
        ok: false,
        error: `URL must be from clawhub.ai or clawhub.com (got ${parsed.hostname})`,
      });
      return;
    }

    // Extract slug: last non-empty path segment
    const segments = parsed.pathname.split("/").filter(Boolean);
    const slug = segments[segments.length - 1];
    if (!slug) {
      res.status(400).json({ ok: false, error: "Could not extract skill slug from URL" });
      return;
    }

    res.json({ ok: true, data: { slug, host: parsed.hostname } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
