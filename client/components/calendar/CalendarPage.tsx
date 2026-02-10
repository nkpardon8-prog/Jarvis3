"use client";

import { useState } from "react";
import { CalendarView } from "./CalendarView";
import { TasksPanel } from "./TasksPanel";
import { AIAgenda } from "./AIAgenda";
import { Calendar, CheckSquare, Sparkles } from "lucide-react";

type Tab = "calendar" | "tasks" | "agenda";

const tabs: { id: Tab; label: string; icon: typeof Calendar }[] = [
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "agenda", label: "AI Agenda", icon: Sparkles },
];

export function CalendarPage() {
  const [activeTab, setActiveTab] = useState<Tab>("calendar");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 bg-hud-bg-secondary/50 rounded-xl border border-hud-border w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30 shadow-[0_0_10px_rgba(0,212,255,0.1)]"
                  : "text-hud-text-muted hover:text-hud-text hover:bg-hud-surface-hover border border-transparent"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "calendar" && <CalendarView />}
      {activeTab === "tasks" && <TasksPanel />}
      {activeTab === "agenda" && <AIAgenda />}
    </div>
  );
}
