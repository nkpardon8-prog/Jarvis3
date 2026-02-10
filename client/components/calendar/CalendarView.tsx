"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EventModal } from "./EventModal";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
} from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location?: string;
  description?: string;
  provider: "google" | "microsoft";
  htmlLink?: string;
}

type ViewMode = "month" | "week" | "day";

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
const SLOT_HEIGHT = 48;

function formatHour(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12} ${ampm}`;
}

export function CalendarView() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalEvent, setModalEvent] = useState<CalendarEvent | null>(null);
  const [modalDefaults, setModalDefaults] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const today = new Date(currentDate);
    today.setHours(0, 0, 0, 0);

    if (viewMode === "day") {
      return { rangeStart: today, rangeEnd: addDays(today, 1) };
    }
    if (viewMode === "week") {
      const ws = startOfWeek(today);
      return { rangeStart: ws, rangeEnd: addDays(ws, 7) };
    }
    const ms = startOfMonth(today);
    const me = endOfMonth(today);
    const calStart = startOfWeek(ms);
    const calEnd = addDays(startOfWeek(addDays(me, 7)), 0);
    return { rangeStart: calStart, rangeEnd: calEnd };
  }, [viewMode, currentDate]);

  const { data, isLoading } = useQuery({
    queryKey: ["calendar-events", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const res = await api.get<any>(
        `/calendar/events?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`
      );
      if (!res.ok) throw new Error(res.error || "Failed to load events");
      return res.data;
    },
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
  });

  const connected = data?.connected || false;
  const events: CalendarEvent[] = data?.events || [];

  const navigate = useCallback(
    (direction: number) => {
      setCurrentDate((prev) => {
        const d = new Date(prev);
        if (viewMode === "day") d.setDate(d.getDate() + direction);
        else if (viewMode === "week") d.setDate(d.getDate() + direction * 7);
        else d.setMonth(d.getMonth() + direction);
        return d;
      });
    },
    [viewMode]
  );

  const goToToday = () => setCurrentDate(new Date());

  const openCreate = (startTime?: string) => {
    const now = new Date();
    const defStart =
      startTime ||
      `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:00`;
    const endDate = new Date(now);
    endDate.setHours(endDate.getHours() + 1);
    const defEnd = `${endDate.getFullYear()}-${pad2(endDate.getMonth() + 1)}-${pad2(endDate.getDate())}T${pad2(endDate.getHours())}:00`;
    setModalEvent(null);
    setModalDefaults({ start: defStart, end: defEnd });
    setShowModal(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setModalEvent(event);
    setModalDefaults(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalEvent(null);
    setModalDefaults(null);
  };

  const viewTitle = useMemo(() => {
    if (viewMode === "day") return formatDate(currentDate);
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate);
      const we = addDays(ws, 6);
      return `${formatShortDate(ws)} – ${formatShortDate(we)}, ${we.getFullYear()}`;
    }
    return currentDate.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }, [viewMode, currentDate]);

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 p-0.5 bg-hud-bg-secondary/50 rounded-lg border border-hud-border">
          {(["month", "week", "day"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === mode
                  ? "bg-hud-accent/20 text-hud-accent"
                  : "text-hud-text-muted hover:text-hud-text"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-accent hover:bg-hud-accent/10 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-hud-text-secondary hover:text-hud-accent hover:bg-hud-accent/10 transition-colors border border-hud-border"
          >
            Today
          </button>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-accent hover:bg-hud-accent/10 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          <span className="text-sm font-medium text-hud-text ml-2">
            {viewTitle}
          </span>
        </div>

        <button
          onClick={() => openCreate()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 hover:bg-hud-accent/30 transition-colors"
        >
          <Plus size={14} />
          New Event
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : !connected ? (
        <GlassPanel>
          <div className="text-center py-16">
            <p className="text-sm text-hud-text-muted">
              Connect Google or Microsoft in{" "}
              <span className="text-hud-accent">Connections</span> to view calendar events.
            </p>
          </div>
        </GlassPanel>
      ) : viewMode === "month" ? (
        <MonthView
          currentDate={currentDate}
          events={events}
          onDayClick={(d) => {
            setCurrentDate(d);
            setViewMode("day");
          }}
        />
      ) : viewMode === "week" ? (
        <WeekView
          currentDate={currentDate}
          events={events}
          onEventClick={openEdit}
          onSlotClick={(st) => openCreate(st)}
        />
      ) : (
        <DayView
          currentDate={currentDate}
          events={events}
          onEventClick={openEdit}
          onSlotClick={(st) => openCreate(st)}
        />
      )}

      {showModal && (
        <EventModal
          event={modalEvent}
          defaultStart={modalDefaults?.start}
          defaultEnd={modalDefaults?.end}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

// ─── WEEK VIEW ─────────────────────────────────────────
function WeekView({
  currentDate,
  events,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (startTime: string) => void;
}) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <GlassPanel className="!p-0 overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-220px)]">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] min-w-[700px]">
          {/* Header */}
          <div className="sticky top-0 z-20 bg-hud-surface border-b border-hud-border" />
          {days.map((day) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={`sticky top-0 z-20 bg-hud-surface border-b border-l border-hud-border px-2 py-2 text-center ${
                  isToday ? "bg-hud-accent/5" : ""
                }`}
              >
                <p className="text-[10px] text-hud-text-muted uppercase">
                  {day.toLocaleDateString("en-US", { weekday: "short" })}
                </p>
                <p
                  className={`text-sm font-semibold ${
                    isToday ? "text-hud-accent" : "text-hud-text"
                  }`}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}

          {/* Time slots */}
          {HOURS.map((hour) => (
            <div key={`row-${hour}`} className="contents">
              <div
                className="border-b border-hud-border/50 px-1.5 flex items-start justify-end"
                style={{ height: SLOT_HEIGHT }}
              >
                <span className="text-[10px] text-hud-text-muted -mt-1.5">
                  {formatHour(hour)}
                </span>
              </div>

              {days.map((day) => {
                const dayEvents = events.filter((e) => {
                  if (e.allDay) return false;
                  const eStart = new Date(e.start);
                  return isSameDay(eStart, day) && eStart.getHours() === hour;
                });
                const isToday = isSameDay(day, today);

                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className={`relative border-b border-l border-hud-border/50 cursor-pointer hover:bg-hud-accent/5 transition-colors ${
                      isToday ? "bg-hud-accent/[0.02]" : ""
                    }`}
                    style={{ height: SLOT_HEIGHT }}
                    onClick={() => {
                      const s = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}T${pad2(hour)}:00`;
                      onSlotClick(s);
                    }}
                  >
                    {dayEvents.map((evt) => {
                      const eStart = new Date(evt.start);
                      const eEnd = new Date(evt.end);
                      const durationHrs = (eEnd.getTime() - eStart.getTime()) / 3600000;
                      const topOffset = (eStart.getMinutes() / 60) * SLOT_HEIGHT;
                      const height = Math.max(20, durationHrs * SLOT_HEIGHT - 2);

                      return (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(evt);
                          }}
                          className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden cursor-pointer z-10 border ${
                            evt.provider === "google"
                              ? "bg-hud-accent/15 border-hud-accent/30 text-hud-accent hover:bg-hud-accent/25"
                              : "bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/25"
                          }`}
                          style={{ top: topOffset, height }}
                        >
                          <p className="font-medium truncate">{evt.title}</p>
                          <p className="opacity-70">{evt.startTime}</p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}

// ─── DAY VIEW ──────────────────────────────────────────
function DayView({
  currentDate,
  events,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (startTime: string) => void;
}) {
  const today = new Date();
  const isToday = isSameDay(currentDate, today);
  const dayEvents = events.filter((e) => isSameDay(new Date(e.start), currentDate));
  const allDayEvents = dayEvents.filter((e) => e.allDay);
  const timedEvents = dayEvents.filter((e) => !e.allDay);

  return (
    <GlassPanel className="!p-0 overflow-hidden">
      {allDayEvents.length > 0 && (
        <div className="px-4 py-2 border-b border-hud-border bg-hud-surface/50">
          <p className="text-[10px] text-hud-text-muted mb-1">ALL DAY</p>
          {allDayEvents.map((evt) => (
            <div
              key={evt.id}
              onClick={() => onEventClick(evt)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 mr-2 rounded-md text-xs cursor-pointer ${
                evt.provider === "google"
                  ? "bg-hud-accent/15 text-hud-accent"
                  : "bg-blue-500/15 text-blue-400"
              }`}
            >
              {evt.title}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-auto max-h-[calc(100vh-260px)]">
        <div className="grid grid-cols-[60px_1fr]">
          {HOURS.map((hour) => {
            const hourEvents = timedEvents.filter(
              (e) => new Date(e.start).getHours() === hour
            );

            return (
              <div key={`row-${hour}`} className="contents">
                <div
                  className="border-b border-hud-border/50 px-1.5 flex items-start justify-end"
                  style={{ height: SLOT_HEIGHT }}
                >
                  <span className="text-[10px] text-hud-text-muted -mt-1.5">
                    {formatHour(hour)}
                  </span>
                </div>
                <div
                  className={`relative border-b border-hud-border/50 cursor-pointer hover:bg-hud-accent/5 transition-colors ${
                    isToday && today.getHours() === hour ? "bg-hud-accent/[0.03]" : ""
                  }`}
                  style={{ height: SLOT_HEIGHT }}
                  onClick={() => {
                    const s = `${currentDate.getFullYear()}-${pad2(currentDate.getMonth() + 1)}-${pad2(currentDate.getDate())}T${pad2(hour)}:00`;
                    onSlotClick(s);
                  }}
                >
                  {hourEvents.map((evt) => {
                    const eStart = new Date(evt.start);
                    const eEnd = new Date(evt.end);
                    const durationHrs = (eEnd.getTime() - eStart.getTime()) / 3600000;
                    const topOffset = (eStart.getMinutes() / 60) * SLOT_HEIGHT;
                    const height = Math.max(24, durationHrs * SLOT_HEIGHT - 2);

                    return (
                      <div
                        key={evt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(evt);
                        }}
                        className={`absolute left-1 right-1 rounded-lg px-3 py-1.5 overflow-hidden cursor-pointer z-10 border ${
                          evt.provider === "google"
                            ? "bg-hud-accent/15 border-hud-accent/30 text-hud-accent hover:bg-hud-accent/25"
                            : "bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/25"
                        }`}
                        style={{ top: topOffset, height }}
                      >
                        <p className="text-sm font-medium truncate">{evt.title}</p>
                        <div className="flex items-center gap-3 text-[11px] opacity-70 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {evt.startTime} - {evt.endTime}
                          </span>
                          {evt.location && (
                            <span className="flex items-center gap-1">
                              <MapPin size={10} />
                              {evt.location}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </GlassPanel>
  );
}

// ─── MONTH VIEW ────────────────────────────────────────
function MonthView({
  currentDate,
  events,
  onDayClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const today = new Date();
  const days = Array.from({ length: 42 }, (_, i) => addDays(calStart, i));
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <GlassPanel className="!p-0 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-hud-border">
        {dayNames.map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-center text-[10px] font-semibold text-hud-text-muted uppercase tracking-wider"
          >
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isToday = isSameDay(day, today);
          const dayEvts = events.filter((e) => isSameDay(new Date(e.start), day));

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`min-h-[80px] border-b border-r border-hud-border/50 px-1.5 py-1 cursor-pointer hover:bg-hud-accent/5 transition-colors ${
                !isCurrentMonth ? "opacity-30" : ""
              } ${isToday ? "bg-hud-accent/[0.03]" : ""}`}
            >
              <p
                className={`text-xs font-medium mb-1 ${
                  isToday ? "text-hud-accent font-bold" : "text-hud-text-secondary"
                }`}
              >
                {day.getDate()}
              </p>
              <div className="space-y-0.5">
                {dayEvts.slice(0, 3).map((evt) => (
                  <div
                    key={evt.id}
                    className={`text-[9px] px-1 py-0.5 rounded truncate ${
                      evt.provider === "google"
                        ? "bg-hud-accent/15 text-hud-accent"
                        : "bg-blue-500/15 text-blue-400"
                    }`}
                  >
                    {evt.allDay ? "" : evt.startTime + " "}
                    {evt.title}
                  </div>
                ))}
                {dayEvts.length > 3 && (
                  <p className="text-[9px] text-hud-text-muted pl-1">
                    +{dayEvts.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}
