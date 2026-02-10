"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import type { WorkflowTemplate } from "./workflowTemplates";
import {
  GitPullRequest,
  Briefcase,
  BookOpen,
  Radio,
  Home,
  Puzzle,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
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

interface WorkflowTemplateCardProps {
  template: WorkflowTemplate;
  onClick: () => void;
  disabled?: boolean;
}

export function WorkflowTemplateCard({
  template,
  onClick,
  disabled,
}: WorkflowTemplateCardProps) {
  const Icon = ICON_MAP[template.icon] || Puzzle;
  const colors = COLOR_MAP[template.accentColor] || COLOR_MAP["hud-accent"];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <GlassPanel
        className={`hover:${colors.border} hover:scale-[1.01] transition-all duration-200 cursor-pointer`}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`p-2.5 rounded-lg ${colors.bg} flex-shrink-0`}>
            <Icon size={20} className={colors.text} />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-semibold text-hud-text truncate">
                {template.name}
              </h4>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border} whitespace-nowrap`}
              >
                {template.category}
              </span>
            </div>

            <p className="text-[11px] text-hud-text-muted line-clamp-2 mb-2">
              {template.description}
            </p>

            {/* Required skills */}
            <div className="flex flex-wrap gap-1">
              {template.requiredSkills.map((skill) => (
                <span
                  key={skill}
                  className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-hud-text-muted border border-hud-border"
                >
                  <Puzzle size={8} />
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </GlassPanel>
    </button>
  );
}
