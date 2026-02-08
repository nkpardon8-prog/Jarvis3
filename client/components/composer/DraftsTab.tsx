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
  Check,
  X,
  Edit2,
  Trash2,
  Mail,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface DraftReply {
  id: string;
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  emailSnippet: string | null;
  tagId: string | null;
  draftBody: string;
  tone: string;
  status: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_BADGE: Record<string, { variant: "online" | "warning" | "info" | "error" | "offline"; label: string }> = {
  pending: { variant: "warning", label: "Pending" },
  approved: { variant: "online", label: "Approved" },
  sent: { variant: "info", label: "Sent" },
  discarded: { variant: "offline", label: "Discarded" },
};

export function DraftsTab() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["composer-drafts", filterStatus],
    queryFn: async () => {
      const params = filterStatus ? `?status=${filterStatus}` : "";
      const res = await api.get<any>(`/composer/drafts${params}`);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const updateDraft = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; draftBody?: string; status?: string }) => {
      const res = await api.patch(`/composer/drafts/${id}`, body);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["composer-drafts"] });
      setEditingId(null);
    },
  });

  const deleteDraft = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/composer/drafts/${id}`);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["composer-drafts"] });
    },
  });

  const drafts: DraftReply[] = data?.drafts || [];

  return (
    <div className="space-y-4">
      {/* Header + filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileEdit size={16} className="text-hud-accent" />
          <h3 className="text-sm font-semibold text-hud-text">Draft Replies</h3>
          {data?.total > 0 && (
            <span className="text-xs text-hud-text-muted">({data.total})</span>
          )}
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-2 py-1 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="discarded">Discarded</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : drafts.length === 0 ? (
        <GlassPanel>
          <p className="text-xs text-hud-text-muted text-center py-8">
            No draft replies yet. Generate drafts from the Inbox tab or enable auto-drafting.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const isExpanded = expandedId === draft.id;
            const isEditing = editingId === draft.id;
            const badge = STATUS_BADGE[draft.status] || STATUS_BADGE.pending;

            return (
              <GlassPanel key={draft.id}>
                {/* Header */}
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                >
                  <Mail size={16} className="text-hud-accent mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-medium text-hud-text truncate">
                        {draft.emailSubject}
                      </p>
                      <HudBadge variant={badge.variant}>{badge.label}</HudBadge>
                    </div>
                    <p className="text-[10px] text-hud-text-muted truncate">
                      From: {draft.emailFrom}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] text-hud-text-muted">
                      {new Date(draft.createdAt).toLocaleDateString()}
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
                    {draft.emailSnippet && (
                      <div className="bg-white/3 rounded-lg p-3">
                        <p className="text-[10px] text-hud-text-muted mb-1">Original email:</p>
                        <p className="text-xs text-hud-text-secondary">{draft.emailSnippet}</p>
                      </div>
                    )}

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={6}
                          className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text resize-none focus:outline-none focus:border-hud-accent/50"
                        />
                        <div className="flex gap-2">
                          <HudButton
                            size="sm"
                            onClick={() =>
                              updateDraft.mutate({ id: draft.id, draftBody: editBody })
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
                      <div className="bg-hud-accent/5 rounded-lg p-3 border border-hud-accent/10">
                        <p className="text-[10px] text-hud-accent mb-1">AI Draft Reply:</p>
                        <p className="text-xs text-hud-text whitespace-pre-wrap">
                          {draft.draftBody}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    {draft.status === "pending" && !isEditing && (
                      <div className="flex gap-2">
                        <HudButton
                          size="sm"
                          onClick={() =>
                            updateDraft.mutate({ id: draft.id, status: "approved" })
                          }
                          disabled={updateDraft.isPending}
                        >
                          <Check size={12} /> Approve
                        </HudButton>
                        <HudButton
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingId(draft.id);
                            setEditBody(draft.draftBody);
                          }}
                        >
                          <Edit2 size={12} /> Edit
                        </HudButton>
                        <HudButton
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateDraft.mutate({ id: draft.id, status: "discarded" })
                          }
                          disabled={updateDraft.isPending}
                        >
                          <X size={12} /> Discard
                        </HudButton>
                        <HudButton
                          size="sm"
                          variant="danger"
                          onClick={() => deleteDraft.mutate(draft.id)}
                          disabled={deleteDraft.isPending}
                        >
                          <Trash2 size={12} />
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
