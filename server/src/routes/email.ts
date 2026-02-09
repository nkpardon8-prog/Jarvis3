import { Router, Response } from "express";
import { google } from "googleapis";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";
import { getTokensForProvider, getGoogleApiClient } from "../services/oauth.service";
import { processNewEmails } from "../services/email-intelligence.service";

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
    const maxResults = Math.min(parseInt(String(req.query.max || "20"), 10), 50);

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

    // Fire-and-forget: trigger email intelligence pipeline
    processNewEmails(userId, sliced).catch((err) =>
      console.error("[Email] Intelligence pipeline error:", err.message)
    );

    // Optionally include processed email data
    const withProcessed = req.query.withProcessed === "true";
    let processed: Record<string, { summary: string | null; tagName: string | null; tagId: string | null }> = {};

    if (withProcessed) {
      const emailIds = sliced.map((m) => m.id);
      const records = await prisma.processedEmail.findMany({
        where: { userId, emailId: { in: emailIds } },
      });
      for (const r of records) {
        processed[r.emailId] = {
          summary: r.summary,
          tagName: r.tagName,
          tagId: r.tagId,
        };
      }
    }

    res.json({
      ok: true,
      data: {
        connected: true,
        providers: {
          google: !!googleTokens,
          microsoft: !!msTokens,
        },
        messages: sliced,
        ...(withProcessed ? { processed } : {}),
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

// ─── Processed email data ────────────────────────────────────

router.get("/processed", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const emailIds = req.query.ids
      ? String(req.query.ids).split(",").filter(Boolean)
      : [];

    if (emailIds.length === 0) {
      res.json({ ok: true, data: { processed: {} } });
      return;
    }

    const records = await prisma.processedEmail.findMany({
      where: { userId, emailId: { in: emailIds } },
    });

    const processed: Record<string, { summary: string | null; tagName: string | null; tagId: string | null }> = {};
    for (const r of records) {
      processed[r.emailId] = {
        summary: r.summary,
        tagName: r.tagName,
        tagId: r.tagId,
      };
    }

    res.json({ ok: true, data: { processed } });
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

      // Extract body — handle multipart
      let body = "";
      const extractBody = (part: any): string => {
        if (part.body?.data) {
          return Buffer.from(part.body.data, "base64url").toString("utf-8");
        }
        if (part.parts) {
          // Prefer text/plain, fallback to text/html
          const textPart = part.parts.find((p: any) => p.mimeType === "text/plain");
          const htmlPart = part.parts.find((p: any) => p.mimeType === "text/html");
          const target = textPart || htmlPart;
          if (target) return extractBody(target);
          // Recurse into nested multipart
          for (const p of part.parts) {
            const result = extractBody(p);
            if (result) return result;
          }
        }
        return "";
      };
      body = extractBody(detail.data.payload || {});

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

// ─── Contact search (sent + received) ───────────────────────

router.get("/search-contacts", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const query = String(req.query.q || "").trim();

    if (!query) {
      res.json({ ok: true, data: { contacts: [] } });
      return;
    }

    const googleTokens = await getTokensForProvider(userId, "google");
    const contacts: { name: string; email: string; lastDate: string; count: number }[] = [];

    if (googleTokens) {
      const oauth2Client = await getGoogleApiClient(userId);
      if (oauth2Client) {
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        const searchRes = await gmail.users.messages.list({
          userId: "me",
          maxResults: 20,
          q: `from:${query} OR to:${query}`,
        });

        const contactMap = new Map<string, { name: string; email: string; lastDate: string; count: number }>();
        for (const msg of searchRes.data.messages || []) {
          try {
            const detail = await gmail.users.messages.get({
              userId: "me",
              id: msg.id!,
              format: "metadata",
              metadataHeaders: ["From", "To", "Date"],
            });
            const headers = detail.data.payload?.headers || [];
            const from = headers.find((h) => h.name === "From")?.value || "";
            const to = headers.find((h) => h.name === "To")?.value || "";
            const date = headers.find((h) => h.name === "Date")?.value || "";

            // Extract email addresses
            const parseAddr = (s: string) => {
              const match = s.match(/<([^>]+)>/);
              const email = match ? match[1] : s.trim();
              const name = match ? s.replace(/<[^>]+>/, "").trim() : "";
              return { name: name.replace(/"/g, ""), email: email.toLowerCase() };
            };

            for (const addr of [from, ...(to ? to.split(",") : [])]) {
              if (!addr.trim()) continue;
              const parsed = parseAddr(addr.trim());
              if (!parsed.email.toLowerCase().includes(query.toLowerCase())) continue;
              const existing = contactMap.get(parsed.email);
              if (existing) {
                existing.count++;
                if (date && new Date(date) > new Date(existing.lastDate)) {
                  existing.lastDate = new Date(date).toISOString();
                }
              } else {
                contactMap.set(parsed.email, {
                  name: parsed.name || parsed.email,
                  email: parsed.email,
                  lastDate: date ? new Date(date).toISOString() : new Date().toISOString(),
                  count: 1,
                });
              }
            }
          } catch {}
        }

        contacts.push(...Array.from(contactMap.values()));
      }
    }

    // Sort by interaction count descending
    contacts.sort((a, b) => b.count - a.count);

    res.json({ ok: true, data: { contacts: contacts.slice(0, 10) } });
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
