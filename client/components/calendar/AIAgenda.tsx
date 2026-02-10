"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
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
  CheckCircle2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

interface AgendaItem {
  time: string;
  endTime: string;
  title: string;
  type: "event" | "task" | "break" | "lunch" | "activity";
  taskId?: string | null;
  notes?: string;
}

type AgendaDay = "today" | "tomorrow";

// ─── Sci-Fi Firework Particle Component ──────────────────

interface Particle {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  size: number;
  color: string;
  life: number;
  decay: number;
}

function SciFiFirework({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 48;
    const H = 48;
    canvas.width = W;
    canvas.height = H;

    const colors = ["#00d4ff", "#00ff88", "#f0a500", "#a78bfa", "#00d4ff"];
    const particles: Particle[] = [];
    let id = 0;

    // Create burst of particles from center
    for (let i = 0; i < 18; i++) {
      const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.3;
      particles.push({
        id: id++,
        x: W / 2,
        y: H / 2,
        angle,
        speed: 1.2 + Math.random() * 2.5,
        size: 1.2 + Math.random() * 1.8,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
        decay: 0.015 + Math.random() * 0.02,
      });
    }

    // Inner ring — smaller, faster-decaying sparks
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
      particles.push({
        id: id++,
        x: W / 2,
        y: H / 2,
        angle,
        speed: 0.5 + Math.random() * 1.2,
        size: 0.8 + Math.random() * 0.8,
        color: "#ffffff",
        life: 1.0,
        decay: 0.025 + Math.random() * 0.02,
      });
    }

    let frame = 0;
    const maxFrames = 55;

    function animate() {
      if (!ctx || !canvas) return;
      frame++;
      ctx.clearRect(0, 0, W, H);

      // Center flash on first frames
      if (frame < 6) {
        const flashAlpha = 1 - frame / 6;
        const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 12);
        grad.addColorStop(0, `rgba(0, 255, 136, ${flashAlpha * 0.8})`);
        grad.addColorStop(0.5, `rgba(0, 212, 255, ${flashAlpha * 0.3})`);
        grad.addColorStop(1, `rgba(0, 212, 255, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      let alive = false;
      for (const p of particles) {
        if (p.life <= 0) continue;
        alive = true;

        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;
        p.speed *= 0.96;
        p.life -= p.decay;

        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.size * 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();

        // Glow trail
        if (p.life > 0.3) {
          ctx.globalAlpha = p.life * 0.3;
          ctx.beginPath();
          ctx.arc(
            p.x - Math.cos(p.angle) * p.speed * 2,
            p.y - Math.sin(p.angle) * p.speed * 2,
            p.size * 0.5,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      if (!alive || frame > maxFrames) {
        onComplete();
        return;
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{ width: 48, height: 48 }}
    />
  );
}

// ─── Styles & Helpers ────────────────────────────────────

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

function getDateKey(day: AgendaDay): string {
  const d = new Date();
  if (day === "tomorrow") d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Main Component ──────────────────────────────────────

export function AIAgenda() {
  const [showPrefs, setShowPrefs] = useState(false);
  const [selectedDay, setSelectedDay] = useState<AgendaDay>("today");
  const [agenda, setAgenda] = useState<AgendaItem[] | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [agendaDate, setAgendaDate] = useState<string>("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [stats, setStats] = useState<{ events: number; tasks: number }>({
    events: 0,
    tasks: 0,
  });
  const [completedItems, setCompletedItems] = useState<Set<number>>(new Set());
  const [fireworkIndex, setFireworkIndex] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const dateKey = getDateKey(selectedDay);

  // Auto-load saved agenda for the selected day
  const savedAgendaQuery = useQuery({
    queryKey: ["saved-agenda", dateKey],
    queryFn: async () => {
      const res = await api.get<any>(`/calendar/agenda?date=${dateKey}`);
      if (!res.ok) throw new Error(res.error || "Failed to load agenda");
      return res.data; // null if no saved agenda
    },
  });

  // Populate state when saved agenda loads
  useEffect(() => {
    const d = savedAgendaQuery.data;
    if (d === undefined) return; // still loading
    if (d && d.agenda && Array.isArray(d.agenda) && d.agenda.length > 0) {
      setAgenda(d.agenda);
      setRawText(null);
      setAgendaDate(d.date || "");
      setSavedAt(d.savedAt || null);
      setStats({ events: d.eventCount || 0, tasks: d.taskCount || 0 });
      // Restore completed items from server
      const saved = Array.isArray(d.completedItems) ? d.completedItems : [];
      setCompletedItems(new Set(saved));
    } else if (d && d.raw) {
      setAgenda(null);
      setRawText(d.raw);
      setAgendaDate(d.date || "");
      setSavedAt(d.savedAt || null);
      setStats({ events: d.eventCount || 0, tasks: d.taskCount || 0 });
      setCompletedItems(new Set());
    } else {
      // No saved agenda for this date
      setAgenda(null);
      setRawText(null);
      setAgendaDate("");
      setSavedAt(null);
      setStats({ events: 0, tasks: 0 });
      setCompletedItems(new Set());
    }
  }, [savedAgendaQuery.data]);

  // Persist completed items to server
  const saveCompletions = useMutation({
    mutationFn: async (items: number[]) => {
      const res = await api.patch<any>("/calendar/agenda", {
        date: dateKey,
        completedItems: items,
      });
      if (!res.ok) throw new Error(res.error || "Failed to save");
      return res.data;
    },
  });

  const buildAgenda = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>("/calendar/build-agenda", { date: dateKey });
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
      setSavedAt(data.savedAt || new Date().toISOString());
      setStats({ events: data.eventCount || 0, tasks: data.taskCount || 0 });
      setCompletedItems(new Set()); // Reset completions on rebuild
      queryClient.invalidateQueries({ queryKey: ["saved-agenda", dateKey] });
    },
  });

  // Also mark the actual todo as complete if it has a taskId
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

  const handleMarkComplete = useCallback(
    (idx: number, taskId?: string | null) => {
      // Set firework at this index
      setFireworkIndex(idx);

      // Update local state
      setCompletedItems((prev) => {
        const next = new Set(prev);
        next.add(idx);
        // Persist to server
        saveCompletions.mutate(Array.from(next));
        return next;
      });

      // Also complete the linked todo if applicable
      if (taskId) {
        toggleTaskComplete.mutate(taskId);
      }
    },
    [saveCompletions, toggleTaskComplete]
  );

  const handleFireworkComplete = useCallback(() => {
    setFireworkIndex(null);
  }, []);

  const isInitialLoading = savedAgendaQuery.isLoading;
  const hasAgenda = agenda && agenda.length > 0;
  const hasRaw = !!rawText;
  const isEmpty = !hasAgenda && !hasRaw && !buildAgenda.isPending && !buildAgenda.error && !isInitialLoading;

  const completedCount = completedItems.size;
  const totalItems = agenda?.length || 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="text-hud-accent" />
          <h3 className="text-base font-semibold text-hud-text">AI Agenda</h3>

          {/* Today / Tomorrow toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-hud-bg-secondary/50 rounded-lg border border-hud-border ml-1">
            {(["today", "tomorrow"] as AgendaDay[]).map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedDay === day
                    ? "bg-hud-accent/20 text-hud-accent"
                    : "text-hud-text-muted hover:text-hud-text"
                }`}
              >
                {day === "today" ? "Today" : "Tomorrow"}
              </button>
            ))}
          </div>

          {agendaDate && (
            <span className="text-xs text-hud-text-muted">{agendaDate}</span>
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
                {hasAgenda || hasRaw ? "Rebuild" : "Build Agenda"}
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

      {/* Loading state */}
      {isInitialLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : hasAgenda ? (
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
              {totalItems} items
            </span>
            {completedCount > 0 && (
              <span className="flex items-center gap-1 text-hud-success">
                <CheckCircle2 size={12} />
                {completedCount}/{totalItems} done
              </span>
            )}
            {savedAt && (
              <span className="ml-auto text-[10px] text-hud-text-muted/60">
                Generated{" "}
                {new Date(savedAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {completedCount > 0 && (
            <div className="h-0.5 bg-hud-bg-secondary">
              <div
                className="h-full bg-gradient-to-r from-hud-success/80 to-hud-accent/80 transition-all duration-500 ease-out"
                style={{ width: `${(completedCount / totalItems) * 100}%` }}
              />
            </div>
          )}

          {/* Timeline */}
          <div className="divide-y divide-hud-border/50">
            {agenda!.map((item, idx) => {
              const style = typeStyles[item.type] || typeStyles.break;
              const Icon = style.icon;
              const duration = getDurationMinutes(item.time, item.endTime);
              const isCompleted = completedItems.has(idx);
              const showFirework = fireworkIndex === idx;

              return (
                <div
                  key={idx}
                  className={`flex items-start gap-3 px-4 py-3 transition-all duration-300 ${
                    isCompleted ? "opacity-50" : ""
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
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                        isCompleted
                          ? "bg-hud-success/30 border border-hud-success/50"
                          : `${style.bg} border ${style.border}`
                      }`}
                    />
                    {idx < agenda!.length - 1 && (
                      <div className="w-px flex-1 bg-hud-border/50 mt-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 relative">
                    <div className="flex items-center gap-2">
                      {isCompleted ? (
                        <CheckCircle2 size={14} className="text-hud-success shrink-0" />
                      ) : (
                        <Icon size={14} className={`${style.text} shrink-0`} />
                      )}
                      <p
                        className={`text-sm font-medium transition-all duration-300 ${
                          isCompleted
                            ? "line-through text-hud-text-muted"
                            : "text-hud-text"
                        }`}
                      >
                        {item.title}
                      </p>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                          isCompleted
                            ? "bg-hud-success/10 text-hud-success/60"
                            : `${style.bg} ${style.text}`
                        }`}
                      >
                        {isCompleted ? "done" : item.type}
                      </span>

                      {/* Firework animation — renders inline next to the badge */}
                      {showFirework && (
                        <div className="shrink-0 -my-3">
                          <SciFiFirework onComplete={handleFireworkComplete} />
                        </div>
                      )}
                    </div>
                    {item.notes && (
                      <p className={`text-xs mt-0.5 ${isCompleted ? "text-hud-text-muted/50" : "text-hud-text-muted"}`}>
                        {item.notes}
                      </p>
                    )}

                    {!isCompleted && (
                      <button
                        onClick={() => handleMarkComplete(idx, item.taskId)}
                        className="flex items-center gap-1 mt-1.5 text-[10px] text-hud-success hover:text-hud-success/80 transition-colors group"
                      >
                        <Check size={10} className="group-hover:scale-125 transition-transform" />
                        Mark Complete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      ) : hasRaw ? (
        <GlassPanel>
          <div className="text-sm text-hud-text-secondary">
            <MarkdownRenderer content={rawText!} />
          </div>
        </GlassPanel>
      ) : isEmpty ? (
        <GlassPanel>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-hud-accent/10 mb-4">
              <Sparkles size={28} className="text-hud-accent" />
            </div>
            <h3 className="text-base font-semibold text-hud-text mb-2">
              {selectedDay === "today"
                ? "Build Today's Agenda"
                : "Pre-Build Tomorrow's Agenda"}
            </h3>
            <p className="text-sm text-hud-text-muted mb-2 max-w-md mx-auto">
              {selectedDay === "tomorrow"
                ? "Plan ahead — generate tomorrow's optimized schedule now based on your calendar events and tasks."
                : "AI will analyze your calendar events and tasks to create an optimized daily schedule. Calendar events stay fixed while tasks are intelligently slotted into available gaps."}
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
              {selectedDay === "today" ? "Build My Agenda" : "Build Tomorrow's Agenda"}
            </HudButton>
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}
