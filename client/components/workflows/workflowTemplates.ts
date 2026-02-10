// ── Workflow Template Definitions & Types ────────────────────────────

export interface CredentialField {
  envVar: string;
  label: string;
  placeholder: string;
  helpUrl?: string;
}

export interface ScheduleValue {
  kind: "cron" | "every";
  expr?: string;
  intervalMs?: number;
}

export interface SchedulePreset {
  label: string;
  value: ScheduleValue;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide-react icon name
  accentColor: string; // HUD color token
  category: string;
  requiredSkills: string[];
  credentialFields: CredentialField[];
  oauthProviders?: string[];
  defaultSchedule: ScheduleValue;
  schedulePresets: SchedulePreset[];
  promptTemplate: string;
  sessionTarget: "isolated" | "main";
}

export interface WorkflowInstance {
  id: string;
  templateId: string;
  name: string;
  status: "setting-up" | "active" | "paused" | "error";
  schedule: { kind: string; expr?: string; intervalMs?: number; tz?: string };
  customTrigger?: string;
  additionalInstructions: string;
  cronJobId?: string;
  cronJobName: string;
  installedSkills: string[];
  storedCredentials: string[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

// ── The 5 Pre-Built Workflow Templates ───────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
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
      {
        label: "Morning briefing (7 AM)",
        value: { kind: "cron", expr: "0 7 * * *" },
      },
      {
        label: "Morning + afternoon",
        value: { kind: "cron", expr: "0 7,14 * * *" },
      },
      {
        label: "Every 2 hours (work hours)",
        value: { kind: "cron", expr: "0 8-18/2 * * 1-5" },
      },
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
      {
        label: "Daily (10 PM)",
        value: { kind: "cron", expr: "0 22 * * *" },
      },
      {
        label: "Twice daily",
        value: { kind: "cron", expr: "0 9,22 * * *" },
      },
      {
        label: "Weekly (Sunday)",
        value: { kind: "cron", expr: "0 20 * * 0" },
      },
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
      {
        label: "Twice daily (9 AM, 5 PM)",
        value: { kind: "cron", expr: "0 9,17 * * 1-5" },
      },
      {
        label: "Daily morning",
        value: { kind: "cron", expr: "0 9 * * *" },
      },
      {
        label: "Every 4 hours",
        value: { kind: "every", intervalMs: 14400000 },
      },
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
      {
        label: "Every 5 min (event polling)",
        value: { kind: "every", intervalMs: 300000 },
      },
      {
        label: "Every 15 min",
        value: { kind: "every", intervalMs: 900000 },
      },
      {
        label: "Morning + evening routine",
        value: { kind: "cron", expr: "0 7,22 * * *" },
      },
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

// ── Helpers ──────────────────────────────────────────────────────────

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

/** Human-readable schedule description */
export function describeSchedule(schedule: {
  kind: string;
  expr?: string;
  intervalMs?: number;
}): string {
  if (schedule.kind === "every" && schedule.intervalMs) {
    const mins = schedule.intervalMs / 60000;
    if (mins < 60) return `Every ${mins} min`;
    const hrs = mins / 60;
    if (hrs === 1) return "Every hour";
    return `Every ${hrs} hours`;
  }
  if (schedule.kind === "cron" && schedule.expr) {
    return describeCronExpr(schedule.expr);
  }
  return "Custom schedule";
}

/** Simple human-readable cron description for common patterns */
export function describeCronExpr(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [min, hour, dom, , dow] = parts;

  // "0 7 * * *" → "Daily at 7:00 AM"
  if (dom === "*" && dow === "*" && !hour.includes(",") && !hour.includes("/")) {
    const h = parseInt(hour, 10);
    const m = parseInt(min, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const mStr = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
    return `Daily at ${h12}${mStr} ${ampm}`;
  }

  // "0 7,14 * * *" → "Daily at 7:00 AM, 2:00 PM"
  if (dom === "*" && dow === "*" && hour.includes(",")) {
    const hours = hour.split(",").map((h) => {
      const n = parseInt(h, 10);
      const ampm = n >= 12 ? "PM" : "AM";
      const h12 = n === 0 ? 12 : n > 12 ? n - 12 : n;
      return `${h12} ${ampm}`;
    });
    return `Daily at ${hours.join(", ")}`;
  }

  // "0 9,17 * * 1-5" → "Weekdays at 9 AM, 5 PM"
  if (dom === "*" && dow === "1-5" && hour.includes(",")) {
    const hours = hour.split(",").map((h) => {
      const n = parseInt(h, 10);
      const ampm = n >= 12 ? "PM" : "AM";
      const h12 = n === 0 ? 12 : n > 12 ? n - 12 : n;
      return `${h12} ${ampm}`;
    });
    return `Weekdays at ${hours.join(", ")}`;
  }

  // "0 8-18/2 * * 1-5" → "Weekdays every 2h (8 AM - 6 PM)"
  if (dom === "*" && dow === "1-5" && hour.includes("/")) {
    return `Weekdays ${hour}`;
  }

  // "0 20 * * 0" → "Weekly on Sunday at 8 PM"
  if (dom === "*" && /^\d$/.test(dow)) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Weekly on ${days[parseInt(dow, 10)]} at ${h12} ${ampm}`;
  }

  return expr;
}
