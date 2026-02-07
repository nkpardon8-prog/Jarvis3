"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { MessageSquare, Blocks, Link2, Calendar } from "lucide-react";
import Link from "next/link";

const actions = [
  {
    label: "New Chat",
    icon: MessageSquare,
    href: "/dashboard/chat",
    color: "text-hud-accent",
    bg: "bg-hud-accent/10 hover:bg-hud-accent/20",
  },
  {
    label: "Skills",
    icon: Blocks,
    href: "/dashboard/skills",
    color: "text-hud-success",
    bg: "bg-hud-success/10 hover:bg-hud-success/20",
  },
  {
    label: "Connections",
    icon: Link2,
    href: "/dashboard/connections",
    color: "text-hud-amber",
    bg: "bg-hud-amber/10 hover:bg-hud-amber/20",
  },
  {
    label: "Agenda",
    icon: Calendar,
    href: "/dashboard/calendar",
    color: "text-purple-400",
    bg: "bg-purple-400/10 hover:bg-purple-400/20",
  },
];

export function QuickActions() {
  return (
    <GlassPanel>
      <h3 className="text-sm font-semibold text-hud-text mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border border-transparent ${action.bg} transition-colors`}
          >
            <action.icon size={20} className={action.color} />
            <span className="text-xs text-hud-text-secondary">{action.label}</span>
          </Link>
        ))}
      </div>
    </GlassPanel>
  );
}
