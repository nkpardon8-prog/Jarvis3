import { prisma } from "./prisma";
import { decrypt } from "./crypto.service";

export class AutomationNotConfiguredError extends Error {
  constructor() {
    super("Automation AI is not configured. Set up a provider in Connections → Automation AI.");
    this.name = "AutomationNotConfiguredError";
  }
}

export class AutomationRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationRateLimitError";
  }
}

// ─── Per-user rate limiter (sliding window) ──────────────────
// Limits are read from the user's AutomationSettings (adjustable in UI).
// Defaults: 20/min, 200/hour.

const userRequestLog = new Map<string, number[]>();

function checkRateLimit(perMin: number, perHour: number, userId: string): void {
  const now = Date.now();
  let log = userRequestLog.get(userId);

  if (!log) {
    log = [];
    userRequestLog.set(userId, log);
  }

  // Prune entries older than 1 hour
  const hourAgo = now - 60 * 60 * 1000;
  while (log.length > 0 && log[0] < hourAgo) log.shift();

  // Check hourly limit
  if (log.length >= perHour) {
    throw new AutomationRateLimitError(
      `Rate limit exceeded: ${perHour} requests per hour. Try again later.`
    );
  }

  // Check per-minute limit
  const minuteAgo = now - 60 * 1000;
  const recentCount = log.filter((t) => t >= minuteAgo).length;
  if (recentCount >= perMin) {
    throw new AutomationRateLimitError(
      `Rate limit exceeded: ${perMin} requests per minute. Wait a moment and try again.`
    );
  }

  log.push(now);
}

/**
 * Execute an AI prompt using the user's dedicated automation model.
 * Direct HTTP calls to provider APIs — does NOT use the OpenClaw gateway.
 */
export async function automationExec(userId: string, prompt: string, opts?: { skipRateLimit?: boolean; systemPrompt?: string }): Promise<string> {
  const settings = await prisma.automationSettings.findUnique({ where: { userId } });
  if (!settings) throw new AutomationNotConfiguredError();

  if (!opts?.skipRateLimit) {
    checkRateLimit(settings.rateLimitPerMin, settings.rateLimitPerHour, userId);
  }

  const apiKey = decrypt(settings.apiKey);
  const { provider, modelId } = settings;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    let result: unknown;
    switch (provider) {
      case "openai":
        result = await callOpenAI(apiKey, modelId, prompt, controller.signal, opts?.systemPrompt);
        break;
      case "anthropic":
        result = await callAnthropic(apiKey, modelId, prompt, controller.signal, opts?.systemPrompt);
        break;
      case "google":
        result = await callGoogle(apiKey, modelId, prompt, controller.signal, opts?.systemPrompt);
        break;
      default:
        throw new Error(`Unsupported automation provider: ${provider}`);
    }
    // Ensure we always return a string
    if (typeof result === "string") return result;
    if (result && typeof result === "object") return JSON.stringify(result);
    return String(result ?? "");
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAI(apiKey: string, model: string, prompt: string, signal: AbortSignal, systemPrompt?: string): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1024,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic(apiKey: string, model: string, prompt: string, signal: AbortSignal, systemPrompt?: string): Promise<string> {
  const body: any = {
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1024,
  };
  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  return data.content?.[0]?.text || "";
}

async function callGoogle(apiKey: string, model: string, prompt: string, signal: AbortSignal, systemPrompt?: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google AI API error ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}
