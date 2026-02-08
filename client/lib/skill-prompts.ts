/**
 * Prompt templates for skill configuration flows.
 * These are sent to the chat agent to guide users through setup.
 * No runtime dependency on external files — all content is self-contained.
 */

const STORAGE_KEY = "jarvis:auto-prompt";

/** Build a prompt for configuring/enabling an existing skill */
export function buildAddSkillPrompt(skill: {
  key: string;
  displayName: string;
  description?: string;
  missingRequirements?: { bins?: string[]; env?: string[]; config?: string[] };
  requires?: { bins?: string[]; env?: string[]; config?: string[] };
}): string {
  const parts = [
    `I want to set up and enable the "${skill.displayName}" skill (key: ${skill.key}).`,
  ];

  if (skill.description) {
    parts.push(`It does: ${skill.description}`);
  }

  const missing = skill.missingRequirements;
  const requires = skill.requires;

  if (missing?.env?.length || requires?.env?.length) {
    const envVars = [...new Set([...(missing?.env || []), ...(requires?.env || [])])];
    parts.push(`It needs these environment variables configured: ${envVars.join(", ")}.`);
  }
  if (missing?.bins?.length) {
    parts.push(`It requires these binaries to be installed: ${missing.bins.join(", ")}.`);
  }
  if (missing?.config?.length) {
    parts.push(`It needs these config keys set: ${missing.config.join(", ")}.`);
  }

  parts.push(
    "Please help me configure everything needed to get this skill working. " +
    "Walk me through each required credential or dependency step by step, " +
    "then enable the skill when ready."
  );

  return parts.join("\n\n");
}

/** Build an onboarding prompt for installing a ClawHub skill by slug */
export function buildPremadeSkillPrompt(slug: string): string {
  return [
    `I want to install the "${slug}" skill from ClawHub.`,
    "",
    "Before installing, walk me through these quick confirmations:",
    `1. Install this skill: ${slug} — yes or no?`,
    "2. Install the latest version, or pick a specific version?",
    "3. Install into the default workspace skills path — confirm or specify a different path.",
    "4. Open SKILL.md to review before enabling — yes or no?",
    "",
    "After I confirm, run the install command:",
    `\`npx clawhub@latest install ${slug}\``,
    "",
    "Then walk me through any required configuration (API keys, env vars, dependencies) and enable the skill when ready.",
  ].join("\n");
}

/** Build a prompt for creating a brand new custom skill */
export function buildCustomSkillPrompt(): string {
  return [
    "I want to create a new custom skill for OpenClaw.",
    "",
    "Use the skill-creator capability to guide me through the process:",
    "1. Help me define what the skill should do with concrete examples",
    "2. Plan the skill contents (scripts, references, assets as needed)",
    "3. Initialize the skill structure with SKILL.md and proper frontmatter",
    "4. Write the skill instructions and any bundled resources",
    "5. Package it when ready",
    "",
    "Start by asking me what I want the skill to do.",
  ].join("\n");
}

/** Store a prompt for the chat page to pick up after navigation */
export function storeAutoPrompt(prompt: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, prompt);
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

/** Consume the stored auto-prompt (reads and clears) */
export function consumeAutoPrompt(): string | null {
  try {
    const prompt = sessionStorage.getItem(STORAGE_KEY);
    if (prompt) {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    return prompt;
  } catch {
    return null;
  }
}
