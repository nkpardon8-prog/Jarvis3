"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { api } from "@/lib/api";
import {
  Sparkles,
  Download,
  X,
  Check,
  ChevronRight,
} from "lucide-react";

interface RankedSuggestion {
  name: string;
  installId?: string;
  description?: string;
  relevance: "high" | "medium" | "low";
  rationale: string;
}

interface ClawHubSuggestionsProps {
  slug: string;
  onDismiss: () => void;
}

export function ClawHubSuggestions({
  slug,
  onDismiss,
}: ClawHubSuggestionsProps) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<RankedSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch recommendations on mount
  useState(() => {
    (async () => {
      try {
        const res = await api.post<any>(`/integrations/${slug}/recommend`);
        if (res.ok && res.data?.ranked?.length > 0) {
          setSuggestions(res.data.ranked);
        }
      } catch {
        // Non-fatal
      }
      setLoading(false);
    })();
  });

  const toggleSelect = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  const handleInstall = async (suggestion: RankedSuggestion) => {
    setInstalling(suggestion.name);
    setError(null);
    try {
      const res = await api.post("/integrations/install-skill", {
        name: suggestion.name,
        installId: suggestion.installId,
      });
      if (res.ok) {
        setInstalled((prev) => new Set([...prev, suggestion.name]));
      } else {
        setError(`Failed to install ${suggestion.name}: ${res.error}`);
      }
    } catch {
      setError(`Network error installing ${suggestion.name}`);
    }
    setInstalling(null);
  };

  const handleInstallSelected = async () => {
    for (const name of selected) {
      const sug = suggestions.find((s) => s.name === name);
      if (sug && !installed.has(name)) {
        await handleInstall(sug);
      }
    }
  };

  if (loading) {
    return (
      <GlassPanel className="border-hud-accent/20 mt-4">
        <div className="flex items-center gap-3 py-4 justify-center">
          <LoadingSpinner size="sm" />
          <span className="text-xs text-hud-text-secondary">
            Searching ClawHub for related skills...
          </span>
        </div>
      </GlassPanel>
    );
  }

  if (suggestions.length === 0) {
    return null; // No suggestions — don't show anything
  }

  return (
    <GlassPanel className="border-hud-accent/20 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-hud-accent" />
          <h4 className="text-xs font-semibold text-hud-text">
            Recommended from ClawHub
          </h4>
        </div>
        <button
          onClick={onDismiss}
          className="text-hud-text-muted hover:text-hud-text-secondary transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <p className="text-[10px] text-hud-text-muted mb-3">
        These skills complement your integration. Select and install the ones
        you want.
      </p>

      {/* Suggestion list */}
      <div className="space-y-2 mb-3">
        {suggestions.map((sug) => {
          const isInstalled = installed.has(sug.name);
          const isInstalling = installing === sug.name;
          const isSelected = selected.has(sug.name);

          return (
            <div
              key={sug.name}
              className={`flex items-start gap-2 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                isInstalled
                  ? "bg-hud-success/5 border-hud-success/20"
                  : isSelected
                    ? "bg-hud-accent/5 border-hud-accent/30"
                    : "bg-hud-bg-secondary/30 border-hud-border hover:border-hud-accent/20"
              }`}
              onClick={() => !isInstalled && toggleSelect(sug.name)}
            >
              {/* Checkbox */}
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                  isInstalled
                    ? "bg-hud-success border-hud-success"
                    : isSelected
                      ? "bg-hud-accent border-hud-accent"
                      : "border-hud-border"
                }`}
              >
                {(isInstalled || isSelected) && (
                  <Check size={10} className="text-hud-bg" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-hud-text">
                    {sug.name}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                      sug.relevance === "high"
                        ? "bg-hud-success/10 text-hud-success"
                        : "bg-hud-amber/10 text-hud-amber"
                    }`}
                  >
                    {sug.relevance}
                  </span>
                  {isInstalled && (
                    <span className="text-[9px] text-hud-success">
                      Installed
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-hud-text-muted mt-0.5 line-clamp-2">
                  {sug.rationale}
                </p>
              </div>

              {/* Individual install */}
              {!isInstalled && (
                <HudButton
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInstall(sug);
                  }}
                  disabled={isInstalling}
                  className="shrink-0"
                >
                  {isInstalling ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Download size={11} />
                  )}
                </HudButton>
              )}
            </div>
          );
        })}
      </div>

      {/* Bulk actions */}
      <div className="flex gap-2">
        {selected.size > 0 && (
          <HudButton
            size="sm"
            onClick={handleInstallSelected}
            disabled={!!installing}
            className="flex-1"
          >
            {installing ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <Download size={12} />
                Install Selected ({selected.size})
              </>
            )}
          </HudButton>
        )}
        <HudButton size="sm" variant="secondary" onClick={onDismiss}>
          <ChevronRight size={12} />
          Skip
        </HudButton>
      </div>

      {error && <p className="text-[10px] text-hud-error mt-2">{error}</p>}
    </GlassPanel>
  );
}
