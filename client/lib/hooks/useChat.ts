"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSocket } from "@/lib/hooks/useSocket";
import { api } from "@/lib/api";

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
  sessions: ChatSession[];
  currentSessionKey: string;
  sendMessage: (message: string) => void;
  abortMessage: () => void;
  switchSession: (sessionKey: string) => void;
  resetSession: () => Promise<void>;
  loadSessions: () => Promise<void>;
  error: string | null;
}

// Extract plain text from OpenClaw message content which can be:
// - a plain string
// - an array of {type: "text", text: "..."} / {type: "thinking", ...} objects
// - an object with {type, text} keys
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

export function useChat(): UseChatReturn {
  const { socket, connected } = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionKey, setCurrentSessionKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const streamingRef = useRef("");
  const initializedRef = useRef(false);

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

  // Load history when session key changes
  useEffect(() => {
    if (!currentSessionKey) return;

    const loadHistory = async () => {
      try {
        const res = await api.get<{ messages?: ChatMessage[] }>(
          `/chat/history/${encodeURIComponent(currentSessionKey)}?limit=100`
        );
        if (res.ok && res.data) {
          const historyMessages = res.data.messages || (Array.isArray(res.data) ? res.data : []);
          // Normalize the messages from gateway format, filtering out tool calls/results
          const normalized: ChatMessage[] = [];
          for (let i = 0; i < historyMessages.length; i++) {
            const msg = historyMessages[i];
            const role = msg.role;
            // Skip tool calls and tool results — they're internal
            if (role === "toolResult" || role === "tool") continue;
            // For assistant messages, skip if it's only tool_use blocks with no text
            const text = extractTextContent(msg.content);
            if (!text.trim()) continue;
            const displayRole = role === "user" ? "user" : role === "system" ? "system" : "assistant";
            normalized.push({
              id: msg.id || `hist-${i}`,
              role: displayRole,
              content: text,
              timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
              sessionKey: currentSessionKey,
            });
          }
          setMessages(normalized);
        }
      } catch {
        // History might not be available for new sessions
        setMessages([]);
      }
    };
    loadHistory();
  }, [currentSessionKey]);

  // Subscribe to socket events
  useEffect(() => {
    if (!socket) return;

    const handleToken = (payload: any) => {
      // Delta events from OpenClaw contain the full accumulated text so far
      // (not incremental tokens), so we replace rather than append
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
      if (payload?.status === "thinking") {
        setIsThinking(true);
        setIsStreaming(false);
        streamingRef.current = "";
        setStreamingText("");
      } else if (payload?.status === "idle") {
        setIsThinking(false);
        setIsStreaming(false);
      }
    };

    const handleMessage = (payload: any) => {
      // Complete message received — finalize streaming
      const extracted = extractTextContent(payload?.content) || payload?.text || "";
      const content = extracted || streamingRef.current || "";
      if (content) {
        const assistantMsg: ChatMessage = {
          id: payload?.id || `msg-${Date.now()}`,
          role: "assistant",
          content,
          timestamp: payload?.timestamp || new Date().toISOString(),
          sessionKey: currentSessionKey,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }

      // Clear streaming state
      streamingRef.current = "";
      setStreamingText("");
      setIsStreaming(false);
      setIsThinking(false);
    };

    const handleSessionState = (payload: any) => {
      // Session state updates (e.g., title changes)
      console.log("[Chat] Session state update:", payload);
    };

    const handleError = (payload: any) => {
      setError(payload?.error || "An error occurred");
      setIsThinking(false);
      setIsStreaming(false);
      streamingRef.current = "";
      setStreamingText("");

      // Clear error after 5s
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
  }, [socket, currentSessionKey]);

  const sendMessage = useCallback(
    (message: string) => {
      if (!socket || !connected || !currentSessionKey || !message.trim()) return;

      // Add user message to the list immediately
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: message.trim(),
        timestamp: new Date().toISOString(),
        sessionKey: currentSessionKey,
      };
      setMessages((prev) => [...prev, userMsg]);
      setError(null);

      // Reset streaming state
      streamingRef.current = "";
      setStreamingText("");
      setIsThinking(true);

      // Emit to server
      socket.emit("chat:send", {
        sessionKey: currentSessionKey,
        message: message.trim(),
      });
    },
    [socket, connected, currentSessionKey]
  );

  const abortMessage = useCallback(() => {
    if (!socket || !currentSessionKey) return;

    socket.emit("chat:abort", { sessionKey: currentSessionKey });

    // If there was partial streaming text, save it as a partial message
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

    streamingRef.current = "";
    setStreamingText("");
    setIsThinking(false);
    setIsStreaming(false);
  }, [socket, currentSessionKey]);

  const switchSession = useCallback((sessionKey: string) => {
    setCurrentSessionKey(sessionKey);
    setMessages([]);
    streamingRef.current = "";
    setStreamingText("");
    setIsThinking(false);
    setIsStreaming(false);
    setError(null);
  }, []);

  const resetSession = useCallback(async () => {
    if (!currentSessionKey) return;
    try {
      await api.post(`/chat/sessions/${encodeURIComponent(currentSessionKey)}/reset`);
      setMessages([]);
      streamingRef.current = "";
      setStreamingText("");
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
