// ─── Workflow Template Types ──────────────────────────────

export interface CredentialField {
  envVar: string;
  label: string;
  placeholder: string;
  helpUrl?: string;
}

export interface ScheduleValue {
  kind: "cron" | "every";
  expr?: string;
  intervalMs?: number;
}

export interface SchedulePreset {
  label: string;
  value: ScheduleValue;
}

export interface CustomSkillDef {
  slug: string;
  name: string;
  description: string;
  skillMd: string; // Full SKILL.md content to deploy
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide-react icon name
  accentColor: string; // HUD color token
  category: string;
  complexity: "easy" | "medium" | "hard";
  requiredSkills: string[];
  customSkills: CustomSkillDef[];
  credentialFields: CredentialField[];
  oauthProviders?: string[];
  defaultSchedule: ScheduleValue;
  schedulePresets: SchedulePreset[];
  promptTemplate: string;
  sessionTarget: "isolated" | "main";
}
