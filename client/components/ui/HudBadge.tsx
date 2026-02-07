"use client";

import { ReactNode } from "react";

type BadgeVariant = "online" | "offline" | "warning" | "info" | "error";

const badgeStyles: Record<BadgeVariant, string> = {
  online: "bg-hud-success/20 text-hud-success border-hud-success/30",
  offline: "bg-hud-text-muted/20 text-hud-text-muted border-hud-text-muted/30",
  warning: "bg-hud-amber/20 text-hud-amber border-hud-amber/30",
  info: "bg-hud-accent/20 text-hud-accent border-hud-accent/30",
  error: "bg-hud-error/20 text-hud-error border-hud-error/30",
};

export function HudBadge({
  variant = "info",
  children,
  dot,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium
        ${badgeStyles[variant]}
      `}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full animate-pulse-glow`}
          style={{ backgroundColor: "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}
