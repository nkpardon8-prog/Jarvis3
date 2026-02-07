"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Briefcase, Sheet, Link2, ArrowRight } from "lucide-react";
import Link from "next/link";

export function CrmPage() {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["crm-status"],
    queryFn: async () => {
      const res = await api.get<any>("/crm/status");
      if (!res.ok) throw new Error(res.error || "Failed to load CRM status");
      return res.data;
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (settings: { spreadsheetId: string }) => {
      const res = await api.put("/crm/settings", settings);
      if (!res.ok) throw new Error(res.error || "Failed to save");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-status"] });
      setSpreadsheetId("");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const connected = data?.connected ?? false;
  const settings = data?.settings || {};

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-hud-text">CRM Pipeline</h2>

      {connected ? (
        <>
          {/* Connected state */}
          <GlassPanel>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-hud-success/20">
                <Sheet size={20} className="text-hud-success" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-hud-text">
                  Google Sheets Connected
                </h3>
                <p className="text-xs text-hud-text-muted">
                  Spreadsheet ID: {settings.spreadsheetId}
                </p>
              </div>
            </div>

            <div className="text-center py-8 border-t border-hud-border mt-4">
              <Briefcase size={32} className="text-hud-text-muted mx-auto mb-3" />
              <p className="text-sm text-hud-text-secondary">
                Pipeline board coming soon
              </p>
              <p className="text-xs text-hud-text-muted mt-1">
                Contact management and deal tracking will appear here.
              </p>
            </div>
          </GlassPanel>
        </>
      ) : (
        <>
          {/* Setup state */}
          <GlassPanel>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-hud-amber/20">
                <Briefcase size={20} className="text-hud-amber" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-hud-text">
                  Setup CRM
                </h3>
                <p className="text-xs text-hud-text-muted">
                  Connect a Google Spreadsheet to manage contacts and deals
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-white/3 rounded-lg border border-hud-border">
                <h4 className="text-xs font-semibold text-hud-text mb-2">
                  Setup Instructions:
                </h4>
                <ol className="space-y-1.5 text-xs text-hud-text-muted">
                  <li>
                    1. Connect your Google account in{" "}
                    <Link
                      href="/dashboard/connections"
                      className="text-hud-accent hover:underline"
                    >
                      Connections
                    </Link>
                  </li>
                  <li>2. Create or choose a Google Spreadsheet for your CRM data</li>
                  <li>3. Enter the Spreadsheet ID below</li>
                  <li>4. The sheet will be auto-formatted with the CRM template</li>
                </ol>
              </div>

              <div>
                <label className="text-xs text-hud-text-muted mb-1 block">
                  Google Spreadsheet ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                    placeholder="Enter spreadsheet ID from URL"
                    className="flex-1 bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
                  />
                  <HudButton
                    size="sm"
                    onClick={() => saveSettings.mutate({ spreadsheetId })}
                    disabled={!spreadsheetId.trim() || saveSettings.isPending}
                  >
                    Connect
                  </HudButton>
                </div>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel>
            <div className="text-center py-4">
              <Link2 size={20} className="text-hud-text-muted mx-auto mb-2" />
              <Link
                href="/dashboard/connections"
                className="flex items-center gap-1 text-xs text-hud-accent hover:text-hud-accent/80 transition-colors justify-center"
              >
                Go to Connections to set up Google OAuth{" "}
                <ArrowRight size={12} />
              </Link>
            </div>
          </GlassPanel>
        </>
      )}
    </div>
  );
}
