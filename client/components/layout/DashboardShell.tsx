"use client";

import { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { TabNavigation } from "./TabNavigation";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-hud-bg circuit-bg">
      <TopBar />
      <TabNavigation />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
