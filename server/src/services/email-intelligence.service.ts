import { prisma } from "./prisma";
import { automationExec, AutomationNotConfiguredError } from "./automation.service";

interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  read: boolean;
  provider: "google" | "microsoft";
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 10;

/**
 * Process new emails: generate summaries and assign tags.
 * Fire-and-forget — errors are logged, not thrown.
 * Idempotent via @@unique([userId, emailId]).
 */
/**
 * Re-tag all emails: clears existing ProcessedEmail records and re-processes
 * all recent messages with the current tag set. No batch limit.
 * Returns the number of emails processed.
 */
export async function retagAllEmails(userId: string, messages: EmailMessage[]): Promise<number> {
  // Clear all existing tag assignments for this user
  await prisma.processedEmail.deleteMany({ where: { userId } });

  // Filter to 30-day window
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const recent = messages.filter((m) => new Date(m.date).getTime() > cutoff);

  if (recent.length === 0) return 0;

  // Fetch user's tags
  const tags = await prisma.emailTag.findMany({ where: { userId } });
  const tagNames = tags.map((t) => t.name);

  // Ensure "Miscellaneous" exists
  if (!tagNames.includes("Miscellaneous")) {
    const miscTag = await prisma.emailTag.upsert({
      where: { userId_name: { userId, name: "Miscellaneous" } },
      update: {},
      create: {
        userId,
        name: "Miscellaneous",
        color: "#94a3b8",
        isSystem: true,
        sortingIntent: "misc-other",
      },
    });
    tags.push(miscTag);
    tagNames.push("Miscellaneous");
  }

  let processed = 0;
  for (const email of recent) {
    try {
      const prompt = `Analyze this email and return ONLY valid JSON (no markdown, no code fences): { "summary": "<one concise sentence>", "tag": "<best matching tag name>" }
Available tags: ${tagNames.join(", ")}
If no tag fits well, use "Miscellaneous".

From: ${email.from}
Subject: ${email.subject}
Snippet: ${email.snippet}`;

      const result = await automationExec(userId, prompt);

      let parsed: { summary?: string; tag?: string };
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        parsed = {};
      }

      const summary = parsed.summary || null;
      const tagName = parsed.tag || "Miscellaneous";
      const matchedTag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());

      await prisma.processedEmail.create({
        data: {
          userId,
          emailId: email.id,
          provider: email.provider,
          summary,
          tagId: matchedTag?.id || null,
          tagName: matchedTag?.name || tagName,
        },
      });
      processed++;
    } catch (err: any) {
      if (err instanceof AutomationNotConfiguredError) {
        throw err; // Propagate so the endpoint can return a useful error
      }
      console.error(`[EmailIntelligence] Failed to process email ${email.id}:`, err.message);
    }
  }

  return processed;
}

export async function processNewEmails(userId: string, messages: EmailMessage[]): Promise<void> {
  // Filter to 30-day window
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const recent = messages.filter((m) => new Date(m.date).getTime() > cutoff);

  if (recent.length === 0) return;

  // Check which emails are already processed
  const emailIds = recent.map((m) => m.id);
  const existing = await prisma.processedEmail.findMany({
    where: { userId, emailId: { in: emailIds } },
    select: { emailId: true },
  });
  const existingSet = new Set(existing.map((e) => e.emailId));

  const unprocessed = recent.filter((m) => !existingSet.has(m.id));
  if (unprocessed.length === 0) return;

  // Take batch limit
  const batch = unprocessed.slice(0, BATCH_LIMIT);

  // Fetch user's tags
  const tags = await prisma.emailTag.findMany({ where: { userId } });
  const tagNames = tags.map((t) => t.name);

  // Ensure "Miscellaneous" exists
  if (!tagNames.includes("Miscellaneous")) {
    const miscTag = await prisma.emailTag.upsert({
      where: { userId_name: { userId, name: "Miscellaneous" } },
      update: {},
      create: {
        userId,
        name: "Miscellaneous",
        color: "#94a3b8",
        isSystem: true,
        sortingIntent: "misc-other",
      },
    });
    tags.push(miscTag);
    tagNames.push("Miscellaneous");
  }

  for (const email of batch) {
    try {
      const prompt = `Analyze this email and return ONLY valid JSON (no markdown, no code fences): { "summary": "<one concise sentence>", "tag": "<best matching tag name>" }
Available tags: ${tagNames.join(", ")}
If no tag fits well, use "Miscellaneous".

From: ${email.from}
Subject: ${email.subject}
Snippet: ${email.snippet}`;

      const result = await automationExec(userId, prompt);

      // Parse JSON from response (handle potential markdown fences)
      let parsed: { summary?: string; tag?: string };
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        parsed = {};
      }

      const summary = parsed.summary || null;
      const tagName = parsed.tag || "Miscellaneous";
      const matchedTag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());

      await prisma.processedEmail.create({
        data: {
          userId,
          emailId: email.id,
          provider: email.provider,
          summary,
          tagId: matchedTag?.id || null,
          tagName: matchedTag?.name || tagName,
        },
      });
    } catch (err: any) {
      if (err instanceof AutomationNotConfiguredError) {
        // Graceful degradation — no automation configured, skip silently
        return;
      }
      console.error(`[EmailIntelligence] Failed to process email ${email.id}:`, err.message);
    }
  }
}
