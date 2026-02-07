"use client";

import { useState, useCallback, useRef, useEffect, KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onAbort: () => void;
  isProcessing: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onAbort, isProcessing, disabled }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [message]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (!message.trim() || isProcessing || disabled) return;
    onSend(message);
    setMessage("");
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [message, isProcessing, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="border-t border-hud-border bg-hud-bg-primary/80 backdrop-blur-sm p-4">
      <div className="flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (⌘+Enter to send)"
            disabled={disabled}
            rows={1}
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-xl px-4 py-3 text-sm text-hud-text placeholder:text-hud-text-muted/50 resize-none focus:outline-none focus:border-hud-accent/50 focus:ring-1 focus:ring-hud-accent/20 transition-colors disabled:opacity-50"
          />
        </div>

        {isProcessing ? (
          <button
            onClick={onAbort}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-hud-error/20 border border-hud-error/30 flex items-center justify-center text-hud-error hover:bg-hud-error/30 transition-colors"
            title="Stop generating"
          >
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!message.trim() || disabled}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-hud-accent/20 border border-hud-accent/30 flex items-center justify-center text-hud-accent hover:bg-hud-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Send message (⌘+Enter)"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
