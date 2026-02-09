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
    const maxResults = Math.min(parseInt(String(req.query.max || "50"), 10), 100);

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
          maxResults
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
          maxResults
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

router.post("/auto-tag", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Fetch current inbox messages (reuse existing fetch logic)
    const googleTokens = await getTokensForProvider(userId, "google");
    const msTokens = await getTokensForProvider(userId, "microsoft");

    if (!googleTokens && !msTokens) {
      res.status(400).json({ ok: false, error: "No email provider connected." });
      return;
    }

    const messages: EmailMessage[] = [];

    if (googleTokens) {
      try {
        const gmailMessages = await fetchGmailMessages(userId, googleTokens.accessToken, 50);
        messages.push(...gmailMessages);
      } catch (err: any) {
        console.error("[AutoTag] Gmail fetch error:", err.message);
      }
    }

    if (msTokens) {
      try {
        const outlookMessages = await fetchOutlookMessages(msTokens.accessToken, 50);
        messages.push(...outlookMessages);
      } catch (err: any) {
        console.error("[AutoTag] Outlook fetch error:", err.message);
      }
    }

    if (messages.length === 0) {
      res.json({ ok: true, data: { processed: 0, message: "No messages to tag." } });
      return;
    }

    const processed = await retagAllEmails(userId, messages);
    res.json({ ok: true, data: { processed, total: messages.length } });
  } catch (err: any) {
    if (err instanceof AutomationNotConfiguredError) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
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

// ─── Contact search (fast, from People API + recent emails) ──

// In-memory per-user contact cache from recent inbox (avoids repeated Gmail API calls)
const contactCache = new Map<string, { contacts: { name: string; email: string }[]; expires: number }>();

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

    // Build or use cached contact list from recent inbox messages
    const cached = contactCache.get(userId);
    let allContacts: { name: string; email: string }[];

    if (cached && cached.expires > Date.now()) {
      allContacts = cached.contacts;
    } else {
      allContacts = [];
      const oauth2Client = await getGoogleApiClient(userId);
      if (oauth2Client) {
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        // Fetch recent 50 messages (metadata only — fast batch)
        const listRes = await gmail.users.messages.list({
          userId: "me",
          maxResults: 50,
          q: "in:inbox OR in:sent",
        });

        const seen = new Set<string>();
        const msgs = listRes.data.messages || [];

        // Fetch metadata in parallel (batches of 10)
        for (let i = 0; i < msgs.length; i += 10) {
          const batch = msgs.slice(i, i + 10);
          const results = await Promise.allSettled(
            batch.map((m) =>
              gmail.users.messages.get({
                userId: "me",
                id: m.id!,
                format: "metadata",
                metadataHeaders: ["From", "To"],
              })
            )
          );
          for (const r of results) {
            if (r.status !== "fulfilled") continue;
            const headers = r.value.data.payload?.headers || [];
            const from = headers.find((h) => h.name === "From")?.value || "";
            const to = headers.find((h) => h.name === "To")?.value || "";

            for (const addr of [from, ...(to ? to.split(",") : [])]) {
              if (!addr.trim()) continue;
              const match = addr.match(/<([^>]+)>/);
              const email = (match ? match[1] : addr.trim()).toLowerCase();
              if (seen.has(email)) continue;
              seen.add(email);
              const name = match ? addr.replace(/<[^>]+>/, "").trim().replace(/"/g, "") : "";
              allContacts.push({ name: name || email, email });
            }
          }
        }

        // Cache for 5 minutes
        contactCache.set(userId, { contacts: allContacts, expires: Date.now() + 5 * 60 * 1000 });
      }
    }

    // Filter by query
    const matches = allContacts
      .filter((c) => c.email.includes(query) || c.name.toLowerCase().includes(query))
      .slice(0, 10);

    res.json({ ok: true, data: { contacts: matches } });
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
  maxResults: number
): Promise<EmailMessage[]> {
  const oauth2Client = await getGoogleApiClient(userId);
  if (!oauth2Client) {
    throw new Error("Google API client not available");
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // List message IDs from inbox
  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    labelIds: ["INBOX"],
  });

  const messageIds = listRes.data.messages || [];
  if (messageIds.length === 0) return [];

  // Batch fetch message metadata
  const messages: EmailMessage[] = [];
  for (const msg of messageIds) {
    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(No subject)";
      const from = headers.find((h) => h.name === "From")?.value || "";
      const date = headers.find((h) => h.name === "Date")?.value || "";
      const read = !(detail.data.labelIds || []).includes("UNREAD");

      messages.push({
        id: msg.id!,
        subject,
        from,
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        snippet: detail.data.snippet || "",
        read,
        provider: "google",
      });
    } catch {}
  }

  return messages;
}

async function fetchOutlookMessages(
  accessToken: string,
  maxResults: number
): Promise<EmailMessage[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
  url.searchParams.set("$top", String(maxResults));
  url.searchParams.set("$orderby", "receivedDateTime desc");
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
