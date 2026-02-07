"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { api } from "@/lib/api";
import {
  Sparkles,
  Calendar,
  Loader2,
  MapPin,
  Clock,
  ExternalLink,
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

export function AgendaPanel() {
  const [agenda, setAgenda] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: calendarData, isLoading: calLoading } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: async () => {
      const res = await api.get<any>("/calendar/events");
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
  });

  const connected = calendarData?.connected || false;
  const events: CalendarEvent[] = calendarData?.events || [];

  // Group events by date
  const eventsByDate = events.reduce<Record<string, CalendarEvent[]>>(
    (acc, event) => {
      const dateKey = new Date(event.start).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(event);
      return acc;
    },
    {}
  );

  const buildAgenda = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.post<any>("/calendar/build-agenda");
      if (res.ok && res.data) {
        const content =
          res.data.content ||
          res.data.text ||
          res.data.message ||
          (typeof res.data === "string"
            ? res.data
            : JSON.stringify(res.data, null, 2));
        setAgenda(content);
      } else {
        setError(res.error || "Failed to build agenda");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Agenda builder */}
      <GlassPanel>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-hud-accent" />
            <h3 className="text-sm font-semibold text-hud-text">AI Agenda</h3>
          </div>
          <HudButton size="sm" onClick={buildAgenda} disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                Building...
              </span>
            ) : (
              "Build My Agenda"
            )}
          </HudButton>
        </div>

        {error && <p className="text-xs text-hud-error mb-3">{error}</p>}

        {agenda ? (
          <div className="text-sm text-hud-text-secondary">
            <MarkdownRenderer content={agenda} />
          </div>
        ) : (
          <p className="text-xs text-hud-text-muted text-center py-6">
            Click &ldquo;Build My Agenda&rdquo; to have AI create a structured
            daily agenda based on your tasks
            {connected ? " and calendar events" : ""}.
          </p>
        )}
      </GlassPanel>

      {/* Calendar events */}
      <GlassPanel>
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={16} className="text-purple-400" />
          <h3 className="text-sm font-semibold text-hud-text">
            Calendar Events
          </h3>
          {connected && calendarData?.providers && (
            <div className="flex gap-1 ml-auto">
              {calendarData.providers.google && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-hud-accent/10 text-hud-accent">
                  Google
                </span>
              )}
              {calendarData.providers.microsoft && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                  Microsoft
                </span>
              )}
            </div>
          )}
        </div>

        {calLoading ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner size="sm" />
          </div>
        ) : !connected ? (
          <div className="text-center py-6">
            <p className="text-xs text-hud-text-muted">
              Connect Google or Microsoft in Connections to view events here.
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-hud-text-muted">
              No upcoming events in the next 7 days.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(eventsByDate).map(([date, dateEvents]) => (
              <div key={date}>
                <p className="text-[10px] font-semibold text-hud-text-muted uppercase tracking-wider mb-1.5">
                  {date}
                </p>
                <div className="space-y-1.5">
                  {dateEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                        event.provider === "google"
                          ? "border-hud-accent/10 bg-hud-accent/5 hover:bg-hud-accent/10"
                          : "border-blue-500/10 bg-blue-500/5 hover:bg-blue-500/10"
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">
                        <Clock
                          size={12}
                          className={
                            event.provider === "google"
                              ? "text-hud-accent"
                              : "text-blue-400"
                          }
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-hud-text truncate">
                          {event.title}
                        </p>
                        <p className="text-[10px] text-hud-text-muted">
                          {event.allDay
                            ? "All day"
                            : `${event.startTime} - ${event.endTime}`}
                        </p>
                        {event.location && (
                          <p className="text-[10px] text-hud-text-muted flex items-center gap-1 mt-0.5">
                            <MapPin size={8} />
                            {event.location}
                          </p>
                        )}
                      </div>
                      {event.htmlLink && (
                        <a
                          href={event.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-hud-text-muted hover:text-hud-accent transition-colors"
                        >
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
