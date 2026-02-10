"use client";

import { useEffect, useRef, useCallback } from "react";
import { ChatMessage as ChatMessageType } from "@/lib/hooks/useChat";
import type { ActionContext } from "@/lib/skill-prompts";
import { ChatMessage } from "./ChatMessage";
import { ChatTokenStream } from "./ChatTokenStream";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { MessageSquare } from "lucide-react";

interface ChatMessagesProps {
  messages: ChatMessageType[];
  streamingText: string;
  isStreaming: boolean;
  awaitingResponse: boolean;
  actionContext?: ActionContext | null;
}

export function ChatMessages({
  messages,
  streamingText,
  isStreaming,
  awaitingResponse,
  actionContext,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollThrottleRef = useRef(false);

  // Auto-scroll to bottom on new messages (not throttled)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, awaitingResponse]);

  // Throttled scroll during streaming — max once per 300ms, use instant scroll
  useEffect(() => {
    if (!isStreaming || !streamingText) return;
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = true;
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "auto" });
    }
    setTimeout(() => { scrollThrottleRef.current = false; }, 300);
  }, [streamingText, isStreaming]);

  if (messages.length === 0 && !awaitingResponse && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-hud-accent/10 border border-hud-accent/20 flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={28} className="text-hud-accent/50" />
          </div>
          <h3 className="text-lg font-medium text-hud-text mb-2">
            Start a conversation
          </h3>
          <p className="text-sm text-hud-text-muted max-w-sm">
            Send a message to your AI agent. It can help with tasks, answer
            questions, and much more.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin"
    >
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}

      {awaitingResponse && !isStreaming && <ThinkingIndicator actionContext={actionContext} />}

      {isStreaming && streamingText && <ChatTokenStream text={streamingText} />}

      <div ref={scrollRef} />
    </div>
  );
}
