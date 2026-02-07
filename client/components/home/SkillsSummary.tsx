"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Blocks, ArrowRight } from "lucide-react";
import Link from "next/link";

interface SkillsSummaryProps {
  skills: any;
}

export function SkillsSummary({ skills }: SkillsSummaryProps) {
  const skillsList = skills?.skills || skills?.installed || [];
  const total = Array.isArray(skillsList) ? skillsList.length : 0;
  const enabled = Array.isArray(skillsList) ? skillsList.filter((s: any) => s.enabled !== false).length : 0;

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
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center px-3 py-2 bg-white/3 rounded-lg">
            <p className="text-lg font-bold text-hud-text">{total}</p>
            <p className="text-[10px] text-hud-text-muted">Installed</p>
          </div>
          <div className="text-center px-3 py-2 bg-white/3 rounded-lg">
            <p className="text-lg font-bold text-hud-success">{enabled}</p>
            <p className="text-[10px] text-hud-text-muted">Active</p>
          </div>
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
