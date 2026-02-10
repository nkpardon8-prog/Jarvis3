"use client";

import { useState, useMemo } from "react";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Calendar,
  Sun,
  Moon,
  Sunrise,
  Code,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────

export interface ScheduleOutput {
  kind: "cron" | "every";
  expr?: string;
  intervalMs?: number;
  tz?: string;
}

interface SchedulePickerProps {
  value: ScheduleOutput;
  onChange: (schedule: ScheduleOutput) => void;
  timezone: string;
  onTimezoneChange: (tz: string) => void;
}

type FrequencyType = "interval" | "daily" | "weekly" | "monthly" | "custom";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const INTERVAL_OPTIONS = [
  { label: "5 min", ms: 300000 },
  { label: "15 min", ms: 900000 },
  { label: "30 min", ms: 1800000 },
  { label: "1 hour", ms: 3600000 },
  { label: "2 hours", ms: 7200000 },
  { label: "4 hours", ms: 14400000 },
  { label: "6 hours", ms: 21600000 },
  { label: "12 hours", ms: 43200000 },
];

const TIME_SLOTS: { label: string; hour: number; icon: React.ComponentType<any> }[] = [
  { label: "6 AM", hour: 6, icon: Sunrise },
  { label: "7 AM", hour: 7, icon: Sunrise },
  { label: "8 AM", hour: 8, icon: Sun },
  { label: "9 AM", hour: 9, icon: Sun },
  { label: "10 AM", hour: 10, icon: Sun },
  { label: "11 AM", hour: 11, icon: Sun },
  { label: "12 PM", hour: 12, icon: Sun },
  { label: "1 PM", hour: 13, icon: Sun },
  { label: "2 PM", hour: 14, icon: Sun },
  { label: "3 PM", hour: 15, icon: Sun },
  { label: "4 PM", hour: 16, icon: Sun },
  { label: "5 PM", hour: 17, icon: Sun },
  { label: "6 PM", hour: 18, icon: Moon },
  { label: "7 PM", hour: 19, icon: Moon },
  { label: "8 PM", hour: 20, icon: Moon },
  { label: "9 PM", hour: 21, icon: Moon },
  { label: "10 PM", hour: 22, icon: Moon },
  { label: "11 PM", hour: 23, icon: Moon },
];

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
];

// ── Helpers ──────────────────────────────────────────────

function buildCronExpr(
  freq: FrequencyType,
  selectedHours: number[],
  selectedDays: number[],
  selectedDayOfMonth: number
): string {
  const hours = selectedHours.length > 0 ? selectedHours.sort((a, b) => a - b).join(",") : "9";

  if (freq === "daily") {
    return `0 ${hours} * * *`;
  }

  if (freq === "weekly") {
    const days =
      selectedDays.length > 0
        ? selectedDays.sort((a, b) => a - b).join(",")
        : "1-5";
    return `0 ${hours} * * ${days}`;
  }

  if (freq === "monthly") {
    return `0 ${hours} ${selectedDayOfMonth} * *`;
  }

  return `0 ${hours} * * *`;
}

function parseCronToState(expr: string): {
  freq: FrequencyType;
  hours: number[];
  days: number[];
  dayOfMonth: number;
} {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { freq: "daily", hours: [9], days: [], dayOfMonth: 1 };

  const [, hourPart, domPart, , dowPart] = parts;

  const hours = hourPart
    .split(",")
    .map((h) => parseInt(h, 10))
    .filter((h) => !isNaN(h));

  // Monthly: specific day of month
  if (domPart !== "*") {
    return {
      freq: "monthly",
      hours: hours.length ? hours : [9],
      days: [],
      dayOfMonth: parseInt(domPart, 10) || 1,
    };
  }

  // Weekly: specific days of week
  if (dowPart !== "*") {
    const parseDow = (d: string): number[] => {
      // Handle ranges like "1-5"
      if (d.includes("-")) {
        const [start, end] = d.split("-").map(Number);
        const result = [];
        for (let i = start; i <= end; i++) result.push(i);
        return result;
      }
      return [parseInt(d, 10)];
    };
    const days = dowPart.split(",").flatMap(parseDow).filter((d) => !isNaN(d));
    return {
      freq: "weekly",
      hours: hours.length ? hours : [9],
      days,
      dayOfMonth: 1,
    };
  }

  // Daily
  return {
    freq: "daily",
    hours: hours.length ? hours : [9],
    days: [],
    dayOfMonth: 1,
  };
}

function describeScheduleHuman(schedule: ScheduleOutput): string {
  if (schedule.kind === "every" && schedule.intervalMs) {
    const mins = schedule.intervalMs / 60000;
    if (mins < 60) return `Runs every ${mins} minutes`;
    const hrs = mins / 60;
    return `Runs every ${hrs === 1 ? "hour" : `${hrs} hours`}`;
  }

  if (schedule.kind === "cron" && schedule.expr) {
    const { freq, hours, days, dayOfMonth } = parseCronToState(schedule.expr);
    const timeStr = hours
      .map((h) => {
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${h12} ${ampm}`;
      })
      .join(", ");

    if (freq === "daily") return `Daily at ${timeStr}`;
    if (freq === "weekly") {
      const dayNames = days.map((d) => DAYS_FULL[d]).join(", ");
      return `${dayNames} at ${timeStr}`;
    }
    if (freq === "monthly") {
      const suffix =
        dayOfMonth === 1
          ? "st"
          : dayOfMonth === 2
            ? "nd"
            : dayOfMonth === 3
              ? "rd"
              : "th";
      return `${dayOfMonth}${suffix} of every month at ${timeStr}`;
    }
  }

  return "Custom schedule";
}

// ── Component ────────────────────────────────────────────

export function SchedulePicker({
  value,
  onChange,
  timezone,
  onTimezoneChange,
}: SchedulePickerProps) {
  // Derive initial state from value
  const initialState = useMemo(() => {
    if (value.kind === "every") {
      return {
        freq: "interval" as FrequencyType,
        hours: [9],
        days: [] as number[],
        dayOfMonth: 1,
      };
    }
    if (value.kind === "cron" && value.expr) {
      return parseCronToState(value.expr);
    }
    return { freq: "daily" as FrequencyType, hours: [9], days: [] as number[], dayOfMonth: 1 };
  }, []);

  const [frequency, setFrequency] = useState<FrequencyType>(initialState.freq);
  const [selectedHours, setSelectedHours] = useState<number[]>(initialState.hours);
  const [selectedDays, setSelectedDays] = useState<number[]>(initialState.days);
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState(initialState.dayOfMonth);
  const [selectedInterval, setSelectedInterval] = useState(
    value.kind === "every" ? (value.intervalMs || 1800000) : 1800000
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customCron, setCustomCron] = useState(
    value.kind === "cron" ? (value.expr || "") : ""
  );

  // Emit changes
  function emitChange(
    freq: FrequencyType,
    hours: number[],
    days: number[],
    dom: number,
    interval: number,
    cronExpr?: string
  ) {
    if (freq === "interval") {
      onChange({ kind: "every", intervalMs: interval });
    } else if (freq === "custom" && cronExpr) {
      onChange({ kind: "cron", expr: cronExpr, tz: timezone });
    } else {
      const expr = buildCronExpr(freq, hours, days, dom);
      onChange({ kind: "cron", expr, tz: timezone });
    }
  }

  function handleFrequencyChange(freq: FrequencyType) {
    setFrequency(freq);
    if (freq === "custom") {
      setShowAdvanced(true);
    } else {
      setShowAdvanced(false);
      emitChange(freq, selectedHours, selectedDays, selectedDayOfMonth, selectedInterval);
    }
  }

  function toggleHour(hour: number) {
    const next = selectedHours.includes(hour)
      ? selectedHours.filter((h) => h !== hour)
      : [...selectedHours, hour];
    // Ensure at least one hour is selected
    if (next.length === 0) return;
    setSelectedHours(next);
    emitChange(frequency, next, selectedDays, selectedDayOfMonth, selectedInterval);
  }

  function toggleDay(day: number) {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    if (next.length === 0) return;
    setSelectedDays(next);
    emitChange(frequency, selectedHours, next, selectedDayOfMonth, selectedInterval);
  }

  function handleIntervalChange(ms: number) {
    setSelectedInterval(ms);
    emitChange(frequency, selectedHours, selectedDays, selectedDayOfMonth, ms);
  }

  function handleDayOfMonthChange(dom: number) {
    setSelectedDayOfMonth(dom);
    emitChange(frequency, selectedHours, selectedDays, dom, selectedInterval);
  }

  function handleCustomCronChange(expr: string) {
    setCustomCron(expr);
    if (expr.trim().split(/\s+/).length === 5) {
      emitChange("custom", selectedHours, selectedDays, selectedDayOfMonth, selectedInterval, expr);
    }
  }

  // Quick presets for weekday selection
  function selectWeekdays() {
    const weekdays = [1, 2, 3, 4, 5];
    setSelectedDays(weekdays);
    emitChange(frequency, selectedHours, weekdays, selectedDayOfMonth, selectedInterval);
  }

  function selectAllDays() {
    const all = [0, 1, 2, 3, 4, 5, 6];
    setSelectedDays(all);
    emitChange(frequency, selectedHours, all, selectedDayOfMonth, selectedInterval);
  }

  return (
    <div className="space-y-4">
      {/* Frequency tabs */}
      <div>
        <label className="block text-[10px] text-hud-text-muted mb-2 uppercase tracking-wider">
          How Often
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: "interval", label: "Repeating", icon: RotateCw },
              { key: "daily", label: "Daily", icon: Sun },
              { key: "weekly", label: "Weekly", icon: Calendar },
              { key: "monthly", label: "Monthly", icon: Calendar },
              { key: "custom", label: "Advanced", icon: Code },
            ] as const
          ).map(({ key, label, icon: TabIcon }) => (
            <button
              key={key}
              onClick={() => handleFrequencyChange(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                frequency === key
                  ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30"
                  : "bg-hud-bg-secondary/30 text-hud-text-muted border border-hud-border hover:bg-white/5 hover:text-hud-text-secondary"
              }`}
            >
              <TabIcon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Interval picker ── */}
      {frequency === "interval" && (
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-2 uppercase tracking-wider">
            Run Every
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.ms}
                onClick={() => handleIntervalChange(opt.ms)}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  selectedInterval === opt.ms
                    ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30"
                    : "bg-hud-bg-secondary/30 text-hud-text-secondary border border-hud-border hover:bg-white/5"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Daily: pick time(s) ── */}
      {frequency === "daily" && (
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-2 uppercase tracking-wider">
            Run At (click to select multiple times)
          </label>
          <div className="grid grid-cols-6 gap-1">
            {TIME_SLOTS.map(({ label, hour, icon: SlotIcon }) => (
              <button
                key={hour}
                onClick={() => toggleHour(hour)}
                className={`flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-medium rounded-lg transition-all ${
                  selectedHours.includes(hour)
                    ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30 shadow-sm shadow-hud-accent/10"
                    : "bg-hud-bg-secondary/20 text-hud-text-muted border border-transparent hover:bg-white/5 hover:text-hud-text-secondary"
                }`}
              >
                <SlotIcon size={10} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Weekly: pick days + time(s) ── */}
      {frequency === "weekly" && (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] text-hud-text-muted uppercase tracking-wider">
                Which Days
              </label>
              <div className="flex gap-1.5">
                <button
                  onClick={selectWeekdays}
                  className="text-[9px] text-hud-accent hover:text-hud-accent/80 transition-colors"
                >
                  Weekdays
                </button>
                <span className="text-hud-text-muted text-[9px]">|</span>
                <button
                  onClick={selectAllDays}
                  className="text-[9px] text-hud-accent hover:text-hud-accent/80 transition-colors"
                >
                  Every day
                </button>
              </div>
            </div>
            <div className="flex gap-1">
              {DAYS_OF_WEEK.map((day, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                    selectedDays.includes(idx)
                      ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30"
                      : "bg-hud-bg-secondary/20 text-hud-text-muted border border-transparent hover:bg-white/5"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-hud-text-muted mb-2 uppercase tracking-wider">
              Run At
            </label>
            <div className="grid grid-cols-6 gap-1">
              {TIME_SLOTS.map(({ label, hour, icon: SlotIcon }) => (
                <button
                  key={hour}
                  onClick={() => toggleHour(hour)}
                  className={`flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-medium rounded-lg transition-all ${
                    selectedHours.includes(hour)
                      ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30 shadow-sm shadow-hud-accent/10"
                      : "bg-hud-bg-secondary/20 text-hud-text-muted border border-transparent hover:bg-white/5 hover:text-hud-text-secondary"
                  }`}
                >
                  <SlotIcon size={10} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Monthly: pick day of month + time ── */}
      {frequency === "monthly" && (
        <>
          <div>
            <label className="block text-[10px] text-hud-text-muted mb-2 uppercase tracking-wider">
              Day of Month
            </label>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <button
                  key={day}
                  onClick={() => handleDayOfMonthChange(day)}
                  className={`py-1.5 text-xs font-medium rounded-lg transition-all ${
                    selectedDayOfMonth === day
                      ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30"
                      : "bg-hud-bg-secondary/20 text-hud-text-muted border border-transparent hover:bg-white/5"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-hud-text-muted mb-2 uppercase tracking-wider">
              Run At
            </label>
            <div className="grid grid-cols-6 gap-1">
              {TIME_SLOTS.map(({ label, hour, icon: SlotIcon }) => (
                <button
                  key={hour}
                  onClick={() => toggleHour(hour)}
                  className={`flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-medium rounded-lg transition-all ${
                    selectedHours.includes(hour)
                      ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30 shadow-sm shadow-hud-accent/10"
                      : "bg-hud-bg-secondary/20 text-hud-text-muted border border-transparent hover:bg-white/5 hover:text-hud-text-secondary"
                  }`}
                >
                  <SlotIcon size={10} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Advanced: raw cron expression ── */}
      {frequency === "custom" && (
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1.5 uppercase tracking-wider">
            Cron Expression
          </label>
          <input
            type="text"
            value={customCron}
            onChange={(e) => handleCustomCronChange(e.target.value)}
            placeholder="0 9 * * 1-5 (min hour dom mon dow)"
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs font-mono text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
          />
          <div className="mt-1.5 text-[10px] text-hud-text-muted/60 space-y-0.5">
            <p>
              <span className="font-mono text-hud-text-muted">0 9 * * 1-5</span>{" "}
              — Weekdays at 9 AM
            </p>
            <p>
              <span className="font-mono text-hud-text-muted">0 */4 * * *</span>{" "}
              — Every 4 hours
            </p>
            <p>
              <span className="font-mono text-hud-text-muted">30 8,17 * * *</span>{" "}
              — 8:30 AM & 5:30 PM daily
            </p>
          </div>
        </div>
      )}

      {/* Timezone */}
      <div>
        <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
          Timezone
        </label>
        <select
          value={timezone}
          onChange={(e) => {
            onTimezoneChange(e.target.value);
            // Re-emit with new timezone
            if (frequency !== "interval") {
              const expr =
                frequency === "custom"
                  ? customCron
                  : buildCronExpr(frequency, selectedHours, selectedDays, selectedDayOfMonth);
              onChange({ kind: "cron", expr, tz: e.target.value });
            }
          }}
          className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-1.5 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50 transition-colors"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {/* Human-readable summary */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-hud-accent/5 border border-hud-accent/10">
        <Clock size={12} className="text-hud-accent flex-shrink-0" />
        <p className="text-[11px] text-hud-accent">
          {describeScheduleHuman(value)}
        </p>
      </div>
    </div>
  );
}
