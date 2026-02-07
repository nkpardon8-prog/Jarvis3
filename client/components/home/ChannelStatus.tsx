"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Radio } from "lucide-react";

interface ChannelStatusProps {
  health: any;
  channels: any;
}

export function ChannelStatus({ health }: ChannelStatusProps) {
  const channelData = health?.channels || {};
  const channelOrder = health?.channelOrder || Object.keys(channelData);
  const channelLabels = health?.channelLabels || {};

  return (
    <GlassPanel>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-hud-amber/20">
          <Radio size={20} className="text-hud-amber" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-hud-text">Channels</h3>
          <p className="text-xs text-hud-text-muted">Communication</p>
        </div>
      </div>

      {channelOrder.length === 0 ? (
        <p className="text-xs text-hud-text-muted">No channels configured</p>
      ) : (
        <div className="space-y-2">
          {channelOrder.map((channelId: string) => {
            const ch = channelData[channelId];
            const label = channelLabels[channelId] || channelId;
            const configured = ch?.configured ?? false;
            const running = ch?.running ?? false;
            const probeOk = ch?.probe?.ok ?? false;
            const botName = ch?.probe?.bot?.username;

            let status = "Not configured";
            let statusColor = "text-hud-text-muted";
            let dotColor = "bg-gray-500";

            if (configured && running) {
              status = "Running";
              statusColor = "text-hud-success";
              dotColor = "bg-hud-success";
            } else if (configured && probeOk) {
              status = "Ready";
              statusColor = "text-hud-amber";
              dotColor = "bg-hud-amber";
            } else if (configured) {
              status = "Configured";
              statusColor = "text-hud-text-secondary";
              dotColor = "bg-hud-accent";
            }

            return (
              <div
                key={channelId}
                className="flex items-center justify-between px-3 py-2 bg-white/3 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <div>
                    <p className="text-xs font-medium text-hud-text">{label}</p>
                    {botName && (
                      <p className="text-[10px] text-hud-text-muted">@{botName}</p>
                    )}
                  </div>
                </div>
                <span className={`text-[10px] font-medium ${statusColor}`}>
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}
