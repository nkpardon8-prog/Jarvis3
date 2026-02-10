"use client";

import { useCallback, useRef, useState, useEffect } from "react";

export interface EverydayChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

interface SendEverydayMessagePayload {
  provider?: string;
  model?: string;
  message: string;
  thinkingLevel?: string;
  deepResearch?: boolean;
  incognito?: boolean;
  endpoint?: string;
}

export function useEverydayAIChat() {
  const [messages, setMessages] = useState<EverydayChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<EverydayChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendMessage = useCallback(async (payload: SendEverydayMessagePayload) => {
    if (!payload.message.trim()) return;
    setError(null);
    const userMessage: EverydayChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: payload.message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setAwaitingResponse(true);
    setIsStreaming(true);
    setStreamingText("");

    const controller = new AbortController();
    abortRef.current = controller;
    let currentText = "";

    try {
      const endpoint = payload.endpoint || "/everyday-ai/chat";
      const history = [...messagesRef.current, userMessage];
      const body =
        endpoint === "/everyday-ai/chat"
          ? {
              provider: payload.provider,
              model: payload.model,
              messages: history.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              thinkingLevel: payload.thinkingLevel,
              deepResearch: payload.deepResearch,
              stream: true,
              incognito: payload.incognito,
            }
          : { message: payload.message };

      const res = await fetch(`/api${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Request failed");
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const json = await res.json();
        const reply = json?.data?.message || "";
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: reply,
            timestamp: new Date().toISOString(),
          },
        ]);
        setStreamingText("");
        setIsStreaming(false);
        setAwaitingResponse(false);
        return;
      }

      let doneReceived = false;
      await consumeSse(res, (data) => {
        if (data.type === "token") {
          currentText += data.text;
          setStreamingText(currentText);
        } else if (data.type === "done") {
          doneReceived = true;
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: currentText || "",
              timestamp: new Date().toISOString(),
            },
          ]);
          setStreamingText("");
          setIsStreaming(false);
          setAwaitingResponse(false);
        } else if (data.type === "error") {
          setError(data.error || "Streaming error");
          setStreamingText("");
          setIsStreaming(false);
          setAwaitingResponse(false);
        }
      });

      if (!doneReceived) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: currentText || "",
            timestamp: new Date().toISOString(),
          },
        ]);
        setStreamingText("");
        setIsStreaming(false);
        setAwaitingResponse(false);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError("Request aborted");
      } else {
        setError(err?.message || "Failed to send message");
      }
      setStreamingText("");
      setIsStreaming(false);
      setAwaitingResponse(false);
    }
  }, []);

  const abortMessage = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendResearchMessage = useCallback(
    async (payload: SendEverydayMessagePayload) => {
      return sendMessage({ ...payload, endpoint: payload.endpoint || "/everyday-ai/active-research" });
    },
    [sendMessage]
  );

  return {
    messages,
    streamingText,
    isStreaming,
    awaitingResponse,
    error,
    sendMessage,
    sendResearchMessage,
    abortMessage,
  };
}

async function consumeSse(res: Response, onData: (data: any) => void): Promise<void> {
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
          const payload = line.replace(/^data:\s*/, "").trim();
          if (!payload) continue;
          try {
            onData(JSON.parse(payload));
          } catch {
            // ignore parse errors
          }
        }
      }
      idx = buffer.indexOf("\n\n");
    }
  }
}
