"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Trash2, Globe, Key, Edit3 } from "lucide-react";
import { api } from "@/lib/api";

const AUTH_LABELS: Record<string, string> = {
  "api-key-header": "API Key (Header)",
  "api-key-query": "API Key (Query)",
  bearer: "Bearer Token",
  oauth2: "OAuth2",
  basic: "Basic Auth",
  none: "No Auth",
};

interface IntegrationCardProps {
  integration: {
    slug: string;
    name: string;
    apiBaseUrl: string;
    authMethod: string;
    description: string;
    status: "pending" | "created" | "error";
    errorMessage?: string;
    skillFound?: boolean;
    skillEnabled?: boolean;
  };
  onDelete: () => void;
  onEdit?: () => void;
}

export function IntegrationCard({
  integration,
  onDelete,
  onEdit,
}: IntegrationCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await api.delete(`/integrations/${integration.slug}`);
      if (res.ok) {
        onDelete();
      } else {
        setError(res.error || "Failed to delete");
      }
    } catch {
      setError("Network error");
    }
    setDeleting(false);
  };

  const statusColor =
    integration.status === "created"
      ? "bg-hud-success"
      : integration.status === "pending"
        ? "bg-hud-amber"
        : "bg-hud-error";

  const statusLabel =
    integration.status === "created"
      ? "Active"
      : integration.status === "pending"
        ? "Pending"
        : "Error";

  return (
    <GlassPanel
      className={
        integration.status === "created" ? "border-hud-success/20" : ""
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-hud-accent/10">
            <Globe size={14} className="text-hud-accent" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-hud-text truncate">
              {integration.name}
            </h4>
            <p className="text-[10px] text-hud-text-muted truncate font-mono">
              {integration.apiBaseUrl}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
              integration.status === "created"
                ? "text-hud-success bg-hud-success/10"
                : integration.status === "pending"
                  ? "text-hud-amber bg-hud-amber/10"
                  : "text-hud-error bg-hud-error/10"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-hud-text-secondary line-clamp-2 mb-3">
        {integration.description}
      </p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-hud-accent/10 text-hud-accent border border-hud-accent/20">
          <Key size={9} />
          {AUTH_LABELS[integration.authMethod] || integration.authMethod}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-hud-text-muted border border-hud-border">
          Custom
        </span>
        {integration.skillFound && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              integration.skillEnabled
                ? "bg-hud-success/10 text-hud-success border-hud-success/20"
                : "bg-white/5 text-hud-text-muted border-hud-border"
            }`}
          >
            Skill {integration.skillEnabled ? "Enabled" : "Disabled"}
          </span>
        )}
      </div>

      {/* Error message */}
      {integration.errorMessage && (
        <p className="text-[10px] text-hud-error mb-2">
          {integration.errorMessage}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {onEdit && (
          <HudButton
            size="sm"
            variant="secondary"
            onClick={onEdit}
            className="flex-1"
          >
            <Edit3 size={12} />
            Edit
          </HudButton>
        )}
        <HudButton
          size="sm"
          variant="danger"
          onClick={handleDelete}
          disabled={deleting}
          className={onEdit ? "" : "flex-1"}
        >
          {deleting ? (
            <LoadingSpinner size="sm" />
          ) : (
            <>
              <Trash2 size={12} />
              Delete
            </>
          )}
        </HudButton>
      </div>

      {error && <p className="text-[10px] text-hud-error mt-2">{error}</p>}
    </GlassPanel>
  );
}
