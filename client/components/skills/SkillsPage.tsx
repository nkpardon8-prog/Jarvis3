"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { InstalledSkillCard } from "./InstalledSkillCard";
import { Search, Blocks } from "lucide-react";

export function SkillsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: async () => {
      const res = await api.get<any>("/skills");
      if (!res.ok) throw new Error(res.error || "Failed to load skills");
      return res.data;
    },
  });

  const toggleSkill = useMutation({
    mutationFn: async ({ skillKey, enabled }: { skillKey: string; enabled: boolean }) => {
      const res = await api.patch(`/skills/${encodeURIComponent(skillKey)}`, { enabled });
      if (!res.ok) throw new Error(res.error || "Failed to update skill");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const skills = data?.skills || data?.installed || [];
  const filteredSkills = searchQuery
    ? skills.filter(
        (s: any) =>
          s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.key?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : skills;

  const enabledCount = skills.filter((s: any) => s.enabled !== false).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-hud-text">Skills</h2>
        <div className="flex items-center gap-2 text-sm text-hud-text-muted">
          <Blocks size={14} className="text-hud-accent" />
          {enabledCount} / {skills.length} active
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-hud-text-muted"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search skills..."
          className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
        />
      </div>

      {/* Installed skills grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredSkills.map((skill: any) => (
          <InstalledSkillCard
            key={skill.key || skill.name}
            skill={skill}
            onToggle={(enabled) =>
              toggleSkill.mutate({
                skillKey: skill.key || skill.name,
                enabled,
              })
            }
            isToggling={toggleSkill.isPending}
          />
        ))}
      </div>

      {filteredSkills.length === 0 && (
        <GlassPanel>
          <div className="text-center py-8">
            <p className="text-sm text-hud-text-muted">
              {searchQuery ? "No skills match your search" : "No skills installed"}
            </p>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
