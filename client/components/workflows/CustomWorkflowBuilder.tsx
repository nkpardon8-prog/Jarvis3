"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SchedulePicker, type ScheduleOutput } from "./SchedulePicker";
import { describeSchedule } from "./workflowTemplates";
import {
  X,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Wand2,
  Key,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Zap,
  Puzzle,
  ExternalLink,
  Clock,
} from "lucide-react";

interface CustomWorkflowBuilderProps {
  onClose: () => void;
}

interface CredentialEntry {
  id: string;
  envVar: string;
  label: string;
  value: string;
}

interface Suggestion {
  type: string;
  envVar: string;
  label: string;
  description: string;
  helpUrl?: string;
}

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

type Step = "describe" | "credentials" | "schedule" | "progress";

const CUSTOM_SCHEDULE_PRESETS: { label: string; value: ScheduleOutput }[] = [
  { label: "Every 15 min", value: { kind: "every", intervalMs: 900000 } },
  { label: "Every 30 min", value: { kind: "every", intervalMs: 1800000 } },
  { label: "Every hour", value: { kind: "every", intervalMs: 3600000 } },
  { label: "Daily 9 AM", value: { kind: "cron", expr: "0 9 * * *" } },
  { label: "Weekdays 9 AM", value: { kind: "cron", expr: "0 9 * * 1-5" } },
  { label: "Twice daily (9 AM + 5 PM)", value: { kind: "cron", expr: "0 9,17 * * *" } },
  { label: "Daily 10 PM", value: { kind: "cron", expr: "0 22 * * *" } },
  { label: "Every 4 hours", value: { kind: "every", intervalMs: 14400000 } },
  { label: "Weekly Monday 9 AM", value: { kind: "cron", expr: "0 9 * * 1" } },
];

export function CustomWorkflowBuilder({ onClose }: CustomWorkflowBuilderProps) {
  const queryClient = useQueryClient();

  // Step state
  const [step, setStep] = useState<Step>("describe");

  // Step 1: Describe
  const [workflowName, setWorkflowName] = useState("");
  const [description, setDescription] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [customTrigger, setCustomTrigger] = useState("");

  // Step 2: Credentials
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsExplanation, setSuggestionsExplanation] = useState("");
  const [oauthSuggestions, setOauthSuggestions] = useState<string[]>([]);

  // Step 3: Schedule
  const [schedule, setSchedule] = useState<ScheduleOutput>({
    kind: "cron",
    expr: "0 9 * * *",
  });
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  });

  // Step 4: Progress
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [setupDone, setSetupDone] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [resultData, setResultData] = useState<any>(null);

  // Add credential entry
  function addCredential() {
    setCredentials((prev) => [
      ...prev,
      {
        id: `cred-${Date.now()}`,
        envVar: "",
        label: "",
        value: "",
      },
    ]);
  }

  function removeCredential(id: string) {
    setCredentials((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCredential(
    id: string,
    field: keyof CredentialEntry,
    value: string
  ) {
    setCredentials((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  }

  // Apply a suggestion as a credential entry
  function applySuggestion(suggestion: Suggestion) {
    const exists = credentials.some((c) => c.envVar === suggestion.envVar);
    if (exists) return;
    setCredentials((prev) => [
      ...prev,
      {
        id: `cred-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        envVar: suggestion.envVar,
        label: suggestion.label,
        value: "",
      },
    ]);
  }

  // Fetch suggestions when entering credentials step with no creds
  async function fetchSuggestions() {
    if (!description.trim()) return;
    setSuggestionsLoading(true);
    try {
      const res = await api.post<any>("/workflows/custom/suggest", {
        name: workflowName.trim(),
        description: description.trim(),
      });
      if (res.ok && res.data) {
        setSuggestions(res.data.suggestions || []);
        setSuggestionsExplanation(res.data.explanation || "");
        setOauthSuggestions(res.data.oauthSuggestions || []);
      }
    } catch {
      // Non-critical
    } finally {
      setSuggestionsLoading(false);
    }
  }

  // Validation per step
  function canProceedFrom(s: Step): boolean {
    if (s === "describe") {
      return workflowName.trim().length >= 2 && description.trim().length >= 10;
    }
    if (s === "credentials") {
      // Credentials are optional but if added, envVar and value must be filled
      for (const cred of credentials) {
        if (cred.envVar && !cred.value.trim()) return false;
      }
      return true;
    }
    if (s === "schedule") {
      if (schedule.kind === "cron" && !schedule.expr) return false;
      if (schedule.kind === "every" && !schedule.intervalMs) return false;
      return true;
    }
    return true;
  }

  // Navigate
  function goNext() {
    if (step === "describe") {
      setStep("credentials");
      // Auto-fetch suggestions if no credentials added yet
      if (credentials.length === 0) {
        fetchSuggestions();
      }
    } else if (step === "credentials") {
      setStep("schedule");
    } else if (step === "schedule") {
      handleActivate();
    }
  }

  function goBack() {
    if (step === "credentials") setStep("describe");
    else if (step === "schedule") setStep("credentials");
  }

  // Create workflow
  const createWorkflow = useMutation({
    mutationFn: async () => {
      // Filter out empty credentials
      const validCreds = credentials.filter(
        (c) => c.envVar.trim() && c.value.trim()
      );

      const res = await api.post<any>("/workflows/custom", {
        name: workflowName.trim(),
        description: description.trim(),
        schedule,
        credentials: validCreds.map((c) => ({
          envVar: c.envVar.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
          label: c.label.trim() || c.envVar.trim(),
          value: c.value.trim(),
        })),
        additionalInstructions: additionalInstructions.trim(),
        customTrigger: customTrigger.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error || "Failed to create workflow");
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      setResultData(data);
    },
  });

  async function handleActivate() {
    setStep("progress");
    setSetupDone(false);
    setSetupError("");

    const steps: ProgressStep[] = [
      { label: "Analyzing workflow requirements...", status: "pending" },
      { label: "Generating agent prompt...", status: "pending" },
      { label: "Installing skills...", status: "pending" },
      { label: "Storing credentials...", status: "pending" },
      { label: "Creating scheduled job...", status: "pending" },
      { label: "Verifying workflow...", status: "pending" },
    ];
    setProgressSteps(steps);

    const updateStep = (idx: number, status: ProgressStep["status"]) => {
      setProgressSteps((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, status } : s))
      );
    };

    // Animated progress — the actual work happens in one POST call,
    // so we animate steps as the mutation runs
    updateStep(0, "active");
    await new Promise((r) => setTimeout(r, 500));
    updateStep(0, "done");

    updateStep(1, "active");

    try {
      // This single call does everything: analyze, install skills, store creds, create cron
      await createWorkflow.mutateAsync();

      updateStep(1, "done");

      // Mark remaining steps as done
      updateStep(2, "active");
      await new Promise((r) => setTimeout(r, 400));
      updateStep(2, "done");

      updateStep(3, "active");
      await new Promise((r) => setTimeout(r, 300));
      updateStep(3, "done");

      updateStep(4, "active");
      await new Promise((r) => setTimeout(r, 400));
      updateStep(4, "done");

      updateStep(5, "active");
      await new Promise((r) => setTimeout(r, 300));
      updateStep(5, "done");

      setSetupDone(true);
    } catch (err: any) {
      // Find first active step and mark it as error
      setProgressSteps((prev) => {
        const activeIdx = prev.findIndex((s) => s.status === "active");
        return prev.map((s, i) =>
          i === (activeIdx >= 0 ? activeIdx : 1) ? { ...s, status: "error" } : s
        );
      });
      setSetupError(err.message || "Failed to create workflow");
    }
  }

  const stepLabels: Record<Step, string> = {
    describe: "Describe Your Workflow",
    credentials: "API Connections",
    schedule: "Schedule",
    progress: "Setting Up...",
  };

  const stepNumber = { describe: 1, credentials: 2, schedule: 3, progress: 4 };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && step !== "progress") onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-hud-bg border border-hud-border rounded-2xl shadow-2xl"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-hud-border bg-hud-bg/95 backdrop-blur-sm rounded-t-2xl">
            <div className="flex items-center gap-3">
              {step !== "describe" && step !== "progress" && (
                <button
                  onClick={goBack}
                  className="p-1 rounded-lg text-hud-text-muted hover:text-hud-text hover:bg-white/5 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <Wand2 size={18} className="text-hud-amber" />
              <h2 className="text-base font-semibold text-hud-text">
                {stepLabels[step]}
              </h2>
              {step !== "progress" && (
                <span className="text-[10px] text-hud-text-muted bg-white/5 px-2 py-0.5 rounded-full">
                  Step {stepNumber[step]}/3
                </span>
              )}
            </div>
            {step !== "progress" && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-text hover:bg-white/5 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="px-6 py-5">
            {/* ─── Step 1: Describe ─── */}
            {step === "describe" && (
              <div className="space-y-5">
                <p className="text-xs text-hud-text-muted">
                  Describe what you want your workflow to do. The system will
                  automatically generate the agent prompt, identify needed skills,
                  and build any custom skills required.
                </p>

                {/* Name */}
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1.5 uppercase tracking-wider">
                    Workflow Name
                  </label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="e.g., Daily News Digest, Invoice Processor, Lead Qualifier"
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-sm text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1.5 uppercase tracking-wider">
                    What should this workflow do?
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the automation in plain English. Be specific about what data to read, what actions to take, and what output to produce.&#10;&#10;Example: Every morning, check my Gmail for new invoices, extract the amounts and vendor names, log them to a Google Sheet, and send me a Slack summary."
                    rows={6}
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-sm text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors resize-y"
                  />
                  <p className="text-[10px] text-hud-text-muted/60 mt-1 px-1">
                    The more detail you provide, the better the generated automation
                    will be.
                  </p>
                </div>

                {/* Additional Instructions (collapsed by default) */}
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1.5 uppercase tracking-wider">
                    Additional Instructions (Optional)
                  </label>
                  <textarea
                    value={additionalInstructions}
                    onChange={(e) => setAdditionalInstructions(e.target.value)}
                    placeholder="Any specific constraints, preferences, or edge cases..."
                    rows={2}
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors resize-y"
                  />
                </div>

                {/* Custom Trigger */}
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1.5 uppercase tracking-wider">
                    Custom Trigger (Optional)
                  </label>
                  <textarea
                    value={customTrigger}
                    onChange={(e) => setCustomTrigger(e.target.value)}
                    placeholder="e.g., When a new email arrives with 'URGENT' in the subject"
                    rows={2}
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors resize-y"
                  />
                </div>

                {/* Next */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={goNext}
                    disabled={!canProceedFrom("describe")}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next: Connections
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* ─── Step 2: Credentials ─── */}
            {step === "credentials" && (
              <div className="space-y-5">
                <p className="text-xs text-hud-text-muted">
                  Add any API keys, tokens, or webhook URLs your workflow needs.
                  If you&apos;re unsure, skip this step — the system will suggest
                  what connections are needed.
                </p>

                {/* Suggestions from AI */}
                {suggestionsLoading && (
                  <GlassPanel className="border-hud-amber/20">
                    <div className="flex items-center gap-3">
                      <LoadingSpinner size="sm" />
                      <p className="text-xs text-hud-text-muted">
                        Analyzing your workflow for recommended connections...
                      </p>
                    </div>
                  </GlassPanel>
                )}

                {!suggestionsLoading &&
                  suggestions.length > 0 &&
                  credentials.length === 0 && (
                    <GlassPanel className="border-hud-amber/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb size={14} className="text-hud-amber" />
                        <h4 className="text-xs font-semibold text-hud-amber">
                          Recommended Connections
                        </h4>
                      </div>
                      {suggestionsExplanation && (
                        <p className="text-[11px] text-hud-text-muted mb-3">
                          {suggestionsExplanation}
                        </p>
                      )}
                      <div className="space-y-2">
                        {suggestions.map((s, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/3 border border-hud-border"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-hud-text">
                                  {s.label}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-hud-amber/10 text-hud-amber border border-hud-amber/20">
                                  {s.type}
                                </span>
                              </div>
                              <p className="text-[10px] text-hud-text-muted mt-0.5">
                                {s.description}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {s.helpUrl && (
                                <a
                                  href={s.helpUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-hud-accent hover:underline flex items-center gap-0.5"
                                >
                                  Get key
                                  <ExternalLink size={8} />
                                </a>
                              )}
                              <button
                                onClick={() => applySuggestion(s)}
                                className="text-[10px] px-2 py-1 bg-hud-amber/15 text-hud-amber border border-hud-amber/25 rounded hover:bg-hud-amber/25 transition-colors"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {oauthSuggestions.length > 0 && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-hud-success/5 border border-hud-success/15">
                          <p className="text-[10px] text-hud-text-muted">
                            <span className="text-hud-success font-medium">
                              OAuth recommended:
                            </span>{" "}
                            {oauthSuggestions.join(", ")} — configure on the{" "}
                            <a
                              href="/dashboard/connections"
                              className="text-hud-accent underline"
                            >
                              Connections page
                            </a>
                          </p>
                        </div>
                      )}
                    </GlassPanel>
                  )}

                {/* User's credential entries */}
                {credentials.length > 0 && (
                  <div>
                    <label className="flex items-center gap-1.5 text-[10px] text-hud-text-muted mb-2 uppercase tracking-wider">
                      <Key size={10} />
                      Credentials
                    </label>
                    <div className="space-y-3">
                      {credentials.map((cred) => (
                        <div
                          key={cred.id}
                          className="p-3 rounded-lg bg-white/2 border border-hud-border space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            {/* Env var name */}
                            <div className="flex-1">
                              <label className="text-[9px] text-hud-text-muted mb-0.5 block">
                                Env Variable Name
                              </label>
                              <input
                                type="text"
                                value={cred.envVar}
                                onChange={(e) =>
                                  updateCredential(
                                    cred.id,
                                    "envVar",
                                    e.target.value
                                      .toUpperCase()
                                      .replace(/[^A-Z0-9_]/g, "_")
                                  )
                                }
                                placeholder="MY_API_KEY"
                                className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded px-2 py-1.5 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 font-mono"
                              />
                            </div>
                            {/* Label */}
                            <div className="flex-1">
                              <label className="text-[9px] text-hud-text-muted mb-0.5 block">
                                Label
                              </label>
                              <input
                                type="text"
                                value={cred.label}
                                onChange={(e) =>
                                  updateCredential(cred.id, "label", e.target.value)
                                }
                                placeholder="My API Key"
                                className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded px-2 py-1.5 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50"
                              />
                            </div>
                            {/* Delete */}
                            <button
                              onClick={() => removeCredential(cred.id)}
                              className="p-1.5 text-hud-text-muted hover:text-hud-error transition-colors mt-3"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          {/* Value */}
                          <div className="relative">
                            <input
                              type={showValues[cred.id] ? "text" : "password"}
                              value={cred.value}
                              onChange={(e) =>
                                updateCredential(cred.id, "value", e.target.value)
                              }
                              placeholder="Enter the key/token value"
                              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded px-2 py-1.5 pr-8 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 font-mono"
                            />
                            <button
                              onClick={() =>
                                setShowValues((prev) => ({
                                  ...prev,
                                  [cred.id]: !prev[cred.id],
                                }))
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-secondary transition-colors"
                            >
                              {showValues[cred.id] ? (
                                <EyeOff size={12} />
                              ) : (
                                <Eye size={12} />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add credential button */}
                <button
                  onClick={addCredential}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-hud-text-muted border border-dashed border-hud-border rounded-lg hover:border-hud-accent/30 hover:text-hud-accent transition-colors w-full justify-center"
                >
                  <Plus size={12} />
                  Add API Key / Token
                </button>

                {/* Nav */}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-[10px] text-hud-text-muted/60">
                    Credentials are stored securely in your OpenClaw instance.
                  </p>
                  <button
                    onClick={goNext}
                    disabled={!canProceedFrom("credentials")}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next: Schedule
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* ─── Step 3: Schedule ─── */}
            {step === "schedule" && (
              <div className="space-y-5">
                <p className="text-xs text-hud-text-muted">
                  Pick a quick preset or use the visual scheduler below to set
                  exactly when this workflow runs.
                </p>

                {/* Quick presets */}
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-2 uppercase tracking-wider">
                    Quick Presets
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {CUSTOM_SCHEDULE_PRESETS.map((preset) => {
                      const isActive =
                        preset.value.kind === schedule.kind &&
                        ((preset.value.kind === "every" &&
                          preset.value.intervalMs === schedule.intervalMs) ||
                          (preset.value.kind === "cron" &&
                            preset.value.expr === schedule.expr));
                      return (
                        <button
                          key={preset.label}
                          onClick={() => setSchedule(preset.value)}
                          className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                            isActive
                              ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30"
                              : "bg-hud-bg-secondary/30 text-hud-text-muted border border-hud-border hover:bg-white/5 hover:text-hud-text-secondary"
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-hud-border" />
                  <span className="text-[10px] text-hud-text-muted uppercase tracking-wider">
                    or customize
                  </span>
                  <div className="flex-1 h-px bg-hud-border" />
                </div>

                {/* Full visual calendar scheduler */}
                <SchedulePicker
                  value={schedule}
                  onChange={setSchedule}
                  timezone={timezone}
                  onTimezoneChange={setTimezone}
                />

                {/* Summary */}
                <GlassPanel>
                  <h4 className="text-[10px] text-hud-text-muted uppercase tracking-wider mb-2">
                    Workflow Summary
                  </h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Wand2 size={11} className="text-hud-amber" />
                      <span className="text-hud-text">{workflowName}</span>
                    </div>
                    <p className="text-[11px] text-hud-text-muted pl-5 line-clamp-2">
                      {description}
                    </p>
                    {credentials.filter((c) => c.envVar).length > 0 && (
                      <div className="flex items-center gap-2 pl-5">
                        <Key size={10} className="text-hud-text-muted" />
                        <span className="text-hud-text-muted">
                          {credentials.filter((c) => c.envVar).length} credential
                          {credentials.filter((c) => c.envVar).length !== 1
                            ? "s"
                            : ""}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pl-5">
                      <Clock size={10} className="text-hud-accent" />
                      <span className="text-hud-accent">
                        {describeSchedule(schedule)}
                      </span>
                    </div>
                  </div>
                </GlassPanel>

                {/* Activate */}
                <div className="flex items-center justify-end pt-2">
                  <button
                    onClick={goNext}
                    disabled={!canProceedFrom("schedule")}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Zap size={14} />
                    Build & Activate
                  </button>
                </div>
              </div>
            )}

            {/* ─── Step 4: Progress ─── */}
            {step === "progress" && (
              <div className="space-y-6 py-4">
                <div className="space-y-3">
                  {progressSteps.map((ps, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300 ${
                        ps.status === "active"
                          ? "bg-hud-accent/10 border border-hud-accent/20"
                          : ps.status === "done"
                            ? "bg-hud-success/5 border border-hud-success/10"
                            : ps.status === "error"
                              ? "bg-hud-error/5 border border-hud-error/10"
                              : "bg-white/2 border border-transparent"
                      }`}
                    >
                      {ps.status === "active" && <LoadingSpinner size="sm" />}
                      {ps.status === "done" && (
                        <CheckCircle2 size={16} className="text-hud-success" />
                      )}
                      {ps.status === "error" && (
                        <XCircle size={16} className="text-hud-error" />
                      )}
                      {ps.status === "pending" && (
                        <div className="w-4 h-4 rounded-full border border-hud-border" />
                      )}
                      <span
                        className={`text-sm ${
                          ps.status === "active"
                            ? "text-hud-accent"
                            : ps.status === "done"
                              ? "text-hud-success"
                              : ps.status === "error"
                                ? "text-hud-error"
                                : "text-hud-text-muted"
                        }`}
                      >
                        {ps.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Success */}
                {setupDone && (
                  <GlassPanel className="border-hud-success/30">
                    <div className="flex items-center gap-3 mb-3">
                      <CheckCircle2 size={20} className="text-hud-success" />
                      <h3 className="text-sm font-semibold text-hud-success">
                        Workflow Created & Activated
                      </h3>
                    </div>
                    <p className="text-xs text-hud-text-muted mb-3">
                      <strong className="text-hud-text">{workflowName}</strong> is
                      now running on schedule:{" "}
                      <span className="text-hud-accent">
                        {describeSchedule(schedule)}
                      </span>
                    </p>

                    {/* Show what was installed/created */}
                    {resultData?.skillsInstalled?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {resultData.skillsInstalled.map((skill: string) => (
                          <span
                            key={skill}
                            className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-hud-success/10 text-hud-success border border-hud-success/20"
                          >
                            <Puzzle size={8} />
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    {resultData?.suggestedConnections?.length > 0 && (
                      <div className="mb-3 px-3 py-2 rounded-lg bg-hud-amber/5 border border-hud-amber/15">
                        <p className="text-[10px] text-hud-amber font-medium mb-1">
                          Recommended for better results:
                        </p>
                        {resultData.suggestedConnections.map(
                          (s: string, i: number) => (
                            <p
                              key={i}
                              className="text-[10px] text-hud-text-muted"
                            >
                              {s}
                            </p>
                          )
                        )}
                      </div>
                    )}

                    <button
                      onClick={onClose}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors"
                    >
                      <Check size={12} />
                      Done
                    </button>
                  </GlassPanel>
                )}

                {/* Error */}
                {setupError && (
                  <GlassPanel className="border-hud-error/30">
                    <div className="flex items-center gap-3 mb-3">
                      <AlertCircle size={20} className="text-hud-error" />
                      <h3 className="text-sm font-semibold text-hud-error">
                        Setup Failed
                      </h3>
                    </div>
                    <p className="text-xs text-hud-text-muted mb-4">
                      {setupError}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setStep("describe");
                          setSetupError("");
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors"
                      >
                        <ArrowLeft size={12} />
                        Edit & Retry
                      </button>
                      <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium text-hud-text-muted border border-hud-border rounded-lg hover:bg-white/5 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </GlassPanel>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
