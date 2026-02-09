"use client";

import { useState, useRef, useEffect } from "react";
import { Circle, CheckCircle2, Tag, X } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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
  selectedId: string | null;
  onSelect: (id: string) => void;
  showUnreadOnly: boolean;
  filterTag: string | null;
  tags: any[];
  emailTags: Record<string, { tagId: string; tagName: string | null }>;
  onTagEmail: (emailId: string, provider: string, tagId: string | null, tagName: string | null) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
}

export function EmailList({
  messages,
  selectedId,
  onSelect,
  showUnreadOnly,
  filterTag,
  tags,
  emailTags,
  onTagEmail,
  onLoadMore,
  loadingMore,
  hasMore,
}: EmailListProps) {
  const [tagMenuId, setTagMenuId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver to trigger loadMore when sentinel is visible
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  // Apply filters
  let filtered = messages;
  if (showUnreadOnly) {
    filtered = filtered.filter((m) => !m.read);
  }
  if (filterTag) {
    filtered = filtered.filter((m) => emailTags[m.id]?.tagId === filterTag);
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
        const isSelected = selectedId === msg.id;
        const emailTag = emailTags[msg.id];
        const tagInfo = emailTag ? tags.find((t: any) => t.id === emailTag.tagId) : null;

        return (
          <div key={msg.id} className="relative">
            <button
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
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[10px] text-hud-text-muted/50 truncate flex-1">
                      {msg.snippet}
                    </p>
                    {/* Tag badge or tag button */}
                    {tagInfo ? (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: `${tagInfo.color || "#00d4ff"}15`,
                          color: tagInfo.color || "#00d4ff",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTagMenuId(tagMenuId === msg.id ? null : msg.id);
                        }}
                      >
                        {tagInfo.name}
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTagMenuId(tagMenuId === msg.id ? null : msg.id);
                        }}
                        className="shrink-0 p-0.5 text-hud-text-muted/30 hover:text-hud-accent transition-colors"
                        title="Add tag"
                      >
                        <Tag size={10} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </button>

            {/* Tag assignment dropdown */}
            {tagMenuId === msg.id && (
              <div className="absolute right-2 top-full z-50 mt-0.5 bg-hud-bg border border-hud-border rounded-lg shadow-xl overflow-hidden min-w-[120px]">
                {tags.map((tag: any) => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      onTagEmail(msg.id, msg.provider, tag.id, tag.name);
                      setTagMenuId(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hud-accent/10 transition-colors flex items-center gap-2"
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color || "#00d4ff" }}
                    />
                    <span className="text-[10px] text-hud-text">{tag.name}</span>
                  </button>
                ))}
                {emailTag && (
                  <button
                    onClick={() => {
                      onTagEmail(msg.id, msg.provider, null, null);
                      setTagMenuId(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hud-error/10 transition-colors flex items-center gap-2 border-t border-hud-border"
                  >
                    <X size={10} className="text-hud-error" />
                    <span className="text-[10px] text-hud-error">Remove tag</span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Scroll sentinel — triggers loading more when visible */}
      <div ref={sentinelRef} className="flex items-center justify-center py-3">
        {loadingMore && <LoadingSpinner size="sm" />}
        {!hasMore && filtered.length > 20 && (
          <span className="text-[9px] text-hud-text-muted">End of inbox</span>
        )}
      </div>
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
