import { Router, Response } from "express";
import { google } from "googleapis";
import { proxyAuthMiddleware } from "../middleware/proxyAuth";
import { AuthRequest } from "../types";
import { getGoogleApiClient } from "../services/oauth.service";
import { prisma } from "../services/prisma";

const router = Router();

router.use(proxyAuthMiddleware);

// ─── Rate limiting (in-memory, per token/user) ──────────────

interface RateWindow {
  timestamps: number[];
}

const rateLimits = new Map<string, RateWindow>();
const RATE_LIMIT_PER_MIN = 120;
const RATE_LIMIT_PER_HOUR = 1500;

function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let window = rateLimits.get(userId);
  if (!window) {
    window = { timestamps: [] };
    rateLimits.set(userId, window);
  }

  // Prune timestamps older than 1 hour
  const oneHourAgo = now - 60 * 60 * 1000;
  window.timestamps = window.timestamps.filter((t) => t > oneHourAgo);

  // Check hourly limit
  if (window.timestamps.length >= RATE_LIMIT_PER_HOUR) {
    const oldestInWindow = window.timestamps[0];
    return { allowed: false, retryAfterMs: oldestInWindow + 60 * 60 * 1000 - now };
  }

  // Check per-minute limit
  const oneMinAgo = now - 60 * 1000;
  const recentCount = window.timestamps.filter((t) => t > oneMinAgo).length;
  if (recentCount >= RATE_LIMIT_PER_MIN) {
    const oldestRecent = window.timestamps.find((t) => t > oneMinAgo)!;
    return { allowed: false, retryAfterMs: oldestRecent + 60 * 1000 - now };
  }

  window.timestamps.push(now);
  return { allowed: true };
}

function rateLimitGuard(req: AuthRequest, res: Response): boolean {
  const userId = req.user!.userId;
  const result = checkRateLimit(userId);
  if (!result.allowed) {
    res.status(429).json({
      ok: false,
      error: "Rate limit exceeded",
      retryAfterMs: result.retryAfterMs,
    });
    return false;
  }
  return true;
}

// ─── Helper: get Gmail client for proxy user ────────────────

async function getGmailClient(userId: string) {
  const oauth2Client = await getGoogleApiClient(userId);
  if (!oauth2Client) return null;
  return google.gmail({ version: "v1", auth: oauth2Client });
}

// ─── Helper: extract email body from payload ────────────────

function extractBody(payload: any): string {
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
  collectParts(payload || {});

  const htmlPart = allParts.find((p) => p.mimeType === "text/html");
  const plainPart = allParts.find((p) => p.mimeType === "text/plain");
  if (htmlPart) return htmlPart.data;
  if (plainPart && plainPart.data.trim()) return plainPart.data;
  if (allParts.length > 0) return allParts[0].data;
  return "";
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── GET /messages — List inbox messages ────────────────────

router.get("/messages", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const gmail = await getGmailClient(userId);
    if (!gmail) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const maxResults = Math.min(parseInt(String(req.query.maxResults || "20"), 10), 100);
    const pageToken = req.query.pageToken ? String(req.query.pageToken) : undefined;
    const labelIds = req.query.labelIds
      ? String(req.query.labelIds).split(",").filter(Boolean)
      : undefined;
    const q = req.query.q ? String(req.query.q) : undefined;

    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      ...(pageToken ? { pageToken } : {}),
      ...(labelIds ? { labelIds } : {}),
      ...(q ? { q } : {}),
    });

    const messageRefs = listRes.data.messages || [];
    if (messageRefs.length === 0) {
      res.json({ ok: true, data: { messages: [], nextPageToken: null } });
      return;
    }

    // Fetch metadata in parallel batches of 20
    const messages: any[] = [];
    for (let i = 0; i < messageRefs.length; i += 20) {
      const batch = messageRefs.slice(i, i + 20);
      const results = await Promise.allSettled(
        batch.map((m) =>
          gmail.users.messages.get({
            userId: "me",
            id: m.id!,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "To", "Date"],
          })
        )
      );

      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const detail = r.value;
        const headers = detail.data.payload?.headers || [];
        messages.push({
          id: detail.data.id,
          threadId: detail.data.threadId,
          subject: headers.find((h) => h.name === "Subject")?.value || "(No subject)",
          from: headers.find((h) => h.name === "From")?.value || "",
          to: headers.find((h) => h.name === "To")?.value || "",
          date: headers.find((h) => h.name === "Date")?.value || "",
          snippet: detail.data.snippet || "",
          labelIds: detail.data.labelIds || [],
          read: !(detail.data.labelIds || []).includes("UNREAD"),
        });
      }
    }

    console.log(`[GmailProxy] GET /messages userId=${userId} count=${messages.length}`);

    res.json({
      ok: true,
      data: {
        messages,
        nextPageToken: listRes.data.nextPageToken || null,
        resultSizeEstimate: listRes.data.resultSizeEstimate,
      },
    });
  } catch (err: any) {
    console.error(`[GmailProxy] GET /messages error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /messages/:id — Full message content ───────────────

router.get("/messages/:id", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;
  const messageId = String(req.params.id);

  try {
    const gmail = await getGmailClient(userId);
    if (!gmail) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = detail.data.payload?.headers || [];
    const body = extractBody(detail.data.payload);

    console.log(`[GmailProxy] GET /messages/${messageId} userId=${userId}`);

    res.json({
      ok: true,
      data: {
        id: detail.data.id,
        threadId: detail.data.threadId,
        subject: headers.find((h) => h.name === "Subject")?.value || "(No subject)",
        from: headers.find((h) => h.name === "From")?.value || "",
        to: headers.find((h) => h.name === "To")?.value || "",
        date: headers.find((h) => h.name === "Date")?.value || "",
        snippet: detail.data.snippet || "",
        labelIds: detail.data.labelIds || [],
        read: !(detail.data.labelIds || []).includes("UNREAD"),
        body,
      },
    });
  } catch (err: any) {
    console.error(`[GmailProxy] GET /messages/${messageId} error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /messages/modify — Batch add/remove labels ────────

router.post("/messages/modify", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const gmail = await getGmailClient(userId);
    if (!gmail) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const { messageIds, addLabelIds, removeLabelIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      res.status(400).json({ ok: false, error: "messageIds array is required" });
      return;
    }
    if (messageIds.length > 50) {
      res.status(400).json({ ok: false, error: "Maximum 50 messages per batch" });
      return;
    }
    if (!addLabelIds && !removeLabelIds) {
      res.status(400).json({ ok: false, error: "At least one of addLabelIds or removeLabelIds is required" });
      return;
    }

    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids: messageIds,
        addLabelIds: addLabelIds || [],
        removeLabelIds: removeLabelIds || [],
      },
    });

    console.log(`[GmailProxy] POST /messages/modify userId=${userId} count=${messageIds.length}`);

    res.json({ ok: true, data: { modified: messageIds.length } });
  } catch (err: any) {
    console.error(`[GmailProxy] POST /messages/modify error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /messages/search — Search with Gmail query syntax ─

router.post("/messages/search", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const gmail = await getGmailClient(userId);
    if (!gmail) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const { query, maxResults: maxParam } = req.body;
    if (!query || typeof query !== "string") {
      res.status(400).json({ ok: false, error: "query string is required" });
      return;
    }

    const maxResults = Math.min(parseInt(String(maxParam || "20"), 10), 100);

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
    });

    const messageRefs = listRes.data.messages || [];
    if (messageRefs.length === 0) {
      res.json({ ok: true, data: { messages: [], resultSizeEstimate: 0 } });
      return;
    }

    // Fetch metadata
    const messages: any[] = [];
    for (let i = 0; i < messageRefs.length; i += 20) {
      const batch = messageRefs.slice(i, i + 20);
      const results = await Promise.allSettled(
        batch.map((m) =>
          gmail.users.messages.get({
            userId: "me",
            id: m.id!,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "To", "Date"],
          })
        )
      );

      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const detail = r.value;
        const headers = detail.data.payload?.headers || [];
        messages.push({
          id: detail.data.id,
          threadId: detail.data.threadId,
          subject: headers.find((h) => h.name === "Subject")?.value || "(No subject)",
          from: headers.find((h) => h.name === "From")?.value || "",
          to: headers.find((h) => h.name === "To")?.value || "",
          date: headers.find((h) => h.name === "Date")?.value || "",
          snippet: detail.data.snippet || "",
          labelIds: detail.data.labelIds || [],
          read: !(detail.data.labelIds || []).includes("UNREAD"),
        });
      }
    }

    console.log(`[GmailProxy] POST /messages/search userId=${userId} query="${query}" count=${messages.length}`);

    res.json({
      ok: true,
      data: {
        messages,
        resultSizeEstimate: listRes.data.resultSizeEstimate,
      },
    });
  } catch (err: any) {
    console.error(`[GmailProxy] POST /messages/search error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /messages/send — Send email via Gmail ─────────────

router.post("/messages/send", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const gmail = await getGmailClient(userId);
    if (!gmail) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const { to, subject, body, bodyType } = req.body;
    if (!to || !subject || !body) {
      res.status(400).json({ ok: false, error: "to, subject, and body are required" });
      return;
    }

    const contentType = bodyType === "html" ? "text/html" : "text/plain";
    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: ${contentType}; charset=utf-8\r\n\r\n${body}`
    ).toString("base64url");

    const sent = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    console.log(`[GmailProxy] POST /messages/send userId=${userId}`);
    res.json({
      ok: true,
      data: {
        sent: true,
        id: sent.data.id || null,
        threadId: sent.data.threadId || null,
      },
    });
  } catch (err: any) {
    console.error(`[GmailProxy] POST /messages/send error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /labels — List all Gmail labels ────────────────────

router.get("/labels", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const gmail = await getGmailClient(userId);
    if (!gmail) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const labelsRes = await gmail.users.labels.list({ userId: "me" });
    const labels = (labelsRes.data.labels || []).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      messageListVisibility: l.messageListVisibility,
      labelListVisibility: l.labelListVisibility,
    }));

    console.log(`[GmailProxy] GET /labels userId=${userId} count=${labels.length}`);

    res.json({ ok: true, data: { labels } });
  } catch (err: any) {
    console.error(`[GmailProxy] GET /labels error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /labels — Create a new Gmail label ────────────────

router.post("/labels", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const gmail = await getGmailClient(userId);
    if (!gmail) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const { name } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ ok: false, error: "name string is required" });
      return;
    }

    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });

    console.log(`[GmailProxy] POST /labels userId=${userId} name="${name}"`);

    res.json({
      ok: true,
      data: {
        id: created.data.id,
        name: created.data.name,
        type: created.data.type,
      },
    });
  } catch (err: any) {
    console.error(`[GmailProxy] POST /labels error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /calendar/events — List Google Calendar events ─────

router.get("/calendar/events", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const auth = await getGoogleApiClient(userId);
    if (!auth) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const calendar = google.calendar({ version: "v3", auth });
    const start = req.query.start ? new Date(String(req.query.start)) : new Date();
    const end = req.query.end
      ? new Date(String(req.query.end))
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    const events = (response.data.items || []).map((event) => {
      const isAllDay = !!event.start?.date;
      const startStr = event.start?.dateTime || event.start?.date || "";
      const endStr = event.end?.dateTime || event.end?.date || "";
      return {
        id: event.id || "",
        title: event.summary || "(No title)",
        start: startStr,
        end: endStr,
        startTime: isAllDay ? "All day" : formatTime(startStr),
        endTime: isAllDay ? "" : formatTime(endStr),
        allDay: isAllDay,
        location: event.location || undefined,
        description: event.description || undefined,
        htmlLink: event.htmlLink || undefined,
      };
    });

    console.log(`[GmailProxy] GET /calendar/events userId=${userId} count=${events.length}`);
    res.json({ ok: true, data: { events } });
  } catch (err: any) {
    console.error(`[GmailProxy] GET /calendar/events error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /calendar/events — Create Google Calendar event ───

router.post("/calendar/events", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const auth = await getGoogleApiClient(userId);
    if (!auth) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const { title, start, end, description, location, timezone } = req.body;
    if (!title || !start || !end) {
      res.status(400).json({ ok: false, error: "title, start, and end are required" });
      return;
    }

    const calendar = google.calendar({ version: "v3", auth });
    const created = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description: description || undefined,
        location: location || undefined,
        start: { dateTime: String(start), timeZone: timezone || "UTC" },
        end: { dateTime: String(end), timeZone: timezone || "UTC" },
      },
    });

    console.log(`[GmailProxy] POST /calendar/events userId=${userId} title="${title}"`);
    res.json({
      ok: true,
      data: {
        id: created.data.id || null,
        htmlLink: created.data.htmlLink || null,
      },
    });
  } catch (err: any) {
    console.error(`[GmailProxy] POST /calendar/events error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /drive/files — List Drive files ───────────────────

router.get("/drive/files", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const auth = await getGoogleApiClient(userId);
    if (!auth) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const maxResults = Math.min(parseInt(String(req.query.max || "20"), 10), 100);
    const pageToken = req.query.pageToken ? String(req.query.pageToken) : undefined;
    const nameFilter = req.query.q ? String(req.query.q) : undefined;
    let q = "trashed = false";
    if (nameFilter) {
      q += ` and name contains '${nameFilter.replace(/'/g, "\\'")}'`;
    }

    const drive = google.drive({ version: "v3", auth });
    const response = await drive.files.list({
      q,
      pageSize: maxResults,
      pageToken,
      orderBy: "modifiedTime desc",
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, size, owners)",
    });

    const files = (response.data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      size: f.size ? parseInt(f.size, 10) : null,
      owner: f.owners?.[0]?.displayName || f.owners?.[0]?.emailAddress || null,
    }));

    console.log(`[GmailProxy] GET /drive/files userId=${userId} count=${files.length}`);
    res.json({
      ok: true,
      data: {
        files,
        nextPageToken: response.data.nextPageToken || null,
      },
    });
  } catch (err: any) {
    console.error(`[GmailProxy] GET /drive/files error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /drive/search — Search Drive content ──────────────

router.get("/drive/search", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const query = req.query.q ? String(req.query.q) : "";
    if (!query) {
      res.status(400).json({ ok: false, error: "Query parameter 'q' is required" });
      return;
    }

    const auth = await getGoogleApiClient(userId);
    if (!auth) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const drive = google.drive({ version: "v3", auth });
    const response = await drive.files.list({
      q: `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      pageSize: 50,
      orderBy: "modifiedTime desc",
      fields: "files(id, name, mimeType, modifiedTime, webViewLink, size)",
    });

    const files = (response.data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      size: f.size ? parseInt(f.size, 10) : null,
    }));

    console.log(`[GmailProxy] GET /drive/search userId=${userId} query="${query}" count=${files.length}`);
    res.json({ ok: true, data: { files } });
  } catch (err: any) {
    console.error(`[GmailProxy] GET /drive/search error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /docs/:docId — Read Google Doc text ───────────────

router.get("/docs/:docId", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const auth = await getGoogleApiClient(userId);
    if (!auth) {
      res.status(400).json({ ok: false, error: "Google account not connected for this user" });
      return;
    }

    const { docId } = req.params;
    const docs = google.docs({ version: "v1", auth });
    const docResponse = await docs.documents.get({ documentId: String(docId) });
    const docData = docResponse.data;

    let textContent = "";
    for (const element of docData.body?.content || []) {
      if (!element.paragraph) continue;
      for (const pe of element.paragraph.elements || []) {
        if (pe.textRun?.content) textContent += pe.textRun.content;
      }
    }

    console.log(`[GmailProxy] GET /docs/${docId} userId=${userId}`);
    res.json({
      ok: true,
      data: {
        title: docData.title || "(Untitled)",
        body: textContent,
        revisionId: docData.revisionId || null,
        documentId: docData.documentId,
      },
    });
  } catch (err: any) {
    console.error(`[GmailProxy] GET /docs/:docId error userId=${userId}:`, err.message);
    if (err.code === 404) {
      res.status(404).json({ ok: false, error: "Document not found" });
      return;
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /tagging/config — Config for OpenClaw tagging agent ──

router.get("/tagging/config", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const schedule = await prisma.taggingSchedule.findUnique({ where: { userId } });

    if (!schedule || !schedule.enabled) {
      res.json({ ok: true, data: { enabled: false, mode: "backfill", lastCheckpoint: null, tags: [] } });
      return;
    }

    const tags = await prisma.emailTag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });

    console.log(`[GmailProxy] GET /tagging/config userId=${userId} tags=${tags.length} mode=${schedule.mode}`);

    res.json({
      ok: true,
      data: {
        enabled: true,
        mode: schedule.mode,
        lastCheckpoint: schedule.lastCheckpoint || null,
        tags: tags.map((t) => ({
          name: t.name,
          criteria: t.criteria || t.description || null,
          color: t.color,
        })),
      },
    });
  } catch (err: any) {
    console.error(`[GmailProxy] GET /tagging/config error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /tagging/results — Agent reports tagging results ───
// Also aliased as POST /tagging/sync for skill compatibility

async function handleTaggingResults(userId: string, body: any) {
  const { status, mode, processed, tagged, skipped, failed, newCheckpoint, results, errors } = body || {};

  if (!status || typeof status !== "string") {
    return { error: "status is required", statusCode: 400 as const };
  }

  const normalizedStatus = status === "ok" ? "ok" : status === "noop" ? "noop" : "error";

  // Upsert each tagged result into ProcessedEmail
  const resultList = Array.isArray(results) ? results : [];
  let upserted = 0;

  for (const r of resultList) {
    if (!r.emailId || !r.tagName) continue;

    const tag = await prisma.emailTag.findFirst({
      where: { userId, name: { equals: r.tagName } },
    });

    await prisma.processedEmail.upsert({
      where: { userId_emailId: { userId, emailId: r.emailId } },
      update: {
        summary: r.summary || null,
        tagId: tag?.id || null,
        tagName: r.tagName,
        processedAt: new Date(),
      },
      create: {
        userId,
        emailId: r.emailId,
        provider: "google",
        summary: r.summary || null,
        tagId: tag?.id || null,
        tagName: r.tagName,
      },
    });
    upserted++;
  }

  const schedule = await prisma.taggingSchedule.findUnique({ where: { userId } });
  const effectiveMode = schedule?.mode || (mode === "incremental" ? "incremental" : "backfill");
  const promoteToIncremental =
    effectiveMode === "backfill" && (normalizedStatus === "ok" || normalizedStatus === "noop");

  const runSummary = JSON.stringify({
    mode: effectiveMode,
    processed,
    tagged,
    skipped,
    failed,
    errors: Array.isArray(errors) ? errors : [],
  });

  const updateData: any = {
    lastRunAt: new Date(),
    lastRunStatus: normalizedStatus,
    lastRunSummary: runSummary,
    errorMessage: normalizedStatus === "error" && Array.isArray(errors) ? errors.join("; ") : null,
  };

  if (newCheckpoint) {
    updateData.lastCheckpoint = newCheckpoint;
  }

  if (promoteToIncremental) {
    updateData.mode = "incremental";
  }

  await prisma.taggingSchedule.upsert({
    where: { userId },
    update: updateData,
    create: {
      userId,
      enabled: false,
      mode: promoteToIncremental ? "incremental" : effectiveMode,
      ...(newCheckpoint ? { lastCheckpoint: newCheckpoint } : {}),
      lastRunAt: new Date(),
      lastRunStatus: normalizedStatus,
      lastRunSummary: runSummary,
      errorMessage: normalizedStatus === "error" && Array.isArray(errors) ? errors.join("; ") : null,
    },
  });

  return {
    data: {
      upserted,
      modeBeforeRun: effectiveMode,
      modeAfterRun: promoteToIncremental ? "incremental" : effectiveMode,
      promotedToIncremental: promoteToIncremental,
      status: normalizedStatus,
    },
    statusCode: 200 as const,
  };
}

router.post("/tagging/results", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const handled = await handleTaggingResults(userId, req.body);
    if ("error" in handled) {
      res.status(handled.statusCode).json({ ok: false, error: handled.error });
      return;
    }

    console.log(
      `[GmailProxy] POST /tagging/results userId=${userId} status=${handled.data.status} upserted=${handled.data.upserted} promoted=${handled.data.promotedToIncremental}`
    );
    res.json({ ok: true, data: handled.data });
  } catch (err: any) {
    console.error(`[GmailProxy] POST /tagging/results error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /tagging/sync — Alias for /tagging/results ─────────
// Some skill versions may call /tagging/sync instead of /tagging/results.
// This handler delegates to the same logic.

router.post("/tagging/sync", async (req: AuthRequest, res: Response) => {
  if (!rateLimitGuard(req, res)) return;
  const userId = req.user!.userId;

  try {
    const handled = await handleTaggingResults(userId, req.body);
    if ("error" in handled) {
      res.status(handled.statusCode).json({ ok: false, error: handled.error });
      return;
    }

    console.log(
      `[GmailProxy] POST /tagging/sync userId=${userId} status=${handled.data.status} upserted=${handled.data.upserted} promoted=${handled.data.promotedToIncremental}`
    );
    res.json({ ok: true, data: handled.data });
  } catch (err: any) {
    console.error(`[GmailProxy] POST /tagging/sync error userId=${userId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
