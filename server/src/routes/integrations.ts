import { Router, Response } from "express";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { gateway } from "../gateway/connection";

const router = Router();
router.use(authMiddleware);

// ─── Types ──────────────────────────────────────────────

interface CustomIntegration {
  slug: string;
  name: string;
  apiBaseUrl: string;
  authMethod: string;
  authEnvVar?: string;
  description: string;
  instructions: string;
  createdAt: string;
  status: "pending" | "created" | "error";
  errorMessage?: string;
}

type AuthMethod =
  | "api-key-header"
  | "api-key-query"
  | "bearer"
  | "oauth2"
  | "basic"
  | "none";

const VALID_AUTH_METHODS: AuthMethod[] = [
  "api-key-header",
  "api-key-query",
  "bearer",
  "oauth2",
  "basic",
  "none",
];

// ─── Helpers ────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveEnvVar(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "_") + "_KEY";
}

function getAuthInstructions(
  authMethod: string,
  envVar: string
): string {
  switch (authMethod) {
    case "api-key-header":
      return `Include the header \`X-API-Key: $\{${envVar}}\` with every request. The API key is stored in the environment variable \`${envVar}\`.`;
    case "api-key-query":
      return `Append \`?api_key=$\{${envVar}}\` as a query parameter to every request URL. The API key is stored in the environment variable \`${envVar}\`.`;
    case "bearer":
      return `Include the header \`Authorization: Bearer $\{${envVar}}\` with every request. The token is stored in the environment variable \`${envVar}\`.`;
    case "oauth2":
      return `This API uses OAuth2 authentication. The client credentials are stored in environment variables \`${envVar}_CLIENT_ID\` and \`${envVar}_CLIENT_SECRET\`. Obtain an access token from the OAuth2 token endpoint before making API calls.`;
    case "basic":
      return `This API uses HTTP Basic authentication. Credentials are stored in environment variables \`${envVar}_USERNAME\` and \`${envVar}_PASSWORD\`. Encode them as Base64 and include the header \`Authorization: Basic <encoded>\`.`;
    case "none":
      return "This API does not require authentication.";
    default:
      return `Authentication method: ${authMethod}. Credentials may be stored in the environment variable \`${envVar}\`.`;
  }
}

function buildSkillMd(integration: {
  name: string;
  slug: string;
  description: string;
  apiBaseUrl: string;
  authMethod: string;
  authEnvVar: string;
  instructions: string;
}): string {
  const authInstructions = getAuthInstructions(
    integration.authMethod,
    integration.authEnvVar
  );

  return `---
name: ${integration.name}
description: ${integration.description}
version: 1.0.0
author: custom
tags:
  - api-integration
  - custom
---

# ${integration.name}

${integration.description}

## Authentication

${authInstructions}

## API Reference

Base URL: \`${integration.apiBaseUrl}\`

## Instructions

${integration.instructions}
`;
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

/** Send a prompt to the agent and wait for full response */
async function agentExec(
  prompt: string,
  timeoutMs = 60000
): Promise<any> {
  const defaults = gateway.sessionDefaults;
  const agentId = defaults?.defaultAgentId || "main";
  const mainKey = defaults?.mainKey || "main";
  const sessionKey = `agent:${agentId}:${mainKey}`;

  return gateway.send(
    "chat.send",
    {
      sessionKey,
      message: prompt,
      deliver: "full",
      thinking: "low",
      idempotencyKey: `integration-${Date.now()}-${randomUUID().slice(0, 8)}`,
    },
    timeoutMs
  );
}

// ─── GET /api/integrations — List all custom integrations ─

router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const [configResult, skillsResult] = await Promise.all([
      gateway.send("config.get", {}) as Promise<any>,
      gateway.send("skills.status", {}).catch(() => null),
    ]);

    const integrations: CustomIntegration[] =
      configResult?.config?.customIntegrations || [];

    // Cross-reference with live skill status
    const sr = skillsResult as any;
    const skills = Array.isArray(sr?.skills)
      ? sr.skills
      : Array.isArray(sr)
        ? sr
        : [];

    const enriched = integrations.map((integ: CustomIntegration) => {
      const skill = skills.find(
        (s: any) =>
          s.key === integ.slug ||
          s.name?.toLowerCase() === integ.name.toLowerCase()
      );
      return {
        ...integ,
        skillFound: !!skill,
        skillEnabled: skill?.enabled ?? false,
      };
    });

    res.json({ ok: true, data: { integrations: enriched } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/integrations — Create a new integration ──

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { name, apiBaseUrl, authMethod, credentials, description, instructions } =
      req.body;

    // Validate
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({ ok: false, error: "Name is required (min 2 characters)" });
      return;
    }
    if (!apiBaseUrl || typeof apiBaseUrl !== "string") {
      res.status(400).json({ ok: false, error: "API Base URL is required" });
      return;
    }
    if (!authMethod || !VALID_AUTH_METHODS.includes(authMethod)) {
      res.status(400).json({
        ok: false,
        error: `Invalid auth method. Must be one of: ${VALID_AUTH_METHODS.join(", ")}`,
      });
      return;
    }
    if (!description || typeof description !== "string") {
      res.status(400).json({ ok: false, error: "Description is required" });
      return;
    }
    if (!instructions || typeof instructions !== "string") {
      res.status(400).json({ ok: false, error: "Instructions are required" });
      return;
    }

    const slug = slugify(name);
    if (!slug) {
      res.status(400).json({ ok: false, error: "Name must contain at least one alphanumeric character" });
      return;
    }

    // Check for duplicate
    const currentConfig = (await gateway.send("config.get", {})) as any;
    const existing: CustomIntegration[] =
      currentConfig?.config?.customIntegrations || [];
    if (existing.some((e) => e.slug === slug)) {
      res.status(409).json({
        ok: false,
        error: `Integration "${slug}" already exists`,
      });
      return;
    }

    const envVar = deriveEnvVar(slug);

    // Step 1: Store credentials via agent (if provided)
    // Uses update-or-append pattern to avoid duplicates
    if (credentials && authMethod !== "none") {
      if (authMethod === "oauth2") {
        if (credentials.clientId) {
          await agentExec(
            `Update the file ~/.openclaw/.env: if a line starting with "${envVar}_CLIENT_ID=" exists, replace it with "${envVar}_CLIENT_ID=${credentials.clientId}". Otherwise, append the line "${envVar}_CLIENT_ID=${credentials.clientId}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`
          );
        }
        if (credentials.clientSecret) {
          await agentExec(
            `Update the file ~/.openclaw/.env: if a line starting with "${envVar}_CLIENT_SECRET=" exists, replace it with "${envVar}_CLIENT_SECRET=${credentials.clientSecret}". Otherwise, append the line "${envVar}_CLIENT_SECRET=${credentials.clientSecret}" to the end of the file. Do NOT remove or modify any other lines. Confirm when done.`
          );
        }
      } else if (authMethod === "basic") {
        if (credentials.username) {
          await agentExec(
            `Update the file ~/.openclaw/.env: if a line starting with "${envVar}_USERNAME=" exists, replace it with "${envVar}_USERNAME=${credentials.username}". Otherwise, append the line "${envVar}_USERNAME=${credentials.username}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`
          );
        }
        if (credentials.password) {
          await agentExec(
            `Update the file ~/.openclaw/.env: if a line starting with "${envVar}_PASSWORD=" exists, replace it with "${envVar}_PASSWORD=${credentials.password}". Otherwise, append the line "${envVar}_PASSWORD=${credentials.password}" to the end of the file. Do NOT remove or modify any other lines. Confirm when done.`
          );
        }
      } else {
        // Single API key/token
        const value =
          typeof credentials === "string" ? credentials : credentials.apiKey;
        if (value) {
          await agentExec(
            `Update the file ~/.openclaw/.env: if a line starting with "${envVar}=" exists, replace it with "${envVar}=${value}". Otherwise, append the line "${envVar}=${value}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`
          );
        }
      }
    }

    // Step 2: Build SKILL.md
    const skillMd = buildSkillMd({
      name: name.trim(),
      slug,
      description: description.trim(),
      apiBaseUrl: apiBaseUrl.trim(),
      authMethod,
      authEnvVar: envVar,
      instructions: instructions.trim(),
    });

    // Step 3: Store metadata in config
    const integration: CustomIntegration = {
      slug,
      name: name.trim(),
      apiBaseUrl: apiBaseUrl.trim(),
      authMethod,
      authEnvVar: envVar,
      description: description.trim(),
      instructions: instructions.trim(),
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    await patchConfig((config) => ({
      ...config,
      customIntegrations: [...(config.customIntegrations || []), integration],
    }));

    // Step 4: Create skill via agent
    let createResult: any;
    try {
      createResult = await agentExec(
        `Create a new OpenClaw skill by performing these exact steps:\n1. Create the directory ~/.openclaw/skills/${slug}/ (and any parent directories if needed)\n2. Write the following content EXACTLY to the file ~/.openclaw/skills/${slug}/SKILL.md:\n\n${skillMd}\n\nConfirm when the file has been created successfully.`,
        60000
      );
    } catch (err: any) {
      // Update status to error
      await patchConfig((config) => ({
        ...config,
        customIntegrations: (config.customIntegrations || []).map(
          (i: CustomIntegration) =>
            i.slug === slug
              ? { ...i, status: "error", errorMessage: err.message }
              : i
        ),
      })).catch(() => {});

      res.status(500).json({
        ok: false,
        error: `Agent failed to create skill: ${err.message}`,
      });
      return;
    }

    // Step 5: Verify with delay for watcher refresh
    await new Promise((r) => setTimeout(r, 2000));
    let verified = false;
    try {
      const skills = (await gateway.send("skills.status", {})) as any;
      const skillList = Array.isArray(skills?.skills)
        ? skills.skills
        : Array.isArray(skills)
          ? skills
          : [];
      verified = skillList.some(
        (s: any) =>
          s.key === slug || s.name?.toLowerCase() === name.trim().toLowerCase()
      );
    } catch {
      // Verification failed, not fatal
    }

    // Step 6: Update status
    const finalStatus = verified ? "created" : "pending";
    await patchConfig((config) => ({
      ...config,
      customIntegrations: (config.customIntegrations || []).map(
        (i: CustomIntegration) =>
          i.slug === slug ? { ...i, status: finalStatus } : i
      ),
    })).catch(() => {});

    res.json({
      ok: true,
      data: {
        integration: { ...integration, status: finalStatus },
        verified,
        agentResponse: createResult,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/integrations/:slug — Update an integration ─

router.put("/:slug", async (req: AuthRequest, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const { name, apiBaseUrl, authMethod, credentials, description, instructions } =
      req.body;

    // Find existing
    const currentConfig = (await gateway.send("config.get", {})) as any;
    const existing: CustomIntegration[] =
      currentConfig?.config?.customIntegrations || [];
    const idx = existing.findIndex((e) => e.slug === slug);
    if (idx === -1) {
      res.status(404).json({ ok: false, error: "Integration not found" });
      return;
    }

    const current = existing[idx];
    const updated: CustomIntegration = {
      ...current,
      name: name?.trim() || current.name,
      apiBaseUrl: apiBaseUrl?.trim() || current.apiBaseUrl,
      authMethod: authMethod || current.authMethod,
      description: description?.trim() || current.description,
      instructions: instructions?.trim() || current.instructions,
      status: "pending",
    };

    const envVar = updated.authEnvVar || deriveEnvVar(slug);
    updated.authEnvVar = envVar;

    // Store updated credentials if provided
    if (credentials && updated.authMethod !== "none") {
      const value =
        typeof credentials === "string" ? credentials : credentials.apiKey;
      if (value) {
        await agentExec(
          `Update the file ~/.openclaw/.env: if a line starting with "${envVar}=" exists, replace it with "${envVar}=${value}". Otherwise, append the line "${envVar}=${value}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`
        );
      }
    }

    // Rebuild SKILL.md
    const skillMd = buildSkillMd({
      name: updated.name,
      slug,
      description: updated.description,
      apiBaseUrl: updated.apiBaseUrl,
      authMethod: updated.authMethod,
      authEnvVar: envVar,
      instructions: updated.instructions,
    });

    // Update config
    await patchConfig((config) => ({
      ...config,
      customIntegrations: (config.customIntegrations || []).map(
        (i: CustomIntegration) => (i.slug === slug ? updated : i)
      ),
    }));

    // Overwrite SKILL.md via agent
    await agentExec(
      `Overwrite the file ~/.openclaw/skills/${slug}/SKILL.md with the following content EXACTLY:\n\n${skillMd}\n\nConfirm when the file has been updated.`,
      60000
    );

    // Update status
    await patchConfig((config) => ({
      ...config,
      customIntegrations: (config.customIntegrations || []).map(
        (i: CustomIntegration) =>
          i.slug === slug ? { ...i, status: "created" } : i
      ),
    })).catch(() => {});

    res.json({ ok: true, data: { integration: { ...updated, status: "created" } } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/integrations/:slug — Remove integration ─

router.delete("/:slug", async (req: AuthRequest, res: Response) => {
  try {
    const slug = req.params.slug as string;

    // Verify it exists
    const currentConfig = (await gateway.send("config.get", {})) as any;
    const existing: CustomIntegration[] =
      currentConfig?.config?.customIntegrations || [];
    if (!existing.some((e) => e.slug === slug)) {
      res.status(404).json({ ok: false, error: "Integration not found" });
      return;
    }

    // Remove skill directory via agent
    try {
      await agentExec(
        `Remove the directory ~/.openclaw/skills/${slug}/ and all its contents. Confirm when done.`,
        30000
      );
    } catch {
      // Non-fatal — directory might not exist
    }

    // Remove from config
    await patchConfig((config) => ({
      ...config,
      customIntegrations: (config.customIntegrations || []).filter(
        (i: CustomIntegration) => i.slug !== slug
      ),
    }));

    res.json({ ok: true, data: { deleted: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/integrations/:slug/recommend — ClawHub suggestions ─

router.post("/:slug/recommend", async (req: AuthRequest, res: Response) => {
  try {
    const slug = req.params.slug as string;

    // Get integration metadata
    const currentConfig = (await gateway.send("config.get", {})) as any;
    const integrations: CustomIntegration[] =
      currentConfig?.config?.customIntegrations || [];
    const integration = integrations.find((i) => i.slug === slug);

    if (!integration) {
      res.status(404).json({ ok: false, error: "Integration not found" });
      return;
    }

    // Search ClawHub
    let searchResults: any[] = [];
    try {
      const results = (await gateway.send("skills.search", {
        query: `${integration.name} ${integration.description}`,
      })) as any;
      searchResults = Array.isArray(results?.skills)
        ? results.skills
        : Array.isArray(results)
          ? results
          : [];
    } catch {
      // ClawHub not available
    }

    if (searchResults.length === 0) {
      res.json({ ok: true, data: { results: [], ranked: [] } });
      return;
    }

    // Ask LLM to rank results
    let ranked: any[] = [];
    try {
      const prompt = `The user just created a custom API integration skill for "${integration.name}" that does: "${integration.description}". The API base URL is ${integration.apiBaseUrl}.

Here are related skills available on ClawHub:
${JSON.stringify(
        searchResults.map((s: any) => ({
          name: s.name || s.key,
          description: s.description || "",
          installId: s.installId || s.id,
        })),
        null,
        2
      )}

Which of these would complement what the user just set up? Return ONLY a JSON array (no other text) where each element has:
- "name": the skill name
- "installId": the install ID
- "relevance": "high" | "medium" | "low"
- "rationale": one sentence explaining why it's relevant

Only include skills with "high" or "medium" relevance. Return an empty array [] if none are relevant.`;

      const llmResult = (await agentExec(prompt, 30000)) as any;

      // Extract JSON from response
      const responseText =
        typeof llmResult === "string"
          ? llmResult
          : llmResult?.message?.content?.[0]?.text ||
            llmResult?.text ||
            JSON.stringify(llmResult);

      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        ranked = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // LLM ranking failed — return raw results without ranking
    }

    res.json({ ok: true, data: { results: searchResults, ranked } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/integrations/install-skill — Install from ClawHub ─

router.post("/install-skill", async (req: AuthRequest, res: Response) => {
  try {
    const { name, installId } = req.body;
    if (!name) {
      res.status(400).json({ ok: false, error: "Skill name is required" });
      return;
    }

    const result = await gateway.send("skills.install", {
      name,
      ...(installId ? { installId } : {}),
    });

    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
