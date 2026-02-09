"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmailList } from "./EmailList";
import { EmailDetail } from "./EmailDetail";
import { ComposePane } from "./ComposePane";
import { TagManager } from "./TagManager";
import {
  Mail,
  Eye,
  Plus,
} from "lucide-react";

interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  read: boolean;
  provider: "google" | "microsoft";
}

// Load schedule: 1 month initially, then 2 months per subsequent load
const LOAD_SCHEDULE = [1, 2, 2, 2, 2, 2]; // months per chunk

export function EmailPage() {
  const queryClient = useQueryClient();
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [composeToEmail, setComposeToEmail] = useState<string | undefined>();
  const [composeSubject, setComposeSubject] = useState<string | undefined>();
  const tagManagerRef = useRef<HTMLDivElement>(null);

  // Progressive loading state
  const [extraMessages, setExtraMessages] = useState<EmailMessage[]>([]);
  const [chunkIndex, setChunkIndex] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextBefore, setNextBefore] = useState<string | null>(null);

  const { data: statusData } = useQuery({
    queryKey: ["email-status"],
    queryFn: async () => {
      const res = await api.get<any>("/email/status");
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const res = await api.get<any>("/email/settings");
      if (!res.ok) throw new Error(res.error || "Failed to load settings");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Initial load: first month — uses cache from DashboardShell prefetch
  const { data: inboxData, isLoading: inboxLoading } = useQuery({
    queryKey: ["email-inbox-chunk-0"],
    queryFn: async () => {
      const res = await api.get<any>("/email/inbox?months=1");
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: !!statusData?.connected,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  // Derive initial messages from query data (works with cache + fresh fetches)
  const initialMessages: EmailMessage[] = inboxData?.messages || [];

  // Set nextBefore cursor when initial data loads
  useEffect(() => {
    if (inboxData?.dateRange?.after && !nextBefore) {
      setNextBefore(inboxData.dateRange.after);
    }
    if (inboxData?.messages?.length === 0) {
      setHasMore(false);
    }
  }, [inboxData, nextBefore]);

  // Combine initial + extra messages (from load-more)
  const allMessages = (() => {
    if (extraMessages.length === 0) return initialMessages;
    const existingIds = new Set(initialMessages.map((m) => m.id));
    const unique = extraMessages.filter((m) => !existingIds.has(m.id));
    return [...initialMessages, ...unique];
  })();

  // Load more handler — called when user scrolls to bottom
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !nextBefore) return;
    if (chunkIndex >= LOAD_SCHEDULE.length) {
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    try {
      const months = LOAD_SCHEDULE[chunkIndex];
      const res = await api.get<any>(
        `/email/inbox?months=${months}&before=${encodeURIComponent(nextBefore)}`
      );
      if (!res.ok) throw new Error(res.error);

      const newMsgs: EmailMessage[] = res.data.messages || [];

      if (newMsgs.length === 0) {
        setHasMore(false);
      } else {
        setExtraMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const unique = newMsgs.filter((m) => !existingIds.has(m.id));
          return [...prev, ...unique];
        });
        if (res.data.dateRange?.after) {
          setNextBefore(res.data.dateRange.after);
        }
        setChunkIndex((i) => i + 1);
      }
    } catch (err) {
      console.error("[Email] Load more error:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, nextBefore, chunkIndex]);

  // Fetch tag assignments for current emails
  const emailIds = allMessages.map((m) => m.id).join(",");
  const { data: emailTagsData } = useQuery({
    queryKey: ["email-tags", emailIds],
    queryFn: async () => {
      if (!emailIds) return { tags: {} };
      const res = await api.get<any>(`/email/email-tags?ids=${emailIds}`);
      if (!res.ok) return { tags: {} };
      return res.data;
    },
    enabled: allMessages.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Seed system tags on first load
  useEffect(() => {
    api.post("/composer/seed-tags").catch(() => {});
  }, []);

  const connected = statusData?.connected || false;
  const tags = settingsData?.tags || [];
  const emailTags: Record<string, { tagId: string; tagName: string | null }> = emailTagsData?.tags || {};
  const unreadCount = allMessages.filter((m) => !m.read).length;

  // Find the selected email for detail view
  const selectedEmail = selectedEmailId
    ? allMessages.find((m) => m.id === selectedEmailId)
    : null;

  const handleReply = (to: string, subject: string) => {
    setComposeToEmail(to);
    setComposeSubject(subject);
    setSelectedEmailId(null);
  };

  // Not connected state
  if (!connected && !inboxLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-hud-text">Email</h2>
        <GlassPanel>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-hud-amber/20">
              <Mail size={20} className="text-hud-amber" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-hud-text">No Email Connected</h3>
              <p className="text-xs text-hud-text-muted">
                Connect Gmail or Outlook in Connections to manage email.
              </p>
            </div>
          </div>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-hud-text">Email</h2>
          {/* Compact provider indicator */}
          <div className="flex items-center gap-1">
            {statusData?.providers?.google && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-hud-accent/10 text-hud-accent">
                Gmail
              </span>
            )}
            {statusData?.providers?.microsoft && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                Outlook
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold bg-hud-accent/20 text-hud-accent px-2 py-0.5 rounded-full">
              {unreadCount} unread
            </span>
          )}
          {allMessages.length > 0 && (
            <span className="text-[9px] text-hud-text-muted">
              {allMessages.length} emails
            </span>
          )}
        </div>
      </div>

      {/* Filter controls */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
            showUnreadOnly
              ? "bg-hud-accent/15 text-hud-accent border border-hud-accent/30"
              : "text-hud-text-muted hover:text-hud-text border border-hud-border"
          }`}
        >
          <Eye size={11} />
          Unread
        </button>

        {tags.map((tag: any) => (
          <button
            key={tag.id}
            onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              filterTag === tag.id
                ? "border"
                : "text-hud-text-muted hover:text-hud-text border border-hud-border"
            }`}
            style={
              filterTag === tag.id
                ? {
                    backgroundColor: `${tag.color}15`,
                    color: tag.color,
                    borderColor: `${tag.color}50`,
                  }
                : {}
            }
          >
            {tag.name}
          </button>
        ))}

        <button
          onClick={() => tagManagerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-hud-text-muted hover:text-hud-accent border border-hud-border hover:border-hud-accent/30 transition-colors"
        >
          <Plus size={10} />
          Add Tag
        </button>
      </div>

      {/* Main split layout */}
      {inboxLoading && allMessages.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: "calc(100vh - 280px)" }}>
          {/* Left pane — Email list */}
          <GlassPanel className="!p-2 overflow-hidden">
            <EmailList
              messages={allMessages}
              selectedId={selectedEmailId}
              onSelect={(id) => {
                setSelectedEmailId(id);
                setComposeToEmail(undefined);
                setComposeSubject(undefined);
              }}
              showUnreadOnly={showUnreadOnly}
              filterTag={filterTag}
              tags={tags}
              emailTags={emailTags}
              onTagEmail={(emailId, provider, tagId, tagName) => {
                api.post("/email/tag-email", { emailId, provider, tagId, tagName }).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["email-tags"] });
                });
              }}
              onLoadMore={loadMore}
              loadingMore={loadingMore}
              hasMore={hasMore}
            />
          </GlassPanel>

          {/* Right pane — Detail view or Compose */}
          <GlassPanel className="overflow-hidden">
            {selectedEmail ? (
              <EmailDetail
                messageId={selectedEmail.id}
                provider={selectedEmail.provider}
                onClose={() => setSelectedEmailId(null)}
                onReply={handleReply}
              />
            ) : (
              <ComposePane
                initialTo={composeToEmail}
                initialSubject={composeSubject}
                onClearInitial={() => {
                  setComposeToEmail(undefined);
                  setComposeSubject(undefined);
                }}
              />
            )}
          </GlassPanel>
        </div>
      )}

      {/* Tag management section */}
      <div ref={tagManagerRef}>
        <TagManager tags={tags} />
      </div>
    </div>
  );
}
