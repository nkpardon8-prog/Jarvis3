"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { InstalledSkillCard } from "./InstalledSkillCard";
import { PremadeSkillsBrowser } from "./PremadeSkillsBrowser";
import { buildCustomSkillPrompt, storeAutoPrompt } from "@/lib/skill-prompts";
import { Search, Blocks, Wrench, Package } from "lucide-react";

type StatusFilter = "all" | "active" | "inactive";

export function SkillsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showBrowser, setShowBrowser] = useState(false);
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
    mutationFn: async ({
      skillKey,
      enabled,
    }: {
      skillKey: string;
      enabled: boolean;
    }) => {
      const res = await api.patch(
        `/skills/${encodeURIComponent(skillKey)}`,
        { enabled }
      );
      if (!res.ok) throw new Error(res.error || "Failed to update skill");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  const handleCredentialsSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["skills"] });
  };

  function handleBuildCustomSkill() {
    const prompt = buildCustomSkillPrompt();
    storeAutoPrompt(prompt, "build-custom-skill");
    router.push("/dashboard/chat");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // If browsing premade skills, show that view instead
  if (showBrowser) {
    return <PremadeSkillsBrowser onClose={() => setShowBrowser(false)} />;
  }

  const skills = data?.skills || data?.installed || [];
  const counts = data?.counts || {
    total: skills.length,
    active: 0,
    inactive: 0,
  };

  // Apply status filter
  const statusFiltered =
    statusFilter === "all"
      ? skills
      : skills.filter((s: any) => s.status === statusFilter);

  // Apply search filter
  const filteredSkills = searchQuery
    ? statusFiltered.filter(
        (s: any) =>
          s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.key?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : statusFiltered;

  const filterTabs: {
    key: StatusFilter;
    label: string;
    count: number;
    color: string;
  }[] = [
    {
      key: "all",
      label: "All",
      count: counts.total,
      color: "text-hud-text-muted",
    },
    {
      key: "active",
      label: "Active",
      count: counts.active,
      color: "text-hud-success",
    },
    {
      key: "inactive",
      label: "Inactive",
      count: counts.inactive,
      color: "text-hud-text-muted",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-hud-text">Skills</h2>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-hud-success">
            <span className="h-1.5 w-1.5 rounded-full bg-hud-success" />
            {counts.active} active
          </span>
          {counts.inactive > 0 && (
            <span className="flex items-center gap-1.5 text-hud-text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-hud-text-muted" />
              {counts.inactive} inactive
            </span>
          )}
          <span className="flex items-center gap-1.5 text-hud-text-muted">
            <Blocks size={14} className="text-hud-accent" />
            {counts.total} total
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === tab.key
                ? "bg-hud-accent/20 text-hud-accent border border-hud-accent/30"
                : "text-hud-text-muted hover:text-hud-text hover:bg-white/5 border border-transparent"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`ml-1.5 ${statusFilter === tab.key ? "text-hud-accent" : tab.color}`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Skill actions */}
      <div className="flex items-center gap-3">
          <button
            onClick={handleBuildCustomSkill}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-hud-accent/10 text-hud-accent border border-hud-accent/20 rounded-lg hover:bg-hud-accent/20 transition-colors"
          >
            <Wrench size={14} />
            Build a Custom Skill
          </button>
          <button
            onClick={() => setShowBrowser(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-hud-surface text-hud-text border border-hud-border rounded-lg hover:bg-white/5 transition-colors"
          >
            <Package size={14} />
            Browse Premade Skills
          </button>
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
            onCredentialsSaved={handleCredentialsSaved}
            isToggling={toggleSkill.isPending}
          />
        ))}
      </div>

      {filteredSkills.length === 0 && (
        <GlassPanel>
          <div className="text-center py-8">
            <p className="text-sm text-hud-text-muted">
              {searchQuery
                ? "No skills match your search"
                : statusFilter !== "all"
                  ? `No ${statusFilter} skills`
                  : "No skills installed"}
            </p>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
