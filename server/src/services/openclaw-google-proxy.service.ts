import { randomBytes, createHash, randomUUID } from "crypto";
import { prisma } from "./prisma";
import { gateway } from "../gateway/connection";
import { config } from "../config";
import { getTokensForProvider } from "./oauth.service";

// ─── Error codes ──────────────────────────────────────────

export type ProvisionErrorCode =
  | "google_not_connected"
  | "gateway_disconnected"
  | "env_write_failed"
  | "skill_create_failed"
  | "skill_verify_failed"
  | "unknown";

// ─── Types ────────────────────────────────────────────────

export interface ProvisionResult {
  deployed: boolean;
  proxyUrl: string;
  skillVerified: boolean;
  tokenRotated: boolean;
}

export interface ProvisionStatus {
  status: "pending" | "success" | "failed" | "none";
  errorCode: string | null;
  errorMessage: string | null;
  targetProxyUrl: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  hasProxyToken: boolean;
  googleConnected: boolean;
  gatewayConnected: boolean;
}

// ─── Idempotency guard ───────────────────────────────────
// Prevent concurrent provisioning per user and rate-limit retries

const activeProvisions = new Set<string>();
const REPROVISION_COOLDOWN_MS = 30_000; // 30s between attempts

// ─── Skill template ──────────────────────────────────────

function buildGoogleSkillMd(proxyUrl: string): string {
  return `---
name: Jarvis Google Proxy
description: Access Gmail, Calendar, and Drive through Jarvis using a bearer token.
version: 1.0.0
author: jarvis
tags:
  - google
  - gmail
  - calendar
  - drive
  - proxy
---

# Jarvis Google Proxy

Use the Jarvis Google proxy for Gmail, Calendar, and Drive operations.

## Auth

Send this header on every request:
\`Authorization: Bearer \${JARVIS_GOOGLE_PROXY_TOKEN}\`

## Base URL

\`${proxyUrl}/api/google-proxy\`

Compatibility alias: \`${proxyUrl}/api/gmail-proxy\`

## Gmail

- \`GET /messages\` — list messages
- \`GET /messages/:id\` — full message content
- \`POST /messages/search\` — Gmail query syntax search
- \`POST /messages/modify\` — add/remove labels in batch
- \`POST /messages/send\` — send email
- \`GET /labels\` — list labels
- \`POST /labels\` — create label

## Calendar

- \`GET /calendar/events\` — list events
- \`POST /calendar/events\` — create event

## Drive + Docs

- \`GET /drive/files\` — list files
- \`GET /drive/search\` — full-text search
- \`GET /docs/:docId\` — read Google Doc text

## Response format

All endpoints return \`{ ok: boolean, data?: T, error?: string }\`.

## Rate limits

Proxy applies per-user limits to protect the backend.
`;
}

// ─── Agent exec helper ───────────────────────────────────

async function agentExec(prompt: string, timeoutMs = 60000): Promise<any> {
  const defaults = gateway.sessionDefaults;
  const agentId = defaults?.defaultAgentId || "main";
  const mainKey = defaults?.mainKey || "main";
  const sessionKey = `agent:${agentId}:${mainKey}`;

  return gateway.send(
    "chat.send",
    {
      sessionKey,
      message: prompt,
      deliver: true,
      thinking: "low",
      idempotencyKey: `google-proxy-${Date.now()}-${randomUUID().slice(0, 8)}`,
    },
    timeoutMs
  );
}

// ─── Status helpers ──────────────────────────────────────

async function recordProvisionAttempt(
  userId: string,
  proxyUrl: string
): Promise<void> {
  await prisma.proxyProvisionStatus.upsert({
    where: { userId },
    update: {
      status: "pending",
      errorCode: null,
      errorMessage: null,
      targetProxyUrl: proxyUrl,
      lastAttemptAt: new Date(),
    },
    create: {
      userId,
      status: "pending",
      targetProxyUrl: proxyUrl,
      lastAttemptAt: new Date(),
    },
  });
}

async function recordProvisionSuccess(
  userId: string,
  proxyUrl: string,
  skillVerified: boolean
): Promise<void> {
  const now = new Date();
  await prisma.proxyProvisionStatus.upsert({
    where: { userId },
    update: {
      status: "success",
      errorCode: null,
      errorMessage: null,
      targetProxyUrl: proxyUrl,
      lastAttemptAt: now,
      lastSuccessAt: now,
    },
    create: {
      userId,
      status: "success",
      targetProxyUrl: proxyUrl,
      lastAttemptAt: now,
      lastSuccessAt: now,
    },
  });
  if (!skillVerified) {
    console.warn(`[Provision] userId=${userId} deployed but skill not yet verified`);
  }
}

async function recordProvisionFailure(
  userId: string,
  errorCode: ProvisionErrorCode,
  errorMessage: string
): Promise<void> {
  await prisma.proxyProvisionStatus.upsert({
    where: { userId },
    update: {
      status: "failed",
      errorCode,
      errorMessage,
      lastAttemptAt: new Date(),
    },
    create: {
      userId,
      status: "failed",
      errorCode,
      errorMessage,
      lastAttemptAt: new Date(),
    },
  });
}

// ─── Get provisioning status ─────────────────────────────

export async function getProvisionStatus(userId: string): Promise<ProvisionStatus> {
  const [statusRecord, tokenRecord, googleTokens] = await Promise.all([
    prisma.proxyProvisionStatus.findUnique({ where: { userId } }),
    prisma.proxyApiToken.findUnique({ where: { userId } }),
    getTokensForProvider(userId, "google"),
  ]);

  return {
    status: statusRecord?.status as ProvisionStatus["status"] || "none",
    errorCode: statusRecord?.errorCode || null,
    errorMessage: statusRecord?.errorMessage || null,
    targetProxyUrl: statusRecord?.targetProxyUrl || null,
    lastAttemptAt: statusRecord?.lastAttemptAt?.toISOString() || null,
    lastSuccessAt: statusRecord?.lastSuccessAt?.toISOString() || null,
    hasProxyToken: !!tokenRecord,
    googleConnected: !!googleTokens,
    gatewayConnected: gateway.isConnected,
  };
}

// ─── Core provisioning ──────────────────────────────────

export async function provisionOpenClawGoogleProxy(
  userId: string,
  options?: { force?: boolean }
): Promise<ProvisionResult> {
  // Concurrency guard
  if (activeProvisions.has(userId)) {
    throw new Error("Provisioning already in progress for this user");
  }

  const proxyUrl = config.oauthBaseUrl || `http://localhost:${config.port}`;

  // Idempotency: skip if already successful recently (unless forced)
  if (!options?.force) {
    const existing = await prisma.proxyProvisionStatus.findUnique({ where: { userId } });
    if (
      existing?.status === "success" &&
      existing.lastSuccessAt &&
      Date.now() - existing.lastSuccessAt.getTime() < REPROVISION_COOLDOWN_MS
    ) {
      return {
        deployed: true,
        proxyUrl: existing.targetProxyUrl || proxyUrl,
        skillVerified: true,
        tokenRotated: false,
      };
    }
  }

  activeProvisions.add(userId);
  try {
    // Pre-checks with structured error codes
    const googleTokens = await getTokensForProvider(userId, "google");
    if (!googleTokens) {
      await recordProvisionFailure(userId, "google_not_connected", "Google account not connected. Connect Google first.");
      throw new ProvisionError("google_not_connected", "Google account not connected. Connect Google first.");
    }

    if (!gateway.isConnected) {
      await recordProvisionFailure(userId, "gateway_disconnected", "OpenClaw gateway not connected.");
      throw new ProvisionError("gateway_disconnected", "OpenClaw gateway not connected.");
    }

    // Record attempt
    await recordProvisionAttempt(userId, proxyUrl);

    // Check if we already have a token — only rotate if none exists or forced
    let tokenRotated = false;
    const existingToken = await prisma.proxyApiToken.findUnique({ where: { userId } });

    let plaintext: string;
    if (!existingToken || options?.force) {
      plaintext = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(plaintext).digest("hex");
      await prisma.proxyApiToken.upsert({
        where: { userId },
        update: { tokenHash, label: "OpenClaw Google Proxy" },
        create: { userId, tokenHash, label: "OpenClaw Google Proxy" },
      });
      tokenRotated = true;
    } else {
      // Re-generate plaintext for env write since we don't store it
      // We MUST rotate to write to env — we can't recover the original plaintext
      plaintext = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(plaintext).digest("hex");
      await prisma.proxyApiToken.update({
        where: { userId },
        data: { tokenHash },
      });
      tokenRotated = true;
    }

    // Write env vars
    try {
      await agentExec(
        `Update ~/.openclaw/.env using update-or-append semantics for each key. Set JARVIS_GOOGLE_PROXY_TOKEN=${plaintext}. Set JARVIS_GMAIL_PROXY_TOKEN=${plaintext}. Do not print secret values in your response. Confirm done.`,
        30000
      );
    } catch (err: any) {
      await recordProvisionFailure(userId, "env_write_failed", `Failed to write proxy token to OpenClaw env: ${err.message}`);
      throw new ProvisionError("env_write_failed", `Failed to write proxy token to OpenClaw env: ${err.message}`);
    }

    try {
      await agentExec(
        `Update ~/.openclaw/.env using update-or-append semantics for each key. Set JARVIS_GOOGLE_PROXY_URL=${proxyUrl}. Set JARVIS_GMAIL_PROXY_URL=${proxyUrl}. Confirm done.`,
        30000
      );
    } catch (err: any) {
      await recordProvisionFailure(userId, "env_write_failed", `Failed to write proxy URL to OpenClaw env: ${err.message}`);
      throw new ProvisionError("env_write_failed", `Failed to write proxy URL to OpenClaw env: ${err.message}`);
    }

    // Write skill
    try {
      const skillMd = buildGoogleSkillMd(proxyUrl).replace(/`/g, "\\`");
      await agentExec(
        `Create directory ~/.openclaw/skills/jarvis-google if missing, then overwrite ~/.openclaw/skills/jarvis-google/SKILL.md with:\n\n${skillMd}\n\nConfirm done.`,
        30000
      );
    } catch (err: any) {
      await recordProvisionFailure(userId, "skill_create_failed", `Failed to create skill: ${err.message}`);
      throw new ProvisionError("skill_create_failed", `Failed to create skill: ${err.message}`);
    }

    // Verify skill
    let skillVerified = false;
    try {
      const skillsResult = (await gateway.send("skills.status", {})) as any;
      const skills = Array.isArray(skillsResult?.skills)
        ? skillsResult.skills
        : Array.isArray(skillsResult)
          ? skillsResult
          : [];
      skillVerified = skills.some(
        (s: any) => s.key === "jarvis-google" || s.name === "Jarvis Google Proxy"
      );
    } catch {
      // Non-fatal — skill may take a moment to be detected
    }

    // Record success
    await recordProvisionSuccess(userId, proxyUrl, skillVerified);

    return {
      deployed: true,
      proxyUrl,
      skillVerified,
      tokenRotated,
    };
  } finally {
    activeProvisions.delete(userId);
  }
}

// ─── Idempotent backfill: ensure provisioned ─────────────
// Call from status endpoints — safe to call frequently.
// Only triggers provisioning if: Google connected + no successful provision.

const backfillAttempted = new Set<string>();

export async function ensureProvisioned(userId: string): Promise<void> {
  // Only attempt once per server lifetime per user (unless they retry manually)
  if (backfillAttempted.has(userId)) return;
  backfillAttempted.add(userId);

  try {
    const googleTokens = await getTokensForProvider(userId, "google");
    if (!googleTokens) return; // Not connected, nothing to do

    if (!gateway.isConnected) return; // Gateway down, skip silently

    const existing = await prisma.proxyProvisionStatus.findUnique({ where: { userId } });
    if (existing?.status === "success") return; // Already provisioned

    // Fire-and-forget
    console.log(`[Provision] Backfill: auto-provisioning userId=${userId}`);
    provisionOpenClawGoogleProxy(userId).catch((err: any) => {
      console.error(`[Provision] Backfill failed userId=${userId}:`, err.message);
    });
  } catch (err: any) {
    console.error(`[Provision] Backfill check error userId=${userId}:`, err.message);
  }
}

// Reset the backfill flag so the next status check can re-trigger
export function resetBackfillFlag(userId: string): void {
  backfillAttempted.delete(userId);
}

// ─── Startup sweep ──────────────────────────────────────

export async function backfillAllConnectedUsers(): Promise<void> {
  if (!gateway.isConnected) {
    console.log("[Provision] Skipping startup backfill — gateway not connected");
    return;
  }

  try {
    // Find users with Google OAuth tokens but no successful provision
    const googleTokenUsers = await prisma.oAuthToken.findMany({
      where: { provider: "google" },
      select: { userId: true },
    });

    if (googleTokenUsers.length === 0) return;

    const successfulProvisions = await prisma.proxyProvisionStatus.findMany({
      where: { status: "success" },
      select: { userId: true },
    });
    const successSet = new Set(successfulProvisions.map((p) => p.userId));

    const needsProvision = googleTokenUsers.filter((u) => !successSet.has(u.userId));
    if (needsProvision.length === 0) {
      console.log("[Provision] All Google-connected users already provisioned");
      return;
    }

    console.log(`[Provision] Startup backfill: ${needsProvision.length} user(s) need provisioning`);

    // Provision sequentially to avoid overwhelming the gateway
    for (const user of needsProvision) {
      try {
        await provisionOpenClawGoogleProxy(user.userId);
        console.log(`[Provision] Backfill success: userId=${user.userId}`);
      } catch (err: any) {
        console.error(`[Provision] Backfill failed userId=${user.userId}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error("[Provision] Startup backfill error:", err.message);
  }
}

// ─── Custom error class ─────────────────────────────────

export class ProvisionError extends Error {
  code: ProvisionErrorCode;

  constructor(code: ProvisionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ProvisionError";
  }
}
