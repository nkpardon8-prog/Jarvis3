"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Brain, ArrowRight } from "lucide-react";
import Link from "next/link";

interface ActiveModelProps {
  models: any;
  health: any;
  sessions?: any;
}

export function ActiveModel({ models, health, sessions }: ActiveModelProps) {
  const modelDefaults = models?.defaults || {};
  const sessionDefaults = sessions?.defaults || {};
  const currentModel = sessionDefaults?.model || modelDefaults?.model || health?.defaults?.model || "Unknown";
  const provider = sessionDefaults?.modelProvider || modelDefaults?.modelProvider || health?.defaults?.modelProvider || "";
  const defaults = { ...modelDefaults, ...sessionDefaults };

  return (
    <GlassPanel>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-hud-accent/20">
          <Brain size={20} className="text-hud-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-hud-text">Active Model</h3>
          <p className="text-xs text-hud-text-muted">AI Provider</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="px-3 py-2 bg-hud-accent/5 border border-hud-accent/20 rounded-lg">
          <p className="text-sm font-medium text-hud-accent">{currentModel}</p>
          {provider && (
            <p className="text-xs text-hud-text-muted mt-0.5 capitalize">{provider}</p>
          )}
        </div>

        {defaults?.contextTokens && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-hud-text-muted">Context Window</span>
            <span className="text-xs text-hud-text-secondary">
              {(defaults.contextTokens / 1000).toFixed(0)}K tokens
            </span>
          </div>
        )}

        <Link
          href="/dashboard/connections?focus=active-model"
          className="flex items-center gap-1 text-xs text-hud-accent hover:text-hud-accent/80 transition-colors mt-2"
        >
          Change model <ArrowRight size={12} />
        </Link>
      </div>
    </GlassPanel>
  );
}
