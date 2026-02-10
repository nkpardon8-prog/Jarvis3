"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { api } from "@/lib/api";
import {
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  Server,
  Activity,
} from "lucide-react";

export function GatewayCard() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["gateway-status"],
    queryFn: async () => {
      const res = await api.get<any>("/gateway/status");
      if (!res.ok) throw new Error(res.error || "Failed to load gateway status");
      return res.data;
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const connected = data?.connected || false;
  const hasToken = data?.hasToken || false;
  const currentUrl = data?.url || "";
  const latencyMs = data?.latencyMs;
  const methodCount = data?.methods || 0;
  const serverVersion = data?.serverVersion || null;

  const isConfigured = !!currentUrl && hasToken;

  const handleSave = async () => {
    if (!url.trim() && !token.trim()) return;
    setSaving(true);
    setMessage(null);

    try {
      const body: Record<string, string> = {};
      if (url.trim()) body.url = url.trim();
      if (token.trim()) body.token = token.trim();

      const res = await api.post<any>("/gateway/configure", body);
      if (res.ok) {
        const d = res.data;
        if (d.connected) {
          setMessage({
            type: "success",
            text: `Connected — ${d.methods} methods available`,
          });
        } else if (d.reconnectError) {
          setMessage({
            type: "error",
            text: `Saved, but connection failed: ${d.reconnectError}`,
          });
        } else {
          setMessage({ type: "success", text: "Configuration saved" });
        }
        setUrl("");
        setToken("");
        setShowUpdate(false);
        refetch();
      } else {
        setMessage({ type: "error", text: res.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    }
    setSaving(false);
  };

  if (isLoading) {
    return (
      <GlassPanel>
        <div className="flex justify-center py-6">
          <LoadingSpinner size="sm" />
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className={connected ? "border-hud-success/30" : ""}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${connected ? "bg-hud-success/20" : "bg-hud-amber/20"}`}
          >
            {connected ? (
              <Wifi size={20} className="text-hud-success" />
            ) : (
              <WifiOff size={20} className="text-hud-amber" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-hud-text">
              OpenClaw Gateway
            </h3>
            {connected ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-hud-success font-medium">
                  Connected
                </span>
                {latencyMs !== null && latencyMs !== undefined && (
                  <span className="text-[9px] text-hud-text-muted">
                    {latencyMs}ms
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-hud-text-muted">
                {isConfigured
                  ? "Disconnected — unable to reach gateway"
                  : "Enter gateway URL and auth token to connect"}
              </p>
            )}
          </div>
        </div>
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            connected ? "bg-hud-success animate-pulse" : "bg-hud-error"
          }`}
        />
      </div>

      {/* Connected info */}
      {connected && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-hud-accent/10 text-hud-accent border border-hud-accent/20">
            <Server size={9} />
            {serverVersion ? `v${serverVersion}` : "Server"}
          </span>
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-hud-accent/10 text-hud-accent border border-hud-accent/20">
            <Activity size={9} />
            {methodCount} methods
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-hud-text-muted border border-hud-border">
            {currentUrl}
          </span>
        </div>
      )}

      {/* Configure / Update form */}
      {!isConfigured || showUpdate ? (
        <div className="space-y-3">
          {isConfigured && (
            <p className="text-[10px] text-hud-text-muted">
              Update connection settings below. Leave a field empty to keep the
              current value.
            </p>
          )}

          {/* URL */}
          <div>
            <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
              Gateway URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                isConfigured
                  ? currentUrl
                  : "ws://127.0.0.1:18789"
              }
              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
            />
          </div>

          {/* Token */}
          <div>
            <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
              Auth Token
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={hasToken ? "••••••••••••" : "Your auth token"}
                className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 pr-10 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-secondary transition-colors"
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <HudButton
              size="sm"
              onClick={handleSave}
              disabled={saving || (!url.trim() && !token.trim())}
              className="flex-1"
            >
              {saving ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Save size={12} />
                  Save & Connect
                </>
              )}
            </HudButton>
            {isConfigured && (
              <HudButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  setShowUpdate(false);
                  setUrl("");
                  setToken("");
                  setMessage(null);
                }}
              >
                Cancel
              </HudButton>
            )}
          </div>
        </div>
      ) : (
        /* Connected or configured — show update toggle */
        <div className="flex gap-2">
          <HudButton
            size="sm"
            variant="secondary"
            onClick={() => setShowUpdate(true)}
            className="flex-1"
          >
            <RefreshCw size={12} />
            Update Connection
          </HudButton>
        </div>
      )}

      {/* Messages */}
      {message && (
        <p
          className={`text-[10px] mt-2 ${
            message.type === "success" ? "text-hud-success" : "text-hud-error"
          }`}
        >
          {message.text}
        </p>
      )}
    </GlassPanel>
  );
}
