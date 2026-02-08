import { Router, Response } from "express";
import { google } from "googleapis";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";
import { getTokensForProvider, getGoogleApiClient } from "../services/oauth.service";

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

    res.json({
      ok: true,
      data: {
        connected: true,
        providers: {
          google: !!googleTokens,
          microsoft: !!msTokens,
        },
        messages: messages.slice(0, maxResults),
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
