import { prisma } from "./prisma";
import { encrypt, decrypt } from "./crypto.service";
import { gateway } from "../gateway/connection";

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

export async function setProviderKey(userId: string, provider: EverydayProviderId, apiKey: string): Promise<void> {
  const encrypted = encrypt(apiKey);
  await prisma.userProviderKey.upsert({
    where: { userId_provider: { userId, provider } },
    update: { apiKey: encrypted },
    create: { userId, provider, apiKey: encrypted },
  });
}

export async function getProviderKey(userId: string, provider: EverydayProviderId): Promise<string | null> {
  const record = await prisma.userProviderKey.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (record?.apiKey) {
    return decrypt(record.apiKey);
  }

  const imported = await importProviderKeyFromGateway(userId, provider);
  if (imported) return imported;
  return null;
}

export async function listStoredProviderKeys(userId: string): Promise<Set<EverydayProviderId>> {
  const records = await prisma.userProviderKey.findMany({ where: { userId } });
  return new Set(records.map((r) => r.provider as EverydayProviderId));
}

async function importProviderKeyFromGateway(
  userId: string,
  provider: EverydayProviderId
): Promise<string | null> {
  try {
    const configResult = (await gateway.send("config.get", {})) as any;
    const providers = configResult?.config?.models?.providers || {};
    const apiKey = providers?.[provider]?.apiKey;
    if (typeof apiKey === "string" && apiKey.trim()) {
      await setProviderKey(userId, provider, apiKey.trim());
      return apiKey.trim();
    }
  } catch {
    // Ignore gateway failures; caller will handle missing key.
  }
  return null;
}
