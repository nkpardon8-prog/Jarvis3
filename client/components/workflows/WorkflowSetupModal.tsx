"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { WorkflowTemplateCard } from "./WorkflowTemplateCard";
import { SchedulePicker, type ScheduleOutput } from "./SchedulePicker";
import {
  WORKFLOW_TEMPLATES,
  describeSchedule,
  type WorkflowTemplate,
} from "./workflowTemplates";
import {
  X,
  ArrowLeft,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Zap,
  Key,
  Wand2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface WorkflowSetupModalProps {
  onClose: () => void;
  preselectedTemplateId?: string;
  onSwitchToCustom?: () => void;
}

type Step = "select" | "configure" | "progress";

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

export function WorkflowSetupModal({
  onClose,
  preselectedTemplateId,
  onSwitchToCustom,
}: WorkflowSetupModalProps) {
  const queryClient = useQueryClient();

  // Step state
  const [step, setStep] = useState<Step>(
    preselectedTemplateId ? "configure" : "select"
  );
  const [selectedTemplate, setSelectedTemplate] =
    useState<WorkflowTemplate | null>(
      preselectedTemplateId
        ? WORKFLOW_TEMPLATES.find((t) => t.id === preselectedTemplateId) || null
        : null
    );

  // Form state
  const [workflowName, setWorkflowName] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});
  const [schedule, setSchedule] = useState<ScheduleOutput>({ kind: "cron", expr: "0 9 * * *" });
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  });
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [customTrigger, setCustomTrigger] = useState("");

  // Progress state
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [setupDone, setSetupDone] = useState(false);
  const [setupError, setSetupError] = useState("");

  // Reset form when template changes
  useEffect(() => {
    if (selectedTemplate) {
      setWorkflowName(selectedTemplate.name);
      setCredentials({});
      setShowCredentials({});
      // Initialize schedule from template default
      const ds = selectedTemplate.defaultSchedule;
      if (ds.kind === "every" && ds.intervalMs) {
        setSchedule({ kind: "every", intervalMs: ds.intervalMs });
      } else if (ds.kind === "cron" && ds.expr) {
        setSchedule({ kind: "cron", expr: ds.expr, tz: timezone });
      }
      setAdditionalInstructions("");
      setCustomTrigger("");
    }
  }, [selectedTemplate?.id]);

  // Build the schedule to send to the API
  function getScheduleForApi(): { kind: string; expr?: string; intervalMs?: number; tz?: string } {
    return schedule;
  }

  // Validation
  function isValid(): boolean {
    if (!selectedTemplate) return false;
    if (!workflowName.trim()) return false;

    // Check credentials
    for (const field of selectedTemplate.credentialFields) {
      if (!credentials[field.envVar]?.trim()) return false;
    }

    // Check schedule
    if (schedule.kind === "cron" && !schedule.expr) return false;
    if (schedule.kind === "every" && !schedule.intervalMs) return false;

    return true;
  }

  // Create workflow mutation
  const createWorkflow = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>("/workflows", {
        templateId: selectedTemplate!.id,
        name: workflowName.trim(),
        credentials,
        schedule: getScheduleForApi(),
        additionalInstructions: additionalInstructions.trim(),
        customTrigger: customTrigger.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error || "Failed to create workflow");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  // Handle activation
  async function handleActivate() {
    if (!selectedTemplate || !isValid()) return;

    setStep("progress");
    setSetupDone(false);
    setSetupError("");

    const steps: ProgressStep[] = [
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

    // Step 1: Skills
    updateStep(0, "active");
    await new Promise((r) => setTimeout(r, 600));
    updateStep(0, "done");

    // Step 2: Credentials
    updateStep(1, "active");
    await new Promise((r) => setTimeout(r, 400));
    updateStep(1, "done");

    // Step 3: Create
    updateStep(2, "active");

    try {
      await createWorkflow.mutateAsync();
      updateStep(2, "done");

      // Step 4: Verify
      updateStep(3, "active");
      await new Promise((r) => setTimeout(r, 800));
      updateStep(3, "done");

      setSetupDone(true);
    } catch (err: any) {
      updateStep(2, "error");
      setSetupError(err.message || "Failed to activate workflow");
    }
  }

  // Template selection handler
  function handleSelectTemplate(template: WorkflowTemplate) {
    setSelectedTemplate(template);
    setStep("configure");
  }

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
              {step === "configure" && !preselectedTemplateId && (
                <button
                  onClick={() => setStep("select")}
                  className="p-1 rounded-lg text-hud-text-muted hover:text-hud-text hover:bg-white/5 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <Zap size={18} className="text-hud-accent" />
              <h2 className="text-base font-semibold text-hud-text">
                {step === "select"
                  ? "Add Workflow"
                  : step === "configure"
                    ? selectedTemplate?.name || "Configure Workflow"
                    : "Setting Up Workflow"}
              </h2>
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
            {/* ─── Step 1: Template Selection ─── */}
            {step === "select" && (
              <div className="space-y-3">
                <p className="text-sm text-hud-text-muted mb-4">
                  Choose a pre-built workflow to get started, or build your own.
                </p>
                {WORKFLOW_TEMPLATES.map((template) => (
                  <WorkflowTemplateCard
                    key={template.id}
                    template={template}
                    onClick={() => handleSelectTemplate(template)}
                  />
                ))}

                {/* Build Custom divider + card */}
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex-1 h-px bg-hud-border" />
                  <span className="text-[10px] text-hud-text-muted uppercase tracking-wider">
                    or
                  </span>
                  <div className="flex-1 h-px bg-hud-border" />
                </div>

                <button
                  onClick={() => {
                    if (onSwitchToCustom) {
                      onClose();
                      onSwitchToCustom();
                    }
                  }}
                  className="w-full text-left"
                >
                  <GlassPanel className="hover:border-hud-amber/30 hover:scale-[1.01] transition-all duration-200 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-lg bg-hud-amber/15 flex-shrink-0">
                        <Wand2 size={20} className="text-hud-amber" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-hud-text">
                            Build Custom Workflow
                          </h4>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-hud-amber/15 text-hud-amber border border-hud-amber/30 whitespace-nowrap">
                            AI-Powered
                          </span>
                        </div>
                        <p className="text-[11px] text-hud-text-muted line-clamp-2">
                          Describe what you want in plain English. The system will
                          generate the agent prompt, find or build the needed skills,
                          and set up credentials automatically.
                        </p>
                      </div>
                    </div>
                  </GlassPanel>
                </button>
              </div>
            )}

            {/* ─── Step 2: Configuration Form ─── */}
            {step === "configure" && selectedTemplate && (
              <div className="space-y-5">
                {/* Workflow Name */}
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1.5 uppercase tracking-wider">
                    Workflow Name
                  </label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="Enter a name for this workflow"
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-sm text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
                  />
                </div>

                {/* OAuth Status */}
                {selectedTemplate.oauthProviders &&
                  selectedTemplate.oauthProviders.length > 0 && (
                    <GlassPanel className="border-hud-success/20">
                      <div className="flex items-center gap-2">
                        <Check size={14} className="text-hud-success" />
                        <p className="text-xs text-hud-text">
                          This workflow uses{" "}
                          <span className="text-hud-success font-medium">
                            {selectedTemplate.oauthProviders.join(", ")} OAuth
                          </span>{" "}
                          — configure it on the{" "}
                          <a
                            href="/dashboard/connections"
                            className="text-hud-accent underline"
                          >
                            Connections page
                          </a>{" "}
                          if not already connected.
                        </p>
                      </div>
                    </GlassPanel>
                  )}

                {/* Credentials */}
                {selectedTemplate.credentialFields.length > 0 && (
                  <div>
                    <label className="flex items-center gap-1.5 text-[10px] text-hud-text-muted mb-2 uppercase tracking-wider">
                      <Key size={10} />
                      Credentials
                    </label>
                    <div className="space-y-3">
                      {selectedTemplate.credentialFields.map((field) => (
                        <div key={field.envVar}>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-hud-text-secondary">
                              {field.label}
                            </label>
                            {field.helpUrl && (
                              <a
                                href={field.helpUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-hud-accent hover:underline"
                              >
                                Get key
                              </a>
                            )}
                          </div>
                          <div className="relative">
                            <input
                              type={showCredentials[field.envVar] ? "text" : "password"}
                              value={credentials[field.envVar] || ""}
                              onChange={(e) =>
                                setCredentials((prev) => ({
                                  ...prev,
                                  [field.envVar]: e.target.value,
                                }))
                              }
                              placeholder={field.placeholder}
                              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 pr-10 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors font-mono"
                            />
                            <button
                              onClick={() =>
                                setShowCredentials((prev) => ({
                                  ...prev,
                                  [field.envVar]: !prev[field.envVar],
                                }))
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-secondary transition-colors"
                            >
                              {showCredentials[field.envVar] ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Schedule — visual calendar-style picker */}
                <SchedulePicker
                  value={schedule}
                  onChange={setSchedule}
                  timezone={timezone}
                  onTimezoneChange={setTimezone}
                />

                {/* Additional Instructions */}
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1.5 uppercase tracking-wider">
                    Additional Instructions
                  </label>
                  <textarea
                    value={additionalInstructions}
                    onChange={(e) => setAdditionalInstructions(e.target.value)}
                    placeholder={getInstructionsPlaceholder(selectedTemplate.id)}
                    rows={4}
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
                    placeholder="Describe an alternative trigger condition, e.g., 'When a new email arrives with subject containing URGENT'"
                    rows={2}
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors resize-y"
                  />
                  <p className="text-[10px] text-hud-text-muted/60 mt-1 px-1">
                    The agent will be given this trigger context alongside the
                    regular schedule.
                  </p>
                </div>

                {/* Activate Button */}
                <div className="flex items-center justify-end pt-2">
                  <button
                    onClick={handleActivate}
                    disabled={!isValid()}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Zap size={14} />
                    Activate Workflow
                  </button>
                </div>
              </div>
            )}

            {/* ─── Step 3: Progress ─── */}
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
                      {ps.status === "active" && (
                        <LoadingSpinner size="sm" />
                      )}
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

                {/* Success state */}
                {setupDone && (
                  <GlassPanel className="border-hud-success/30">
                    <div className="flex items-center gap-3 mb-3">
                      <CheckCircle2 size={20} className="text-hud-success" />
                      <h3 className="text-sm font-semibold text-hud-success">
                        Workflow Activated
                      </h3>
                    </div>
                    <p className="text-xs text-hud-text-muted mb-4">
                      <strong className="text-hud-text">{workflowName}</strong>{" "}
                      is now running on schedule:{" "}
                      <span className="text-hud-accent">
                        {describeSchedule(schedule)}
                      </span>
                    </p>
                    <button
                      onClick={onClose}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors"
                    >
                      <Check size={12} />
                      Done
                    </button>
                  </GlassPanel>
                )}

                {/* Error state */}
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
                          setStep("configure");
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

// ─── Helpers ────────────────────────────────────────────

function getInstructionsPlaceholder(templateId: string): string {
  switch (templateId) {
    case "github-triage":
      return "e.g., Focus on repos: my-org/api, my-org/frontend. Prioritize security-related issues. Use labels: bug, feature, urgent.";
    case "google-workspace-assistant":
      return "e.g., Ignore newsletters and promotional emails. Prioritize emails from my team leads. Block off lunch time 12-1 PM.";
    case "notion-curator":
      return "e.g., Focus on the Engineering and Product databases. Tag all meeting notes with attendee names. Link related project pages.";
    case "social-listening":
      return "e.g., Monitor mentions of 'Acme Corp' and 'acme.io'. Focus on Twitter, Reddit, and Hacker News. Track competitor mentions too.";
    case "smart-home-ops":
      return "e.g., Turn off all lights at midnight. Set thermostat to 68F during work hours. Alert me if garage door is open after 10 PM.";
    default:
      return "Add any specific instructions for this workflow...";
  }
}
