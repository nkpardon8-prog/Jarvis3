"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Check } from "lucide-react";

interface Prefs {
  wakeTime: string;
  sleepTime: string;
  workStartTime: string;
  workEndTime: string;
  lunchStart: string;
  lunchDuration: number;
  focusBlockMinutes: number;
  breakMinutes: number;
  travelBuffer: number;
  midDayActivity: string;
  midDayStart: string;
  midDayDuration: number;
  preferMorning: boolean;
  notes: string;
}

const defaultPrefs: Prefs = {
  wakeTime: "07:00",
  sleepTime: "22:00",
  workStartTime: "09:00",
  workEndTime: "17:00",
  lunchStart: "12:00",
  lunchDuration: 60,
  focusBlockMinutes: 90,
  breakMinutes: 15,
  travelBuffer: 15,
  midDayActivity: "",
  midDayStart: "14:00",
  midDayDuration: 30,
  preferMorning: true,
  notes: "",
};

export function SchedulePreferences() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [localPrefs, setLocalPrefs] = useState<Prefs>(defaultPrefs);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data, isLoading } = useQuery({
    queryKey: ["schedule-preferences"],
    queryFn: async () => {
      const res = await api.get<any>("/calendar/preferences");
      if (!res.ok) throw new Error(res.error || "Failed to load preferences");
      return res.data;
    },
  });

  useEffect(() => {
    if (data) {
      setLocalPrefs({ ...defaultPrefs, ...data });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (prefs: Partial<Prefs>) => {
      const res = await api.put("/calendar/preferences", prefs);
      if (!res.ok) throw new Error(res.error || "Failed to save");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-preferences"] });
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    },
  });

  const debouncedSave = useCallback(
    (updates: Partial<Prefs>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveMutation.mutate(updates);
      }, 1000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const updateField = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    const updated = { ...localPrefs, [key]: value };
    setLocalPrefs(updated);
    debouncedSave({ [key]: value });
  };

  if (isLoading) {
    return (
      <div className="text-center py-4 text-xs text-hud-text-muted">
        Loading preferences...
      </div>
    );
  }

  const inputClass =
    "w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-1.5 text-sm text-hud-text focus:outline-none focus:border-hud-accent/50 transition-colors";

  return (
    <div className="space-y-4">
      {saved && (
        <div className="flex items-center gap-1.5 text-xs text-hud-success">
          <Check size={12} />
          Saved
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {/* Wake / Sleep */}
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Wake Time</label>
          <input
            type="time"
            value={localPrefs.wakeTime}
            onChange={(e) => updateField("wakeTime", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Sleep Time</label>
          <input
            type="time"
            value={localPrefs.sleepTime}
            onChange={(e) => updateField("sleepTime", e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Work hours */}
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Work Start</label>
          <input
            type="time"
            value={localPrefs.workStartTime}
            onChange={(e) => updateField("workStartTime", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Work End</label>
          <input
            type="time"
            value={localPrefs.workEndTime}
            onChange={(e) => updateField("workEndTime", e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Lunch */}
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Lunch Time</label>
          <input
            type="time"
            value={localPrefs.lunchStart}
            onChange={(e) => updateField("lunchStart", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Lunch Duration (min)</label>
          <input
            type="number"
            value={localPrefs.lunchDuration}
            onChange={(e) => updateField("lunchDuration", parseInt(e.target.value) || 60)}
            min={15}
            max={120}
            step={15}
            className={inputClass}
          />
        </div>

        {/* Focus blocks */}
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Focus Block (min)</label>
          <input
            type="number"
            value={localPrefs.focusBlockMinutes}
            onChange={(e) => updateField("focusBlockMinutes", parseInt(e.target.value) || 90)}
            min={15}
            max={240}
            step={15}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Break Duration (min)</label>
          <input
            type="number"
            value={localPrefs.breakMinutes}
            onChange={(e) => updateField("breakMinutes", parseInt(e.target.value) || 15)}
            min={5}
            max={60}
            step={5}
            className={inputClass}
          />
        </div>

        {/* Travel buffer */}
        <div className="col-span-2">
          <label className="block text-[10px] text-hud-text-muted mb-1">
            Travel Buffer (min before/after location events)
          </label>
          <input
            type="number"
            value={localPrefs.travelBuffer}
            onChange={(e) => updateField("travelBuffer", parseInt(e.target.value) || 15)}
            min={0}
            max={60}
            step={5}
            className={inputClass}
          />
        </div>

        {/* Mid-day activity */}
        <div className="col-span-2">
          <label className="block text-[10px] text-hud-text-muted mb-1">
            Mid-Day Activity (e.g., gym, walk, meditation)
          </label>
          <input
            type="text"
            value={localPrefs.midDayActivity}
            onChange={(e) => updateField("midDayActivity", e.target.value)}
            placeholder="e.g., Gym, Walk, Nap"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Activity Start</label>
          <input
            type="time"
            value={localPrefs.midDayStart}
            onChange={(e) => updateField("midDayStart", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1">Activity Duration (min)</label>
          <input
            type="number"
            value={localPrefs.midDayDuration}
            onChange={(e) => updateField("midDayDuration", parseInt(e.target.value) || 30)}
            min={10}
            max={120}
            step={10}
            className={inputClass}
          />
        </div>

        {/* Prefer morning */}
        <div className="col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localPrefs.preferMorning}
              onChange={(e) => updateField("preferMorning", e.target.checked)}
              className="rounded border-hud-border accent-hud-accent"
            />
            <span className="text-sm text-hud-text">
              Prefer morning for deep work / high-priority tasks
            </span>
          </label>
        </div>

        {/* Notes */}
        <div className="col-span-2">
          <label className="block text-[10px] text-hud-text-muted mb-1">
            Additional Notes / Preferences
          </label>
          <textarea
            value={localPrefs.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            rows={3}
            placeholder="Any other scheduling preferences, constraints, or notes for the AI..."
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>
    </div>
  );
}
