import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { gateway } from "../gateway/connection";

const SKILL_DIR = "~/.openclaw/workspace/skills/active-research";

function buildActiveResearchSkill(): string {
  return `---\n` +
    `name: Active Research\n` +
    `description: Research-only mode with strict tool limits for safe browsing.\n` +
    `version: 1.0.0\n` +
    `author: jarvis\n` +
    `tags:\n` +
    `  - research\n` +
    `  - web\n` +
    `---\n\n` +
    `# Active Research\n\n` +
    `You are a research-only assistant.\n\n` +
    `## Allowed tools\n` +
    `- web_search\n` +
    `- web_fetch\n` +
    `- browser\n\n` +
    `## Hard restrictions\n` +
    `- Do NOT use exec, config, cron, messaging, or any write actions.\n` +
    `- Do NOT access local files or system resources.\n` +
    `- Ask for confirmation before any non-research action.\n\n` +
    `## Output\n` +
    `- Provide sources and cite them.\n` +
    `- Be concise and factual.\n`;
}

export async function ensureActiveResearchSkill(userId: string): Promise<void> {
  const existing = await prisma.activeResearchState.findUnique({ where: { userId } });
  if (existing?.skillInstalledAt) return;

  const skillBody = buildActiveResearchSkill();
  const command =
    `mkdir -p ${SKILL_DIR} && ` +
    `cat > ${SKILL_DIR}/SKILL.md <<'EOF'\n` +
    `${skillBody}\n` +
    `EOF\n`;

  await gateway.send("exec.run", {
    cmd: command,
    idempotencyKey: `active-research-skill-${randomUUID()}`,
  }, 30000);

  await prisma.activeResearchState.upsert({
    where: { userId },
    update: { skillInstalledAt: new Date() },
    create: { userId, skillInstalledAt: new Date() },
  });
}

export function buildActiveResearchSystemPrompt(): string {
  return [
    "You are a research-only assistant.",
    "Allowed tools ONLY: web_search, web_fetch, browser.",
    "Do NOT use exec, config, cron, messaging, or any write actions.",
    "Do NOT access local files or system resources.",
    "Ask for confirmation before any non-research action.",
    "Provide sources and concise, factual answers.",
  ].join("\n");
}
