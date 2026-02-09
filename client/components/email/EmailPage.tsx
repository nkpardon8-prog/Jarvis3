"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { HudButton } from "@/components/ui/HudButton";
import { EmailList } from "./EmailList";
import { EmailDetail } from "./EmailDetail";
import { ComposePane } from "./ComposePane";
import { TagManager } from "./TagManager";
import {
  Mail,
  Eye,
  Tag,
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

export function EmailPage() {
  const queryClient = useQueryClient();
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [composeToEmail, setComposeToEmail] = useState<string | undefined>();
  const [composeSubject, setComposeSubject] = useState<string | undefined>();
  const [showTagManager, setShowTagManager] = useState(false);

  const { data: statusData } = useQuery({
    queryKey: ["email-status"],
    queryFn: async () => {
      const res = await api.get<any>("/email/status");
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const { data: settingsData } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const res = await api.get<any>("/email/settings");
      if (!res.ok) throw new Error(res.error || "Failed to load settings");
      return res.data;
    },
  });

  const { data: inboxData, isLoading: inboxLoading } = useQuery({
    queryKey: ["email-inbox"],
    queryFn: async () => {
      const res = await api.get<any>("/email/inbox?max=25&withProcessed=true");
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: !!statusData?.connected,
    refetchInterval: 3 * 60 * 1000,
  });

  // Seed system tags on first load
  useEffect(() => {
    api.post("/composer/seed-tags").catch(() => {});
  }, []);

  const connected = statusData?.connected || false;
  const messages: EmailMessage[] = inboxData?.messages || [];
  const processed = inboxData?.processed || {};
  const tags = settingsData?.tags || [];
  const unreadCount = messages.filter((m) => !m.read).length;

  // Find the selected email for detail view
  const selectedEmail = selectedEmailId
    ? messages.find((m) => m.id === selectedEmailId)
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
            onClick={() => setFilterTag(filterTag === tag.name ? null : tag.name)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              filterTag === tag.name
                ? "border"
                : "text-hud-text-muted hover:text-hud-text border border-hud-border"
            }`}
            style={
              filterTag === tag.name
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
          onClick={() => setShowTagManager(!showTagManager)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-hud-text-muted hover:text-hud-accent border border-hud-border hover:border-hud-accent/30 transition-colors"
        >
          <Plus size={10} />
          Add Tag
        </button>
      </div>

      {/* Main split layout */}
      {inboxLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: "calc(100vh - 280px)" }}>
          {/* Left pane — Email list */}
          <GlassPanel className="!p-2 overflow-hidden">
            <EmailList
              messages={messages}
              processed={processed}
              selectedId={selectedEmailId}
              onSelect={(id) => {
                setSelectedEmailId(id);
                setComposeToEmail(undefined);
                setComposeSubject(undefined);
              }}
              filterTag={filterTag}
              showUnreadOnly={showUnreadOnly}
              tags={tags}
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
      {showTagManager && <TagManager tags={tags} />}
    </div>
  );
}
