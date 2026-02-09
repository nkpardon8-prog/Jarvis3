"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Settings,
  Trash2,
  Zap,
} from "lucide-react";

const AUTOMATION_PROVIDERS: Record<string, { label: string; models: { id: string; name: string }[] }> = {
  openai: {
    label: "OpenAI",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
    ],
  },
  anthropic: {
    label: "Anthropic",
    models: [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
    ],
  },
  google: {
    label: "Google AI",
    models: [
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    ],
  },
};

export function AutomationAICard() {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState("openai");
  const [modelId, setModelId] = useState(AUTOMATION_PROVIDERS.openai.models[0].id);
  const [apiKey, setApiKey] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [perMin, setPerMin] = useState(20);
  const [perHour, setPerHour] = useState(200);
  const [showRateLimits, setShowRateLimits] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["automation-settings"],
    queryFn: async () => {
      const res = await api.get<any>("/automation/settings");
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/automation/settings", { provider, modelId, apiKey });
      if (!res.ok) throw new Error(res.error || "Failed to save");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-settings"] });
      setApiKey("");
      setShowForm(false);
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ response: string }>("/automation/test", {});
      if (!res.ok) throw new Error(res.error || "Test failed");
      return res.data!;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete("/automation/settings");
      if (!res.ok) throw new Error(res.error || "Failed to remove");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-settings"] });
    },
  });

  const rateLimitMutation = useMutation({
    mutationFn: async () => {
      const res = await api.patch("/automation/settings", {
        rateLimitPerMin: perMin,
        rateLimitPerHour: perHour,
      });
      if (!res.ok) throw new Error(res.error || "Failed to update rate limits");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-settings"] });
    },
  });

  // Sync rate limit state when data loads
  useEffect(() => {
    if (data?.rateLimitPerMin) setPerMin(data.rateLimitPerMin);
    if (data?.rateLimitPerHour) setPerHour(data.rateLimitPerHour);
  }, [data?.rateLimitPerMin, data?.rateLimitPerHour]);

  if (isLoading) {
    return (
      <GlassPanel>
        <div className="flex justify-center py-4">
          <LoadingSpinner size="sm" />
        </div>
      </GlassPanel>
    );
  }

  const configured = data?.configured || false;
  const currentModels = AUTOMATION_PROVIDERS[provider]?.models || [];

  return (
    <GlassPanel className={configured ? "border-hud-success/20" : ""}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${configured ? "bg-hud-success" : "bg-hud-text-muted/40"}`} />
          <h4 className="text-sm font-medium text-hud-text">
            {configured ? "Configured" : "Not Configured"}
          </h4>
        </div>
        {configured && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-hud-text-muted">
              {data.provider} / {data.modelId}
            </span>
            <span className="text-[10px] text-hud-text-muted/50 font-mono">{data.apiKeyRedacted}</span>
          </div>
        )}
      </div>

      {configured && !showForm && (
        <div className="flex items-center gap-2">
          <HudButton
            size="sm"
            variant="secondary"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? <LoadingSpinner size="sm" /> : <Zap size={12} />}
            Test
          </HudButton>
          <HudButton
            size="sm"
            variant="secondary"
            onClick={() => {
              setProvider(data.provider);
              setModelId(data.modelId);
              setShowForm(true);
            }}
          >
            Update
          </HudButton>
          <HudButton
            size="sm"
            variant="danger"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 size={12} />
            Remove
          </HudButton>
          {testMutation.isSuccess && (
            <span className="text-[10px] text-hud-success flex items-center gap-1">
              <Check size={10} /> Connected
            </span>
          )}
          {testMutation.isError && (
            <span className="text-[10px] text-hud-error">{(testMutation.error as Error).message}</span>
          )}
        </div>
      )}

      {/* Rate limit controls (collapsible) */}
      {configured && !showForm && (
        <div className="mt-3">
          <button
            onClick={() => setShowRateLimits(!showRateLimits)}
            className="flex items-center gap-1.5 text-[10px] text-hud-text-muted hover:text-hud-text transition-colors"
          >
            <Settings size={11} />
            Rate Limits
            {showRateLimits ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {showRateLimits && (
            <div className="mt-2 pt-2 border-t border-hud-border space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-hud-text-muted mb-0.5 block">Per minute</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={perMin}
                    onChange={(e) => setPerMin(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-2 py-1 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50 font-mono"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-hud-text-muted mb-0.5 block">Per hour</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={perHour}
                    onChange={(e) => setPerHour(Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 1)))}
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-2 py-1 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50 font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <HudButton
                  size="sm"
                  variant="secondary"
                  onClick={() => rateLimitMutation.mutate()}
                  disabled={rateLimitMutation.isPending}
                >
                  {rateLimitMutation.isPending ? <LoadingSpinner size="sm" /> : "Save Limits"}
                </HudButton>
                {rateLimitMutation.isSuccess && (
                  <span className="text-[10px] text-hud-success">Saved</span>
                )}
                {rateLimitMutation.isError && (
                  <span className="text-[10px] text-hud-error">{(rateLimitMutation.error as Error).message}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(!configured || showForm) && (
        <div className="space-y-3 mt-2">
          {/* Provider */}
          <div>
            <label className="text-[10px] text-hud-text-muted mb-1 block">Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                const models = AUTOMATION_PROVIDERS[e.target.value]?.models || [];
                if (models.length > 0) setModelId(models[0].id);
              }}
              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
            >
              {Object.entries(AUTOMATION_PROVIDERS).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="text-[10px] text-hud-text-muted mb-1 block">Model</label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
            >
              {currentModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="text-[10px] text-hud-text-muted mb-1 block">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50 font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <HudButton
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!apiKey.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? <LoadingSpinner size="sm" /> : "Save"}
            </HudButton>
            {showForm && (
              <HudButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  setShowForm(false);
                  setApiKey("");
                }}
              >
                Cancel
              </HudButton>
            )}
            {saveMutation.isError && (
              <span className="text-[10px] text-hud-error">{(saveMutation.error as Error).message}</span>
            )}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
