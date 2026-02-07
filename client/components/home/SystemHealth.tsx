"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Activity, Server, Zap } from "lucide-react";

interface SystemHealthProps {
  gateway: any;
  health: any;
}

export function SystemHealth({ gateway, health }: SystemHealthProps) {
  const connected = gateway?.connected ?? false;
  const uptimeMs = health?.heartbeatSeconds ? health.heartbeatSeconds * 1000 : 0;
  const uptimeHours = uptimeMs > 0 ? Math.floor(uptimeMs / 3600000) : 0;

  return (
    <GlassPanel>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${connected ? "bg-hud-success/20" : "bg-hud-error/20"}`}>
          <Activity size={20} className={connected ? "text-hud-success" : "text-hud-error"} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-hud-text">System Health</h3>
          <p className="text-xs text-hud-text-muted">Gateway Status</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-hud-text-muted">Connection</span>
          <span className={`text-xs font-medium ${connected ? "text-hud-success" : "text-hud-error"}`}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-hud-text-muted">Protocol</span>
          <span className="text-xs text-hud-text-secondary">v{gateway?.protocol || "?"}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-hud-text-muted">Server</span>
          <span className="text-xs text-hud-text-secondary flex items-center gap-1">
            <Server size={10} />
            {gateway?.serverVersion || "unknown"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-hud-text-muted">Methods</span>
          <span className="text-xs text-hud-text-secondary flex items-center gap-1">
            <Zap size={10} className="text-hud-accent" />
            {gateway?.methods || 0} available
          </span>
        </div>

        {uptimeHours > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-hud-text-muted">Heartbeat</span>
            <span className="text-xs text-hud-text-secondary">every {Math.floor((health?.heartbeatSeconds || 0) / 60)}m</span>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
