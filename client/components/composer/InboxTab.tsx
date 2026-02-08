"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TagManager } from "@/components/email/TagManager";
import { HudToggle } from "@/components/ui/HudToggle";
import {
  Mail,
  Tag,
  FileEdit,
  Sparkles,
  CheckCircle2,
  Circle,
  Inbox,
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

export function InboxTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const res = await api.get<any>("/email/settings");
      if (!res.ok) throw new Error(res.error || "Failed to load settings");
      return res.data;
    },
  });

  const { data: statusData } = useQuery({
    queryKey: ["email-status"],
    queryFn: async () => {
      const res = await api.get<any>("/email/status");
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const { data: inboxData, isLoading: inboxLoading } = useQuery({
    queryKey: ["email-inbox"],
    queryFn: async () => {
      const res = await api.get<any>("/email/inbox?max=15");
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: !!statusData?.connected,
    refetchInterval: 5 * 60 * 1000,
  });

  const updateSettings = useMutation({
    mutationFn: async (settings: Record<string, any>) => {
      const res = await api.put("/email/settings", settings);
      if (!res.ok) throw new Error(res.error || "Failed to save");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const settings = data?.settings || {};
  const tags = data?.tags || [];
  const connected = statusData?.connected || false;
  const messages: EmailMessage[] = inboxData?.messages || [];
  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <div className="space-y-6">
      {/* Connection status */}
      <GlassPanel className={connected ? "border-hud-success/30" : ""}>
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`p-2 rounded-lg ${connected ? "bg-hud-success/20" : "bg-hud-amber/20"}`}
          >
            <Mail
              size={20}
              className={connected ? "text-hud-success" : "text-hud-amber"}
            />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-hud-text">
              Email Connection
            </h3>
            {connected ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-hud-success">Connected</p>
                {statusData?.providers && (
                  <div className="flex gap-1">
                    {statusData.providers.google && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-hud-accent/10 text-hud-accent">
                        Gmail
                      </span>
                    )}
                    {statusData.providers.microsoft && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                        Outlook
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-hud-text-muted">
                Connect Gmail or Outlook in Connections to manage email.
              </p>
            )}
          </div>
          {connected && unreadCount > 0 && (
            <span className="text-[10px] font-bold bg-hud-accent/20 text-hud-accent px-2 py-0.5 rounded-full">
              {unreadCount} unread
            </span>
          )}
        </div>
      </GlassPanel>

      {/* Inbox preview */}
      {connected && (
        <GlassPanel>
          <div className="flex items-center gap-2 mb-3">
            <Inbox size={16} className="text-hud-accent" />
            <h3 className="text-sm font-semibold text-hud-text">
              Recent Inbox
            </h3>
          </div>

          {inboxLoading ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner size="sm" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-hud-text-muted text-center py-6">
              No messages in your inbox.
            </p>
          ) : (
            <div className="space-y-1">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors cursor-default ${
                    msg.read
                      ? "border-transparent bg-transparent hover:bg-white/3"
                      : "border-hud-accent/10 bg-hud-accent/5"
                  }`}
                >
                  <div className="shrink-0 mt-1">
                    {msg.read ? (
                      <CheckCircle2
                        size={12}
                        className="text-hud-text-muted/40"
                      />
                    ) : (
                      <Circle size={12} className="text-hud-accent" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-xs truncate ${msg.read ? "text-hud-text-secondary" : "text-hud-text font-medium"}`}
                      >
                        {msg.subject}
                      </p>
                      <span
                        className={`shrink-0 text-[9px] px-1 py-0.5 rounded ${
                          msg.provider === "google"
                            ? "bg-hud-accent/10 text-hud-accent"
                            : "bg-blue-500/10 text-blue-400"
                        }`}
                      >
                        {msg.provider === "google" ? "G" : "M"}
                      </span>
                    </div>
                    <p className="text-[10px] text-hud-text-muted truncate">
                      {msg.from}
                    </p>
                    <p className="text-[10px] text-hud-text-muted/60 truncate mt-0.5">
                      {msg.snippet}
                    </p>
                  </div>
                  <span className="text-[9px] text-hud-text-muted shrink-0 mt-0.5">
                    {formatRelativeDate(msg.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {/* Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassPanel>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Tag size={18} className="text-hud-accent" />
              <div>
                <p className="text-sm font-medium text-hud-text">
                  Auto-Tagging
                </p>
                <p className="text-xs text-hud-text-muted">
                  Automatically categorize incoming emails using AI
                </p>
              </div>
            </div>
            <HudToggle
              checked={!!settings.autoTagEnabled}
              onChange={(checked) =>
                updateSettings.mutate({ autoTagEnabled: checked })
              }
              size="md"
              label="Auto-tagging"
            />
          </div>
        </GlassPanel>

        <GlassPanel>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileEdit size={18} className="text-hud-success" />
              <div>
                <p className="text-sm font-medium text-hud-text">
                  Auto-Drafting
                </p>
                <p className="text-xs text-hud-text-muted">
                  Generate draft replies for incoming emails
                </p>
              </div>
            </div>
            <HudToggle
              checked={!!settings.autoDraftEnabled}
              onChange={(checked) =>
                updateSettings.mutate({ autoDraftEnabled: checked })
              }
              size="md"
              activeColor="success"
              label="Auto-drafting"
            />
          </div>
        </GlassPanel>
      </div>

      {/* Draft settings */}
      {settings.autoDraftEnabled && (
        <GlassPanel>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-hud-accent" />
            <h3 className="text-sm font-semibold text-hud-text">
              Draft Settings
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-hud-text-muted mb-1 block">
                Draft Tone
              </label>
              <select
                value={settings.draftTone || "professional"}
                onChange={(e) =>
                  updateSettings.mutate({ draftTone: e.target.value })
                }
                className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-hud-text-muted mb-1 block">
                Signature
              </label>
              <textarea
                value={settings.signature || ""}
                onChange={(e) =>
                  updateSettings.mutate({ signature: e.target.value })
                }
                placeholder="Your email signature..."
                rows={3}
                className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 resize-none focus:outline-none focus:border-hud-accent/50"
              />
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Tags */}
      <TagManager tags={tags} />
    </div>
  );
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
