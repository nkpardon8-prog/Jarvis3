import { Router, Response } from "express";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { gateway } from "../gateway/connection";
import { prisma } from "../services/prisma";
import {
  WORKFLOW_TEMPLATES,
  getTemplateById,
  type WorkflowTemplate,
} from "./workflow-templates";

const router = Router();
router.use(authMiddleware);

// ─── Helpers ────────────────────────────────────────────

/** Serialize a Prisma Workflow row into the API response shape */
function serializeWorkflow(row: any) {
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    status: row.status,
    schedule: JSON.parse(row.schedule || "{}"),
    customTrigger: row.customTrigger || undefined,
    additionalInstructions: row.additionalInstructions || "",
    cronJobId: row.cronJobId || undefined,
    cronJobName: row.cronJobName,
    installedSkills: JSON.parse(row.installedSkills || "[]"),
    storedCredentials: JSON.parse(row.storedCredentials || "[]"),
    generatedPrompt: row.generatedPrompt || undefined,
    errorMessage: row.errorMessage || undefined,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
  };
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
      deliver: true,
      thinking: "low",
      idempotencyKey: `workflow-${Date.now()}-${randomUUID().slice(0, 8)}`,
    },
    timeoutMs
  );
}

/** Check if a gateway method is available */
function hasCronMethods(): boolean {
  const methods = gateway.availableMethods || [];
  const has = methods.includes("cron.add");
  console.log(`[Workflows] hasCronMethods: ${has} (${methods.length} total methods, cron methods: ${methods.filter(m => m.startsWith("cron")).join(", ") || "none"})`);
  return has;
}

/** Build cron job schedule params from workflow schedule */
function buildCronSchedule(schedule: {
  kind: string;
  expr?: string;
  intervalMs?: number;
  tz?: string;
}): Record<string, unknown> {
  if (schedule.kind === "every" && schedule.intervalMs) {
    return { kind: "every", everyMs: schedule.intervalMs };
  }
  if (schedule.kind === "cron" && schedule.expr) {
    const cronSchedule: Record<string, unknown> = {
      kind: "cron",
      expr: schedule.expr,
    };
    if (schedule.tz) cronSchedule.tz = schedule.tz;
    return cronSchedule;
  }
  throw new Error("Invalid schedule configuration");
}

/** Assemble the agent prompt from template + user instructions */
function assemblePrompt(
  template: WorkflowTemplate,
  additionalInstructions: string,
  customTrigger?: string
): string {
  let prompt = template.promptTemplate.replace(
    "{{ADDITIONAL_INSTRUCTIONS}}",
    additionalInstructions || ""
  );

  if (customTrigger) {
    prompt = `[Trigger context: ${customTrigger}]\n\n${prompt}`;
  }

  return prompt;
}

/** Get the agent prompt for any workflow (template or custom).
 *  Accepts either a Prisma row or a serialized workflow object. */
function getWorkflowPrompt(workflow: {
  templateId: string;
  additionalInstructions?: string | null;
  customTrigger?: string | null;
  generatedPrompt?: string | null;
}): string | null {
  // Custom workflow — use stored prompt
  if (workflow.generatedPrompt) {
    return workflow.generatedPrompt;
  }
  // Template workflow — assemble from template
  const template = getTemplateById(workflow.templateId);
  if (template) {
    return assemblePrompt(template, workflow.additionalInstructions || "", workflow.customTrigger || undefined);
  }
  return null;
}

// ─── GET /api/workflows — List all workflow instances ────

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = await prisma.workflow.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    const workflows = rows.map(serializeWorkflow);

    // Cross-reference with live cron status if available
    let cronJobs: any[] = [];
    if (hasCronMethods()) {
      try {
        const cronResult = (await gateway.send("cron.list", {})) as any;
        cronJobs = Array.isArray(cronResult?.jobs)
          ? cronResult.jobs
          : Array.isArray(cronResult)
            ? cronResult
            : [];
      } catch {
        // cron.list not available
      }
    }

    const enriched = workflows.map((wf: any) => {
      const cronJob = cronJobs.find(
        (j: any) => j.name === wf.cronJobName || j.id === wf.cronJobId
      );
      const template = getTemplateById(wf.templateId);

      return {
        ...wf,
        cronActive: !!cronJob,
        lastRun: cronJob?.lastRun || null,
        nextRun: cronJob?.nextRun || null,
        template: template
          ? {
              icon: template.icon,
              accentColor: template.accentColor,
              category: template.category,
            }
          : null,
      };
    });

    res.json({ ok: true, data: { workflows: enriched } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/workflows/templates — List available templates ─

router.get("/templates", async (_req: AuthRequest, res: Response) => {
  try {
    // Templates are static — credential "alreadyStored" is always false since
    // we can't reliably query gateway .env file content. The UI handles this
    // by always showing credential fields for new workflow setup.
    const templates = WORKFLOW_TEMPLATES.map((t) => ({
      ...t,
      credentialFields: t.credentialFields.map((f) => ({
        ...f,
        alreadyStored: false,
      })),
    }));

    res.json({ ok: true, data: { templates } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/workflows — Activate a workflow (SSE streaming) ──

router.post("/", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const wantStream = req.headers.accept === "text/event-stream";

  function sendProgress(step: string, status: "active" | "done" | "error", message?: string) {
    if (!wantStream) return;
    try { res.write(`data: ${JSON.stringify({ step, status, message })}\n\n`); } catch { /* closed */ }
  }

  if (wantStream) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  }

  try {
    const { templateId, name: customName, credentials, schedule, additionalInstructions, customTrigger } = req.body;

    // 1. Validate
    const template = getTemplateById(templateId);
    if (!template) {
      if (wantStream) { sendProgress("validate", "error", `Unknown template: ${templateId}`); res.end(); }
      else { res.status(400).json({ ok: false, error: `Unknown template: ${templateId}` }); }
      return;
    }
    if (!schedule?.kind) {
      if (wantStream) { sendProgress("validate", "error", "Schedule is required"); res.end(); }
      else { res.status(400).json({ ok: false, error: "Schedule is required" }); }
      return;
    }
    if (schedule.kind === "cron" && !schedule.expr) {
      if (wantStream) { sendProgress("validate", "error", "Cron expression required"); res.end(); }
      else { res.status(400).json({ ok: false, error: "Cron expression required" }); }
      return;
    }
    if (schedule.kind === "every" && !schedule.intervalMs) {
      if (wantStream) { sendProgress("validate", "error", "Interval required"); res.end(); }
      else { res.status(400).json({ ok: false, error: "Interval required" }); }
      return;
    }

    // Gateway pre-check — fail fast if gateway is disconnected
    if (!gateway.isConnected) {
      const msg = "Gateway is disconnected — cannot create workflow. Check your gateway connection in Settings.";
      if (wantStream) { sendProgress("validate", "error", msg); res.end(); }
      else { res.status(503).json({ ok: false, error: msg }); }
      return;
    }

    // Check which creds are already stored (if any)
    for (const field of template.credentialFields) {
      if (field.label.toLowerCase().includes("optional")) continue;
      if (!credentials?.[field.envVar]) {
        const msg = `Credential "${field.label}" is required`;
        if (wantStream) { sendProgress("validate", "error", msg); res.end(); }
        else { res.status(400).json({ ok: false, error: msg }); }
        return;
      }
    }

    const workflowId = randomUUID();
    const shortId = workflowId.slice(0, 8);
    const cronJobName = `jarvis-wf-${templateId}-${shortId}`;
    const workflowName = customName?.trim() || template.name;

    // Save initial row in Prisma
    await prisma.workflow.create({
      data: {
        id: workflowId,
        userId,
        templateId,
        name: workflowName,
        status: "setting-up",
        schedule: JSON.stringify(schedule),
        customTrigger: customTrigger || null,
        additionalInstructions: additionalInstructions || "",
        cronJobName,
      },
    });

    // 2. Install required skills
    sendProgress("skills", "active");
    const installedSkills: string[] = [];
    for (const skillName of template.requiredSkills) {
      try {
        await gateway.send("skills.install", { name: skillName }, 15000);
        installedSkills.push(skillName);
      } catch (err: any) {
        if (!err.message?.includes("already")) {
          console.warn(`[Workflows] Skill install warning for "${skillName}": ${err.message}`);
        }
        installedSkills.push(skillName);
      }
    }
    sendProgress("skills", "done");

    // 2b. Deploy custom skills via agentExec
    sendProgress("custom-skills", "active");
    if (template.customSkills && template.customSkills.length > 0) {
      for (const cs of template.customSkills) {
        try {
          await agentExec(
            `Create the directory ~/.openclaw/skills/${cs.slug}/ if it does not exist, then write the following content to ~/.openclaw/skills/${cs.slug}/SKILL.md (overwrite if exists):\n\n${cs.skillMd}\n\nConfirm when the file is written.`,
            30000
          );
          installedSkills.push(cs.slug);
        } catch (err: any) {
          console.warn(`[Workflows] Custom skill deploy warning for "${cs.slug}": ${err.message}`);
          installedSkills.push(cs.slug); // optimistic
        }
      }
    }
    sendProgress("custom-skills", "done");

    // 3. Store credentials via agentExec
    sendProgress("credentials", "active");
    const storedCreds: string[] = [];
    for (const field of template.credentialFields) {
      const value = credentials?.[field.envVar];
      if (value) {
        try {
          await agentExec(
            `Update the file ~/.openclaw/.env: if a line starting with "${field.envVar}=" exists, replace it with "${field.envVar}=${value}". Otherwise, append the line "${field.envVar}=${value}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`,
            30000
          );
          storedCreds.push(field.envVar);
        } catch (err: any) {
          console.error(`[Workflows] Credential store failed ${field.envVar}: ${err.message}`);
          storedCreds.push(field.envVar); // optimistic
        }
      }
    }
    sendProgress("credentials", "done");

    // 4. Create cron job
    sendProgress("cron", "active");
    let cronJobId: string | undefined;
    let cronError: string | undefined;
    const agentPrompt = assemblePrompt(template, additionalInstructions || "", customTrigger);

    if (hasCronMethods()) {
      try {
        const cronResult = (await gateway.send("cron.add", {
          name: cronJobName,
          schedule: buildCronSchedule(schedule),
          sessionTarget: template.sessionTarget,
          payload: { kind: "agentTurn", message: agentPrompt },
        }, 15000)) as any;
        cronJobId = cronResult?.id || cronResult?.jobId;
      } catch (err: any) {
        console.error(`[Workflows] cron.add failed: ${err.message}`);
        cronError = `Cron job creation failed: ${err.message}`;
      }
    } else {
      cronError = "Cron scheduling is not available — gateway may not support it";
    }

    if (cronError) {
      sendProgress("cron", "error", cronError);
    } else {
      sendProgress("cron", "done");
    }

    // 5. Update status — error if cron failed, active otherwise
    sendProgress("verify", "active");
    const finalStatus = cronError ? "error" : "active";
    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: finalStatus,
        cronJobId: cronJobId || null,
        installedSkills: JSON.stringify(installedSkills),
        storedCredentials: JSON.stringify(storedCreds),
        errorMessage: cronError || null,
      },
    });
    sendProgress("verify", "done");

    const resultData = { ok: true, data: { workflow: serializeWorkflow(updated) } };

    if (wantStream) {
      res.write(`data: ${JSON.stringify({ step: "complete", status: "done", result: resultData })}\n\n`);
      res.end();
    } else {
      res.json(resultData);
    }
  } catch (err: any) {
    console.error(`[Workflows] Template workflow error: ${err.message}`);
    if (wantStream) { sendProgress("error", "error", err.message); res.end(); }
    else { res.status(500).json({ ok: false, error: err.message }); }
  }
});

// ─── POST /api/workflows/custom — Create custom workflow (SSE streaming) ──

router.post("/custom", async (req: AuthRequest, res: Response) => {
  const wantStream = req.headers.accept === "text/event-stream";

  function sendProgress(step: string, status: "active" | "done" | "error", message?: string) {
    if (!wantStream) return;
    try {
      res.write(`data: ${JSON.stringify({ step, status, message })}\n\n`);
    } catch { /* connection may have closed */ }
  }

  if (wantStream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
  }

  try {
    const {
      name,
      description,
      schedule,
      credentials, // Array of { envVar, label, value }
      additionalInstructions,
      customTrigger,
    } = req.body;

    // 1. Validate inputs
    if (!name?.trim()) {
      if (wantStream) { sendProgress("validate", "error", "Workflow name is required"); res.end(); }
      else { res.status(400).json({ ok: false, error: "Workflow name is required" }); }
      return;
    }
    if (!description?.trim()) {
      if (wantStream) { sendProgress("validate", "error", "Workflow description is required"); res.end(); }
      else { res.status(400).json({ ok: false, error: "Workflow description is required" }); }
      return;
    }
    if (!schedule || !schedule.kind) {
      if (wantStream) { sendProgress("validate", "error", "Schedule is required"); res.end(); }
      else { res.status(400).json({ ok: false, error: "Schedule is required" }); }
      return;
    }
    if (schedule.kind === "cron" && !schedule.expr) {
      if (wantStream) { sendProgress("validate", "error", "Cron expression is required"); res.end(); }
      else { res.status(400).json({ ok: false, error: "Cron expression is required" }); }
      return;
    }
    if (schedule.kind === "every" && !schedule.intervalMs) {
      if (wantStream) { sendProgress("validate", "error", "Interval is required"); res.end(); }
      else { res.status(400).json({ ok: false, error: "Interval is required" }); }
      return;
    }

    // Gateway pre-check — fail fast if gateway is disconnected
    if (!gateway.isConnected) {
      const msg = "Gateway is disconnected — cannot create workflow. Check your gateway connection in Settings.";
      if (wantStream) { sendProgress("validate", "error", msg); res.end(); }
      else { res.status(503).json({ ok: false, error: msg }); }
      return;
    }

    const workflowId = randomUUID();
    const shortId = workflowId.slice(0, 8);
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const cronJobName = `jarvis-wf-custom-${slug}-${shortId}`;
    const workflowName = name.trim();

    // 2. Save initial "setting-up" state in Prisma
    await prisma.workflow.create({
      data: {
        id: workflowId,
        userId: req.user!.userId,
        templateId: `custom-${slug}`,
        name: workflowName,
        status: "setting-up",
        schedule: JSON.stringify(schedule),
        customTrigger: customTrigger || null,
        additionalInstructions: additionalInstructions || "",
        cronJobName,
      },
    });

    // 3. Store user-provided credentials
    sendProgress("credentials", "active");
    const storedCreds: string[] = [];

    const credentialList: { envVar: string; label: string; value: string }[] =
      Array.isArray(credentials) ? credentials : [];

    for (const cred of credentialList) {
      if (cred.value?.trim()) {
        try {
          await agentExec(
            `Update the file ~/.openclaw/.env: if a line starting with "${cred.envVar}=" exists, replace it with "${cred.envVar}=${cred.value.trim()}". Otherwise, append the line "${cred.envVar}=${cred.value.trim()}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`,
            30000
          );
          storedCreds.push(cred.envVar);
        } catch (err: any) {
          console.error(`[Workflows] Failed to store credential ${cred.envVar}: ${err.message}`);
          storedCreds.push(cred.envVar); // optimistic
        }
      }
    }
    sendProgress("credentials", "done");

    // 4. Use the agent to analyze the workflow and generate system prompt + identify skills
    sendProgress("analyze", "active");
    const credentialInfo = credentialList.length > 0
      ? `\nAvailable credentials (already stored in ~/.openclaw/.env):\n${credentialList.map((c) => `- ${c.envVar}: ${c.label}`).join("\n")}`
      : "\nNo credentials were provided by the user.";

    const analysisPrompt = `You are helping set up an automated workflow. Analyze the following workflow description and produce a JSON response.

Workflow Name: ${workflowName}
Workflow Description: ${description.trim()}
${credentialInfo}
${additionalInstructions ? `\nAdditional Instructions: ${additionalInstructions.trim()}` : ""}

Respond with a JSON object (and nothing else) with these fields:
{
  "systemPrompt": "A comprehensive system prompt for the agent that will execute this workflow. Include: role identity, available tools/credentials, step-by-step instructions, output format, and error handling. Reference any credential env vars by name.",
  "suggestedSkills": ["skill-slug-1", "skill-slug-2"],
  "skillsToCreate": [
    {
      "slug": "my-custom-skill",
      "name": "My Custom Skill",
      "description": "What this skill does",
      "skillMd": "Full SKILL.md content with YAML frontmatter"
    }
  ],
  "suggestedConnections": ["Description of a recommended connection if no credentials were provided"]
}

Rules:
- suggestedSkills: List ClawHub skill slugs that should be installed (e.g., "github", "slack", "notion", "gmail", "web-search", "home-assistant", "google-calendar", "google-drive").
- skillsToCreate: Only include this if the workflow needs a skill that does NOT exist on ClawHub and must be custom-built. Write a complete SKILL.md with YAML frontmatter (name, description, version, author, tags) and full instructions.
- suggestedConnections: If the user provided no credentials, suggest what API keys or OAuth connections would make this workflow feasible. If credentials were provided, return an empty array.
- systemPrompt: Must be self-contained. The agent receiving this prompt should be able to execute the workflow without any other context. Include auth details referencing the env var names.

Respond ONLY with valid JSON, no markdown fences, no explanation.`;

    let analysis: any;
    let promptSource: "ai" | "fallback" = "ai";
    try {
      const analysisResult = (await agentExec(analysisPrompt, 90000)) as any;
      const responseText =
        analysisResult?.message?.content ||
        analysisResult?.text ||
        analysisResult?.content ||
        (typeof analysisResult === "string" ? analysisResult : JSON.stringify(analysisResult));

      const jsonMatch = String(responseText).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Agent did not return valid JSON");
      }
    } catch (err: any) {
      console.error(`[Workflows] Agent analysis failed: ${err.message}, using fallback`);
      promptSource = "fallback";
      analysis = {
        systemPrompt: `You are a custom automation agent. Your job is: ${description.trim()}

## Authentication
${credentialList.length > 0
  ? credentialList.map((c) => `- Use the ${c.envVar} environment variable for ${c.label} (already configured at ~/.openclaw/.env).`).join("\n")
  : "No credentials configured. You may need to request credentials from the user if external API access is required."}

## Instructions
${description.trim()}

${additionalInstructions ? `## Additional Instructions\n${additionalInstructions.trim()}` : ""}

## Error Handling
- If any API call fails, log the error and continue with remaining tasks.
- Never fail silently — always produce a report of what was completed and any issues.

{{ADDITIONAL_INSTRUCTIONS}}`,
        suggestedSkills: [],
        skillsToCreate: [],
        suggestedConnections: credentialList.length === 0
          ? ["Consider adding API credentials to enable external service access for this workflow."]
          : [],
      };
    }
    sendProgress("analyze", "done");

    // 5. Install suggested skills from ClawHub
    sendProgress("skills", "active");
    const installedSkills: string[] = [];
    const suggestedSkills: string[] = Array.isArray(analysis.suggestedSkills)
      ? analysis.suggestedSkills
      : [];

    for (const skillName of suggestedSkills) {
      try {
        await gateway.send("skills.install", { name: skillName }, 15000);
        installedSkills.push(skillName);
      } catch (err: any) {
        if (!err.message?.includes("already")) {
          console.warn(`[Workflows] Skill install warning for "${skillName}": ${err.message}`);
        }
        installedSkills.push(skillName);
      }
    }

    // 6. Create custom skills if needed
    const skillsToCreate: any[] = Array.isArray(analysis.skillsToCreate)
      ? analysis.skillsToCreate
      : [];

    for (const skill of skillsToCreate) {
      if (skill.slug && skill.skillMd) {
        try {
          await agentExec(
            `Create a new OpenClaw skill by performing these exact steps:\n1. Create the directory ~/.openclaw/skills/${skill.slug}/ (and any parent directories if needed)\n2. Write the following content EXACTLY to the file ~/.openclaw/skills/${skill.slug}/SKILL.md:\n\n${skill.skillMd}\n\nConfirm when the file has been created successfully.`,
            45000
          );
          installedSkills.push(skill.slug);
        } catch (err: any) {
          console.warn(`[Workflows] Custom skill creation failed for "${skill.slug}": ${err.message}`);
        }
      }
    }
    sendProgress("skills", "done");

    // 7. Create cron job
    sendProgress("cron", "active");
    let cronJobId: string | undefined;
    let cronError: string | undefined;
    const systemPrompt = String(analysis.systemPrompt || "");
    let finalPrompt = systemPrompt.includes("{{ADDITIONAL_INSTRUCTIONS}}")
      ? systemPrompt.replace("{{ADDITIONAL_INSTRUCTIONS}}", additionalInstructions || "")
      : systemPrompt + (additionalInstructions ? `\n\n${additionalInstructions}` : "");

    if (customTrigger) {
      finalPrompt = `[Trigger context: ${customTrigger}]\n\n${finalPrompt}`;
    }

    if (hasCronMethods()) {
      try {
        const cronResult = (await gateway.send("cron.add", {
          name: cronJobName,
          schedule: buildCronSchedule(schedule),
          sessionTarget: "isolated",
          payload: {
            kind: "agentTurn",
            message: finalPrompt,
          },
        }, 15000)) as any;

        cronJobId = cronResult?.id || cronResult?.jobId;
        console.log(`[Workflows/Custom] cron.add SUCCESS: cronJobId=${cronJobId}`);
      } catch (err: any) {
        console.error(`[Workflows/Custom] cron.add failed: ${err.message}`);
        cronError = `Cron job creation failed: ${err.message}`;
      }
    } else {
      console.log(`[Workflows/Custom] No cron methods available, skipping cron.add`);
      cronError = "Cron scheduling is not available — gateway may not support it";
    }

    if (cronError) {
      sendProgress("cron", "error", cronError);
    } else {
      sendProgress("cron", "done");
    }

    // 8. Update workflow status — error if cron failed, active otherwise
    sendProgress("verify", "active");
    const suggestedConnections: string[] = Array.isArray(analysis.suggestedConnections)
      ? analysis.suggestedConnections
      : [];

    const finalStatus = cronError ? "error" : "active";
    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: finalStatus,
        cronJobId: cronJobId || null,
        installedSkills: JSON.stringify(installedSkills),
        storedCredentials: JSON.stringify(storedCreds),
        generatedPrompt: finalPrompt,
        errorMessage: cronError || null,
      },
    });
    sendProgress("verify", "done");

    const resultData = {
      ok: true,
      data: {
        workflow: serializeWorkflow(updated),
        generatedPrompt: systemPrompt,
        promptSource,
        suggestedConnections,
        skillsInstalled: installedSkills,
        skillsCreated: skillsToCreate.map((s: any) => s.slug).filter(Boolean),
      },
    };

    if (wantStream) {
      res.write(`data: ${JSON.stringify({ step: "complete", status: "done", result: resultData })}\n\n`);
      res.end();
    } else {
      res.json(resultData);
    }
  } catch (err: any) {
    console.error(`[Workflows/Custom] Custom workflow creation error: ${err.message}`);
    if (wantStream) {
      sendProgress("error", "error", err.message);
      res.end();
    } else {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
});

// ─── POST /api/workflows/custom/suggest — Suggest connections ──

router.post("/custom/suggest", async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!description?.trim()) {
      res.status(400).json({ ok: false, error: "Description is required" });
      return;
    }

    const suggestionPrompt = `Analyze this workflow and suggest what API connections, credentials, or OAuth providers would be needed to make it work.

Workflow Name: ${name || "Custom Workflow"}
Description: ${description.trim()}

Respond with a JSON object (and nothing else):
{
  "suggestions": [
    {
      "type": "api-key",
      "envVar": "SUGGESTED_ENV_VAR_NAME",
      "label": "Human-readable label",
      "description": "Why this is needed",
      "helpUrl": "URL where the user can get this key (optional)"
    }
  ],
  "oauthSuggestions": ["google", "microsoft"],
  "explanation": "Brief explanation of what connections are recommended and why"
}

Rules:
- type can be "api-key", "oauth", or "webhook"
- envVar should be uppercase with underscores, like GITHUB_PAT or SLACK_WEBHOOK_URL
- Only suggest connections that are actually needed for the described workflow
- oauthSuggestions: list OAuth provider names if OAuth would be applicable (e.g., "google" for Gmail/Calendar/Drive, "microsoft" for Outlook/Teams)

Respond ONLY with valid JSON, no markdown fences.`;

    const result = (await agentExec(suggestionPrompt, 30000)) as any;
    const responseText =
      result?.message?.content ||
      result?.text ||
      result?.content ||
      (typeof result === "string" ? result : JSON.stringify(result));

    const jsonMatch = String(responseText).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      res.json({ ok: true, data: suggestions });
    } else {
      res.json({
        ok: true,
        data: {
          suggestions: [],
          oauthSuggestions: [],
          explanation: "Could not analyze the workflow. Please add credentials manually.",
        },
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/workflows/:id — Update workflow ───────────

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const workflowId = req.params.id as string;
    const { name, schedule, additionalInstructions, customTrigger, credentials } =
      req.body;

    // Find existing workflow in Prisma
    const existing = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Workflow not found" });
      return;
    }

    const template = getTemplateById(existing.templateId);
    const existingSchedule = JSON.parse(existing.schedule || "{}");

    const updatedSchedule = schedule || existingSchedule;
    const updatedInstructions =
      additionalInstructions !== undefined
        ? additionalInstructions
        : existing.additionalInstructions;
    const updatedTrigger =
      customTrigger !== undefined ? customTrigger : existing.customTrigger;

    // Update credentials if provided
    if (credentials) {
      if (template) {
        for (const field of template.credentialFields) {
          const value = credentials[field.envVar];
          if (value) {
            try {
              await agentExec(
                `Update the file ~/.openclaw/.env: if a line starting with "${field.envVar}=" exists, replace it with "${field.envVar}=${value}". Otherwise, append the line "${field.envVar}=${value}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`,
                30000
              );
            } catch (err: any) {
              console.error(`[Workflows] Credential update failed ${field.envVar}: ${err.message}`);
            }
          }
        }
      } else {
        for (const [envVar, value] of Object.entries(credentials)) {
          if (value && typeof value === "string") {
            try {
              await agentExec(
                `Update the file ~/.openclaw/.env: if a line starting with "${envVar}=" exists, replace it with "${envVar}=${value}". Otherwise, append the line "${envVar}=${value}" to the end of the file. Create the file if it does not exist. Do NOT remove or modify any other lines. Confirm when done.`,
                30000
              );
            } catch (err: any) {
              console.error(`[Workflows] Credential update failed ${envVar}: ${err.message}`);
            }
          }
        }
      }
    }

    // Build the updated prompt for the workflow
    let updatedPrompt: string | null = null;
    if (template) {
      updatedPrompt = assemblePrompt(template, updatedInstructions || "", updatedTrigger || undefined);
    } else if (existing.generatedPrompt) {
      updatedPrompt = existing.generatedPrompt;
      if (additionalInstructions !== undefined && additionalInstructions !== existing.additionalInstructions) {
        updatedPrompt = existing.generatedPrompt + "\n\n## Additional Instructions\n" + additionalInstructions;
      }
    }

    // Recreate cron job if workflow is active
    let newCronJobId = existing.cronJobId;
    if (existing.status === "active" && hasCronMethods()) {
      // Remove old cron job
      try {
        if (existing.cronJobId) {
          await gateway.send("cron.remove", { jobId: existing.cronJobId });
        } else {
          await gateway.send("cron.remove", { name: existing.cronJobName });
        }
      } catch {
        // Old job may not exist
      }

      // Create new cron job
      const agentPrompt = updatedPrompt || getWorkflowPrompt(existing);
      if (agentPrompt) {
        const sessionTarget = template?.sessionTarget || "isolated";
        try {
          const cronResult = (await gateway.send("cron.add", {
            name: existing.cronJobName,
            schedule: buildCronSchedule(updatedSchedule),
            sessionTarget,
            payload: { kind: "agentTurn", message: agentPrompt },
          }, 15000)) as any;
          newCronJobId = cronResult?.id || cronResult?.jobId || null;
        } catch (err: any) {
          console.error(`[Workflows] Failed to recreate cron job: ${err.message}`);
        }
      }
    }

    // Update workflow in Prisma
    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        name: name?.trim() || existing.name,
        schedule: JSON.stringify(updatedSchedule),
        additionalInstructions: updatedInstructions || "",
        customTrigger: updatedTrigger || null,
        cronJobId: newCronJobId,
        ...(updatedPrompt && !template ? { generatedPrompt: updatedPrompt } : {}),
      },
    });

    res.json({ ok: true, data: { workflow: serializeWorkflow(updated) } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /api/workflows/:id/toggle — Pause/Resume ─────

router.patch("/:id/toggle", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const workflowId = req.params.id as string;

    const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
    if (!workflow) {
      res.status(404).json({ ok: false, error: "Workflow not found" });
      return;
    }

    const template = getTemplateById(workflow.templateId);
    const isPausing = workflow.status === "active";
    const newStatus = isPausing ? "paused" : "active";
    let newCronJobId = workflow.cronJobId;

    if (hasCronMethods()) {
      if (isPausing) {
        // Remove cron job to pause
        try {
          if (workflow.cronJobId) {
            await gateway.send("cron.remove", { jobId: workflow.cronJobId });
          } else {
            await gateway.send("cron.remove", { name: workflow.cronJobName });
          }
        } catch {
          // Job may not exist
        }
        newCronJobId = null;
      } else {
        // Recreate cron job to resume
        const agentPrompt = getWorkflowPrompt(workflow);
        if (agentPrompt) {
          const workflowSchedule = JSON.parse(workflow.schedule || "{}");
          const sessionTarget = template?.sessionTarget || "isolated";
          try {
            const cronResult = (await gateway.send("cron.add", {
              name: workflow.cronJobName,
              schedule: buildCronSchedule(workflowSchedule),
              sessionTarget,
              payload: { kind: "agentTurn", message: agentPrompt },
            }, 15000)) as any;
            newCronJobId = cronResult?.id || cronResult?.jobId || null;
          } catch (err: any) {
            console.error(`[Workflows] Failed to recreate cron job: ${err.message}`);
          }
        }
      }
    }

    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: newStatus,
        cronJobId: newCronJobId,
      },
    });

    res.json({ ok: true, data: { workflow: serializeWorkflow(updated) } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/workflows/:id — Remove workflow ─────────

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const workflowId = req.params.id as string;

    const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
    if (!workflow) {
      res.status(404).json({ ok: false, error: "Workflow not found" });
      return;
    }

    // Remove cron job
    if (hasCronMethods()) {
      try {
        if (workflow.cronJobId) {
          await gateway.send("cron.remove", { jobId: workflow.cronJobId });
        } else {
          await gateway.send("cron.remove", { name: workflow.cronJobName });
        }
      } catch {
        // Job may not exist
      }
    }

    // Remove from Prisma
    await prisma.workflow.delete({ where: { id: workflowId } });

    res.json({ ok: true, data: { deleted: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/workflows/:id/run — Force-run workflow ────

router.post("/:id/run", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const workflowId = req.params.id as string;

    const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
    if (!workflow) {
      res.status(404).json({ ok: false, error: "Workflow not found" });
      return;
    }

    // Try cron.run first, fall back to direct chat.send
    if (hasCronMethods() && (workflow.cronJobId || workflow.cronJobName)) {
      try {
        const runParams: Record<string, unknown> = { mode: "force" };
        if (workflow.cronJobId) {
          runParams.jobId = workflow.cronJobId;
        } else {
          runParams.name = workflow.cronJobName;
        }
        await gateway.send("cron.run", runParams);
        res.json({ ok: true, data: { triggered: true, method: "cron.run" } });
        return;
      } catch {
        // Fall through to agentExec
      }
    }

    // Fallback: run prompt directly via agentExec
    const agentPrompt = getWorkflowPrompt(workflow);
    if (!agentPrompt) {
      res.status(500).json({ ok: false, error: "No prompt available for this workflow" });
      return;
    }
    await agentExec(agentPrompt, 120000);
    res.json({ ok: true, data: { triggered: true, method: "agentExec" } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/workflows/:id/history — Execution history ──

router.get("/:id/history", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const workflowId = req.params.id as string;

    const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
    if (!workflow) {
      res.status(404).json({ ok: false, error: "Workflow not found" });
      return;
    }

    if (!hasCronMethods()) {
      res.json({ ok: true, data: { runs: [], available: false } });
      return;
    }

    try {
      const runsParams: Record<string, unknown> = {
        limit: parseInt(String(req.query.limit || "20"), 10),
      };
      if (workflow.cronJobId) {
        runsParams.jobId = workflow.cronJobId;
      } else {
        runsParams.id = workflow.cronJobName;
      }

      const result = (await gateway.send("cron.runs", runsParams)) as any;
      const runs = Array.isArray(result?.runs)
        ? result.runs
        : Array.isArray(result)
          ? result
          : [];

      res.json({ ok: true, data: { runs, available: true } });
    } catch {
      res.json({ ok: true, data: { runs: [], available: false } });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/workflows/:id/retry — Retry a failed workflow ────

router.post("/:id/retry", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const workflowId = req.params.id as string;

    const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
    if (!workflow) {
      res.status(404).json({ ok: false, error: "Workflow not found" });
      return;
    }

    if (workflow.status !== "error") {
      res.status(400).json({ ok: false, error: "Only failed workflows can be retried" });
      return;
    }

    if (!gateway.isConnected) {
      res.status(503).json({ ok: false, error: "Gateway is disconnected — cannot retry" });
      return;
    }

    if (!hasCronMethods()) {
      res.status(503).json({ ok: false, error: "Cron methods not available on gateway" });
      return;
    }

    // Get the prompt — either from stored generatedPrompt or re-assemble from template
    const agentPrompt = getWorkflowPrompt(workflow);
    if (!agentPrompt) {
      res.status(500).json({ ok: false, error: "No prompt available for this workflow — please delete and recreate" });
      return;
    }

    const schedule = JSON.parse(workflow.schedule || "{}");
    const template = getTemplateById(workflow.templateId);
    const sessionTarget = template?.sessionTarget || "isolated";

    // Try to register the cron job
    try {
      const cronResult = (await gateway.send("cron.add", {
        name: workflow.cronJobName,
        schedule: buildCronSchedule(schedule),
        sessionTarget,
        payload: { kind: "agentTurn", message: agentPrompt },
      }, 15000)) as any;

      const cronJobId = cronResult?.id || cronResult?.jobId;

      const updated = await prisma.workflow.update({
        where: { id: workflowId },
        data: {
          status: "active",
          cronJobId: cronJobId || null,
          errorMessage: null,
        },
      });

      console.log(`[Workflows] Retry SUCCESS for "${workflow.name}" — cronJobId=${cronJobId}`);
      res.json({ ok: true, data: { workflow: serializeWorkflow(updated) } });
    } catch (err: any) {
      console.error(`[Workflows] Retry cron.add failed for "${workflow.name}": ${err.message}`);
      res.status(500).json({ ok: false, error: `Failed to create cron job: ${err.message}` });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Cron Re-registration on Gateway Reconnect ─────────────

/**
 * Re-register all active workflow cron jobs with the gateway.
 * Called on server startup and gateway reconnect because the gateway
 * does not persist cron jobs across restarts.
 */
export async function reRegisterWorkflowCrons(): Promise<void> {
  // Clean up orphaned "setting-up" workflows (crashed mid-activation)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  try {
    const orphaned = await prisma.workflow.updateMany({
      where: {
        status: "setting-up",
        createdAt: { lt: fiveMinAgo },
      },
      data: {
        status: "error",
        errorMessage: "Setup was interrupted — please retry or delete this workflow",
      },
    });
    if (orphaned.count > 0) {
      console.log(`[Workflows] Cleaned up ${orphaned.count} orphaned "setting-up" workflow(s)`);
    }
  } catch (err: any) {
    console.warn(`[Workflows] Orphan cleanup failed: ${err.message}`);
  }

  if (!hasCronMethods()) {
    console.log("[Workflows] No cron methods available — skipping re-registration");
    return;
  }

  const activeWorkflows = await prisma.workflow.findMany({
    where: { status: "active" },
  });

  if (activeWorkflows.length === 0) {
    console.log("[Workflows] No active workflows to re-register");
    return;
  }

  console.log(`[Workflows] Re-registering ${activeWorkflows.length} active workflow cron job(s)…`);

  // Get existing cron jobs so we don't duplicate
  let existingJobs: any[] = [];
  try {
    const cronResult = (await gateway.send("cron.list", {})) as any;
    existingJobs = Array.isArray(cronResult?.jobs)
      ? cronResult.jobs
      : Array.isArray(cronResult)
        ? cronResult
        : [];
  } catch {
    // cron.list failed — register everything
  }

  for (const workflow of activeWorkflows) {
    const alreadyExists = existingJobs.some(
      (j: any) => j.name === workflow.cronJobName || j.id === workflow.cronJobId
    );

    if (alreadyExists) {
      console.log(`[Workflows]   ✓ ${workflow.name} (${workflow.cronJobName}) — already registered`);
      continue;
    }

    const agentPrompt = getWorkflowPrompt(workflow);
    if (!agentPrompt) {
      console.warn(`[Workflows]   ✗ ${workflow.name} — no prompt available, skipping`);
      continue;
    }

    const schedule = JSON.parse(workflow.schedule || "{}");
    const template = getTemplateById(workflow.templateId);
    const sessionTarget = template?.sessionTarget || "isolated";

    try {
      const cronResult = (await gateway.send("cron.add", {
        name: workflow.cronJobName,
        schedule: buildCronSchedule(schedule),
        sessionTarget,
        payload: { kind: "agentTurn", message: agentPrompt },
      }, 15000)) as any;

      const newJobId = cronResult?.id || cronResult?.jobId;

      // Update stored cronJobId if the gateway assigned a new one
      if (newJobId && newJobId !== workflow.cronJobId) {
        await prisma.workflow.update({
          where: { id: workflow.id },
          data: { cronJobId: newJobId },
        });
      }

      console.log(`[Workflows]   ✓ ${workflow.name} (${workflow.cronJobName}) — registered (id: ${newJobId || "unknown"})`);
    } catch (err: any) {
      console.error(`[Workflows]   ✗ ${workflow.name} — cron.add failed: ${err.message}`);
    }
  }

  console.log("[Workflows] Cron re-registration complete");
}

export default router;
