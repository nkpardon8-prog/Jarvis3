"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  buildPremadeSkillPrompt,
  buildCustomSkillPrompt,
  storeAutoPrompt,
} from "@/lib/skill-prompts";
import {
  ArrowLeft,
  Package,
  ExternalLink,
  Link as LinkIcon,
  Plus,
  Wrench,
  AlertCircle,
} from "lucide-react";

interface PremadeSkillsBrowserProps {
  onClose: () => void;
}

const ALLOWED_HOSTS = ["clawhub.ai", "clawhub.com", "www.clawhub.ai", "www.clawhub.com"];

/** Quick client-side check before hitting the backend */
function isValidClawHubUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return ALLOWED_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

export function PremadeSkillsBrowser({ onClose }: PremadeSkillsBrowserProps) {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");

  const urlValid = urlInput.trim().length > 0 && isValidClawHubUrl(urlInput);

  function handleBuildCustomSkill() {
    const prompt = buildCustomSkillPrompt();
    storeAutoPrompt(prompt);
    router.push("/dashboard/chat");
  }

  async function handleAddSkill() {
    if (!urlValid) return;
    setResolving(true);
    setError("");

    try {
      const res = await api.post<{ slug: string; host: string }>(
        "/skills/resolve-url",
        { url: urlInput.trim() }
      );
      if (!res.ok || !res.data?.slug) {
        setError(res.error || "Could not extract skill slug from URL");
        return;
      }

      const prompt = buildPremadeSkillPrompt(res.data.slug);
      storeAutoPrompt(prompt);
      router.push("/dashboard/chat");
    } catch (err: any) {
      setError(err.message || "Failed to resolve URL");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-text hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Package size={18} className="text-hud-accent" />
          <h3 className="text-lg font-semibold text-hud-text">
            Add a Skill
          </h3>
        </div>
      </div>

      {/* Build Custom Skill button */}
      <button
        onClick={handleBuildCustomSkill}
        className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-hud-accent/10 text-hud-accent border border-hud-accent/20 rounded-lg hover:bg-hud-accent/20 transition-colors"
      >
        <Wrench size={14} />
        Build a Custom Skill
      </button>

      {/* Instructions */}
      <GlassPanel>
        <div className="space-y-3">
          <p className="text-sm text-hud-text">
            Browse skills on the official ClawHub registry, copy a skill page URL, and paste it below to install.
          </p>

          <a
            href="https://clawhub.ai/skills"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-hud-accent/15 text-hud-accent border border-hud-accent/25 rounded-lg hover:bg-hud-accent/25 transition-colors"
          >
            <ExternalLink size={12} />
            Open ClawHub
          </a>
        </div>
      </GlassPanel>

      {/* URL input */}
      <GlassPanel>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LinkIcon size={14} className="text-hud-accent" />
            <label className="text-sm font-medium text-hud-text">
              Paste Skill URL
            </label>
          </div>

          <div className="relative">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setError("");
              }}
              placeholder="https://clawhub.ai/your-skill-slug"
              className="w-full bg-hud-bg/50 border border-hud-border rounded-lg px-3 py-2.5 text-sm text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50"
            />
          </div>

          {urlInput.trim() && !urlValid && (
            <p className="flex items-center gap-1 text-[11px] text-hud-amber">
              <AlertCircle size={11} />
              URL must be from clawhub.ai or clawhub.com
            </p>
          )}

          {error && (
            <p className="flex items-center gap-1 text-[11px] text-hud-error">
              <AlertCircle size={11} />
              {error}
            </p>
          )}

          {urlValid && (
            <button
              onClick={handleAddSkill}
              disabled={resolving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors disabled:opacity-50"
            >
              <Plus size={14} />
              {resolving ? "Resolving..." : "Add Skill"}
            </button>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
