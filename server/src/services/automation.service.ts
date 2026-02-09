import { prisma } from "./prisma";
import { decrypt } from "./crypto.service";

export class AutomationNotConfiguredError extends Error {
  constructor() {
    super("Automation AI is not configured. Set up a provider in Connections → Automation AI.");
    this.name = "AutomationNotConfiguredError";
  }
}

/**
 * Execute an AI prompt using the user's dedicated automation model.
 * Direct HTTP calls to provider APIs — does NOT use the OpenClaw gateway.
 */
export async function automationExec(userId: string, prompt: string): Promise<string> {
  const settings = await prisma.automationSettings.findUnique({ where: { userId } });
  if (!settings) throw new AutomationNotConfiguredError();

  const apiKey = decrypt(settings.apiKey);
  const { provider, modelId } = settings;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    switch (provider) {
      case "openai":
        return await callOpenAI(apiKey, modelId, prompt, controller.signal);
      case "anthropic":
        return await callAnthropic(apiKey, modelId, prompt, controller.signal);
      case "google":
        return await callGoogle(apiKey, modelId, prompt, controller.signal);
      default:
        throw new Error(`Unsupported automation provider: ${provider}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAI(apiKey: string, model: string, prompt: string, signal: AbortSignal): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
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

async function callAnthropic(apiKey: string, model: string, prompt: string, signal: AbortSignal): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  return data.content?.[0]?.text || "";
}

async function callGoogle(apiKey: string, model: string, prompt: string, signal: AbortSignal): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google AI API error ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}
