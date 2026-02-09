import { Router, Response } from "express";
import { google } from "googleapis";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";
import { getTokensForProvider, getGoogleApiClient } from "../services/oauth.service";
import { retagAllEmails } from "../services/email-intelligence.service";
import { AutomationNotConfiguredError } from "../services/automation.service";

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

// ─── Auto-tag all emails ────────────────────────────────────────

// In-memory auto-tag job status per user
interface AutoTagJob { status: "running" | "done" | "error"; processed: number; total: number; error?: string }
const autoTagJobs = new Map<string, AutoTagJob>();

router.post("/auto-tag", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    // If already running, reject
    const existing = autoTagJobs.get(userId);
    if (existing?.status === "running") {
      res.json({ ok: true, data: { status: "running", processed: existing.processed, total: existing.total } });
      return;
    }

    // Validate upfront before going async
    const googleTokens = await getTokensForProvider(userId, "google");
    const msTokens = await getTokensForProvider(userId, "microsoft");

    if (!googleTokens && !msTokens) {
      res.status(400).json({ ok: false, error: "No email provider connected." });
      return;
    }

    // Initialize job and respond immediately
    autoTagJobs.set(userId, { status: "running", processed: 0, total: 0 });
    res.json({ ok: true, data: { status: "running", processed: 0, total: 0 } });

    // Run in background — not awaited
    (async () => {
      try {
        const messages: EmailMessage[] = [];
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setMonth(thirtyDaysAgo.getMonth() - 1);

        if (googleTokens) {
          try {
            const gmailMessages = await fetchGmailMessages(userId, googleTokens.accessToken, 200, thirtyDaysAgo, now);
            messages.push(...gmailMessages);
          } catch (err: any) {
            console.error("[AutoTag] Gmail fetch error:", err.message);
          }
        }

        if (msTokens) {
          try {
            const outlookMessages = await fetchOutlookMessages(msTokens.accessToken, 200, thirtyDaysAgo, now);
            messages.push(...outlookMessages);
          } catch (err: any) {
            console.error("[AutoTag] Outlook fetch error:", err.message);
          }
        }

        const job = autoTagJobs.get(userId)!;
        job.total = messages.length;

        if (messages.length === 0) {
          job.status = "done";
          return;
        }

        const processed = await retagAllEmails(userId, messages, (count) => {
          job.processed = count;
        });
        job.processed = processed;
        job.status = "done";
      } catch (err: any) {
        const job = autoTagJobs.get(userId);
        if (job) {
          job.status = "error";
          job.error = err.message;
        }
        console.error("[AutoTag] Background job error:", err.message);
      }
    })();
  } catch (err: any) {
    if (err instanceof AutomationNotConfiguredError) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Auto-tag job status (poll) ──────────────────────────────
router.get("/auto-tag/status", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const job = autoTagJobs.get(userId);
  if (!job) {
    res.json({ ok: true, data: { status: "idle" } });
    return;
  }
  res.json({ ok: true, data: job });
  // Clean up finished jobs after client reads them
  if (job.status === "done" || job.status === "error") {
    autoTagJobs.delete(userId);
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
