"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface HudInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const HudInput = forwardRef<HTMLInputElement, HudInputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-medium text-hud-text-secondary uppercase tracking-wider">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full rounded-lg border border-hud-border bg-hud-bg-secondary
            px-3 py-2.5 text-sm text-hud-text placeholder-hud-text-muted
            transition-all duration-200
            ${error ? "border-hud-error" : ""}
            ${className}
          `}
          {...props}
        />
        {error && <span className="text-xs text-hud-error">{error}</span>}
      </div>
    );
  }
);

HudInput.displayName = "HudInput";
