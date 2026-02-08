"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Blocks, ArrowRight } from "lucide-react";
import Link from "next/link";

interface SkillsSummaryProps {
  skills: any;
  skillsCounts?: { total: number; active: number; inactive: number } | null;
}

export function SkillsSummary({ skills, skillsCounts }: SkillsSummaryProps) {
  // Prefer pre-computed counts from dashboard or skills endpoint
  const serverCounts = skillsCounts || skills?.counts;

  let total: number;
  let active: number;
  let inactive: number;

  if (serverCounts) {
    total = serverCounts.total || 0;
    active = serverCounts.active || 0;
    inactive = serverCounts.inactive || 0;
  } else {
    // Fallback: compute from raw skill list
    const skillsList = skills?.skills || skills?.installed || [];
    const list = Array.isArray(skillsList) ? skillsList : [];
    total = list.length;
    active = list.filter(
      (s: any) => s.enabled !== false && s.eligible !== false
    ).length;
    inactive = total - active;
  }

  return (
    <GlassPanel>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-hud-success/20">
          <Blocks size={20} className="text-hud-success" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-hud-text">Skills</h3>
          <p className="text-xs text-hud-text-muted">Agent Capabilities</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className={`grid ${inactive > 0 ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
          <div className="text-center px-3 py-2 bg-white/3 rounded-lg">
            <p className="text-lg font-bold text-hud-text">{total}</p>
            <p className="text-[10px] text-hud-text-muted">Installed</p>
          </div>
          <div className="text-center px-3 py-2 bg-white/3 rounded-lg">
            <p className="text-lg font-bold text-hud-success">{active}</p>
            <p className="text-[10px] text-hud-text-muted">Active</p>
          </div>
          {inactive > 0 && (
            <div className="text-center px-3 py-2 bg-white/3 rounded-lg">
              <p className="text-lg font-bold text-hud-text-muted">{inactive}</p>
              <p className="text-[10px] text-hud-text-muted">Inactive</p>
            </div>
          )}
        </div>

        <Link
          href="/dashboard/skills"
          className="flex items-center gap-1 text-xs text-hud-accent hover:text-hud-accent/80 transition-colors"
        >
          Manage skills <ArrowRight size={12} />
        </Link>
      </div>
    </GlassPanel>
  );
}
