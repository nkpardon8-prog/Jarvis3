"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { ActionContext } from "@/lib/skill-prompts";

/** Stage messages keyed by action context. Each string appears at its index * STAGE_INTERVAL_MS. */
const STAGE_MESSAGES: Record<string, string[]> = {
  "add-premade-skill": [
    "Reviewing skill link and validating source.",
    "Extracting skill slug and install metadata.",
    "Checking available versions and compatibility.",
    "Preparing install plan for your workspace.",
    "Confirming whether to review SKILL.md first.",
    "Staging install command and safety checks.",
    "Running installation and dependency resolution.",
    "Verifying files and expected skill structure.",
    "Checking required env vars, binaries, and config.",
    "Preparing guided setup steps for missing requirements.",
    "Enabling skill and validating active status.",
    "Refreshing skills state in Jarvis + gateway.",
    "Finalizing setup summary and next actions.",
    "Still working safely; longer installs can take ~1\u20132 minutes.",
  ],
  "enable-inactive-skill": [
    "Inspecting current skill status and reason for inactivity.",
    "Checking missing requirements (env, binaries, config).",
    "Mapping required setup steps for this skill.",
    "Preparing credential/config prompts for you.",
    "Applying updates based on your confirmations.",
    "Re-checking skill eligibility after updates.",
    "Enabling skill and validating runtime readiness.",
    "Syncing updated state to Jarvis.",
    "Final verification in progress; ensuring stable activation.",
  ],
  "build-custom-skill": [
    "Understanding your skill goal and trigger phrases.",
    "Defining scope, boundaries, and success criteria.",
    "Planning skill structure (SKILL.md, scripts, references).",
    "Drafting instruction flow and usage patterns.",
    "Adding required resources and reusable templates.",
    "Validating naming, metadata, and trigger clarity.",
    "Building final skill package layout.",
    "Running quality checks for ambiguity/conflicts.",
    "Preparing installation/registration steps.",
    "Installing and validating skill visibility.",
    "Verifying active state and usage readiness.",
    "Polishing final instructions and handoff summary.",
  ],
  "configure-skill-credentials": [
    "Identifying which credentials this skill requires.",
    "Validating required key names and formats.",
    "Preparing secure config update path.",
    "Applying credential updates safely.",
    "Re-checking masked credential presence (not values).",
    "Testing eligibility with updated config.",
    "Enabling skill (if ready) and re-validating.",
    "Final sync and verification in progress.",
  ],
  "create-custom-integration": [
    "Validating integration name, base URL, and auth mode.",
    "Preparing auth/env mapping for this integration.",
    "Generating skill spec and operational instructions.",
    "Building integration metadata and config payload.",
    "Writing/patching integration config safely.",
    "Creating skill files and registration entry.",
    "Verifying install/discovery in skills status.",
    "Checking eligibility and unresolved requirements.",
    "Finalizing integration summary and next setup steps.",
  ],
  generic: [
    "Processing your request.",
    "Building an execution plan.",
    "Gathering required context.",
    "Applying changes safely.",
    "Validating results.",
    "Running final checks.",
    "Still working; thanks for waiting. This can take up to a couple of minutes.",
  ],
};

const STAGE_INTERVAL_MS = 8000;
const SHOW_DELAY = 80;

interface ThinkingIndicatorProps {
  actionContext?: ActionContext | null;
}

export function ThinkingIndicator({ actionContext }: ThinkingIndicatorProps) {
  const stages = useMemo(
    () => STAGE_MESSAGES[actionContext || "generic"] || STAGE_MESSAGES.generic,
    [actionContext]
  );

  const [stageIndex, setStageIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const startTime = useRef(Date.now());

  // Delay showing the full indicator to avoid flicker on fast responses
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY);
    return () => clearTimeout(timer);
  }, []);

  // Advance stage by elapsed time (8s intervals), hold last message
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsedMs = Date.now() - startTime.current;
      const newIndex = Math.min(
        Math.floor(elapsedMs / STAGE_INTERVAL_MS),
        stages.length - 1
      );
      setStageIndex((prev) => {
        if (newIndex !== prev) {
          setAnimKey((k) => k + 1);
        }
        return newIndex;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [stages.length]);

  // Elapsed time counter
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!visible) {
    return <div className="h-16" />;
  }

  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="thinking-card max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-sm bg-[#0d1a2a] border border-hud-accent/15 relative overflow-hidden">
        {/* Shimmer sweep */}
        <div className="thinking-shimmer absolute inset-0 pointer-events-none" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          {/* Animated rings */}
          <div className="relative w-8 h-8 flex-shrink-0" aria-hidden="true">
            <div className="thinking-ring-outer absolute inset-0 rounded-full border-2 border-hud-accent/25" />
            <div className="thinking-ring-inner absolute inset-1 rounded-full border-2 border-hud-accent/40" />
            <div className="absolute inset-2.5 rounded-full bg-hud-accent/15 thinking-pulse" />
          </div>

          {/* Status text with transition animation */}
          <div className="flex-1 min-w-0">
            <p key={animKey} className="text-sm text-hud-text-secondary thinking-stage-fade">
              {stages[stageIndex]}
            </p>
          </div>

          {/* Elapsed time */}
          {elapsed > 0 && (
            <span className="text-[10px] text-hud-text-muted tabular-nums flex-shrink-0">
              ~{elapsed}s
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
