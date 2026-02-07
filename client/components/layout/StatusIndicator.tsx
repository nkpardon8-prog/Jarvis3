"use client";

type Status = "connected" | "disconnected" | "connecting";

const statusColors: Record<Status, string> = {
  connected: "bg-hud-success text-hud-success",
  disconnected: "bg-hud-error text-hud-error",
  connecting: "bg-hud-amber text-hud-amber",
};

const statusLabels: Record<Status, string> = {
  connected: "Online",
  disconnected: "Offline",
  connecting: "Connecting...",
};

export function StatusIndicator({ status }: { status: Status }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full animate-pulse-glow ${statusColors[status]}`}
      />
      <span className="text-xs text-hud-text-secondary">{statusLabels[status]}</span>
    </div>
  );
}
