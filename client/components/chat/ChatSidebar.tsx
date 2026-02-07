"use client";

import { useEffect } from "react";
import { ChatSession } from "@/lib/hooks/useChat";
import { Plus, MessageSquare, RotateCcw, ChevronLeft } from "lucide-react";

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSessionKey: string;
  onSwitchSession: (key: string) => void;
  onLoadSessions: () => Promise<void>;
  onResetSession: () => Promise<void>;
  onClose?: () => void;
}

export function ChatSidebar({
  sessions,
  currentSessionKey,
  onSwitchSession,
  onLoadSessions,
  onResetSession,
  onClose,
}: ChatSidebarProps) {
  // Load sessions on mount
  useEffect(() => {
    onLoadSessions();
  }, [onLoadSessions]);

  return (
    <div className="flex flex-col h-full bg-hud-bg-primary/50 border-r border-hud-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hud-border">
        <h3 className="text-sm font-semibold text-hud-text">Sessions</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={onResetSession}
            className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-accent hover:bg-hud-accent/10 transition-colors"
            title="Reset current session"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => onSwitchSession("agent:main:main")}
            className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-accent hover:bg-hud-accent/10 transition-colors"
            title="New chat"
          >
            <Plus size={14} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-text hover:bg-white/5 transition-colors lg:hidden"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5 scrollbar-thin">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-hud-text-muted">No sessions yet</p>
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.key === currentSessionKey;
            return (
              <button
                key={session.key}
                onClick={() => onSwitchSession(session.key)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors ${
                  isActive
                    ? "bg-hud-accent/10 border-r-2 border-hud-accent text-hud-text"
                    : "text-hud-text-muted hover:bg-white/5 hover:text-hud-text-secondary"
                }`}
              >
                <MessageSquare
                  size={14}
                  className={isActive ? "text-hud-accent" : ""}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {session.label || session.key}
                  </p>
                  {session.messageCount !== undefined && (
                    <p className="text-[10px] text-hud-text-muted mt-0.5">
                      {session.messageCount} messages
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
