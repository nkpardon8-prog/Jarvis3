"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { X, Trash2, Loader2 } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  provider: "google" | "microsoft";
}

interface EventModalProps {
  event?: CalendarEvent | null;
  defaultStart?: string;
  defaultEnd?: string;
  onClose: () => void;
}

function toLocalDatetime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventModal({ event, defaultStart, defaultEnd, onClose }: EventModalProps) {
  const queryClient = useQueryClient();
  const isEdit = !!event;

  const [title, setTitle] = useState(event?.title || "");
  const [start, setStart] = useState(
    event ? toLocalDatetime(event.start) : defaultStart || ""
  );
  const [end, setEnd] = useState(
    event ? toLocalDatetime(event.end) : defaultEnd || ""
  );
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [location, setLocation] = useState(event?.location || "");
  const [description, setDescription] = useState(event?.description || "");

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const createEvent = useMutation({
    mutationFn: async () => {
      const body: any = { title, start, end: end || start, allDay, timeZone };
      if (location) body.location = location;
      if (description) body.description = description;
      console.log("[EventModal] Creating event:", JSON.stringify(body));
      const res = await api.post("/calendar/events", body);
      console.log("[EventModal] Create response:", JSON.stringify(res));
      if (!res.ok) throw new Error(res.error || "Failed to create event");
      return res.data;
    },
    onSuccess: (data) => {
      console.log("[EventModal] Event created successfully:", data);
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      onClose();
    },
    onError: (err: any) => {
      console.error("[EventModal] Create event ERROR:", err);
      alert("Failed to create event: " + (err?.message || String(err)));
    },
  });

  const updateEvent = useMutation({
    mutationFn: async () => {
      const body: any = { title, start, end: end || start, allDay, location, description, timeZone };
      const res = await api.patch(`/calendar/events/${event!.id}`, body);
      if (!res.ok) throw new Error(res.error || "Failed to update event");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      onClose();
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/calendar/events/${event!.id}`);
      if (!res.ok) throw new Error(res.error || "Failed to delete event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      onClose();
    },
  });

  const isPending = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;
  const error = createEvent.error || updateEvent.error || deleteEvent.error;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[EventModal] handleSubmit — title:", title, "start:", start, "isEdit:", isEdit);
    if (!title.trim() || !start) {
      console.warn("[EventModal] handleSubmit blocked — title empty:", !title.trim(), "start empty:", !start);
      return;
    }
    if (isEdit) {
      updateEvent.mutate();
    } else {
      console.log("[EventModal] Calling createEvent.mutate()");
      createEvent.mutate();
    }
  };

  const inputClass =
    "w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-sm text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50 transition-colors";

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassPanel className="w-full max-w-md !p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hud-border">
          <h3 className="text-base font-semibold text-hud-text">
            {isEdit ? "Edit Event" : "New Event"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-text hover:bg-hud-surface-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs text-hud-text-muted mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className={inputClass}
              autoFocus
            />
          </div>

          {/* All Day toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded border-hud-border accent-hud-accent"
            />
            <span className="text-sm text-hud-text">All day event</span>
          </label>

          {/* Start / End */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hud-text-muted mb-1.5">Start</label>
              <input
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? start.split("T")[0] : start}
                onChange={(e) => setStart(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-hud-text-muted mb-1.5">End</label>
              <input
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? (end || start).split("T")[0] : end}
                onChange={(e) => setEnd(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs text-hud-text-muted mb-1.5">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-hud-text-muted mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-hud-error">
              {(error as Error).message}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            {isEdit && (
              <HudButton
                type="button"
                variant="danger"
                size="sm"
                onClick={() => deleteEvent.mutate()}
                disabled={isPending}
              >
                <Trash2 size={14} />
                Delete
              </HudButton>
            )}
            <div className="flex-1" />
            <HudButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </HudButton>
            <HudButton
              type="submit"
              size="sm"
              disabled={!title.trim() || !start || isPending}
            >
              {isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isEdit ? (
                "Save"
              ) : (
                "Create"
              )}
            </HudButton>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}
