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
export async function retagAllEmails(userId: string, messages: EmailMessage[], onProgress?: (count: number) => void): Promise<number> {
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

  // Build tag reference with descriptions/criteria for the AI
  const tagReference = tags.map((t) => {
    let entry = `- "${t.name}"`;
    if (t.criteria) entry += `: ${t.criteria}`;
    else if (t.description) entry += `: ${t.description}`;
    return entry;
  }).join("\n");

  const systemPrompt = `You are an expert email classifier. Your job is to analyze emails and assign each one to the single most appropriate tag based on the sender, subject, and content.

Rules:
- You MUST return ONLY valid JSON with no markdown, no code fences, no explanation.
- The JSON format is: { "summary": "<one concise sentence describing the email>", "tag": "<exact tag name>" }
- Choose the tag whose criteria best matches the email. Consider the sender's identity/domain, the subject line, and the email content.
- If no tag is a clear match, use "Miscellaneous".
- The tag name must exactly match one of the available tags (case-insensitive matching is OK).

Available tags:
${tagReference}`;

  let processed = 0;
  for (const email of recent) {
    try {
      const prompt = `From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Content: ${email.snippet}`;

      const result = await automationExec(userId, prompt, { skipRateLimit: true, systemPrompt });

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

      // Upsert: update existing record in-place, or create new — tags stay visible during retagging
      await prisma.processedEmail.upsert({
        where: { userId_emailId: { userId, emailId: email.id } },
        update: {
          summary,
          tagId: matchedTag?.id || null,
          tagName: matchedTag?.name || tagName,
          processedAt: new Date(),
        },
        create: {
          userId,
          emailId: email.id,
          provider: email.provider,
          summary,
          tagId: matchedTag?.id || null,
          tagName: matchedTag?.name || tagName,
        },
      });
      processed++;
      onProgress?.(processed);
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

  // Build tag reference with descriptions/criteria
  const tagRef = tags.map((t) => {
    let entry = `- "${t.name}"`;
    if (t.criteria) entry += `: ${t.criteria}`;
    else if (t.description) entry += `: ${t.description}`;
    return entry;
  }).join("\n");

  const sysPrompt = `You are an expert email classifier. Analyze each email and assign it to the single most appropriate tag based on the sender, subject, and content.

Rules:
- Return ONLY valid JSON: { "summary": "<one sentence>", "tag": "<exact tag name>" }
- No markdown, no code fences, no explanation.
- Consider the sender's identity/domain, subject line, and content.
- If no tag clearly fits, use "Miscellaneous".

Available tags:
${tagRef}`;

  for (const email of batch) {
    try {
      const prompt = `From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Content: ${email.snippet}`;

      const result = await automationExec(userId, prompt, { systemPrompt: sysPrompt });

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
