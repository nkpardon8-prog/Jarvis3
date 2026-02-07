"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { Plus, Trash2, Edit2, Check, X, Tag } from "lucide-react";

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

  const resetForm = () => {
    setName("");
    setColor(PRESET_COLORS[0]);
    setDescription("");
    setCriteria("");
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
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-accent hover:bg-hud-accent/10 transition-colors"
        >
          <Plus size={16} />
        </button>
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
