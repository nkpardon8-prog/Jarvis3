// ─── Barrel Export for Workflow Templates Module ─────────────────
export type {
  WorkflowTemplate,
  CredentialField,
  ScheduleValue,
  SchedulePreset,
  CustomSkillDef,
} from "./types";

export { WORKFLOW_TEMPLATES } from "./templates";
export { CUSTOM_SKILLS } from "./skills";

// ── Helpers ──────────────────────────────────────────────────────

import { WORKFLOW_TEMPLATES } from "./templates";

/** Look up a template by ID. Returns undefined for unknown IDs. */
export function getTemplateById(id: string) {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

/** All unique category strings across all templates. */
export function getCategories(): string[] {
  const cats = new Set(WORKFLOW_TEMPLATES.map((t) => t.category));
  return Array.from(cats);
}

/** Filter templates by category. Pass undefined for all. */
export function getTemplatesByCategory(category?: string) {
  if (!category) return WORKFLOW_TEMPLATES;
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}
