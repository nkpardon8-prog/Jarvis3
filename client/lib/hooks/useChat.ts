"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSocket } from "@/lib/hooks/useSocket";
import { api } from "@/lib/api";
import { consumeAutoPrompt } from "@/lib/skill-prompts";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  sessionKey?: string;
}

export interface ChatSession {
  key: string;
  agentId?: string;
  model?: string;
  messageCount?: number;
  lastActivity?: string;
  label?: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  streamingText: string;
  isThinking: boolean;
  isStreaming: boolean;
  awaitingResponse: boolean;
  sessions: ChatSession[];
  currentSessionKey: string;
  sendMessage: (message: string) => void;
  abortMessage: () => void;
  switchSession: (sessionKey: string) => void;
  resetSession: () => Promise<void>;
  loadSessions: () => Promise<void>;
  error: string | null;
}

/** Polling intervals */
const FAST_POLL_MS = 500;
const IDLE_POLL_MS = 15000;

/**
 * Extract plain text from OpenClaw message content which can be:
 * - a plain string
 * - an array of {type: "text", text: "..."} / {type: "thinking", ...} objects
 * - an object with {type, text} keys
 */
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block?.type === "text" && typeof block?.text === "string")
      .map((block: any) => block.text)
      .join("\n");
  }
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
  }
  return "";
}

/** Normalize raw gateway history messages into display-ready ChatMessage[] */
function normalizeHistory(raw: any[], sessionKey: string): ChatMessage[] {
  const normalized: ChatMessage[] = [];
  for (let i = 0; i < raw.length; i++) {
    const msg = raw[i];
    const role = msg.role;
    if (role === "toolResult" || role === "tool") continue;
    const text = extractTextContent(msg.content);
    if (!text.trim()) continue;
    const displayRole = role === "user" ? "user" : role === "system" ? "system" : "assistant";
    normalized.push({
      id: msg.id || `hist-${i}`,
      role: displayRole,
      content: text,
      timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
      sessionKey,
    });
  }
  return normalized;
}

export function useChat(): UseChatReturn {
  const { socket, connected } = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionKey, setCurrentSessionKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const streamingRef = useRef("");
  const initializedRef = useRef(false);

  // Refs for access inside interval/callback closures
  const awaitingResponseRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownIdsRef = useRef(new Set<string>());
  const sessionKeyRef = useRef("");

  // Keep refs in sync with state
  useEffect(() => { sessionKeyRef.current = currentSessionKey; }, [currentSessionKey]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  /** Helper: mark response as received (clears awaiting + streaming state) */
  const markResponseReceived = useCallback(() => {
    awaitingResponseRef.current = false;
    setAwaitingResponse(false);
    setIsThinking(false);
    setIsStreaming(false);
    streamingRef.current = "";
    setStreamingText("");
  }, []);

  /** Fetch history and reconcile against local state */
  const pollHistory = useCallback(async () => {
    const sessionKey = sessionKeyRef.current;
    if (!sessionKey) return;

    try {
      const res = await api.get<any>(
        `/chat/history/${encodeURIComponent(sessionKey)}?limit=100`
      );
      if (!res.ok || !res.data) return;

      const raw = res.data.messages || (Array.isArray(res.data) ? res.data : []);
      const normalized = normalizeHistory(raw, sessionKey);

      // Count assistant messages in local vs history
      const localAssistantCount = messagesRef.current.filter((m) => m.role === "assistant").length;
      const historyAssistantCount = normalized.filter((m) => m.role === "assistant").length;

      if (historyAssistantCount > localAssistantCount) {
        // History has assistant message(s) we don't have — reconcile by replacing
        console.log(
          `[Chat] Poll reconcile: history has ${historyAssistantCount} assistant msgs, local has ${localAssistantCount}`
        );

        // Rebuild known IDs from history
        knownIdsRef.current.clear();
        for (const msg of normalized) {
          if (msg.id) knownIdsRef.current.add(msg.id);
        }

        setMessages(normalized);

        if (awaitingResponseRef.current) {
          console.log("[Chat] Assistant reply detected via poll — clearing awaiting");
          markResponseReceived();
        }
      }
    } catch {
      // Poll failure is non-critical
    }
  }, [markResponseReceived]);

  /** Start polling at fast (in-flight) or idle rate */
  const startPolling = useCallback(
    (fast: boolean) => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
      const interval = fast ? FAST_POLL_MS : IDLE_POLL_MS;
      pollTimerRef.current = setInterval(pollHistory, interval);
    },
    [pollHistory]
  );

  /** Stop all polling */
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Load default session key on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initSession = async () => {
      try {
        const res = await api.get<{ sessionKey: string; agentId: string }>("/chat/default-session");
        if (res.ok && res.data) {
          setCurrentSessionKey(res.data.sessionKey);
        }
      } catch {
        setCurrentSessionKey("agent:main:main");
      }
    };
    initSession();
  }, []);

  // Load history when session changes, then start idle polling
  useEffect(() => {
    if (!currentSessionKey) return;

    knownIdsRef.current.clear();
    awaitingResponseRef.current = false;
    setAwaitingResponse(false);

    const loadHistory = async () => {
      try {
        const res = await api.get<{ messages?: ChatMessage[] }>(
          `/chat/history/${encodeURIComponent(currentSessionKey)}?limit=100`
        );
        if (res.ok && res.data) {
          const raw = res.data.messages || (Array.isArray(res.data) ? res.data : []);
          const normalized = normalizeHistory(raw, currentSessionKey);
          for (const msg of normalized) {
            if (msg.id) knownIdsRef.current.add(msg.id);
          }
          setMessages(normalized);
        }
      } catch {
        setMessages([]);
      }

      startPolling(false);
    };
    loadHistory();

    return () => stopPolling();
  }, [currentSessionKey, startPolling, stopPolling]);

  // Subscribe to socket events
  useEffect(() => {
    if (!socket) return;

    const handleToken = (payload: any) => {
      if (payload?.sessionKey && payload.sessionKey !== sessionKeyRef.current) return;

      const rawToken = payload?.token || payload?.text || payload?.content || "";
      const token = typeof rawToken === "string" ? rawToken : extractTextContent(rawToken);
      if (token) {
        streamingRef.current = token;
        setStreamingText(token);
        setIsStreaming(true);
        setIsThinking(false);
      }
    };

    const handleStatus = (payload: any) => {
      if (payload?.sessionKey && payload.sessionKey !== sessionKeyRef.current) return;

      if (payload?.status === "thinking") {
        setIsThinking(true);
        setIsStreaming(false);
        streamingRef.current = "";
        setStreamingText("");
      } else if (payload?.status === "idle") {
        setIsThinking(false);
        setIsStreaming(false);
        // Do NOT clear awaitingResponse here — wait for actual message arrival.
        // But trigger immediate poll to check for the response.
        if (awaitingResponseRef.current) {
          console.log("[Chat] Idle status while awaiting — immediate poll");
          pollHistory();
        }
      }
    };

    const handleMessage = (payload: any) => {
      if (payload?.sessionKey && payload.sessionKey !== sessionKeyRef.current) return;

      const extracted = extractTextContent(payload?.content) || payload?.text || "";
      const content = extracted || streamingRef.current || "";
      if (content) {
        const id = payload?.id || `msg-${Date.now()}`;

        // ID-based dedup: skip if already known
        if (knownIdsRef.current.has(id)) {
          console.log(`[Chat] Socket message deduped by ID: ${id}`);
        } else {
          // Cross-path dedup: check if last message has same content (poll delivered first)
          const last = messagesRef.current[messagesRef.current.length - 1];
          if (last?.role === "assistant" && last.content === content) {
            console.log("[Chat] Socket message deduped by content (poll delivered first)");
          } else {
            knownIdsRef.current.add(id);
            const assistantMsg: ChatMessage = {
              id,
              role: "assistant",
              content,
              timestamp: payload?.timestamp || new Date().toISOString(),
              sessionKey: sessionKeyRef.current,
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
        }
      }

      markResponseReceived();
      startPolling(false);
    };

    const handleSessionState = (payload: any) => {
      console.log("[Chat] Session state update:", payload);
    };

    const handleError = (payload: any) => {
      setError(payload?.error || "An error occurred");
      markResponseReceived();
      startPolling(false);
      setTimeout(() => setError(null), 5000);
    };

    socket.on("chat:token", handleToken);
    socket.on("chat:status", handleStatus);
    socket.on("chat:message", handleMessage);
    socket.on("chat:session-state", handleSessionState);
    socket.on("chat:error", handleError);

    return () => {
      socket.off("chat:token", handleToken);
      socket.off("chat:status", handleStatus);
      socket.off("chat:message", handleMessage);
      socket.off("chat:session-state", handleSessionState);
      socket.off("chat:error", handleError);
    };
  }, [socket, pollHistory, startPolling, markResponseReceived]);

  // Auto-prompt
  const autoPromptHandled = useRef(false);
  useEffect(() => {
    if (autoPromptHandled.current) return;
    if (!socket || !connected || !currentSessionKey) return;

    const prompt = consumeAutoPrompt();
    if (!prompt) {
      autoPromptHandled.current = true;
      return;
    }

    autoPromptHandled.current = true;

    const doAutoSend = async () => {
      try {
        await api.post(`/chat/sessions/${encodeURIComponent(currentSessionKey)}/reset`);
        setMessages([]);
        knownIdsRef.current.clear();
        streamingRef.current = "";
        setStreamingText("");
      } catch {
        // Reset failure is non-fatal
      }

      setTimeout(() => {
        const userMsg: ChatMessage = {
          id: `user-${Date.now()}`,
          role: "user",
          content: prompt.trim(),
          timestamp: new Date().toISOString(),
          sessionKey: currentSessionKey,
        };
        setMessages((prev) => [...prev, userMsg]);
        setError(null);
        streamingRef.current = "";
        setStreamingText("");
        setIsThinking(true);

        awaitingResponseRef.current = true;
        setAwaitingResponse(true);
        startPolling(true);

        socket.emit("chat:send", {
          sessionKey: currentSessionKey,
          message: prompt.trim(),
        });
      }, 300);
    };

    doAutoSend();
  }, [socket, connected, currentSessionKey, startPolling]);

  const sendMessage = useCallback(
    (message: string) => {
      if (!socket || !connected || !currentSessionKey || !message.trim()) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: message.trim(),
        timestamp: new Date().toISOString(),
        sessionKey: currentSessionKey,
      };
      setMessages((prev) => [...prev, userMsg]);
      setError(null);

      streamingRef.current = "";
      setStreamingText("");
      setIsThinking(true);

      awaitingResponseRef.current = true;
      setAwaitingResponse(true);
      startPolling(true);
      console.log("[Chat] Message sent, awaiting response");

      socket.emit("chat:send", {
        sessionKey: currentSessionKey,
        message: message.trim(),
      });
    },
    [socket, connected, currentSessionKey, startPolling]
  );

  const abortMessage = useCallback(() => {
    if (!socket || !currentSessionKey) return;

    socket.emit("chat:abort", { sessionKey: currentSessionKey });

    if (streamingRef.current) {
      const partialMsg: ChatMessage = {
        id: `partial-${Date.now()}`,
        role: "assistant",
        content: streamingRef.current + "\n\n*[Response aborted]*",
        timestamp: new Date().toISOString(),
        sessionKey: currentSessionKey,
      };
      setMessages((prev) => [...prev, partialMsg]);
    }

    markResponseReceived();
    startPolling(false);
  }, [socket, currentSessionKey, startPolling, markResponseReceived]);

  const switchSession = useCallback(
    (sessionKey: string) => {
      setCurrentSessionKey(sessionKey);
      setMessages([]);
      knownIdsRef.current.clear();
      streamingRef.current = "";
      setStreamingText("");
      setIsThinking(false);
      setIsStreaming(false);
      awaitingResponseRef.current = false;
      setAwaitingResponse(false);
      setError(null);
      stopPolling();
    },
    [stopPolling]
  );

  const resetSession = useCallback(async () => {
    if (!currentSessionKey) return;
    try {
      await api.post(`/chat/sessions/${encodeURIComponent(currentSessionKey)}/reset`);
      setMessages([]);
      knownIdsRef.current.clear();
      streamingRef.current = "";
      setStreamingText("");
      awaitingResponseRef.current = false;
      setAwaitingResponse(false);
    } catch {
      setError("Failed to reset session");
    }
  }, [currentSessionKey]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await api.get<any>("/chat/sessions");
      if (res.ok && res.data) {
        const sessionList = res.data.sessions || res.data || [];
        const mapped: ChatSession[] = Array.isArray(sessionList)
          ? sessionList.map((s: any) => ({
              key: s.key || s.sessionKey || s.id,
              agentId: s.agentId,
              model: s.model,
              messageCount: s.messageCount || s.messages,
              lastActivity: s.lastActivity || s.updatedAt,
              label: s.label || s.name || s.key,
            }))
          : [];
        setSessions(mapped);
      }
    } catch {
      console.error("[Chat] Failed to load sessions");
    }
  }, []);

  return {
    messages,
    streamingText,
    isThinking,
    isStreaming,
    awaitingResponse,
    sessions,
    currentSessionKey,
    sendMessage,
    abortMessage,
    switchSession,
    resetSession,
    loadSessions,
    error,
  };
}
