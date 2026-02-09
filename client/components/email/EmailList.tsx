"use client";

import { Circle, CheckCircle2 } from "lucide-react";

interface ProcessedData {
  summary: string | null;
  tagName: string | null;
  tagId: string | null;
}

interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  read: boolean;
  provider: "google" | "microsoft";
}

interface EmailListProps {
  messages: EmailMessage[];
  processed: Record<string, ProcessedData>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filterTag: string | null;
  showUnreadOnly: boolean;
  tags: any[];
}

export function EmailList({
  messages,
  processed,
  selectedId,
  onSelect,
  filterTag,
  showUnreadOnly,
  tags,
}: EmailListProps) {
  // Apply filters
  let filtered = messages;
  if (showUnreadOnly) {
    filtered = filtered.filter((m) => !m.read);
  }
  if (filterTag) {
    filtered = filtered.filter((m) => {
      const p = processed[m.id];
      return p?.tagName?.toLowerCase() === filterTag.toLowerCase();
    });
  }

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-hud-text-muted text-xs py-12">
        {messages.length === 0 ? "No messages in your inbox." : "No emails match filters."}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 overflow-y-auto max-h-[calc(100vh-260px)]">
      {filtered.map((msg) => {
        const p = processed[msg.id];
        const isSelected = selectedId === msg.id;
        const tag = p?.tagName ? tags.find((t: any) => t.name === p.tagName) : null;

        return (
          <button
            key={msg.id}
            onClick={() => onSelect(msg.id)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors border ${
              isSelected
                ? "bg-hud-accent/10 border-hud-accent/30"
                : msg.read
                  ? "border-transparent hover:bg-white/3"
                  : "border-hud-accent/10 bg-hud-accent/5 hover:bg-hud-accent/8"
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-1">
                {msg.read ? (
                  <CheckCircle2 size={11} className="text-hud-text-muted/40" />
                ) : (
                  <Circle size={11} className="text-hud-accent" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={`text-xs truncate flex-1 ${msg.read ? "text-hud-text-secondary" : "text-hud-text font-medium"}`}>
                    {extractName(msg.from)}
                  </p>
                  <span className="text-[9px] text-hud-text-muted shrink-0">
                    {formatRelativeDate(msg.date)}
                  </span>
                </div>
                <p className={`text-[11px] truncate ${msg.read ? "text-hud-text-muted" : "text-hud-text-secondary"}`}>
                  {msg.subject}
                </p>
                {p?.summary ? (
                  <p className="text-[10px] text-hud-text-muted/70 truncate mt-0.5">
                    {p.summary}
                  </p>
                ) : (
                  <p className="text-[10px] text-hud-text-muted/50 truncate mt-0.5">
                    {msg.snippet}
                  </p>
                )}
                {tag && (
                  <span
                    className="inline-block text-[9px] px-1.5 py-0.5 rounded mt-1"
                    style={{
                      backgroundColor: `${tag.color || "#00d4ff"}15`,
                      color: tag.color || "#00d4ff",
                    }}
                  >
                    {p.tagName}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function extractName(from: string): string {
  // "John Doe <john@example.com>" → "John Doe"
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim().replace(/"/g, "");
  return from.split("@")[0] || from;
}

function formatRelativeDate(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
