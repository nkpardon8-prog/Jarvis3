"use client";

import { ReactNode, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TopBar } from "./TopBar";
import { TabNavigation } from "./TabNavigation";

export function DashboardShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Eagerly prefetch all email data on login so the Email tab is instant
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const prefetchEmail = async () => {
      const opts = { signal: controller.signal };

      // 1. Fetch status first to know if connected
      const statusRes = await api.get<any>("/email/status", opts);
      if (!statusRes.ok || controller.signal.aborted) return;
      queryClient.setQueryData(["email-status"], statusRes.data);

      if (!statusRes.data?.connected) return;

      // 2. Fetch settings + inbox in parallel
      const [settingsRes, inboxRes] = await Promise.all([
        api.get<any>("/email/settings", opts),
        api.get<any>("/email/inbox?months=1", opts),
      ]);

      if (controller.signal.aborted) return;

      if (settingsRes.ok) {
        queryClient.setQueryData(["email-settings"], settingsRes.data);
      }
      if (inboxRes.ok) {
        queryClient.setQueryData(["email-inbox-chunk-0"], inboxRes.data);

        // 3. Prefetch email tags for loaded messages
        const msgs = inboxRes.data.messages || [];
        if (msgs.length > 0) {
          const ids = msgs.map((m: any) => m.id).join(",");
          const tagsRes = await api.get<any>(`/email/email-tags?ids=${ids}`, opts);
          if (tagsRes.ok) {
            queryClient.setQueryData(["email-tags", ids], tagsRes.data);
          }
        }
      }
    };

    prefetchEmail().catch(() => {});

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [queryClient]);

  return (
    <div className="flex h-screen flex-col bg-hud-bg circuit-bg">
      <TopBar />
      <TabNavigation />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
