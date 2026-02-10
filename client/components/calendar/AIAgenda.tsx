"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { SchedulePreferences } from "./SchedulePreferences";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import {
  Sparkles,
  Settings,
  Loader2,
  Calendar,
  CheckSquare,
  Coffee,
  Utensils,
  Activity,
  Clock,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
} from "lucide-react";

interface AgendaItem {
  time: string;
  endTime: string;
  title: string;
  type: "event" | "task" | "break" | "lunch" | "activity";
  taskId?: string | null;
  notes?: string;
}

const typeStyles: Record<
  string,
  { bg: string; border: string; text: string; icon: typeof Calendar }
> = {
  event: {
    bg: "bg-hud-accent/10",
    border: "border-hud-accent/30",
    text: "text-hud-accent",
    icon: Calendar,
  },
  task: {
    bg: "bg-hud-amber/10",
    border: "border-hud-amber/30",
    text: "text-hud-amber",
    icon: CheckSquare,
  },
  break: {
    bg: "bg-hud-text-muted/10",
    border: "border-hud-border",
    text: "text-hud-text-muted",
    icon: Coffee,
  },
  lunch: {
    bg: "bg-hud-success/10",
    border: "border-hud-success/30",
    text: "text-hud-success",
    icon: Utensils,
  },
  activity: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-400",
    icon: Activity,
  },
};

function formatTimeRange(start: string, end: string): string {
  const format = (t: string) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m || 0).padStart(2, "0")} ${ampm}`;
  };
  return `${format(start)} - ${format(end)}`;
}

function getDurationMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function AIAgenda() {
  const [showPrefs, setShowPrefs] = useState(false);
  const [agenda, setAgenda] = useState<AgendaItem[] | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [agendaDate, setAgendaDate] = useState<string>("");
  const [stats, setStats] = useState<{ events: number; tasks: number }>({
    events: 0,
    tasks: 0,
  });
  const queryClient = useQueryClient();

  const buildAgenda = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>("/calendar/build-agenda");
      if (!res.ok) throw new Error(res.error || "Failed to build agenda");
      return res.data;
    },
    onSuccess: (data) => {
      if (data.agenda && Array.isArray(data.agenda)) {
        setAgenda(data.agenda);
        setRawText(null);
      } else if (data.raw) {
        setAgenda(null);
        setRawText(data.raw);
      } else {
        setAgenda(null);
        setRawText(typeof data === "string" ? data : JSON.stringify(data, null, 2));
      }
      setAgendaDate(data.date || "");
      setStats({ events: data.eventCount || 0, tasks: data.taskCount || 0 });
    },
  });

  const toggleTaskComplete = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.patch(`/todos/${taskId}`, { completed: true });
      if (!res.ok) throw new Error(res.error || "Failed");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  const handleToggleTask = (taskId: string) => {
    toggleTaskComplete.mutate(taskId);
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-hud-accent" />
          <h3 className="text-base font-semibold text-hud-text">AI Agenda</h3>
          {agendaDate && (
            <span className="text-xs text-hud-text-muted ml-2">{agendaDate}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrefs(!showPrefs)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showPrefs
                ? "bg-hud-amber/20 text-hud-amber border-hud-amber/30"
                : "bg-hud-surface text-hud-text-secondary border-hud-border hover:bg-hud-surface-hover"
            }`}
          >
            <Settings size={14} />
            Preferences
            {showPrefs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <HudButton
            size="sm"
            onClick={() => buildAgenda.mutate()}
            disabled={buildAgenda.isPending}
          >
            {buildAgenda.isPending ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" />
                Building...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} />
                Build Agenda
              </span>
            )}
          </HudButton>
        </div>
      </div>

      {/* Schedule Preferences (collapsible) */}
      {showPrefs && (
        <GlassPanel>
          <div className="flex items-center gap-2 mb-4">
            <Settings size={14} className="text-hud-amber" />
            <h4 className="text-sm font-semibold text-hud-text">
              Schedule Preferences
            </h4>
            <span className="text-[10px] text-hud-text-muted ml-auto">
              Auto-saves on change
            </span>
          </div>
          <SchedulePreferences />
        </GlassPanel>
      )}

      {/* Error */}
      {buildAgenda.error && (
        <GlassPanel>
          <div className="flex items-center gap-2 text-hud-error">
            <AlertCircle size={16} />
            <p className="text-sm">{(buildAgenda.error as Error).message}</p>
          </div>
          {((buildAgenda.error as Error).message?.includes("automation") ||
            (buildAgenda.error as Error).message?.includes("AutomationSettings") ||
            (buildAgenda.error as Error).message?.includes("No automation")) && (
            <p className="text-xs text-hud-text-muted mt-2">
              Configure your AI API key in{" "}
              <span className="text-hud-accent">Connections &rarr; Automation AI</span>{" "}
              to use this feature.
            </p>
          )}
        </GlassPanel>
      )}

      {/* Agenda timeline */}
      {agenda && agenda.length > 0 ? (
        <GlassPanel className="!p-0">
          {/* Stats bar */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-b border-hud-border text-xs text-hud-text-muted">
            <span className="flex items-center gap-1">
              <Calendar size={12} className="text-hud-accent" />
              {stats.events} events
            </span>
            <span className="flex items-center gap-1">
              <CheckSquare size={12} className="text-hud-amber" />
              {stats.tasks} tasks
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {agenda.length} items
            </span>
          </div>

          {/* Timeline */}
          <div className="divide-y divide-hud-border/50">
            {agenda.map((item, idx) => {
              const style = typeStyles[item.type] || typeStyles.break;
              const Icon = style.icon;
              const duration = getDurationMinutes(item.time, item.endTime);
              const isTaskCompleted = item.taskId && completedTasks.has(item.taskId);

              return (
                <div
                  key={idx}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    isTaskCompleted ? "opacity-50" : ""
                  }`}
                >
                  {/* Time */}
                  <div className="w-28 shrink-0 text-right">
                    <p className="text-xs font-mono text-hud-text-secondary">
                      {formatTimeRange(item.time, item.endTime)}
                    </p>
                    {duration > 0 && (
                      <p className="text-[10px] text-hud-text-muted">
                        {formatDuration(duration)}
                      </p>
                    )}
                  </div>

                  {/* Timeline dot */}
                  <div className="flex flex-col items-center pt-1">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${style.bg} border ${style.border}`}
                    />
                    {idx < agenda.length - 1 && (
                      <div className="w-px flex-1 bg-hud-border/50 mt-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={style.text} />
                      <p
                        className={`text-sm font-medium ${
                          isTaskCompleted
                            ? "line-through text-hud-text-muted"
                            : "text-hud-text"
                        }`}
                      >
                        {item.title}
                      </p>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded ${style.bg} ${style.text} uppercase tracking-wider`}
                      >
                        {item.type}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="text-xs text-hud-text-muted mt-0.5">
                        {item.notes}
                      </p>
                    )}

                    {item.taskId && !isTaskCompleted && (
                      <button
                        onClick={() => handleToggleTask(item.taskId!)}
                        className="flex items-center gap-1 mt-1.5 text-[10px] text-hud-success hover:text-hud-success/80 transition-colors"
                      >
                        <Check size={10} />
                        Mark Complete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      ) : rawText ? (
        <GlassPanel>
          <div className="text-sm text-hud-text-secondary">
            <MarkdownRenderer content={rawText} />
          </div>
        </GlassPanel>
      ) : !buildAgenda.isPending && !buildAgenda.error ? (
        <GlassPanel>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-hud-accent/10 mb-4">
              <Sparkles size={28} className="text-hud-accent" />
            </div>
            <h3 className="text-base font-semibold text-hud-text mb-2">
              Build Your Daily Agenda
            </h3>
            <p className="text-sm text-hud-text-muted mb-2 max-w-md mx-auto">
              AI will analyze your calendar events and tasks to create an optimized
              daily schedule. Calendar events stay fixed while tasks are intelligently
              slotted into available gaps.
            </p>
            <p className="text-xs text-hud-text-muted mb-6">
              Set your preferences first, then click{" "}
              <span className="text-hud-accent">Build Agenda</span> to generate your
              schedule.
            </p>
            <HudButton
              onClick={() => buildAgenda.mutate()}
              disabled={buildAgenda.isPending}
            >
              <Sparkles size={16} />
              Build My Agenda
            </HudButton>
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}
