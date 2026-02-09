"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Plus, Trash2, Edit2, Tag, Sparkles, Check, X } from "lucide-react";

interface TagManagerProps {
  tags: any[];
}

const PRESET_COLORS = [
  "#00d4ff",
  "#f0a500",
  "#00ff88",
  "#ff4757",
  "#a855f7",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
];

export function TagManager({ tags }: TagManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const queryClient = useQueryClient();

  const createTag = useMutation({
    mutationFn: async (tag: { name: string; color: string; description: string; criteria: string }) => {
      const res = await api.post("/email/tags", tag);
      if (!res.ok) throw new Error(res.error || "Failed to create");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
      resetForm();
    },
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; color: string; description: string; criteria: string }) => {
      const res = await api.patch(`/email/tags/${id}`, data);
      if (!res.ok) throw new Error(res.error || "Failed to update");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
      resetForm();
    },
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/email/tags/${id}`);
      if (!res.ok) throw new Error(res.error || "Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
    },
  });

  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  const aiHelp = useMutation({
    mutationFn: async () => {
      const prompt = `I'm creating an email classification tag called "${name}".\n\n${criteria ? `Current criteria: ${criteria}\n\n` : ""}Write concise classification criteria for this tag — describe what kinds of emails should be tagged with "${name}". Be specific about sender patterns, subject keywords, or content characteristics. Return only the criteria text, nothing else. Keep it to 1-3 sentences.`;
      const res = await api.post<{ response: string }>("/automation/assist", { prompt });
      if (!res.ok) throw new Error(res.error || "AI help not available. Configure Automation AI in Connections.");
      return res.data!;
    },
    onSuccess: (data) => {
      const text = typeof data?.response === "string" ? data.response : JSON.stringify(data?.response ?? "");
      setAiSuggestion(text);
    },
  });

  // Auto-tag: fire-and-forget with polling
  const [autoTagStatus, setAutoTagStatus] = useState<{ status: string; processed: number; total: number; error?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const autoTag = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>("/email/auto-tag");
      if (!res.ok) throw new Error(res.error || "Auto-tagging failed");
      return res.data;
    },
    onSuccess: (data) => {
      setAutoTagStatus({ status: "running", processed: 0, total: data?.total || 0 });
      // Start polling for progress — invalidate tags on every tick so UI updates live
      pollRef.current = setInterval(async () => {
        try {
          const res = await api.get<any>("/email/auto-tag/status");
          if (!res.ok) return;
          const job = res.data;
          setAutoTagStatus(job);
          // Refresh tags on every poll so new tags appear in real time
          queryClient.invalidateQueries({ queryKey: ["email-tags"] });
          if (job.status === "done" || job.status === "error" || job.status === "idle") {
            clearInterval(pollRef.current);
            pollRef.current = undefined;
          }
        } catch { /* ignore */ }
      }, 3000);
    },
  });

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const resetForm = () => {
    setName("");
    setColor(PRESET_COLORS[0]);
    setDescription("");
    setCriteria("");
    setAiSuggestion(null);
    setShowForm(false);
    setEditId(null);
  };

  const startEdit = (tag: any) => {
    setEditId(tag.id);
    setName(tag.name);
    setColor(tag.color || PRESET_COLORS[0]);
    setDescription(tag.description || "");
    setCriteria(tag.criteria || "");
    setShowForm(true);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editId) {
      updateTag.mutate({ id: editId, name, color, description, criteria });
    } else {
      createTag.mutate({ name, color, description, criteria });
    }
  };

  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-hud-accent" />
          <h3 className="text-sm font-semibold text-hud-text">Email Tags</h3>
          <span className="text-xs text-hud-text-muted">({tags.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <HudButton
            size="sm"
            variant="secondary"
            onClick={() => autoTag.mutate()}
            disabled={autoTag.isPending || autoTagStatus?.status === "running" || tags.length === 0}
          >
            {(autoTag.isPending || autoTagStatus?.status === "running") ? <LoadingSpinner size="sm" /> : <Sparkles size={12} />}
            {autoTagStatus?.status === "running"
              ? `Tagging ${autoTagStatus.processed}/${autoTagStatus.total}...`
              : autoTag.isPending ? "Starting..." : "Re-tag All"}
          </HudButton>
          <HudButton
            size="sm"
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
          >
            <Plus size={14} />
            Add Tag
          </HudButton>
        </div>
      </div>

      {/* Auto-tag status */}
      {autoTagStatus?.status === "running" && (
        <div className="mb-3 p-2 bg-hud-accent/10 border border-hud-accent/20 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-hud-accent">
              Tagging emails... {autoTagStatus.processed}/{autoTagStatus.total}
            </p>
            <p className="text-[10px] text-hud-text-muted">
              {autoTagStatus.total > 0 ? `${Math.round((autoTagStatus.processed / autoTagStatus.total) * 100)}%` : ""}
            </p>
          </div>
          {autoTagStatus.total > 0 && (
            <div className="h-1 bg-hud-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-hud-accent rounded-full transition-all duration-500"
                style={{ width: `${(autoTagStatus.processed / autoTagStatus.total) * 100}%` }}
              />
            </div>
          )}
          <p className="text-[9px] text-hud-text-muted mt-1">You can close this page — tagging continues in the background.</p>
        </div>
      )}
      {autoTagStatus?.status === "done" && (
        <div className="mb-3 p-2 bg-hud-success/10 border border-hud-success/20 rounded-lg">
          <p className="text-[10px] text-hud-success">
            Auto-tagged {autoTagStatus.processed} of {autoTagStatus.total} emails.
          </p>
        </div>
      )}
      {autoTagStatus?.status === "error" && (
        <div className="mb-3 p-2 bg-hud-error/10 border border-hud-error/20 rounded-lg">
          <p className="text-[10px] text-hud-error">{autoTagStatus.error || "Auto-tagging failed"}</p>
        </div>
      )}
      {autoTag.isError && !autoTagStatus && (
        <div className="mb-3 p-2 bg-hud-error/10 border border-hud-error/20 rounded-lg">
          <p className="text-[10px] text-hud-error">{(autoTag.error as Error).message}</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="space-y-3 mb-4 p-3 bg-white/3 rounded-lg border border-hud-border">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tag name (e.g., Urgent, Client, Invoice)"
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
          />

          <div>
            <p className="text-[10px] text-hud-text-muted mb-1.5">Color:</p>
            <div className="flex gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border-2 ${
                    color === c ? "border-white" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="Classification criteria (e.g., 'Emails from clients requesting quotes or pricing information')"
            rows={2}
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 resize-none focus:outline-none focus:border-hud-accent/50"
          />

          {/* AI suggestion */}
          {aiSuggestion && (
            <div className="p-2 bg-hud-accent/5 border border-hud-accent/20 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-hud-accent font-medium flex items-center gap-1">
                  <Sparkles size={10} /> AI Suggestion
                </span>
              </div>
              <p className="text-[10px] text-hud-text-secondary whitespace-pre-wrap mb-2">{aiSuggestion}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setCriteria(aiSuggestion); setAiSuggestion(null); }}
                  className="text-[10px] text-hud-success hover:underline flex items-center gap-0.5"
                >
                  <Check size={10} /> Use
                </button>
                <button
                  onClick={() => setAiSuggestion(null)}
                  className="text-[10px] text-hud-text-muted hover:text-hud-text flex items-center gap-0.5"
                >
                  <X size={10} /> Dismiss
                </button>
              </div>
            </div>
          )}

          {/* AI Help button */}
          <button
            onClick={() => aiHelp.mutate()}
            disabled={!name.trim() || aiHelp.isPending}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-hud-success/15 text-hud-success border border-hud-success/30 hover:bg-hud-success/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {aiHelp.isPending ? <LoadingSpinner size="sm" /> : <Sparkles size={14} />}
            AI Help — Write Classification
          </button>
          {aiHelp.isError && (
            <p className="text-[10px] text-hud-amber">{(aiHelp.error as Error).message}</p>
          )}

          <div className="flex gap-2">
            <HudButton size="sm" onClick={handleSave} disabled={!name.trim()}>
              {editId ? "Update" : "Create"}
            </HudButton>
            <HudButton size="sm" variant="ghost" onClick={resetForm}>
              Cancel
            </HudButton>
          </div>
        </div>
      )}

      {/* Tags list */}
      {tags.length === 0 ? (
        <p className="text-xs text-hud-text-muted text-center py-4">
          No tags created yet. Add tags to classify emails.
        </p>
      ) : (
        <div className="space-y-2">
          {tags.map((tag: any) => (
            <div
              key={tag.id}
              className="flex items-center gap-3 px-3 py-2 bg-white/3 rounded-lg group"
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color || "#00d4ff" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-hud-text">{tag.name}</p>
                {tag.criteria && (
                  <p className="text-[10px] text-hud-text-muted truncate">
                    {tag.criteria}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(tag)}
                  className="p-1 text-hud-text-muted hover:text-hud-accent"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={() => deleteTag.mutate(tag.id)}
                  className="p-1 text-hud-text-muted hover:text-hud-error"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
