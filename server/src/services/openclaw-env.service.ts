import { promises as fs } from "fs";
import path from "path";
import os from "os";

function openclawEnvPath(): string {
  return path.join(os.homedir(), ".openclaw", ".env");
}

// Minimal .env parser: KEY=VALUE lines, ignores comments and blank lines.
export async function readOpenClawEnvVar(key: string): Promise<string | null> {
  try {
    const file = await fs.readFile(openclawEnvPath(), "utf8");
    const lines = file.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const k = line.slice(0, idx).trim();
      if (k !== key) continue;
      let v = line.slice(idx + 1);
      // Strip surrounding quotes if present
      v = v.trim();
      if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v.trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}
