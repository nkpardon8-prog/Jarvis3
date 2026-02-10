import { Router, Response } from "express";
import { google } from "googleapis";
import { randomBytes, createHash, randomUUID } from "crypto";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";
import { getTokensForProvider, getGoogleApiClient } from "../services/oauth.service";
import {
  provisionOpenClawGoogleProxy,
  getProvisionStatus,
  ensureProvisioned,
  resetBackfillFlag,
  ProvisionError,
} from "../services/openclaw-google-proxy.service";
import { gateway } from "../gateway/connection";
import { config } from "../config";

const router = Router();

router.use(authMiddleware);

// ─── In-memory contact cache (per user) ─────────────────────
// Populated once from the user's full Gmail history, then filtered locally per keystroke.
// Refreshes every 10 minutes so new contacts appear.

interface CachedContact { name: string; email: string }
interface ContactCache { contacts: CachedContact[]; builtAt: number; building: boolean }
const contactCacheMap = new Map<string, ContactCache>();
const CONTACT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function buildContactCache(userId: string): Promise<CachedContact[]> {
  const existing = contactCacheMap.get(userId);
  if (existing && (Date.now() - existing.builtAt < CONTACT_CACHE_TTL)) return existing.contacts;
  if (existing?.building) return existing.contacts; // return stale while rebuilding

  // Mark as building
  if (existing) existing.building = true;
  else contactCacheMap.set(userId, { contacts: [], builtAt: 0, building: true });

  try {
    const oauth2Client = await getGoogleApiClient(userId);
    if (!oauth2Client) return [];

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const seen = new Set<string>();
    const contacts: CachedContact[] = [];

    // Paginate through recent messages (up to 500) to extract all contacts
    let pageToken: string | undefined;
    let fetched = 0;
    const MAX_MESSAGES = 500;

    while (fetched < MAX_MESSAGES) {
      const listRes = await gmail.users.messages.list({
        userId: "me",
        maxResults: Math.min(100, MAX_MESSAGES - fetched),
        pageToken,
      });

      const msgs = listRes.data.messages || [];
      if (msgs.length === 0) break;

      // Fetch metadata in parallel batches of 25
      for (let i = 0; i < msgs.length; i += 25) {
        const batch = msgs.slice(i, i + 25);
        const results = await Promise.allSettled(
          batch.map((m) =>
            gmail.users.messages.get({
              userId: "me",
              id: m.id!,
              format: "metadata",
              metadataHeaders: ["From", "To", "Cc"],
            })
          )
        );

        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const headers = r.value.data.payload?.headers || [];
          const from = headers.find((h) => h.name === "From")?.value || "";
          const toH = headers.find((h) => h.name === "To")?.value || "";
          const ccH = headers.find((h) => h.name === "Cc")?.value || "";

          for (const addr of [from, ...(toH ? toH.split(",") : []), ...(ccH ? ccH.split(",") : [])]) {
            if (!addr.trim()) continue;
            const angleMatch = addr.match(/<([^>]+)>/);
            const email = (angleMatch ? angleMatch[1] : addr.trim()).toLowerCase();
            if (!email.includes("@") || seen.has(email)) continue;
            seen.add(email);
            const name = angleMatch ? addr.replace(/<[^>]+>/, "").trim().replace(/"/g, "") : "";
            contacts.push({ name: name || email, email });
          }
        }
      }

      fetched += msgs.length;
      pageToken = listRes.data.nextPageToken || undefined;
      if (!pageToken) break;
    }

    contactCacheMap.set(userId, { contacts, builtAt: Date.now(), building: false });
    return contacts;
  } catch (err) {
    console.error("[Email] Contact cache build error:", err);
    const fallback = contactCacheMap.get(userId);
    if (fallback) fallback.building = false;
    return fallback?.contacts || [];
  }
}

// ─── Email connection status ──────────────────────────────

router.get("/status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const googleTokens = await getTokensForProvider(userId, "google");
    const msTokens = await getTokensForProvider(userId, "microsoft");

    // Idempotent backfill: if Google connected but not provisioned, trigger in background
    if (googleTokens) {
      ensureProvisioned(userId);
    }

    res.json({
      ok: true,
      data: {
        connected: !!(googleTokens || msTokens),
        providers: {
          google: !!googleTokens,
          microsoft: !!msTokens,
        },
        message:
          googleTokens || msTokens
            ? undefined
            : "Connect Gmail or Outlook in Connections to manage email.",
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Inbox messages ──────────────────────────────────────

router.get("/inbox", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const maxResults = Math.min(parseInt(String(req.query.max || "500"), 10), 500);

    // Date range: `before` (ISO) = upper bound, `months` = how far back from `before`
    const beforeDate = req.query.before ? new Date(String(req.query.before)) : new Date();
    const months = Math.min(parseInt(String(req.query.months || "1"), 10), 12);
    const afterDate = new Date(beforeDate);
    afterDate.setMonth(afterDate.getMonth() - months);

    const googleTokens = await getTokensForProvider(userId, "google");
    const msTokens = await getTokensForProvider(userId, "microsoft");

    if (!googleTokens && !msTokens) {
      res.json({
        ok: true,
        data: {
          connected: false,
          message: "Connect Gmail or Outlook in Connections to view email.",
          messages: [],
        },
      });
      return;
    }

    const messages: EmailMessage[] = [];

    if (googleTokens) {
      try {
        const gmailMessages = await fetchGmailMessages(
          userId,
          googleTokens.accessToken,
          maxResults,
          afterDate,
          beforeDate
        );
        messages.push(...gmailMessages);
      } catch (err: any) {
        console.error("[Email] Gmail fetch error:", err.message);
      }
    }

    if (msTokens) {
      try {
        const outlookMessages = await fetchOutlookMessages(
          msTokens.accessToken,
          maxResults,
          afterDate,
          beforeDate
        );
        messages.push(...outlookMessages);
      } catch (err: any) {
        console.error("[Email] Outlook fetch error:", err.message);
      }
    }

    // Sort by date descending
    messages.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const sliced = messages.slice(0, maxResults);

    res.json({
      ok: true,
      data: {
        connected: true,
        providers: {
          google: !!googleTokens,
          microsoft: !!msTokens,
        },
        messages: sliced,
        // Let the client know the date range so it can request the next chunk
        dateRange: {
          after: afterDate.toISOString(),
          before: beforeDate.toISOString(),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Email settings ──────────────────────────────────────

router.get("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    let settings = await prisma.emailSettings.findUnique({ where: { userId } });
    if (!settings) {
      settings = await prisma.emailSettings.create({
        data: { userId },
      });
    }

    const tags = await prisma.emailTag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });

    res.json({ ok: true, data: { settings, tags } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { autoTagEnabled, autoDraftEnabled, draftTone, signature, draftRules } =
      req.body;

    const settings = await prisma.emailSettings.upsert({
      where: { userId },
      update: {
        ...(autoTagEnabled !== undefined ? { autoTagEnabled } : {}),
        ...(autoDraftEnabled !== undefined ? { autoDraftEnabled } : {}),
        ...(draftTone !== undefined ? { draftTone } : {}),
        ...(signature !== undefined ? { signature } : {}),
        ...(draftRules !== undefined ? { draftRules } : {}),
      },
      create: {
        userId,
        autoTagEnabled: autoTagEnabled ?? false,
        autoDraftEnabled: autoDraftEnabled ?? false,
        draftTone,
        signature,
        draftRules,
      },
    });

    res.json({ ok: true, data: settings });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Email tags ──────────────────────────────────────────

router.post("/tags", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, color, description, criteria } = req.body;

    if (!name) {
      res.status(400).json({ ok: false, error: "name is required" });
      return;
    }

    const tag = await prisma.emailTag.create({
      data: {
        userId,
        name,
        color: color || "#00d4ff",
        description: description || null,
        criteria: criteria || null,
      },
    });

    res.json({ ok: true, data: tag });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch("/tags/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { name, color, description, criteria } = req.body;

    const existing = await prisma.emailTag.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Tag not found" });
      return;
    }

    const tag = await prisma.emailTag.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(criteria !== undefined ? { criteria } : {}),
      },
    });

    res.json({ ok: true, data: tag });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/tags/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const existing = await prisma.emailTag.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Tag not found" });
      return;
    }

    await prisma.emailTag.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Drafts (shared between email compose and document compose) ──

router.get("/drafts", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const type = req.query.type ? String(req.query.type) : undefined;

    const drafts = await prisma.draft.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ ok: true, data: { drafts } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/drafts", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { type, to, subject, body, context, provider } = req.body;

    if (!body && !subject) {
      res.status(400).json({ ok: false, error: "subject or body is required" });
      return;
    }

    const draft = await prisma.draft.create({
      data: {
        userId,
        type: type || "email",
        to: to || null,
        subject: subject || null,
        body: body || "",
        context: context || null,
        provider: provider || null,
      },
    });

    res.json({ ok: true, data: draft });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch("/drafts/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const existing = await prisma.draft.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Draft not found" });
      return;
    }

    const { to, subject, body, context } = req.body;
    const draft = await prisma.draft.update({
      where: { id },
      data: {
        ...(to !== undefined ? { to } : {}),
        ...(subject !== undefined ? { subject } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(context !== undefined ? { context } : {}),
      },
    });

    res.json({ ok: true, data: draft });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/drafts/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const existing = await prisma.draft.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Draft not found" });
      return;
    }

    await prisma.draft.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Tag an email ────────────────────────────────────────────

router.post("/tag-email", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { emailId, provider, tagId, tagName } = req.body;

    if (!emailId || !provider) {
      res.status(400).json({ ok: false, error: "emailId and provider are required" });
      return;
    }

    if (!tagId) {
      // Remove tag — delete the ProcessedEmail record
      await prisma.processedEmail.deleteMany({ where: { userId, emailId } });
      res.json({ ok: true, data: { emailId, tagId: null, tagName: null } });
      return;
    }

    const record = await prisma.processedEmail.upsert({
      where: { userId_emailId: { userId, emailId } },
      update: { tagId, tagName: tagName || null },
      create: { userId, emailId, provider, tagId, tagName: tagName || null },
    });

    res.json({ ok: true, data: record });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Get tags for emails (batch) ─────────────────────────────

router.get("/email-tags", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const emailIds = req.query.ids
      ? String(req.query.ids).split(",").filter(Boolean)
      : [];

    const records = await prisma.processedEmail.findMany({
      where: { userId, emailId: { in: emailIds }, tagId: { not: null } },
    });

    const tagMap: Record<string, { tagId: string; tagName: string | null }> = {};
    for (const r of records) {
      if (r.tagId) {
        tagMap[r.emailId] = { tagId: r.tagId, tagName: r.tagName };
      }
    }

    res.json({ ok: true, data: { tags: tagMap } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── OpenClaw-native email tagging (cron-based) ─────────────────

/** Send a prompt to the agent and wait for full response */
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
      deliver: "full",
      thinking: "low",
      idempotencyKey: `tagging-${Date.now()}-${randomUUID().slice(0, 8)}`,
    },
    timeoutMs
  );
}

/** Check if cron gateway methods are available */
function hasCronMethod(method: string): boolean {
  const methods = gateway.availableMethods || [];
  return methods.includes(method);
}

/** Check if cron gateway methods are available */
function hasCronMethods(): boolean {
  return hasCronMethod("cron.add");
}

/** Resolve the Jarvis proxy base URL (production-safe, no hardcoded localhost) */
function getProxyUrl(): string {
  return config.oauthBaseUrl || `http://localhost:${config.port}`;
}

const TAGGING_INTERVAL_MS = 30 * 60 * 1000;
const TAGGING_HEALTH_GRACE_MS = 5 * 60 * 1000;

function parseCronDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickLatestDate(a: Date | null, b: Date | null): Date | null {
  if (a && b) return a.getTime() >= b.getTime() ? a : b;
  return a || b;
}

async function getLiveCronJob(schedule: {
  cronJobId?: string | null;
  cronJobName?: string | null;
}): Promise<{ ok: boolean; job: any | null }> {
  if (!gateway.isConnected || !hasCronMethod("cron.list")) return { ok: false, job: null };

  try {
    const cronResult = (await gateway.send("cron.list", {})) as any;
    const jobs = Array.isArray(cronResult?.jobs)
      ? cronResult.jobs
      : Array.isArray(cronResult)
        ? cronResult
        : [];

    const job =
      jobs.find((j: any) => {
        const id = j?.id || j?.jobId;
        if (schedule.cronJobId && id === schedule.cronJobId) return true;
        if (schedule.cronJobName && j?.name === schedule.cronJobName) return true;
        return false;
      }) || null;

    return { ok: true, job };
  } catch {
    return { ok: false, job: null };
  }
}

function deriveTaggingSchedulerHealth(
  schedule: any,
  liveCronJob: any | null,
  cronLookupOk: boolean
) {
  const cronAvailable = hasCronMethod("cron.list");
  const gatewayConnected = gateway.isConnected;
  const now = Date.now();

  const dbLastRun = schedule?.lastRunAt ? new Date(schedule.lastRunAt) : null;
  const liveLastRun = parseCronDate(liveCronJob?.lastRun);
  const nextRun = parseCronDate(liveCronJob?.nextRun);
  const effectiveLastRun = pickLatestDate(dbLastRun, liveLastRun);

  let health: "healthy" | "delayed" | "unhealthy" | "unknown" = "unknown";
  let message: string | null = null;
  let cronJobFound: boolean | null = null;

  if (!schedule?.enabled) {
    health = "unknown";
  } else if (!gatewayConnected) {
    health = "unknown";
    message = "Gateway disconnected — scheduler state unavailable.";
  } else {
    health = "healthy";

    if (cronAvailable) {
      if (!cronLookupOk) {
        health = "unknown";
        message = "Unable to verify scheduler state right now.";
      } else {
        cronJobFound = !!liveCronJob;
      }
      if (cronLookupOk && !liveCronJob) {
        health = "unhealthy";
        message = "Tagging scheduler job is missing. Disable and re-enable Auto-Tag.";
      }
    }

    if (health === "healthy" && nextRun && nextRun.getTime() + TAGGING_HEALTH_GRACE_MS < now) {
      health = "unhealthy";
      message = "Tagging scheduler missed the expected run window.";
    }

    if (health === "healthy" && effectiveLastRun) {
      if (now - effectiveLastRun.getTime() > TAGGING_INTERVAL_MS * 2 + TAGGING_HEALTH_GRACE_MS) {
        health = "unhealthy";
        message = "No tagging run has been recorded recently.";
      }
    }

    if (health === "healthy" && !effectiveLastRun) {
      const enabledAt = schedule?.updatedAt ? new Date(schedule.updatedAt).getTime() : now;
      if (now - enabledAt > TAGGING_INTERVAL_MS + TAGGING_HEALTH_GRACE_MS) {
        health = "delayed";
        message = "First tagging run has not reported back yet.";
      }
    }
  }

  return {
    health,
    message,
    gatewayConnected,
    cronAvailable,
    cronJobFound,
    expectedIntervalMinutes: 30,
    liveLastRunAt: liveLastRun?.toISOString() || null,
    nextRunAt: nextRun?.toISOString() || null,
  };
}

async function triggerTaggingRun(params: {
  cronJobId?: string | null;
  cronJobName?: string | null;
  agentPrompt: string;
}): Promise<"cron.run" | "agentExec"> {
  if (hasCronMethod("cron.run")) {
    try {
      const runParams: any = { mode: "force" };
      if (params.cronJobId) runParams.jobId = params.cronJobId;
      else if (params.cronJobName) runParams.name = params.cronJobName;
      await gateway.send("cron.run", runParams);
      return "cron.run";
    } catch {
      // Fall through to agentExec
    }
  }

  agentExec(params.agentPrompt, 120000).catch((err) => {
    console.error(`[Email] Tagging run fallback error: ${err.message}`);
  });
  return "agentExec";
}

/** Build a self-contained tagging cron prompt with embedded proxy URL and auth instructions.
 *  Isolated cron sessions do NOT auto-source ~/.openclaw/.env, so this prompt must
 *  tell the agent explicitly how to authenticate and what endpoints to call. */
function buildTaggingPrompt(proxyUrl: string): string {
  return `You are running a scheduled email-tagging job for Jarvis.

## Prerequisites

Before making any HTTP requests, read the file ~/.openclaw/.env to load your environment variables. You need JARVIS_GOOGLE_PROXY_TOKEN from that file. If the file does not exist or the variable is missing, report an error and stop.

## Configuration

- Proxy Base URL: ${proxyUrl}/api/google-proxy
- Authentication: Include this header on EVERY request:
  Authorization: Bearer <value of JARVIS_GOOGLE_PROXY_TOKEN from ~/.openclaw/.env>

## Workflow

### Step 1 — Read tagging config
GET ${proxyUrl}/api/google-proxy/tagging/config
- If "enabled" is false or tags array is empty → POST results with status "noop" and stop.
- Note the "mode" (backfill or incremental) and "lastCheckpoint" values.

### Step 2 — Fetch emails
GET ${proxyUrl}/api/google-proxy/messages?maxResults=50
- If mode is "incremental" and lastCheckpoint is set, add &q=after:<lastCheckpoint_as_epoch_seconds> to only fetch recent mail.
- If no messages are returned, POST results with status "noop" and stop.

### Step 3 — Classify each email
For each email, read its full content:
GET ${proxyUrl}/api/google-proxy/messages/<messageId>
Compare the email subject, sender, and body against each tag's classification criteria. Assign the best-matching tag (or skip if no tag matches).

### Step 4 — Apply Gmail labels
For tagged emails, ensure a Gmail label exists for each tag name:
- GET ${proxyUrl}/api/google-proxy/labels — check existing labels
- POST ${proxyUrl}/api/google-proxy/labels with { "name": "<TagName>" } — create if missing
Then apply labels:
- POST ${proxyUrl}/api/google-proxy/messages/modify with { "messageIds": [...], "addLabelIds": ["<labelId>"] }

### Step 5 — Report results
POST ${proxyUrl}/api/google-proxy/tagging/results with JSON body:
{
  "status": "ok" | "error" | "noop",
  "mode": "<backfill or incremental>",
  "processed": <number>,
  "tagged": <number>,
  "skipped": <number>,
  "failed": <number>,
  "newCheckpoint": "<ISO date of newest email processed>",
  "results": [{ "emailId": "<id>", "tagName": "<tag>", "summary": "<brief reason>" }, ...],
  "errors": ["<error message>", ...]
}

## Error Handling
- If proxy auth fails (401/403), POST results with status "error" and errors: ["Proxy authentication failed — token may be invalid"]. Then stop.
- If any individual email fails, skip it, increment "failed", and continue with the rest.
- ALWAYS POST results at the end, even on error — this updates the Jarvis UI with run status.
- Never fail silently.

## Response format
All proxy endpoints return { ok: boolean, data?: T, error?: string }.`;
}

// ─── GET /tagging/status — Current tagging schedule status ───

router.get("/tagging/status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const schedule = await prisma.taggingSchedule.findUnique({ where: { userId } });

    if (!schedule) {
      res.json({
        ok: true,
        data: {
          enabled: false,
          mode: "backfill",
          lastRunAt: null,
          lastRunStatus: null,
          lastRunSummary: null,
          cronJobName: null,
          scheduler: {
            health: "unknown",
            message: null,
            gatewayConnected: gateway.isConnected,
            cronAvailable: hasCronMethod("cron.list"),
            cronJobFound: null,
            expectedIntervalMinutes: 30,
            liveLastRunAt: null,
            nextRunAt: null,
          },
        },
      });
      return;
    }

    const live = await getLiveCronJob(schedule);
    const liveCronJob = live.job;
    const scheduler = deriveTaggingSchedulerHealth(schedule, liveCronJob, live.ok);

    const dbLastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
    const liveLastRun = parseCronDate(liveCronJob?.lastRun);
    const effectiveLastRun = pickLatestDate(dbLastRun, liveLastRun);

    const enriched: any = {
      ...schedule,
      lastRunAt: effectiveLastRun?.toISOString() || schedule.lastRunAt,
      scheduler,
    };

    if (schedule.enabled && scheduler.health !== "healthy") {
      if (enriched.lastRunStatus === "ok") {
        enriched.lastRunStatus = "error";
      }
      if (!enriched.errorMessage && scheduler.message) {
        enriched.errorMessage = scheduler.message;
      }
    }

    res.json({ ok: true, data: enriched });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /tagging/enable — Enable auto-tagging cron ─────────

router.post("/tagging/enable", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    if (!gateway.isConnected) {
      res.status(400).json({ ok: false, error: "Gateway not connected. Connect to OpenClaw first." });
      return;
    }

    // Pre-check: Google must be connected
    const googleTokens = await getTokensForProvider(userId, "google");
    if (!googleTokens) {
      res.status(400).json({ ok: false, error: "Google account not connected. Connect Google first, then enable tagging." });
      return;
    }

    // Only provision if not already successfully provisioned.
    // provisionOpenClawGoogleProxy always rotates the token (plaintext isn't stored),
    // so calling it unnecessarily desyncs the DB hash from the .env plaintext.
    const [provisionStatus, existingToken] = await Promise.all([
      prisma.proxyProvisionStatus.findUnique({ where: { userId } }),
      prisma.proxyApiToken.findUnique({ where: { userId } }),
    ]);

    const alreadyProvisioned = provisionStatus?.status === "success" && !!existingToken;

    if (!alreadyProvisioned) {
      try {
        resetBackfillFlag(userId);
        await provisionOpenClawGoogleProxy(userId);
      } catch (err: any) {
        if (err instanceof ProvisionError) {
          res.status(400).json({ ok: false, error: err.message });
          return;
        }
        console.error(`[Email] Proxy provisioning failed during tagging enable: ${err.message}`);
        res.status(500).json({ ok: false, error: `Proxy provisioning failed: ${err.message}` });
        return;
      }
    }

    const proxyUrl = getProxyUrl();
    const cronJobName = `jarvis-email-tagging-${userId.slice(0, 8)}`;
    const agentPrompt = buildTaggingPrompt(proxyUrl);

    // Create/update DB record
    const schedule = await prisma.taggingSchedule.upsert({
      where: { userId },
      update: {
        enabled: true,
        cronJobName,
        mode: "backfill",
        lastCheckpoint: null,
        lastRunAt: null,
        lastRunStatus: null,
        lastRunSummary: null,
        errorMessage: null,
      },
      create: {
        userId,
        enabled: true,
        cronJobName,
        mode: "backfill",
        lastCheckpoint: null,
      },
    });

    // Register cron job — every 30 minutes
    let cronJobId: string | undefined;

    if (hasCronMethods()) {
      try {
        const cronResult = (await gateway.send("cron.add", {
          name: cronJobName,
          schedule: { kind: "every", everyMs: 1800000 },
          sessionTarget: "isolated",
          payload: {
            kind: "agentTurn",
            message: agentPrompt,
          },
        })) as any;
        cronJobId = cronResult?.id || cronResult?.jobId;
      } catch (err: any) {
        console.error(`[Email] cron.add failed: ${err.message}, trying agentExec fallback`);
        try {
          await agentExec(
            `Create a cron job named "${cronJobName}" with the following configuration:\n- Schedule: every 30 minutes\n- Session: isolated\n- Prompt: ${agentPrompt}\n\nConfirm when the cron job has been created.`,
            30000
          );
        } catch (fallbackErr: any) {
          console.error(`[Email] agentExec cron creation failed: ${fallbackErr.message}`);
        }
      }
    } else {
      try {
        await agentExec(
          `Create a cron job named "${cronJobName}" with the following configuration:\n- Schedule: every 30 minutes\n- Session: isolated\n- Prompt: ${agentPrompt}\n\nConfirm when the cron job has been created.`,
          30000
        );
      } catch (err: any) {
        console.error(`[Email] agentExec cron creation failed: ${err.message}`);
      }
    }

    // Update cronJobId if we got one
    if (cronJobId) {
      await prisma.taggingSchedule.update({
        where: { userId },
        data: { cronJobId },
      });
    }

    const triggerMethod = await triggerTaggingRun({
      cronJobId: cronJobId || schedule.cronJobId,
      cronJobName: schedule.cronJobName,
      agentPrompt,
    });

    const updated = await prisma.taggingSchedule.findUnique({ where: { userId } });
    res.json({
      ok: true,
      data: {
        ...updated,
        initialRunTriggered: true,
        triggerMethod,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /tagging/disable — Disable auto-tagging cron ───────

router.post("/tagging/disable", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const schedule = await prisma.taggingSchedule.findUnique({ where: { userId } });
    if (!schedule) {
      res.json({ ok: true, data: { enabled: false } });
      return;
    }

    // Remove cron job
    if (hasCronMethods()) {
      try {
        if (schedule.cronJobId) {
          await gateway.send("cron.remove", { jobId: schedule.cronJobId });
        } else if (schedule.cronJobName) {
          await gateway.send("cron.remove", { name: schedule.cronJobName });
        }
      } catch {
        // Job may not exist
      }
    }

    await prisma.taggingSchedule.update({
      where: { userId },
      data: { enabled: false },
    });

    res.json({ ok: true, data: { enabled: false } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /tagging/run — Manual trigger ──────────────────────

router.post("/tagging/run", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    let schedule = await prisma.taggingSchedule.findUnique({ where: { userId } });
    if (!schedule || !schedule.enabled) {
      res.status(400).json({ ok: false, error: "Tagging is not enabled. Enable it first." });
      return;
    }

    // Manual rerun must be one-shot full pass before returning to incremental.
    schedule = await prisma.taggingSchedule.update({
      where: { userId },
      data: {
        mode: "backfill",
        lastCheckpoint: null,
        lastRunAt: null,
        lastRunStatus: null,
        lastRunSummary: null,
        errorMessage: null,
      },
    });

    const proxyUrl = getProxyUrl();
    const triggerMethod = await triggerTaggingRun({
      cronJobId: schedule.cronJobId,
      cronJobName: schedule.cronJobName,
      agentPrompt: buildTaggingPrompt(proxyUrl),
    });

    res.json({ ok: true, data: { triggered: true, method: triggerMethod, mode: "backfill" } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Send email ──────────────────────────────────────────────

router.post("/send", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { to, subject, body, provider: requestedProvider } = req.body;

    if (!to || !subject || !body) {
      res.status(400).json({ ok: false, error: "to, subject, and body are required" });
      return;
    }

    const googleTokens = await getTokensForProvider(userId, "google");
    const msTokens = await getTokensForProvider(userId, "microsoft");

    // Determine which provider to use
    const useProvider = requestedProvider || (googleTokens ? "google" : msTokens ? "microsoft" : null);

    if (!useProvider) {
      res.status(400).json({ ok: false, error: "No email provider connected. Connect Gmail or Outlook first." });
      return;
    }

    if (useProvider === "google") {
      if (!googleTokens) {
        res.status(400).json({ ok: false, error: "Google account not connected" });
        return;
      }
      const oauth2Client = await getGoogleApiClient(userId);
      if (!oauth2Client) {
        res.status(500).json({ ok: false, error: "Google API client not available" });
        return;
      }
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const raw = Buffer.from(
        `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
      ).toString("base64url");

      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
    } else if (useProvider === "microsoft") {
      if (!msTokens) {
        res.status(400).json({ ok: false, error: "Microsoft account not connected" });
        return;
      }
      const sendRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${msTokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "Text", content: body },
            toRecipients: [{ emailAddress: { address: to } }],
          },
        }),
      });
      if (!sendRes.ok) {
        const errText = await sendRes.text();
        throw new Error(`Microsoft send error: ${sendRes.status} ${errText}`);
      }
    } else {
      res.status(400).json({ ok: false, error: `Unsupported provider: ${useProvider}` });
      return;
    }

    res.json({ ok: true, data: { sent: true, provider: useProvider } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Full message body ──────────────────────────────────────

router.get("/message/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const messageId = String(req.params.id);
    const provider = String(req.query.provider || "google");

    // Check cache first
    const cached = await prisma.emailContent.findUnique({
      where: { userId_emailId: { userId, emailId: messageId } },
    });
    if (cached) {
      res.json({ ok: true, data: cached });
      return;
    }

    if (provider === "google") {
      const oauth2Client = await getGoogleApiClient(userId);
      if (!oauth2Client) {
        res.status(500).json({ ok: false, error: "Google API client not available" });
        return;
      }
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "(No subject)";
      const from = headers.find((h) => h.name === "From")?.value || "";
      const to = headers.find((h) => h.name === "To")?.value || "";
      const date = headers.find((h) => h.name === "Date")?.value || "";
      const read = !(detail.data.labelIds || []).includes("UNREAD");
      const snippet = detail.data.snippet || "";

      // Extract body — collect all text parts, strongly prefer text/plain
      let body = "";
      const allParts: { mimeType: string; data: string }[] = [];
      const collectParts = (part: any) => {
        if (part.body?.data && part.mimeType) {
          allParts.push({
            mimeType: part.mimeType,
            data: Buffer.from(part.body.data, "base64url").toString("utf-8"),
          });
        }
        if (part.parts) {
          for (const p of part.parts) collectParts(p);
        }
      };
      collectParts(detail.data.payload || {});

      // Prefer HTML (preserves logos, buttons, visuals), fall back to plain text
      const htmlPart = allParts.find((p) => p.mimeType === "text/html");
      const plainPart = allParts.find((p) => p.mimeType === "text/plain");
      if (htmlPart) {
        body = htmlPart.data;
      } else if (plainPart && plainPart.data.trim()) {
        body = plainPart.data;
      } else if (allParts.length > 0) {
        body = allParts[0].data;
      }

      const content = await prisma.emailContent.upsert({
        where: { userId_emailId: { userId, emailId: messageId } },
        update: { body, read },
        create: {
          userId,
          emailId: messageId,
          provider: "google",
          subject,
          from,
          to,
          date: date ? new Date(date).toISOString() : new Date().toISOString(),
          body,
          snippet,
          read,
        },
      });

      res.json({ ok: true, data: content });
    } else if (provider === "microsoft") {
      const msTokens = await getTokensForProvider(userId, "microsoft");
      if (!msTokens) {
        res.status(400).json({ ok: false, error: "Microsoft account not connected" });
        return;
      }
      const msRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=subject,from,toRecipients,receivedDateTime,body,bodyPreview,isRead`,
        {
          headers: {
            Authorization: `Bearer ${msTokens.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!msRes.ok) {
        const errText = await msRes.text();
        throw new Error(`Microsoft Graph error: ${msRes.status} ${errText}`);
      }
      const msg: any = await msRes.json();
      const from = msg.from?.emailAddress
        ? `${msg.from.emailAddress.name || ""} <${msg.from.emailAddress.address || ""}>`
        : "";
      const to = (msg.toRecipients || [])
        .map((r: any) => r.emailAddress?.address || "")
        .filter(Boolean)
        .join(", ");

      const content = await prisma.emailContent.upsert({
        where: { userId_emailId: { userId, emailId: messageId } },
        update: { body: msg.body?.content || "", read: msg.isRead },
        create: {
          userId,
          emailId: messageId,
          provider: "microsoft",
          subject: msg.subject || "(No subject)",
          from,
          to,
          date: msg.receivedDateTime || new Date().toISOString(),
          body: msg.body?.content || "",
          snippet: msg.bodyPreview || "",
          read: msg.isRead || false,
        },
      });

      res.json({ ok: true, data: content });
    } else {
      res.status(400).json({ ok: false, error: `Unsupported provider: ${provider}` });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Contact search (searches entire Gmail account) ──────────

router.get("/search-contacts", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const query = String(req.query.q || "").trim().toLowerCase();

    if (!query) {
      res.json({ ok: true, data: { contacts: [] } });
      return;
    }

    const googleTokens = await getTokensForProvider(userId, "google");
    if (!googleTokens) {
      res.json({ ok: true, data: { contacts: [] } });
      return;
    }

    // Build or retrieve the full contact cache for this user
    const allContacts = await buildContactCache(userId);

    // Filter locally: match query against email and name, letter by letter
    const matches = allContacts.filter((c) =>
      c.email.includes(query) || c.name.toLowerCase().includes(query)
    );

    // Sort by relevance: prefix on local part > prefix on name > prefix on full email > contains
    matches.sort((a, b) => {
      const aLocal = a.email.split("@")[0];
      const bLocal = b.email.split("@")[0];
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();

      // Tier 0: local part (before @) starts with query
      const t0a = aLocal.startsWith(query) ? 0 : 1;
      const t0b = bLocal.startsWith(query) ? 0 : 1;
      if (t0a !== t0b) return t0a - t0b;

      // Tier 1: name starts with query
      const t1a = aName.startsWith(query) ? 0 : 1;
      const t1b = bName.startsWith(query) ? 0 : 1;
      if (t1a !== t1b) return t1a - t1b;

      // Tier 2: full email starts with query
      const t2a = a.email.startsWith(query) ? 0 : 1;
      const t2b = b.email.startsWith(query) ? 0 : 1;
      if (t2a !== t2b) return t2a - t2b;

      // Tier 3: local part contains query (closer to start = better)
      const posA = aLocal.indexOf(query);
      const posB = bLocal.indexOf(query);
      if (posA !== posB) return posA - posB;

      return a.email.localeCompare(b.email);
    });

    res.json({ ok: true, data: { contacts: matches.slice(0, 15) } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /proxy-token — Check if proxy token exists ─────────

router.get("/proxy-token", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const token = await prisma.proxyApiToken.findUnique({ where: { userId } });

    res.json({
      ok: true,
      data: {
        exists: !!token,
        label: token?.label || null,
        createdAt: token?.createdAt || null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /proxy-token — Generate/regenerate proxy token ────

router.post("/proxy-token", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const label = req.body.label || "OpenClaw Gmail Proxy";

    // Generate a 32-byte random token
    const plaintext = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");

    // Upsert — regenerate replaces old token
    await prisma.proxyApiToken.upsert({
      where: { userId },
      update: { tokenHash, label },
      create: { userId, tokenHash, label },
    });

    // Return plaintext ONCE — it's never stored
    res.json({
      ok: true,
      data: {
        token: plaintext,
        label,
        message: "Save this token — it will not be shown again.",
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /proxy-token — Revoke proxy token ───────────────

router.delete("/proxy-token", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const existing = await prisma.proxyApiToken.findUnique({ where: { userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "No proxy token found" });
      return;
    }

    await prisma.proxyApiToken.delete({ where: { userId } });

    res.json({ ok: true, data: { revoked: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /proxy-provision-status — Read provisioning status ──

router.get("/proxy-provision-status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const status = await getProvisionStatus(userId);
    res.json({ ok: true, data: status });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /proxy-token/deploy — Generate + deploy to OpenClaw

router.post("/proxy-token/deploy", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const force = req.body.force === true;

    // Reset backfill flag so manual retry always runs
    resetBackfillFlag(userId);

    const provisioned = await provisionOpenClawGoogleProxy(userId, { force });

    res.json({
      ok: true,
      data: {
        deployed: provisioned.deployed,
        skillVerified: provisioned.skillVerified,
        proxyUrl: provisioned.proxyUrl,
        tokenRotated: provisioned.tokenRotated,
        message: provisioned.skillVerified
          ? "Google proxy deployed and skill verified. OpenClaw can now access Google services."
          : "Google proxy deployed. Skill may take a moment to be detected by OpenClaw.",
      },
    });
  } catch (err: any) {
    console.error("[Email] Proxy deploy error:", err.message);
    const statusCode = err instanceof ProvisionError ? 400 : 500;
    res.status(statusCode).json({
      ok: false,
      error: err.message,
      errorCode: err instanceof ProvisionError ? err.code : "unknown",
    });
  }
});

// ─── Helpers ──────────────────────────────────────────────

interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  read: boolean;
  provider: "google" | "microsoft";
}

async function fetchGmailMessages(
  userId: string,
  accessToken: string,
  maxResults: number,
  afterDate: Date,
  beforeDate: Date
): Promise<EmailMessage[]> {
  const oauth2Client = await getGoogleApiClient(userId);
  if (!oauth2Client) {
    throw new Error("Google API client not available");
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Gmail uses epoch seconds for after:/before: query operators
  const afterEpoch = Math.floor(afterDate.getTime() / 1000);
  const beforeEpoch = Math.floor(beforeDate.getTime() / 1000);

  // List message IDs from inbox within date range, paginate if needed
  let allMessageIds: { id: string }[] = [];
  let pageToken: string | undefined;

  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: Math.min(maxResults - allMessageIds.length, 100),
      labelIds: ["INBOX"],
      q: `after:${afterEpoch} before:${beforeEpoch}`,
      ...(pageToken ? { pageToken } : {}),
    });

    const ids = (listRes.data.messages || []).filter((m): m is { id: string } => !!m.id);
    allMessageIds.push(...ids);
    pageToken = listRes.data.nextPageToken || undefined;
  } while (pageToken && allMessageIds.length < maxResults);

  if (allMessageIds.length === 0) return [];

  // Parallel metadata fetch in batches of 20
  const messages: EmailMessage[] = [];
  for (let i = 0; i < allMessageIds.length; i += 20) {
    const batch = allMessageIds.slice(i, i + 20);
    const results = await Promise.allSettled(
      batch.map((msg) =>
        gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        })
      )
    );

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const detail = r.value;
      const headers = detail.data.payload?.headers || [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(No subject)";
      const from = headers.find((h) => h.name === "From")?.value || "";
      const date = headers.find((h) => h.name === "Date")?.value || "";
      const read = !(detail.data.labelIds || []).includes("UNREAD");

      messages.push({
        id: detail.data.id!,
        subject,
        from,
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        snippet: detail.data.snippet || "",
        read,
        provider: "google",
      });
    }
  }

  return messages;
}

async function fetchOutlookMessages(
  accessToken: string,
  maxResults: number,
  afterDate: Date,
  beforeDate: Date
): Promise<EmailMessage[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
  url.searchParams.set("$top", String(maxResults));
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set("$filter", `receivedDateTime ge ${afterDate.toISOString()} and receivedDateTime lt ${beforeDate.toISOString()}`);
  url.searchParams.set(
    "$select",
    "id,subject,from,receivedDateTime,bodyPreview,isRead"
  );

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Microsoft Graph API error: ${response.status} ${errText}`);
  }

  const data: any = await response.json();

  return (data.value || []).map((msg: any) => ({
    id: msg.id,
    subject: msg.subject || "(No subject)",
    from: msg.from?.emailAddress
      ? `${msg.from.emailAddress.name || ""} <${msg.from.emailAddress.address || ""}>`
      : "",
    date: msg.receivedDateTime || new Date().toISOString(),
    snippet: msg.bodyPreview || "",
    read: msg.isRead || false,
    provider: "microsoft" as const,
  }));
}

export default router;
