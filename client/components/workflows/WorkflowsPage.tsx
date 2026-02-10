"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { WorkflowCard } from "./WorkflowCard";
import { WorkflowSetupModal } from "./WorkflowSetupModal";
import { CustomWorkflowBuilder } from "./CustomWorkflowBuilder";
import { Workflow, Plus, Wand2, Zap, Search } from "lucide-react";

export function WorkflowsPage() {
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const res = await api.get<any>("/workflows");
      if (!res.ok) throw new Error(res.error || "Failed to load workflows");
      return res.data;
    },
    refetchInterval: 30000, // Refresh every 30s for live cron status
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const workflows = data?.workflows || [];

  const activeCount = workflows.filter(
    (w: any) => w.status === "active"
  ).length;
  const pausedCount = workflows.filter(
    (w: any) => w.status === "paused"
  ).length;

  // Filter by search
  const filteredWorkflows = searchQuery
    ? workflows.filter(
        (w: any) =>
          w.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          w.templateId?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : workflows;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-hud-text">Workflows</h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Status counts */}
          {workflows.length > 0 && (
            <div className="flex items-center gap-3 text-sm">
              {activeCount > 0 && (
                <span className="flex items-center gap-1.5 text-hud-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-hud-success" />
                  {activeCount} active
                </span>
              )}
              {pausedCount > 0 && (
                <span className="flex items-center gap-1.5 text-hud-amber">
                  <span className="h-1.5 w-1.5 rounded-full bg-hud-amber" />
                  {pausedCount} paused
                </span>
              )}
              <span className="flex items-center gap-1.5 text-hud-text-muted">
                <Workflow size={14} className="text-hud-accent" />
                {workflows.length} total
              </span>
            </div>
          )}

          {/* Build Custom button */}
          <button
            onClick={() => setShowCustomBuilder(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-hud-amber/15 text-hud-amber border border-hud-amber/25 rounded-lg hover:bg-hud-amber/25 transition-colors"
          >
            <Wand2 size={14} />
            Build Custom
          </button>

          {/* Add Workflow button */}
          <button
            onClick={() => setShowSetupModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors"
          >
            <Plus size={14} />
            Add Workflow
          </button>
        </div>
      </div>

      {/* Search (only show if there are workflows) */}
      {workflows.length > 0 && (
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-hud-text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workflows..."
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
          />
        </div>
      )}

      {/* Workflows grid */}
      {filteredWorkflows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredWorkflows.map((workflow: any) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      ) : workflows.length > 0 && searchQuery ? (
        <GlassPanel>
          <div className="text-center py-8">
            <p className="text-sm text-hud-text-muted">
              No workflows match your search
            </p>
          </div>
        </GlassPanel>
      ) : (
        /* Empty state */
        <GlassPanel>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-hud-accent/10 mb-4">
              <Zap size={28} className="text-hud-accent" />
            </div>
            <h3 className="text-base font-semibold text-hud-text mb-2">
              No Workflows Yet
            </h3>
            <p className="text-sm text-hud-text-muted mb-6 max-w-md mx-auto">
              Workflows are automation packages that combine skill
              downloads, API connections, and scheduled tasks into a single
              plug-and-play setup. Choose a pre-built template or build your own.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowSetupModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 rounded-lg hover:bg-hud-accent/30 transition-colors"
              >
                <Plus size={16} />
                Use a Template
              </button>
              <button
                onClick={() => setShowCustomBuilder(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-hud-amber/15 text-hud-amber border border-hud-amber/25 rounded-lg hover:bg-hud-amber/25 transition-colors"
              >
                <Wand2 size={16} />
                Build Custom
              </button>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Setup Modal */}
      {showSetupModal && (
        <WorkflowSetupModal
          onClose={() => setShowSetupModal(false)}
          onSwitchToCustom={() => setShowCustomBuilder(true)}
        />
      )}

      {/* Custom Workflow Builder */}
      {showCustomBuilder && (
        <CustomWorkflowBuilder onClose={() => setShowCustomBuilder(false)} />
      )}
    </div>
  );
}
