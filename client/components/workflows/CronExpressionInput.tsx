"use client";

import { useState, useEffect } from "react";
import { describeCronExpr } from "./workflowTemplates";
import { Clock, Check, AlertCircle } from "lucide-react";

interface CronExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  timezone: string;
  onTimezoneChange: (tz: string) => void;
}

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

function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  // Basic validation: each part should be a number, range, step, or wildcard
  const pattern = /^(\*|[0-9]+(-[0-9]+)?(\/[0-9]+)?)(,(\*|[0-9]+(-[0-9]+)?(\/[0-9]+)?))*$/;
  return parts.every((p) => pattern.test(p));
}

export function CronExpressionInput({
  value,
  onChange,
  timezone,
  onTimezoneChange,
}: CronExpressionInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newVal: string) => {
    setLocalValue(newVal);
    onChange(newVal);
  };

  const valid = localValue.trim().length > 0 && isValidCron(localValue);
  const description = valid ? describeCronExpr(localValue.trim()) : "";

  return (
    <div className="space-y-2">
      {/* Cron expression input */}
      <div className="relative">
        <Clock
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-hud-text-muted"
        />
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="0 7 * * * (min hour dom mon dow)"
          className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg pl-9 pr-10 py-2 text-xs font-mono text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
        />
        {localValue.trim().length > 0 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {valid ? (
              <Check size={14} className="text-hud-success" />
            ) : (
              <AlertCircle size={14} className="text-hud-error" />
            )}
          </div>
        )}
      </div>

      {/* Human-readable preview */}
      {valid && description && (
        <p className="text-[11px] text-hud-success px-1">
          {description}
        </p>
      )}
      {localValue.trim().length > 0 && !valid && (
        <p className="text-[11px] text-hud-error px-1">
          Invalid cron expression — use 5 fields: minute hour day-of-month month
          day-of-week
        </p>
      )}

      {/* Timezone selector */}
      <div>
        <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
          Timezone
        </label>
        <select
          value={timezone}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-1.5 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50 transition-colors"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      {/* Quick reference */}
      <div className="text-[10px] text-hud-text-muted/60 space-y-0.5 pt-1">
        <p>
          <span className="font-mono text-hud-text-muted">* * * * *</span>{" "}
          — every minute
        </p>
        <p>
          <span className="font-mono text-hud-text-muted">0 9 * * 1-5</span>{" "}
          — weekdays at 9 AM
        </p>
        <p>
          <span className="font-mono text-hud-text-muted">0 */4 * * *</span>{" "}
          — every 4 hours
        </p>
      </div>
    </div>
  );
}
