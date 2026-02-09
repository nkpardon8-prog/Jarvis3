"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Link2,
  Calendar,
  Briefcase,
  Mail,
  FileText,
  MessageSquare,
  Puzzle,
} from "lucide-react";

const tabs = [
  { name: "Home", href: "/dashboard/home", icon: Home },
  { name: "Connections", href: "/dashboard/connections", icon: Link2 },
  { name: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { name: "CRM", href: "/dashboard/crm", icon: Briefcase },
  { name: "Email", href: "/dashboard/email", icon: Mail },
  { name: "Documents", href: "/dashboard/documents", icon: FileText },
  { name: "Chat", href: "/dashboard/chat", icon: MessageSquare },
  { name: "Skills", href: "/dashboard/skills", icon: Puzzle },
];

export function TabNavigation() {
  const pathname = usePathname();

  return (
    <nav className="flex h-12 items-center gap-1 border-b border-hud-border bg-hud-bg/50 px-4 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = pathname?.startsWith(tab.href);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`
              flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium
              transition-all duration-200 whitespace-nowrap
              ${
                isActive
                  ? "bg-hud-accent/15 text-hud-accent border border-hud-accent/30"
                  : "text-hud-text-secondary hover:text-hud-text hover:bg-hud-surface-hover border border-transparent"
              }
            `}
          >
            <Icon size={16} />
            <span>{tab.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
