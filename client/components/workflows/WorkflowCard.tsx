"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudBadge } from "@/components/ui/HudBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { api } from "@/lib/api";
import { describeSchedule, getTemplate } from "./workflowTemplates";
import {
  GitPullRequest,
  Briefcase,
  BookOpen,
  Radio,
  Home,
  Puzzle,
  Play,
  Pause,
  Trash2,
  Clock,
  Zap,
  AlertCircle,
  RotateCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const ICON_MAP: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  GitPullRequest,
  Briefcase,
  BookOpen,
  Radio,
  Home,
};

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  "hud-accent": {
    bg: "bg-hud-accent/15",
    text: "text-hud-accent",
    border: "border-hud-accent/30",
  },
  "hud-success": {
    bg: "bg-hud-success/15",
    text: "text-hud-success",
    border: "border-hud-success/30",
  },
  "hud-amber": {
    bg: "bg-hud-amber/15",
    text: "text-hud-amber",
    border: "border-hud-amber/30",
  },
  "hud-error": {
    bg: "bg-hud-error/15",
    text: "text-hud-error",
    border: "border-hud-error/30",
  },
};

interface WorkflowCardProps {
  workflow: any;
  onEdit?: () => void;
}

export function WorkflowCard({ workflow, onEdit }: WorkflowCardProps) {
  const queryClient = useQueryClient();
  const [showDetails, setShowDetails] = useState(false);

  const template = getTemplate(workflow.templateId);
  const icon = workflow.template?.icon || template?.icon || "Puzzle";
  const accentColor =
    workflow.template?.accentColor || template?.accentColor || "hud-accent";

  const Icon = ICON_MAP[icon] || Puzzle;
  const colors = COLOR_MAP[accentColor] || COLOR_MAP["hud-accent"];

  const isActive = workflow.status === "active";
  const isPaused = workflow.status === "paused";
  const isError = workflow.status === "error";
  const isSettingUp = workflow.status === "setting-up";

  // Toggle (pause/resume)
  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await api.patch<any>(
        `/workflows/${encodeURIComponent(workflow.id)}/toggle`
      );
      if (!res.ok) throw new Error(res.error || "Failed to toggle workflow");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  // Force run
  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>(
        `/workflows/${encodeURIComponent(workflow.id)}/run`
      );
      if (!res.ok) throw new Error(res.error || "Failed to run workflow");
      return res.data;
    },
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete<any>(
        `/workflows/${encodeURIComponent(workflow.id)}`
      );
      if (!res.ok) throw new Error(res.error || "Failed to delete workflow");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const statusBadge = isActive
    ? { variant: "online" as const, label: "Active" }
    : isPaused
      ? { variant: "offline" as const, label: "Paused" }
      : isError
        ? { variant: "offline" as const, label: "Error" }
        : { variant: "offline" as const, label: "Setting up" };

  return (
    <GlassPanel
      className={`${isActive ? colors.border : ""} ${isPaused ? "opacity-70" : ""}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`p-2 rounded-lg ${colors.bg} flex-shrink-0`}>
            <Icon size={18} className={colors.text} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-semibold text-hud-text truncate">
                {workflow.name}
              </h3>
              <HudBadge
                variant={statusBadge.variant}
                dot={isActive}
              >
                {statusBadge.label}
              </HudBadge>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-hud-text-muted">
              <Clock size={10} />
              <span>{describeSchedule(workflow.schedule)}</span>
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${
            isActive
              ? "bg-hud-success animate-pulse"
              : isPaused
                ? "bg-hud-amber"
                : isError
                  ? "bg-hud-error"
                  : "bg-hud-text-muted"
          }`}
        />
      </div>

      {/* Error message */}
      {isError && workflow.errorMessage && (
        <div className="flex items-start gap-2 mb-3 px-2 py-1.5 rounded-lg bg-hud-error/10 border border-hud-error/20">
          <AlertCircle size={12} className="text-hud-error flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-hud-error">{workflow.errorMessage}</p>
        </div>
      )}

      {/* Custom trigger */}
      {workflow.customTrigger && (
        <div className="mb-3 px-2 py-1.5 rounded-lg bg-hud-amber/5 border border-hud-amber/15">
          <p className="text-[10px] text-hud-amber">
            <Zap size={9} className="inline mr-1" />
            Trigger: {workflow.customTrigger}
          </p>
        </div>
      )}

      {/* Installed skills */}
      {workflow.installedSkills && workflow.installedSkills.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {workflow.installedSkills.map((skill: string) => (
            <span
              key={skill}
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-hud-text-muted border border-hud-border"
            >
              <Puzzle size={8} />
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Last/next run info */}
      {(workflow.lastRun || workflow.nextRun) && (
        <div className="flex items-center gap-3 mb-3 text-[10px] text-hud-text-muted">
          {workflow.lastRun && (
            <span>
              Last: {new Date(workflow.lastRun).toLocaleString()}
            </span>
          )}
          {workflow.nextRun && (
            <span>
              Next: {new Date(workflow.nextRun).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Expandable details */}
      {workflow.additionalInstructions && (
        <div className="mb-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-[10px] text-hud-text-muted hover:text-hud-text-secondary transition-colors"
          >
            {showDetails ? (
              <ChevronDown size={11} />
            ) : (
              <ChevronRight size={11} />
            )}
            Instructions
          </button>
          {showDetails && (
            <p className="mt-1.5 text-[11px] text-hud-text-muted px-2 py-1.5 rounded bg-white/3 border border-hud-border">
              {workflow.additionalInstructions}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-hud-border">
        {/* Pause/Resume */}
        {(isActive || isPaused) && (
          <button
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors disabled:opacity-50 ${
              isActive
                ? "bg-hud-amber/15 text-hud-amber border border-hud-amber/25 hover:bg-hud-amber/25"
                : "bg-hud-success/15 text-hud-success border border-hud-success/25 hover:bg-hud-success/25"
            }`}
          >
            {toggleMutation.isPending ? (
              <LoadingSpinner size="sm" />
            ) : isActive ? (
              <>
                <Pause size={11} />
                Pause
              </>
            ) : (
              <>
                <Play size={11} />
                Resume
              </>
            )}
          </button>
        )}

        {/* Run Now */}
        {(isActive || isPaused) && (
          <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-hud-accent/15 text-hud-accent border border-hud-accent/25 rounded-lg hover:bg-hud-accent/25 transition-colors disabled:opacity-50"
          >
            {runMutation.isPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <RotateCw size={11} />
                Run Now
              </>
            )}
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Delete */}
        <button
          onClick={() => {
            if (confirm("Remove this workflow? The cron job will be deleted.")) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-hud-error/10 text-hud-error border border-hud-error/20 rounded-lg hover:bg-hud-error/20 transition-colors disabled:opacity-50"
        >
          {deleteMutation.isPending ? (
            <LoadingSpinner size="sm" />
          ) : (
            <>
              <Trash2 size={11} />
              Delete
            </>
          )}
        </button>
      </div>

      {/* Mutation feedback */}
      {runMutation.isSuccess && (
        <p className="text-[10px] text-hud-success mt-2">
          Workflow triggered successfully
        </p>
      )}
      {runMutation.isError && (
        <p className="text-[10px] text-hud-error mt-2">
          {(runMutation.error as Error)?.message || "Failed to run workflow"}
        </p>
      )}
    </GlassPanel>
  );
}
