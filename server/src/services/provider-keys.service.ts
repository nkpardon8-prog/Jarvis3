import { prisma } from "./prisma";
import { encrypt, decrypt } from "./crypto.service";
import { gateway } from "../gateway/connection";
import { randomUUID } from "crypto";
import { readOpenClawEnvVar } from "./openclaw-env.service";

export type EverydayProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "xai"
  | "mistral"
  | "groq";

export const EVERYDAY_PROVIDERS: { id: EverydayProviderId; name: string }[] = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "xai", name: "xAI" },
  { id: "mistral", name: "Mistral" },
  { id: "groq", name: "Groq" },
];

const PROVIDER_IDS = new Set(EVERYDAY_PROVIDERS.map((p) => p.id));

export function isEverydayProvider(provider: string): provider is EverydayProviderId {
  return PROVIDER_IDS.has(provider as EverydayProviderId);
}

export async function setProviderKey(
  userId: string,
  provider: EverydayProviderId,
  apiKey: string
): Promise<void> {
  const encrypted = encrypt(apiKey);
  await prisma.userProviderKey.upsert({
    where: { userId_provider: { userId, provider } },
    update: { apiKey: encrypted },
    create: { userId, provider, apiKey: encrypted },
  });
}

export async function getProviderKey(
  userId: string,
  provider: EverydayProviderId
): Promise<string | null> {
  const record = await prisma.userProviderKey.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (record?.apiKey) {
    return decrypt(record.apiKey);
  }

  // Import from the OpenClaw host env via gateway (legacy keys saved in Connections)
  const imported = await importProviderKeyFromEnvViaGateway(userId, provider);
  if (imported) return imported;

  return null;
}

export async function listStoredProviderKeys(
  userId: string
): Promise<Set<EverydayProviderId>> {
  const records = await prisma.userProviderKey.findMany({ where: { userId } });
  return new Set(records.map((r) => r.provider as EverydayProviderId));
}

const PROVIDER_TO_ENV_VAR: Record<EverydayProviderId, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
};

async function importProviderKeyFromEnvViaGateway(
  userId: string,
  provider: EverydayProviderId
): Promise<string | null> {
  // NOTE: we read the OpenClaw host env file directly (server-side) for reliability.
  // This avoids depending on gateway chat streaming semantics.
  const envVar = PROVIDER_TO_ENV_VAR[provider];
  const apiKey = (await readOpenClawEnvVar(envVar))?.trim();
  if (!apiKey) return null;

  await setProviderKey(userId, provider, apiKey);
  return apiKey;
}
