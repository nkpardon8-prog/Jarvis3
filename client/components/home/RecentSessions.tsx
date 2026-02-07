"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { MessageSquare, Clock } from "lucide-react";
import Link from "next/link";

interface RecentSessionsProps {
  sessions: any;
}

export function RecentSessions({ sessions }: RecentSessionsProps) {
  const sessionList = sessions?.sessions || [];

  const formatAge = (ageMs: number) => {
    const hours = Math.floor(ageMs / 3600000);
    if (hours < 1) return "< 1h ago";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <GlassPanel>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-purple-400/20">
          <Clock size={20} className="text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-hud-text">Recent Sessions</h3>
          <p className="text-xs text-hud-text-muted">Chat History</p>
        </div>
      </div>

      {sessionList.length === 0 ? (
        <p className="text-xs text-hud-text-muted">No recent sessions</p>
      ) : (
        <div className="space-y-2">
          {sessionList.slice(0, 5).map((session: any) => (
            <Link
              key={session.key}
              href="/dashboard/chat"
              className="flex items-center gap-2 px-3 py-2 bg-white/3 rounded-lg hover:bg-white/5 transition-colors"
            >
              <MessageSquare size={12} className="text-hud-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-hud-text truncate">
                  {session.displayName || session.key}
                </p>
              </div>
              {session.age !== undefined && (
                <span className="text-[10px] text-hud-text-muted flex-shrink-0">
                  {formatAge(session.age)}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
