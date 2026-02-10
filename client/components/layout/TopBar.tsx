"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { StatusIndicator } from "./StatusIndicator";
import { LogOut, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function TopBar() {
  const { user, logout } = useAuth();

  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<{ gateway: { connected: boolean } }>("/health"),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const gatewayConnected = healthData?.data?.gateway?.connected ?? false;

  return (
    <header className="flex h-14 items-center justify-between border-b border-hud-border bg-hud-bg px-6">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-hud-accent/20 flex items-center justify-center">
            <span className="text-hud-accent font-bold text-sm font-mono">J</span>
          </div>
          <h1 className="text-lg font-semibold tracking-wider">
            <span className="text-hud-accent">J.A.R.V.I.S.</span>
          </h1>
        </div>
      </div>

      {/* Center: Gateway Status */}
      <div className="flex items-center gap-4">
        <StatusIndicator
          status={gatewayConnected ? "connected" : "disconnected"}
        />
        <span className="text-xs text-hud-text-muted">Gateway</span>
      </div>

      {/* Right: User Menu */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-hud-text-secondary">
          <User size={14} />
          <span>{user?.displayName || user?.username || "User"}</span>
        </div>
        <button
          onClick={() => logout()}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-hud-text-muted hover:text-hud-error hover:bg-hud-error/10 transition-colors cursor-pointer"
          title="Logout"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
