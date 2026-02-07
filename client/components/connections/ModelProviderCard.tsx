"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { Eye, EyeOff, Key, Check } from "lucide-react";
import { api } from "@/lib/api";

interface ModelProviderCardProps {
  provider: {
    id: string;
    name: string;
    configured: boolean;
  };
  onConfigUpdated: () => void;
}

export function ModelProviderCard({
  provider,
  onConfigUpdated,
}: ModelProviderCardProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await api.post("/connections/store-credential", {
        provider: provider.id,
        apiKey: apiKey.trim(),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "API key saved securely" });
        setApiKey("");
        onConfigUpdated();
      } else {
        setMessage({ type: "error", text: res.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    }
    setSaving(false);
  };

  return (
    <GlassPanel className={provider.configured ? "border-hud-success/30" : ""}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-hud-accent/10">
            <Key size={14} className="text-hud-accent" />
          </div>
          <h4 className="text-sm font-semibold text-hud-text">{provider.name}</h4>
        </div>
        <div className="flex items-center gap-1.5">
          {provider.configured && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-hud-success bg-hud-success/10 px-2 py-0.5 rounded-full">
              <Check size={10} /> Connected
            </span>
          )}
          <div
            className={`w-2 h-2 rounded-full ${
              provider.configured ? "bg-hud-success" : "bg-gray-500"
            }`}
          />
        </div>
      </div>

      {/* API Key Input */}
      <div className="space-y-3">
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider.configured ? "••••••• (key saved)" : "Enter API key"}
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 pr-10 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50 transition-colors"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-secondary transition-colors"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {apiKey && (
          <HudButton size="sm" onClick={handleSaveKey} disabled={saving} className="w-full">
            {saving ? "Saving..." : provider.configured ? "Update API Key" : "Save API Key"}
          </HudButton>
        )}

        {message && (
          <p
            className={`text-[10px] ${
              message.type === "success" ? "text-hud-success" : "text-hud-error"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </GlassPanel>
  );
}
