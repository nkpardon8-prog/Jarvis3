import { Router, Response } from "express";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { gateway } from "../gateway/connection";
import { prisma } from "../services/prisma";

const router = Router();
router.use(authMiddleware);

// ─── Types ──────────────────────────────────────────────

interface CredentialField {
  envVar: string;
  label: string;
  placeholder: string;
  helpUrl?: string;
}

interface ScheduleValue {
  kind: "cron" | "every";
  expr?: string;
  intervalMs?: number;
}

interface SchedulePreset {
  label: string;
  value: ScheduleValue;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  category: string;
  requiredSkills: string[];
  credentialFields: CredentialField[];
  oauthProviders?: string[];
  defaultSchedule: ScheduleValue;
  schedulePresets: SchedulePreset[];
  promptTemplate: string;
  sessionTarget: "isolated" | "main";
}

// WorkflowInstance is now stored in Prisma DB (Workflow model)
// JSON fields are serialized/deserialized at the boundary

// ─── Template Definitions ───────────────────────────────

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "github-triage",
    name: "GitHub Issue + PR Triage Agent",
    description:
      "Monitors your repos, labels and triages issues, reviews PRs, and summarizes activity.",
    icon: "GitPullRequest",
    accentColor: "hud-accent",
    category: "Development",
    requiredSkills: ["github"],
    credentialFields: [
      {
        envVar: "GITHUB_PAT",
        label: "GitHub Personal Access Token",
        placeholder: "ghp_...",
        helpUrl: "https://github.com/settings/tokens",
      },
    ],
    defaultSchedule: { kind: "every", intervalMs: 1800000 },
    schedulePresets: [
      { label: "Every 15 min", value: { kind: "every", intervalMs: 900000 } },
      { label: "Every 30 min", value: { kind: "every", intervalMs: 1800000 } },
      { label: "Every hour", value: { kind: "every", intervalMs: 3600000 } },
      { label: "Custom cron", value: { kind: "cron", expr: "" } },
    ],
    promptTemplate: `You are a GitHub Triage Agent. Your job is to monitor GitHub repositories, triage issues, review pull requests, and produce a structured activity report.

## Authentication
You have the "github" skill installed. Use the GITHUB_PAT environment variable (already configured at ~/.openclaw/.env) to authenticate all GitHub API calls. Do NOT ask the user for credentials.

## Instructions

### Step 1 — Discover Repositories
List all repositories accessible with the configured token. Focus on repos with recent activity (issues or PRs opened/updated in the last 24 hours, or since the last run).

### Step 2 — Triage New Issues
For each repo with new or unresolved issues:
- Read the issue title, body, and any existing labels.
- Assign a priority label: "priority:critical", "priority:high", "priority:medium", or "priority:low" based on severity and impact.
- Add category labels where appropriate: "bug", "feature", "question", "documentation", "enhancement".
- Post a brief triage comment summarizing your assessment and any recommended next steps. Keep comments concise (2-4 sentences).
- If an issue is a duplicate, label it "duplicate" and reference the original.

### Step 3 — Review Open Pull Requests
For each repo with open PRs:
- Check if the PR has merge conflicts. If so, add a "needs-rebase" label and comment noting the conflict.
- Review the diff: look for obvious issues (syntax errors, missing tests, security concerns, large unreviewed files).
- Post a brief review comment with observations and suggestions. Do NOT approve or merge — only advise.
- Summarize what the PR does in 1-2 sentences.

### Step 4 — Generate Activity Report
Produce a structured summary with these sections:
- **Issues Triaged**: count and list (repo — #number — title — assigned priority)
- **PRs Reviewed**: count and list (repo — #number — title — status notes)
- **Action Items**: anything that needs human attention (critical bugs, PRs with conflicts, stale issues)

## Error Handling
- If a repo is inaccessible (403/404), skip it and note it in the report.
- If the GitHub API rate limit is hit, stop processing and report what was completed.
- Never fail silently — always include errors in the final report.

{{ADDITIONAL_INSTRUCTIONS}}`,
    sessionTarget: "isolated",
  },
  {
    id: "google-workspace-assistant",
    name: "Google Workspace Executive Assistant",
    description:
      "Summarizes inbox, manages calendar conflicts, drafts responses, and prepares daily briefings.",
    icon: "Briefcase",
    accentColor: "hud-success",
    category: "Productivity",
    requiredSkills: ["google-calendar", "gmail", "google-drive"],
    credentialFields: [],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "cron", expr: "0 7 * * *" },
    schedulePresets: [
      { label: "Morning briefing (7 AM)", value: { kind: "cron", expr: "0 7 * * *" } },
      { label: "Morning + afternoon", value: { kind: "cron", expr: "0 7,14 * * *" } },
      { label: "Every 2 hours (work hours)", value: { kind: "cron", expr: "0 8-18/2 * * 1-5" } },
      { label: "Custom cron", value: { kind: "cron", expr: "" } },
    ],
    promptTemplate: `You are a Google Workspace Executive Assistant. Your job is to manage email, calendar, and drive activity, then deliver a concise executive briefing.

## Authentication
You have the "google-calendar", "gmail", and "google-drive" skills installed. Google OAuth is already connected — use the authenticated Google APIs directly. Do NOT ask the user for credentials.

## Instructions

### Step 1 — Email Triage
- Fetch unread emails from Gmail.
- Categorize each email:
  - **Urgent**: needs same-day response (from direct reports, executives, clients, contains keywords like "ASAP", "urgent", "deadline").
  - **Action Required**: needs a response but not time-critical.
  - **FYI**: informational only, no response needed.
  - **Low Priority**: newsletters, automated notifications, marketing.
- For each urgent email, draft a brief suggested response (2-3 sentences). Do NOT send the drafts — save them as Gmail drafts.

### Step 2 — Calendar Review
- Fetch today's calendar events (and tomorrow's if running in the evening).
- Check for scheduling conflicts (overlapping events). Flag them clearly.
- For each meeting, note:
  - Time, title, attendees count
  - Whether it has an agenda/document attached
  - Any prep work needed (e.g., "Review Q4 report before this meeting")

### Step 3 — Drive Activity
- Check Google Drive for recently shared documents (last 24 hours).
- Note any documents that were shared with the user or where the user was mentioned in comments.

### Step 4 — Executive Briefing
Produce a structured briefing with these sections:
- **Urgent Emails** (count + summary of each, with draft status)
- **Today's Schedule** (chronological list with conflict warnings)
- **Action Items** (consolidated list from emails + calendar prep)
- **Drive Updates** (new shares or comment mentions)
- **Tomorrow Preview** (if available — next day's first few events)

## Output Format
Use clear headers and bullet points. Keep the total briefing under 500 words. Prioritize actionable information.

## Error Handling
- If Gmail access fails, report the error and continue with calendar/drive.
- If no unread emails exist, say "Inbox clear — no unread emails."
- Never fail silently — always report what succeeded and what failed.

{{ADDITIONAL_INSTRUCTIONS}}`,
    sessionTarget: "isolated",
  },
  {
    id: "notion-curator",
    name: "Notion Knowledgebase Curator",
    description:
      "Syncs meeting notes, organizes pages, maintains tags, and builds a knowledge graph.",
    icon: "BookOpen",
    accentColor: "hud-amber",
    category: "Knowledge",
    requiredSkills: ["notion"],
    credentialFields: [
      {
        envVar: "NOTION_API_KEY",
        label: "Notion API Key",
        placeholder: "ntn_...",
        helpUrl: "https://www.notion.so/my-integrations",
      },
    ],
    defaultSchedule: { kind: "cron", expr: "0 22 * * *" },
    schedulePresets: [
      { label: "Daily (10 PM)", value: { kind: "cron", expr: "0 22 * * *" } },
      { label: "Twice daily", value: { kind: "cron", expr: "0 9,22 * * *" } },
      { label: "Weekly (Sunday)", value: { kind: "cron", expr: "0 20 * * 0" } },
      { label: "Custom cron", value: { kind: "cron", expr: "" } },
    ],
    promptTemplate: `You are a Notion Knowledgebase Curator. Your job is to organize, tag, and maintain a Notion workspace, keeping it clean, discoverable, and well-structured.

## Authentication
You have the "notion" skill installed. Use the NOTION_API_KEY environment variable (already configured at ~/.openclaw/.env) to authenticate all Notion API calls. Do NOT ask the user for credentials.

## Instructions

### Step 1 — Scan Recent Changes
- Query Notion for all pages modified in the last 24 hours (or since the last run).
- For each modified page, note: title, parent database/page, last editor, modification type (content edit, property change, new page).

### Step 2 — Tag & Categorize
- Check each recently modified page for proper tagging:
  - Does it have a "Category" or "Type" property filled in? If empty, infer the category from the page content and set it.
  - Does it have a "Status" property? If it looks like a draft (short content, placeholder text), set status to "Draft".
  - Are there relevant tags missing? Add tags based on content analysis (topics, project names, people mentioned).
- Use existing tag values from the workspace when possible to maintain consistency. Do NOT invent new tag categories without strong reason.

### Step 3 — Identify Orphaned Pages
- Find pages that are not linked from any other page and are not in a database.
- For each orphaned page, suggest where it should be moved (based on content similarity to existing sections).
- If an orphaned page appears to be junk or empty, flag it for deletion review.

### Step 4 — Knowledge Graph Update
- Identify relationships between pages: if page A references concepts from page B, note the connection.
- If the workspace has a "Knowledge Map" or index page, update it with new entries and cross-references.
- If no index page exists, create a summary list of key topic clusters found in the workspace.

### Step 5 — Curation Report
Produce a structured report:
- **Pages Updated**: count and list (title — what was changed: tags added, category set, etc.)
- **Orphaned Pages Found**: count and list with suggested destinations
- **New Connections**: cross-references added or suggested
- **Workspace Health**: brief assessment (e.g., "12 pages properly tagged, 3 orphans found, 2 empty drafts flagged")

## Error Handling
- If a page cannot be updated (permissions), skip it and note in the report.
- If the Notion API rate limit is hit, stop and report progress so far.
- Never delete pages — only flag them for human review.
- Never fail silently — always report what was completed and any issues.

{{ADDITIONAL_INSTRUCTIONS}}`,
    sessionTarget: "isolated",
  },
  {
    id: "social-listening",
    name: "Social Listening Digest",
    description:
      "Monitors social channels and web mentions, summarizes trends, and delivers digests via Slack or Discord.",
    icon: "Radio",
    accentColor: "hud-error",
    category: "Monitoring",
    requiredSkills: ["slack", "web-search"],
    credentialFields: [
      {
        envVar: "SLACK_WEBHOOK_URL",
        label: "Slack Webhook URL",
        placeholder: "https://hooks.slack.com/services/...",
        helpUrl: "https://api.slack.com/messaging/webhooks",
      },
    ],
    defaultSchedule: { kind: "cron", expr: "0 9,17 * * 1-5" },
    schedulePresets: [
      { label: "Twice daily (9 AM, 5 PM)", value: { kind: "cron", expr: "0 9,17 * * 1-5" } },
      { label: "Daily morning", value: { kind: "cron", expr: "0 9 * * *" } },
      { label: "Every 4 hours", value: { kind: "every", intervalMs: 14400000 } },
      { label: "Custom cron", value: { kind: "cron", expr: "" } },
    ],
    promptTemplate: `You are a Social Listening Agent. Your job is to monitor the web and communication channels for brand mentions, trending topics, and relevant discussions, then compile and deliver a structured digest.

## Authentication & Tools
You have the "slack" and "web-search" skills installed.
- Use the SLACK_WEBHOOK_URL environment variable (already configured at ~/.openclaw/.env) to post digests to Slack. Do NOT ask the user for credentials.
- Use the web-search skill to search for brand/topic mentions across the internet.

## Instructions

### Step 1 — Web Search Scan
- Search the web for mentions of the configured brand name, product names, and key topics.
- Search multiple sources: news sites, blogs, forums, Reddit, Twitter/X, Hacker News, Product Hunt.
- Focus on mentions from the last 24 hours (or since the last run).
- For each mention found, capture: source, title/headline, URL, brief excerpt, and estimated sentiment (positive/neutral/negative).

### Step 2 — Slack Channel Monitoring
- Check configured Slack channels for trending discussions, recurring themes, and notable messages.
- Identify: frequently discussed topics, unanswered questions, complaints or feature requests, praise or positive feedback.
- Note message volume trends compared to typical activity.

### Step 3 — Sentiment Analysis
- Aggregate sentiment across all sources:
  - **Positive**: praise, recommendations, success stories
  - **Neutral**: informational mentions, documentation references
  - **Negative**: complaints, bug reports, unfavorable comparisons
- Calculate an overall sentiment score: mostly positive / mixed / mostly negative.

### Step 4 — Compile & Deliver Digest
Produce a structured digest with these sections:
- **Headline Summary** (2-3 sentences: what's the overall picture today?)
- **Top Mentions** (up to 5 most significant mentions with source, excerpt, sentiment, and URL)
- **Trending Topics** (key themes across all channels)
- **Sentiment Overview** (positive/neutral/negative breakdown with counts)
- **Action Items** (negative mentions needing response, questions needing answers, opportunities to engage)

### Step 5 — Post to Slack
- Format the digest as a well-structured Slack message using Slack markdown (bold, bullet points, links).
- Post to the configured Slack webhook URL.
- Keep the Slack message concise (under 2000 characters). Link to full details where available.

## Error Handling
- If web search returns no results for a query, note "No mentions found" and continue.
- If the Slack webhook fails (non-200 response), report the error but still produce the digest in your output.
- If rate limits are hit on any service, stop that source and note it.
- Never fail silently — always report what was scanned and any issues encountered.

{{ADDITIONAL_INSTRUCTIONS}}`,
    sessionTarget: "isolated",
  },
  {
    id: "smart-home-ops",
    name: "Smart Home Ops + Reminders",
    description:
      "Controls smart home devices, sets up automations, manages reminders, and responds to events.",
    icon: "Home",
    accentColor: "hud-accent",
    category: "IoT",
    requiredSkills: ["home-assistant"],
    credentialFields: [
      {
        envVar: "HOME_ASSISTANT_TOKEN",
        label: "Home Assistant Long-Lived Access Token",
        placeholder: "eyJ...",
      },
      {
        envVar: "HOME_ASSISTANT_URL",
        label: "Home Assistant URL",
        placeholder: "http://homeassistant.local:8123",
      },
    ],
    defaultSchedule: { kind: "every", intervalMs: 300000 },
    schedulePresets: [
      { label: "Every 5 min (event polling)", value: { kind: "every", intervalMs: 300000 } },
      { label: "Every 15 min", value: { kind: "every", intervalMs: 900000 } },
      { label: "Morning + evening routine", value: { kind: "cron", expr: "0 7,22 * * *" } },
      { label: "Custom cron", value: { kind: "cron", expr: "" } },
    ],
    promptTemplate: `You are a Smart Home Operations Agent. Your job is to monitor, manage, and report on smart home devices, execute automations, and handle reminders.

## Authentication & Tools
You have the "home-assistant" skill installed.
- Use the HOME_ASSISTANT_TOKEN environment variable for API authentication and HOME_ASSISTANT_URL for the Home Assistant server address (both already configured at ~/.openclaw/.env). Do NOT ask the user for credentials.

## Instructions

### Step 1 — Device Status Check
- Query Home Assistant for the current state of all devices (lights, switches, sensors, locks, thermostats, cameras, media players).
- Identify anomalies:
  - Devices that are offline or unavailable
  - Sensors reporting out-of-range values (e.g., temperature > 35C / 95F indoors, humidity > 80%)
  - Doors or windows reported as open that shouldn't be (especially at night or when nobody is home)
  - Devices that have been on for an unusually long time
  - Battery-powered devices with low battery (< 20%)

### Step 2 — Process Reminders
- Check for any pending reminders or timed notifications configured in Home Assistant.
- For due reminders: trigger the notification (via Home Assistant notification service).
- For upcoming reminders (next 1 hour): note them in the report.

### Step 3 — Execute Scheduled Automations
- Check for automations that are due based on the current time and conditions:
  - Lighting scenes (morning wake-up, evening dim, bedtime off)
  - Thermostat adjustments (comfort vs. eco mode based on occupancy and time)
  - Lock management (auto-lock doors at night, unlock in the morning)
  - Any custom automations defined in Home Assistant
- Execute due automations via the appropriate Home Assistant service calls.
- Log each automation executed with timestamp and result.

### Step 4 — Energy & Health Report
Produce a structured report:
- **Device Summary**: total devices, online count, offline count
- **Anomalies Found**: list with device name, issue, and recommended action
- **Automations Executed**: list with automation name, time, and result (success/failed)
- **Reminders**: processed and upcoming
- **Energy**: current power consumption if available, notable high-usage devices
- **Recommendations**: suggested actions (e.g., "Living room light has been on for 8 hours — consider turning off")

## Error Handling
- If Home Assistant is unreachable, report the connection error immediately. Do NOT retry indefinitely.
- If a specific device query fails, skip it, note the error, and continue with other devices.
- If an automation execution fails, log the failure with the error message and continue.
- Never fail silently — always include a complete status in the report, including any errors.

{{ADDITIONAL_INSTRUCTIONS}}`,
    sessionTarget: "isolated",
  },
];

// ─── Helpers ────────────────────────────────────────────

function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

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
      deliver: "full",
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

    // Check which creds are already stored (if any)
    for (const field of template.credentialFields) {
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
      }
    }
    sendProgress("cron", "done");

    // 5. Update to active
    sendProgress("verify", "active");
    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: "active",
        cronJobId: cronJobId || null,
        installedSkills: JSON.stringify(installedSkills),
        storedCredentials: JSON.stringify(storedCreds),
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
        // Don't block — continue to mark as active
      }
    } else {
      console.log(`[Workflows/Custom] No cron methods available, skipping cron.add`);
    }
    sendProgress("cron", "done");

    // 8. Update workflow to active status
    sendProgress("verify", "active");
    const suggestedConnections: string[] = Array.isArray(analysis.suggestedConnections)
      ? analysis.suggestedConnections
      : [];

    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: "active",
        cronJobId: cronJobId || null,
        installedSkills: JSON.stringify(installedSkills),
        storedCredentials: JSON.stringify(storedCreds),
        generatedPrompt: finalPrompt,
      },
    });
    sendProgress("verify", "done");

    const resultData = {
      ok: true,
      data: {
        workflow: serializeWorkflow(updated),
        generatedPrompt: systemPrompt,
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

export default router;
