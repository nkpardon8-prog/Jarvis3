import { Router, Response } from "express";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import {
  EVERYDAY_PROVIDERS,
  EverydayProviderId,
  getProviderKey,
  isEverydayProvider,
} from "../services/provider-keys.service";
import { readMemory, appendMemory, summarizeForMemory, writeMemory } from "../services/memory.service";
import { ensureActiveResearchSkill, buildActiveResearchSystemPrompt } from "../services/active-research.service";
import { gateway } from "../gateway/connection";

const router = Router();

router.use(authMiddleware);

const PROVIDER_MODELS: Record<EverydayProviderId, { id: string; name: string }[]> = {
  openai: [
    { id: "gpt-4.1", name: "GPT-4.1" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "o4-mini", name: "O4 Mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
  ],
  google: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  ],
  openrouter: [
    { id: "openai/gpt-4.1", name: "GPT-4.1 (OpenRouter)" },
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (OpenRouter)" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (OpenRouter)" },
  ],
  xai: [
    { id: "grok-3", name: "Grok 3" },
    { id: "grok-3-mini", name: "Grok 3 Mini" },
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large" },
    { id: "mistral-medium-latest", name: "Mistral Medium" },
    { id: "codestral-latest", name: "Codestral" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B" },
  ],
};

router.get("/models", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const providers = [];
    for (const provider of EVERYDAY_PROVIDERS) {
      const key = await getProviderKey(userId, provider.id);
      if (key) {
        providers.push({
          id: provider.id,
          name: provider.name,
          models: PROVIDER_MODELS[provider.id],
        });
      }
    }

    res.json({ ok: true, data: { providers } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/chat", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const { provider, model, messages, thinkingLevel, deepResearch, stream, incognito } = req.body;
    if (!provider || !model || !Array.isArray(messages)) {
      res.status(400).json({ ok: false, error: "provider, model, messages are required" });
      return;
    }
    if (!isEverydayProvider(provider)) {
      res.status(400).json({ ok: false, error: `Unsupported provider: ${provider}` });
      return;
    }

    const apiKey = await getProviderKey(userId, provider);
    if (!apiKey) {
      res.status(400).json({ ok: false, error: `No API key stored for ${provider}` });
      return;
    }

    const memory = await readMemory(userId);
    const systemNotes: string[] = [];
    if (memory.trim()) {
      systemNotes.push(`User memory (markdown):\n${memory.trim()}`);
    }
    if (thinkingLevel) {
      systemNotes.push(`Reasoning depth: ${thinkingLevel}. Think step-by-step internally; respond concisely.`);
    }
    if (deepResearch) {
      systemNotes.push("Use deeper analysis and be thorough; include assumptions when needed.");
    }
    const systemMessage = systemNotes.join("\n\n");

    const normalizedMessages = messages
      .filter((m: any) => m && typeof m.role === "string" && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content }));
    if (!normalizedMessages.length) {
      res.status(400).json({ ok: false, error: "messages must contain at least one message" });
      return;
    }

    const params = mapThinkingParams(thinkingLevel, deepResearch);

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let fullText = "";
      const sendEvent = (data: unknown) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        await streamProviderChat({
          provider,
          apiKey,
          model,
          messages: normalizedMessages,
          systemMessage,
          params,
          onToken: (token) => {
            fullText += token;
            sendEvent({ type: "token", text: token });
          },
        });
        sendEvent({ type: "done" });
        res.end();
        if (!incognito) {
          const bullets = summarizeForMemory(fullText);
          await appendMemory(userId, bullets);
        }
      } catch (err: any) {
        sendEvent({ type: "error", error: err.message || "Streaming error" });
        res.end();
      }
      return;
    }

    const text = await callProviderChat({
      provider,
      apiKey,
      model,
      messages: normalizedMessages,
      systemMessage,
      params,
    });
    if (!incognito) {
      const bullets = summarizeForMemory(text);
      await appendMemory(userId, bullets);
    }
    res.json({ ok: true, data: { message: text } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/memory/clear", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    await writeMemory(userId, "");
    res.json({ ok: true, data: { cleared: true } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/active-research", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const { message } = req.body || {};
    if (!message || typeof message !== "string") {
      res.status(400).json({ ok: false, error: "message is required" });
      return;
    }

    await ensureActiveResearchSkill(userId);

    const sessionKey = `agent:research:${userId}`;
    const systemPrompt = buildActiveResearchSystemPrompt();

    async function runOnce(extraInstruction?: string): Promise<string> {
      const requestId = randomUUID();
      const prompt = `${systemPrompt}` +
        `\n\nRequest ID: ${requestId}` +
        (extraInstruction ? `\n\n${extraInstruction}` : "") +
        `\n\nUser request:\n${message}`;

      const result = (await gateway.send(
        "chat.send",
        {
          sessionKey,
          message: prompt,
          deliver: true,
          thinking: "low",
          idempotencyKey: `active-research-${requestId}`,
        },
        120000
      )) as any;

      // Poll history and return the assistant message that follows the user
      // message containing our Request ID marker (robust across clock skew).
      for (let attempt = 0; attempt < 30; attempt++) {
        const historyPayload = (await gateway.send("chat.history", { sessionKey, limit: 120 })) as any;
        const messages = normalizeGatewayHistory(historyPayload);

        let userIdx: number | undefined;
        for (let i = messages.length - 1; i >= 0; i--) {
          const m: any = messages[i];
          if (m?.role !== "user") continue;
          const t = extractTextContent(m?.content || "");
          if (t.includes(`Request ID: ${requestId}`)) {
            userIdx = i;
            break;
          }
        }

        if (userIdx !== undefined) {
          const after = messages.slice(userIdx + 1);
          const assistantMsg = after.find((m: any) => m?.role === "assistant");
          const text = extractTextContent(assistantMsg?.content || "");
          if (text && text.trim()) return text;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      // Fallback: return empty string and let caller decide whether to retry.
      return "";
    }

    let content = await runOnce();

    // Retry once if we got an empty/whitespace response (race or history ordering).
    if (!content || !content.trim()) {
      content = await runOnce(
        "Retry: your previous response may not have been captured. Answer again with citations-first."
      );
    }

    // If the agent returned the citations-first failure sentinel, retry once with a stronger directive.
    if (content?.trim().toLowerCase().includes("no reliable sources found")) {
      content = await runOnce(
        "Retry: you must use web_fetch (and if needed browser) to retrieve at least 1-2 sources before answering. Do not return 'No reliable sources found' unless the tools truly fail."
      );
    }

    res.json({ ok: true, data: { sessionKey, message: content } });
  } catch (err: any) {
    try {
      const { promises: fs } = await import("fs");
      const details =
        `[${new Date().toISOString()}] /everyday-ai/active-research\n` +
        (err?.stack || err?.message || String(err)) +
        "\n\n";
      await fs.appendFile("/tmp/jarvis3-active-research-errors.log", details, "utf8");
    } catch {}

    console.error("[everyday-ai/active-research] error", err);
    res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

export default router;

function mapThinkingParams(thinkingLevel?: string, deepResearch?: boolean) {
  const level = (deepResearch ? "high" : thinkingLevel || "low") as "low" | "medium" | "high";
  const temperature = level === "high" ? 0.3 : level === "medium" ? 0.5 : 0.7;
  const maxTokens = deepResearch ? 1600 : level === "high" ? 1200 : 800;
  return { temperature, maxTokens };
}

function buildSystemMessages(systemMessage: string | null | undefined, messages: { role: string; content: string }[]) {
  const combined: { role: string; content: string }[] = [];
  if (systemMessage) {
    combined.push({ role: "system", content: systemMessage });
  }
  combined.push(...messages);
  return combined;
}

async function callProviderChat(args: {
  provider: EverydayProviderId;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  systemMessage?: string;
  params: { temperature: number; maxTokens: number };
}): Promise<string> {
  switch (args.provider) {
    case "openai":
      return callOpenAICompatible({
        baseUrl: "https://api.openai.com/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
      });
    case "openrouter":
      return callOpenAICompatible({
        baseUrl: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
      });
    case "xai":
      return callOpenAICompatible({
        baseUrl: "https://api.x.ai/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
      });
    case "mistral":
      return callOpenAICompatible({
        baseUrl: "https://api.mistral.ai/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
      });
    case "groq":
      return callOpenAICompatible({
        baseUrl: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
      });
    case "anthropic":
      return callAnthropic({
        apiKey: args.apiKey,
        model: args.model,
        messages: args.messages,
        systemMessage: args.systemMessage,
        params: args.params,
      });
    case "google":
      return callGoogle({
        apiKey: args.apiKey,
        model: args.model,
        messages: args.messages,
        systemMessage: args.systemMessage,
        params: args.params,
      });
    default:
      throw new Error(`Unsupported provider: ${args.provider}`);
  }
}

async function streamProviderChat(args: {
  provider: EverydayProviderId;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  systemMessage?: string;
  params: { temperature: number; maxTokens: number };
  onToken: (token: string) => void;
}): Promise<void> {
  switch (args.provider) {
    case "openai":
      return streamOpenAICompatible({
        baseUrl: "https://api.openai.com/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
        onToken: args.onToken,
      });
    case "openrouter":
      return streamOpenAICompatible({
        baseUrl: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
        onToken: args.onToken,
      });
    case "xai":
      return streamOpenAICompatible({
        baseUrl: "https://api.x.ai/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
        onToken: args.onToken,
      });
    case "mistral":
      return streamOpenAICompatible({
        baseUrl: "https://api.mistral.ai/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
        onToken: args.onToken,
      });
    case "groq":
      return streamOpenAICompatible({
        baseUrl: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: args.apiKey,
        model: args.model,
        messages: buildSystemMessages(args.systemMessage, args.messages),
        params: args.params,
        onToken: args.onToken,
      });
    case "anthropic":
      return streamAnthropic({
        apiKey: args.apiKey,
        model: args.model,
        messages: args.messages,
        systemMessage: args.systemMessage,
        params: args.params,
        onToken: args.onToken,
      });
    case "google":
      // Google streaming varies by endpoint; fallback to single chunk
      const text = await callGoogle({
        apiKey: args.apiKey,
        model: args.model,
        messages: args.messages,
        systemMessage: args.systemMessage,
        params: args.params,
      });
      if (text) args.onToken(text);
      return;
    default:
      throw new Error(`Unsupported provider: ${args.provider}`);
  }
}

async function callOpenAICompatible(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  params: { temperature: number; maxTokens: number };
}): Promise<string> {
  const res = await fetch(args.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.params.temperature,
      max_tokens: args.params.maxTokens,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Provider error ${res.status}: ${text}`);
  }
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function streamOpenAICompatible(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  params: { temperature: number; maxTokens: number };
  onToken: (token: string) => void;
}): Promise<void> {
  const res = await fetch(args.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.params.temperature,
      max_tokens: args.params.maxTokens,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`Provider error ${res.status}: ${text}`);
  }
  await consumeSse(res, (data) => {
    if (data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) args.onToken(delta);
    } catch {
      // ignore parse errors
    }
  });
}

async function callAnthropic(args: {
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  systemMessage?: string;
  params: { temperature: number; maxTokens: number };
}): Promise<string> {
  const body: any = {
    model: args.model,
    messages: args.messages.filter((m) => m.role !== "system"),
    max_tokens: args.params.maxTokens,
    temperature: args.params.temperature,
  };
  if (args.systemMessage) body.system = args.systemMessage;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${text}`);
  }
  const data: any = await res.json();
  return data.content?.map((c: any) => c.text).join("") || "";
}

async function streamAnthropic(args: {
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  systemMessage?: string;
  params: { temperature: number; maxTokens: number };
  onToken: (token: string) => void;
}): Promise<void> {
  const body: any = {
    model: args.model,
    messages: args.messages.filter((m) => m.role !== "system"),
    max_tokens: args.params.maxTokens,
    temperature: args.params.temperature,
    stream: true,
  };
  if (args.systemMessage) body.system = args.systemMessage;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${text}`);
  }

  await consumeSse(res, (data) => {
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.delta?.text || parsed.content_block?.text;
      if (delta) args.onToken(delta);
    } catch {
      // ignore
    }
  });
}

async function callGoogle(args: {
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  systemMessage?: string;
  params: { temperature: number; maxTokens: number };
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${args.apiKey}`;
  const contents = args.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const body: any = {
    contents,
    generationConfig: {
      temperature: args.params.temperature,
      maxOutputTokens: args.params.maxTokens,
    },
  };
  if (args.systemMessage) {
    body.systemInstruction = { parts: [{ text: args.systemMessage }] };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google error ${res.status}: ${text}`);
  }
  const data: any = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function consumeSse(
  res: any,
  onData: (data: string) => void
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data:")) {
          onData(line.replace(/^data:\s*/, "").trim());
        }
      }
      idx = buffer.indexOf("\n\n");
    }
  }
}

function normalizeGatewayHistory(payload: any): any[] {
  // Gateway methods sometimes return different shapes depending on server version.
  // Accept: {messages: [...]}, {data:{messages:[...]}}, or directly an array.
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.messages)) return payload.messages;
    if (payload.data && Array.isArray(payload.data.messages)) return payload.data.messages;
  }
  return [];
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => {
        if (!block || typeof block !== "object") return false;
        if (typeof block.text === "string") return true;
        if (typeof block.value === "string") return true;
        return false;
      })
      .map((block: any) => block.text || block.value || "")
      .join("\n");
  }
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.value === "string") return obj.value;
    if (typeof obj.delta === "string") return obj.delta;
  }
  return "";
}
