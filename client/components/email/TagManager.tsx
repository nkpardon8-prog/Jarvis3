"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Plus, Trash2, Edit2, Tag, Sparkles, Check, X, Play, Clock } from "lucide-react";

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

  // ─── Tagging schedule (OpenClaw cron) ─────────────────────
  const { data: taggingStatus, isLoading: taggingLoading } = useQuery({
    queryKey: ["tagging-status"],
    queryFn: async () => {
      const res = await api.get<any>("/email/tagging/status");
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 30000, // Refresh every 30s to pick up run updates
  });

  const enableTagging = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>("/email/tagging/enable");
      if (!res.ok) throw new Error(res.error || "Failed to enable tagging");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tagging-status"] });
    },
  });

  const disableTagging = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>("/email/tagging/disable");
      if (!res.ok) throw new Error(res.error || "Failed to disable tagging");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tagging-status"] });
    },
  });

  const runTagging = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>("/email/tagging/run");
      if (!res.ok) throw new Error(res.error || "Failed to trigger tagging");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tagging-status"] });
    },
  });

  const isTaggingEnabled = taggingStatus?.enabled === true;
  const isToggling = enableTagging.isPending || disableTagging.isPending;

  const handleToggle = () => {
    if (isTaggingEnabled) {
      disableTagging.mutate();
    } else {
      enableTagging.mutate();
    }
  };

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

  // Format last run time
  const formatLastRun = (isoDate: string | null) => {
    if (!isoDate) return null;
    const d = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
  };

  const formatNextRun = (isoDate: string | null) => {
    if (!isoDate) return null;
    const d = new Date(isoDate);
    const diffMs = d.getTime() - new Date().getTime();
    if (diffMs <= 0) return "due now";
    const diffMin = Math.ceil(diffMs / 60000);
    if (diffMin < 60) return `in ${diffMin}m`;
    const diffHrs = Math.ceil(diffMin / 60);
    if (diffHrs < 24) return `in ${diffHrs}h`;
    return d.toLocaleDateString();
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

      {/* Auto-tagging toggle */}
      <div className="mb-4 p-3 bg-white/3 rounded-lg border border-hud-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className={isTaggingEnabled ? "text-hud-success" : "text-hud-text-muted"} />
            <span className="text-xs font-medium text-hud-text">Auto-Tag (OpenClaw)</span>
          </div>
          <div className="flex items-center gap-2">
            {isTaggingEnabled && (
              <button
                onClick={() => runTagging.mutate()}
                disabled={runTagging.isPending}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-hud-accent bg-hud-accent/10 border border-hud-accent/20 hover:bg-hud-accent/20 transition-colors disabled:opacity-40"
              >
                {runTagging.isPending ? <LoadingSpinner size="sm" /> : <Play size={10} />}
                Run Now
              </button>
            )}
            {/* Toggle switch */}
            <button
              onClick={handleToggle}
              disabled={isToggling || taggingLoading || tags.length === 0}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                isTaggingEnabled ? "bg-hud-success/60" : "bg-hud-bg-secondary"
              } border ${
                isTaggingEnabled ? "border-hud-success/40" : "border-hud-border"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200 ${
                  isTaggingEnabled ? "translate-x-4 bg-hud-success" : "translate-x-0.5 bg-hud-text-muted"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Status line */}
        {isTaggingEnabled && taggingStatus && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-hud-text-muted">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              Every 30 min
            </span>
            <span className={`capitalize ${
              taggingStatus.mode === "incremental" ? "text-hud-success" : "text-hud-amber"
            }`}>
              {taggingStatus.mode}
            </span>
            {taggingStatus.lastRunAt && (
              <span>
                Last run: {formatLastRun(taggingStatus.lastRunAt)}
                {taggingStatus.lastRunStatus && (
                  <span className={`ml-1 ${
                    taggingStatus.lastRunStatus === "ok" ? "text-hud-success" :
                    taggingStatus.lastRunStatus === "error" ? "text-hud-error" : "text-hud-text-muted"
                  }`}>
                    ({taggingStatus.lastRunStatus})
                  </span>
                )}
              </span>
            )}
            {taggingStatus?.scheduler?.nextRunAt && (
              <span>Next run: {formatNextRun(taggingStatus.scheduler.nextRunAt)}</span>
            )}
            {!taggingStatus.lastRunAt && (() => {
              if (taggingStatus?.scheduler?.health === "unhealthy" && taggingStatus?.scheduler?.message) {
                return <span className="text-hud-error">{taggingStatus.scheduler.message}</span>;
              }
              if (taggingStatus?.scheduler?.health === "delayed" && taggingStatus?.scheduler?.message) {
                return <span className="text-hud-amber">{taggingStatus.scheduler.message}</span>;
              }
              // Detect stale "no run yet" state — if enabled for >5 min with no run, likely failed
              const enabledAt = taggingStatus.updatedAt ? new Date(taggingStatus.updatedAt).getTime() : 0;
              const minutesSinceEnabled = enabledAt ? (new Date().getTime() - enabledAt) / 60000 : 0;
              if (minutesSinceEnabled > 5) {
                return (
                  <span className="text-hud-error">
                    First run may have failed — try Run Now
                  </span>
                );
              }
              return <span className="text-hud-amber">Backfill starting...</span>;
            })()}
            {taggingStatus?.scheduler?.health === "unhealthy" && (
              <span className="text-hud-error">Scheduler unhealthy</span>
            )}
          </div>
        )}

        {tags.length === 0 && (
          <p className="mt-2 text-[10px] text-hud-text-muted">
            Create at least one tag to enable auto-tagging.
          </p>
        )}

        {/* Error display */}
        {(enableTagging.isError || disableTagging.isError || runTagging.isError) && (
          <p className="mt-2 text-[10px] text-hud-error">
            {(enableTagging.error as Error)?.message ||
             (disableTagging.error as Error)?.message ||
             (runTagging.error as Error)?.message}
          </p>
        )}
        {taggingStatus?.errorMessage && (
          <p className="mt-1 text-[10px] text-hud-error">{taggingStatus.errorMessage}</p>
        )}
        {!taggingStatus?.errorMessage &&
          taggingStatus?.scheduler?.message &&
          taggingStatus?.scheduler?.health !== "healthy" && (
            <p
              className={`mt-1 text-[10px] ${
                taggingStatus.scheduler.health === "unhealthy" ? "text-hud-error" : "text-hud-amber"
              }`}
            >
              {taggingStatus.scheduler.message}
            </p>
          )}
      </div>

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
