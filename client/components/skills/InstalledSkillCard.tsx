"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";

interface InstalledSkillCardProps {
  skill: any;
  onToggle: (enabled: boolean) => void;
  isToggling: boolean;
}

export function InstalledSkillCard({
  skill,
  onToggle,
  isToggling,
}: InstalledSkillCardProps) {
  const enabled = skill.enabled !== false;
  const name = skill.displayName || skill.name || skill.key || "Unknown";
  const description = skill.description || "";
  const emoji = skill.emoji || "🔧";
  const source = skill.source || skill.type || "bundled";

  return (
    <GlassPanel className={`${enabled ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-xl flex-shrink-0">{emoji}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-hud-text truncate">{name}</p>
            {description && (
              <p className="text-[11px] text-hud-text-muted mt-0.5 line-clamp-2">
                {description}
              </p>
            )}
            <span className="inline-block text-[9px] text-hud-text-muted mt-1 px-1.5 py-0.5 bg-white/5 rounded capitalize">
              {source}
            </span>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          onClick={() => onToggle(!enabled)}
          disabled={isToggling}
          className={`flex-shrink-0 relative w-9 h-5 rounded-full transition-colors ${
            enabled ? "bg-hud-accent" : "bg-hud-border"
          } ${isToggling ? "opacity-50" : ""}`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </GlassPanel>
  );
}
