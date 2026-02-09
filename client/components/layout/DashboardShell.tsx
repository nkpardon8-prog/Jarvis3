"use client";

import { ReactNode, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TopBar } from "./TopBar";
import { TabNavigation } from "./TabNavigation";

export function DashboardShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Prefetch email inbox data so it's ready when user navigates to Email tab
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ["email-inbox"],
      queryFn: async () => {
        const res = await api.get<any>("/email/inbox?max=15&withProcessed=true");
        if (!res.ok) throw new Error(res.error);
        return res.data;
      },
      staleTime: 2 * 60 * 1000,
    });
  }, [queryClient]);

  return (
    <div className="flex h-screen flex-col bg-hud-bg circuit-bg">
      <TopBar />
      <TabNavigation />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
