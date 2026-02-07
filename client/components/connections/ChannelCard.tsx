"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";

interface ChannelCardProps {
  channelId: string;
  label: string;
  channel: any;
  onConfigUpdated: () => void;
}

export function ChannelCard({ channelId, label, channel }: ChannelCardProps) {
  const configured = channel?.configured ?? false;
  const running = channel?.running ?? false;
  const probeOk = channel?.probe?.ok ?? false;
  const botUsername = channel?.probe?.bot?.username;

  let status = "Not configured";
  let statusColor = "text-hud-text-muted";
  let dotColor = "bg-gray-500";

  if (configured && running) {
    status = "Running";
    statusColor = "text-hud-success";
    dotColor = "bg-hud-success";
  } else if (configured && probeOk) {
    status = "Ready (not running)";
    statusColor = "text-hud-amber";
    dotColor = "bg-hud-amber";
  } else if (configured) {
    status = "Configured";
    statusColor = "text-hud-text-secondary";
    dotColor = "bg-hud-accent";
  }

  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <h4 className="text-sm font-semibold text-hud-text">{label}</h4>
        </div>
        <span className={`text-[10px] font-medium ${statusColor}`}>{status}</span>
      </div>

      <div className="space-y-2">
        {botUsername && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-hud-text-muted">Bot</span>
            <span className="text-xs text-hud-text-secondary">@{botUsername}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-hud-text-muted">Channel ID</span>
          <span className="text-xs text-hud-text-muted font-mono">{channelId}</span>
        </div>

        {channel?.mode && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-hud-text-muted">Mode</span>
            <span className="text-xs text-hud-text-secondary">{channel.mode}</span>
          </div>
        )}

        {!configured && (
          <p className="text-xs text-hud-text-muted mt-2">
            Configure this channel in the OpenClaw config file.
          </p>
        )}
      </div>
    </GlassPanel>
  );
}
