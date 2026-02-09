"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { HudBadge } from "@/components/ui/HudBadge";
import {
  FileEdit,
  Mail,
  FileText,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Copy,
} from "lucide-react";

interface Draft {
  id: string;
  type: string;
  to: string | null;
  subject: string | null;
  body: string;
  context: string | null;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
}

export function DraftsTab() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [filterType, setFilterType] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["drafts", filterType],
    queryFn: async () => {
      const params = filterType ? `?type=${filterType}` : "";
      const res = await api.get<any>(`/email/drafts${params}`);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const updateDraft = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; body?: string; subject?: string }) => {
      const res = await api.patch(`/email/drafts/${id}`, body);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      setEditingId(null);
    },
  });

  const deleteDraft = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/email/drafts/${id}`);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
    },
  });

  const drafts: Draft[] = data?.drafts || [];

  return (
    <div className="space-y-4">
      {/* Header + filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileEdit size={16} className="text-hud-accent" />
          <h3 className="text-sm font-semibold text-hud-text">Drafts</h3>
          {drafts.length > 0 && (
            <span className="text-xs text-hud-text-muted">({drafts.length})</span>
          )}
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-2 py-1 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
        >
          <option value="">All</option>
          <option value="email">Email</option>
          <option value="document">Document</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : drafts.length === 0 ? (
        <GlassPanel>
          <p className="text-xs text-hud-text-muted text-center py-8">
            No drafts yet. Use &ldquo;Save Draft&rdquo; in Email Compose or the Document Writer.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const isExpanded = expandedId === draft.id;
            const isEditing = editingId === draft.id;
            const isEmail = draft.type === "email";

            return (
              <GlassPanel key={draft.id}>
                {/* Header */}
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                >
                  {isEmail ? (
                    <Mail size={16} className="text-hud-accent mt-0.5 shrink-0" />
                  ) : (
                    <FileText size={16} className="text-hud-amber mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-medium text-hud-text truncate">
                        {draft.subject || "(No subject)"}
                      </p>
                      <HudBadge variant={isEmail ? "info" : "warning"}>
                        {isEmail ? "Email" : "Document"}
                      </HudBadge>
                    </div>
                    {isEmail && draft.to && (
                      <p className="text-[10px] text-hud-text-muted truncate">
                        To: {draft.to}
                      </p>
                    )}
                    {!isEmail && draft.body && (
                      <p className="text-[10px] text-hud-text-muted truncate">
                        {draft.body.slice(0, 80)}...
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] text-hud-text-muted">
                      {formatDate(draft.updatedAt)}
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-hud-text-muted" />
                    ) : (
                      <ChevronDown size={14} className="text-hud-text-muted" />
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-hud-border space-y-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={8}
                          className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text resize-none focus:outline-none focus:border-hud-accent/50"
                        />
                        <div className="flex gap-2">
                          <HudButton
                            size="sm"
                            onClick={() =>
                              updateDraft.mutate({ id: draft.id, body: editBody })
                            }
                            disabled={updateDraft.isPending}
                          >
                            Save
                          </HudButton>
                          <HudButton
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </HudButton>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white/3 rounded-lg p-3">
                        <p className="text-xs text-hud-text whitespace-pre-wrap">
                          {draft.body || "(empty)"}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    {!isEditing && (
                      <div className="flex gap-2">
                        <HudButton
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingId(draft.id);
                            setEditBody(draft.body);
                          }}
                        >
                          <Edit2 size={12} /> Edit
                        </HudButton>
                        <HudButton
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            navigator.clipboard.writeText(draft.body);
                          }}
                        >
                          <Copy size={12} /> Copy
                        </HudButton>
                        <HudButton
                          size="sm"
                          variant="danger"
                          onClick={() => deleteDraft.mutate(draft.id)}
                          disabled={deleteDraft.isPending}
                        >
                          <Trash2 size={12} /> Delete
                        </HudButton>
                      </div>
                    )}
                  </div>
                )}
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
