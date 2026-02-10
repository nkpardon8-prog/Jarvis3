import { promises as fs } from "fs";
import path from "path";

const MEMORY_DIR = path.join(__dirname, "..", "..", "data", "memory");

function memoryPath(userId: string): string {
  return path.join(MEMORY_DIR, `${userId}.md`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
}

export async function readMemory(userId: string): Promise<string> {
  await ensureDir();
  try {
    return await fs.readFile(memoryPath(userId), "utf8");
  } catch {
    return "";
  }
}

export async function writeMemory(userId: string, content: string): Promise<void> {
  await ensureDir();
  await fs.writeFile(memoryPath(userId), content, "utf8");
}

export async function appendMemory(userId: string, bullets: string[]): Promise<void> {
  if (!bullets.length) return;
  await ensureDir();
  const payload = bullets.map((line) => (line.startsWith("- ") ? line : `- ${line}`)).join("\n") + "\n";
  await fs.appendFile(memoryPath(userId), payload, "utf8");
}

export function summarizeForMemory(text: string, maxBullets = 2): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const bullets = sentences.slice(0, maxBullets).map((s) => s.slice(0, 220).trim());
  return bullets.filter(Boolean);
}
