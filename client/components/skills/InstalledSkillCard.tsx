"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudBadge } from "@/components/ui/HudBadge";
import { api } from "@/lib/api";
import { buildAddSkillPrompt, storeAutoPrompt } from "@/lib/skill-prompts";
import {
  Key,
  ChevronDown,
  ChevronRight,
  Save,
  Plus,
  Ban,
} from "lucide-react";

interface InstalledSkillCardProps {
  skill: any;
  onToggle: (enabled: boolean) => void;
  onCredentialsSaved: () => void;
  isToggling: boolean;
}

export function InstalledSkillCard({
  skill,
  onToggle,
  onCredentialsSaved,
  isToggling,
}: InstalledSkillCardProps) {
  const router = useRouter();
  const [showCredentials, setShowCredentials] = useState(false);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const status: "active" | "inactive" = skill.status || "active";
  const inactiveReason: string | undefined = skill.inactiveReason;
  const isActive = status === "active";
  const isInactive = status === "inactive";
  // Only show "blocked" details when the reason is specifically missing requirements
  const isBlocked = inactiveReason === "blocked";
  const isDisabled = inactiveReason === "disabled" || (!skill.enabled && !isBlocked);

  const name = skill.displayName || skill.name || skill.key || "Unknown";
  const description = skill.description || "";
  const emoji = skill.emoji || "\u{1F527}";
  const source = skill.source || skill.type || "bundled";

  const missingReqs = skill.missingRequirements;
  const requiresEnv = skill.requires?.env?.length > 0 || missingReqs?.env?.length > 0;

  function handleAddSkill() {
    const prompt = buildAddSkillPrompt({
      key: skill.key || skill.name,
      displayName: name,
      description: skill.description,
      missingRequirements: skill.missingRequirements,
      requires: skill.requires,
    });
    storeAutoPrompt(prompt, "enable-inactive-skill");
    router.push("/dashboard/chat");
  }

  async function handleSaveCredentials() {
    setSaving(true);
    setSaveError("");
    try {
      const body: Record<string, any> = {};
      if (apiKeyValue) body.apiKey = apiKeyValue;
      const filledEnv = Object.fromEntries(
        Object.entries(envValues).filter(([, v]) => v.length > 0)
      );
      if (Object.keys(filledEnv).length > 0) body.env = filledEnv;

      if (!body.apiKey && !body.env) {
        setSaveError("Enter at least one credential");
        return;
      }

      const res = await api.post(
        `/skills/${encodeURIComponent(skill.key || skill.name)}/credentials`,
        body
      );
      if (!res.ok) throw new Error(res.error || "Failed to save credentials");

      setApiKeyValue("");
      setEnvValues({});
      setShowCredentials(false);
      onCredentialsSaved();
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassPanel className={isInactive ? "opacity-70" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-xl flex-shrink-0">{emoji}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-hud-text truncate">{name}</p>
              <HudBadge
                variant={isActive ? "online" : "offline"}
                dot={isActive}
              >
                {isActive ? "Active" : "Inactive"}
              </HudBadge>
            </div>
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

        {/* Right side: toggle for active skills, Add Skill button for inactive */}
        <div className="flex-shrink-0">
          {isActive ? (
            <button
              onClick={() => onToggle(false)}
              disabled={isToggling}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-hud-error/15 text-hud-error border border-hud-error/25 rounded-lg hover:bg-hud-error/25 transition-colors disabled:opacity-50"
            >
              <Ban size={12} />
              Disable
            </button>
          ) : isDisabled ? (
            <button
              onClick={handleAddSkill}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors"
            >
              <Plus size={12} />
              Add Skill
            </button>
          ) : (
            <button
              onClick={handleAddSkill}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-hud-amber/20 text-hud-amber border border-hud-amber/30 rounded-lg hover:bg-hud-amber/30 transition-colors"
            >
              <Plus size={12} />
              Add Skill
            </button>
          )}
        </div>
      </div>

      {/* Credential input (when skill requires env vars) */}
      {requiresEnv && isInactive && (
        <div className="mt-3 pt-2 border-t border-hud-border">
          <button
            onClick={() => setShowCredentials(!showCredentials)}
            className="flex items-center gap-1 text-[11px] text-hud-accent hover:text-hud-accent/80 transition-colors"
          >
            {showCredentials ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Key size={11} />
            Configure credentials
          </button>
          {showCredentials && (
            <div className="mt-2 space-y-2">
              <div>
                <label className="text-[10px] text-hud-text-muted uppercase tracking-wider">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  placeholder="sk-..."
                  className="w-full mt-0.5 bg-hud-bg/50 border border-hud-border rounded px-2 py-1 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50"
                />
              </div>

              {(skill.requires?.env || missingReqs?.env || []).map(
                (envVar: string) => (
                  <div key={envVar}>
                    <label className="text-[10px] text-hud-text-muted uppercase tracking-wider">
                      {envVar}
                    </label>
                    <input
                      type="password"
                      value={envValues[envVar] || ""}
                      onChange={(e) =>
                        setEnvValues((prev) => ({
                          ...prev,
                          [envVar]: e.target.value,
                        }))
                      }
                      placeholder={`Value for ${envVar}`}
                      className="w-full mt-0.5 bg-hud-bg/50 border border-hud-border rounded px-2 py-1 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50"
                    />
                  </div>
                )
              )}

              {saveError && (
                <p className="text-[10px] text-hud-error">{saveError}</p>
              )}

              <button
                onClick={handleSaveCredentials}
                disabled={saving}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded hover:bg-hud-accent/30 transition-colors disabled:opacity-50"
              >
                <Save size={11} />
                {saving ? "Saving..." : "Save Credentials"}
              </button>
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
