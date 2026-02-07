"use client";

import { ChatMessage as ChatMessageType } from "@/lib/hooks/useChat";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { User, Bot } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  // Safety: ensure content is always a string
  const content = typeof message.content === "string" ? message.content : String(message.content ?? "");

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group`}>
      <div className={`flex items-start gap-3 max-w-[80%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isUser
              ? "bg-hud-amber/20 border border-hud-amber/30"
              : "bg-hud-accent/20 border border-hud-accent/30"
          }`}
        >
          {isUser ? (
            <User size={16} className="text-hud-amber" />
          ) : (
            <Bot size={16} className="text-hud-accent" />
          )}
        </div>

        {/* Message bubble */}
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? "rounded-br-sm bg-hud-amber/10 border border-hud-amber/20"
              : "rounded-bl-sm bg-[#0d1a2a] border border-hud-border/50"
          }`}
        >
          <div
            className={`text-sm ${
              isUser ? "text-hud-text" : "text-hud-text-secondary"
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{content}</p>
            ) : (
              <MarkdownRenderer content={content} />
            )}
          </div>

          {/* Timestamp */}
          <div
            className={`mt-1 text-[10px] text-hud-text-muted opacity-0 group-hover:opacity-100 transition-opacity ${
              isUser ? "text-right" : "text-left"
            }`}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
