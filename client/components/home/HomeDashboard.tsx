"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { SystemHealth } from "./SystemHealth";
import { ChannelStatus } from "./ChannelStatus";
import { QuickActions } from "./QuickActions";
import { ActiveModel } from "./ActiveModel";
import { SkillsSummary } from "./SkillsSummary";
import { RecentSessions } from "./RecentSessions";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function HomeDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-status"],
    queryFn: async () => {
      const res = await api.get<any>("/dashboard/status");
      if (!res.ok) throw new Error(res.error || "Failed to load dashboard");
      return res.data;
    },
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <GlassPanel>
        <div className="text-center py-12">
          <p className="text-hud-error">Failed to load dashboard data</p>
          <p className="text-sm text-hud-text-muted mt-1">{(error as Error).message}</p>
        </div>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-hud-text">Command Center</h2>

      {/* Top row — health + model + quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SystemHealth
          gateway={data?.gateway}
          health={data?.health}
        />
        <ActiveModel
          models={data?.models}
          health={data?.health}
          sessions={data?.sessions}
        />
        <QuickActions />
      </div>

      {/* Bottom row — channels + skills + sessions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ChannelStatus health={data?.health} channels={data?.channels} />
        <SkillsSummary skills={data?.skills} />
        <RecentSessions sessions={data?.sessions} />
      </div>
    </div>
  );
}
