"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ModelProviderCard } from "./ModelProviderCard";
import { ChannelCard } from "./ChannelCard";
import { ServiceCard } from "./ServiceCard";
import { OAuthAccountCard } from "./OAuthAccountCard";
import { GatewayCard } from "./GatewayCard";
import { IntegrationBuilder } from "./IntegrationBuilder";
import { IntegrationCard } from "./IntegrationCard";
import { ClawHubSuggestions } from "./ClawHubSuggestions";
import {
  Brain,
  Radio,
  Check,
  ChevronDown,
  Puzzle,
  MapPin,
  StickyNote,
  Trello,
  Volume2,
  Gem,
  Link2,
  Mail,
  Calendar,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Wifi,
  Plug,
} from "lucide-react";

// Top 4 models per provider from the actual OpenClaw models.list
const PROVIDER_MODELS: Record<string, { id: string; name: string }[]> = {
  openai: [
    { id: "openai/gpt-5.2", name: "GPT-5.2" },
    { id: "openai/gpt-5", name: "GPT-5" },
    { id: "openai/o4-mini", name: "O4 Mini" },
    { id: "openai/gpt-4.1", name: "GPT-4.1" },
  ],
  anthropic: [
    { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "anthropic/claude-opus-4-20250514", name: "Claude Opus 4" },
    { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5" },
    { id: "anthropic/claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
  ],
  google: [
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    { id: "google/gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite" },
  ],
  xai: [
    { id: "xai/grok-3", name: "Grok 3" },
    { id: "xai/grok-3-mini", name: "Grok 3 Mini" },
    { id: "xai/grok-2", name: "Grok 2" },
    { id: "xai/grok-2-vision-latest", name: "Grok 2 Vision" },
  ],
  mistral: [
    { id: "mistral/mistral-large-latest", name: "Mistral Large" },
    { id: "mistral/mistral-medium-latest", name: "Mistral Medium" },
    { id: "mistral/codestral-latest", name: "Codestral" },
    { id: "mistral/mistral-small-latest", name: "Mistral Small" },
  ],
  openrouter: [
    { id: "openrouter/auto", name: "Auto (best available)" },
    { id: "openrouter/anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (OR)" },
    { id: "openrouter/openai/gpt-5.2", name: "GPT-5.2 (OR)" },
    { id: "openrouter/google/gemini-2.5-pro", name: "Gemini 2.5 Pro (OR)" },
  ],
};

// Service integrations that need API keys (stored in ~/.openclaw/.env)
const SERVICE_DEFINITIONS = [
  {
    id: "notion",
    name: "Notion",
    description: "Connect Notion workspace for notes and docs",
    iconName: "StickyNote" as const,
    fields: [
      {
        key: "notionApiKey",
        label: "Notion API Key",
        placeholder: "ntn_...",
        envVar: "NOTION_API_KEY",
      },
    ],
    eligible: true,
  },
  {
    id: "google-places",
    name: "Google Places",
    description: "Location search and local business lookup",
    iconName: "MapPin" as const,
    fields: [
      {
        key: "googlePlacesKey",
        label: "Google Places API Key",
        placeholder: "AIza...",
        envVar: "GOOGLE_PLACES_API_KEY",
      },
    ],
    eligible: true,
  },
  {
    id: "trello",
    name: "Trello",
    description: "Manage Trello boards, lists, and cards",
    iconName: "Trello" as const,
    fields: [
      {
        key: "trelloApiKey",
        label: "Trello API Key",
        placeholder: "Your Trello API key",
        envVar: "TRELLO_API_KEY",
      },
      {
        key: "trelloToken",
        label: "Trello Token",
        placeholder: "Your Trello token",
        envVar: "TRELLO_TOKEN",
      },
    ],
    eligible: true,
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "Text-to-speech voice synthesis",
    iconName: "Volume2" as const,
    fields: [
      {
        key: "elevenlabsKey",
        label: "ElevenLabs API Key",
        placeholder: "Your ElevenLabs API key",
        envVar: "ELEVENLABS_API_KEY",
      },
    ],
    eligible: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini API for advanced processing skills",
    iconName: "Gem" as const,
    fields: [
      {
        key: "geminiKey",
        label: "Gemini API Key",
        placeholder: "AIza...",
        envVar: "GEMINI_API_KEY",
      },
    ],
    eligible: true,
  },
];

const ICON_MAP = {
  StickyNote: <StickyNote size={14} className="text-hud-accent" />,
  MapPin: <MapPin size={14} className="text-hud-accent" />,
  Trello: <Trello size={14} className="text-hud-accent" />,
  Volume2: <Volume2 size={14} className="text-hud-accent" />,
  Gem: <Gem size={14} className="text-hud-accent" />,
};

export function ConnectionsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [oauthMessage, setOauthMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [suggestionsSlug, setSuggestionsSlug] = useState<string | null>(null);

  // Handle OAuth callback query params
  useEffect(() => {
    const oauthResult = searchParams.get("oauth");
    const provider = searchParams.get("provider");
    const message = searchParams.get("message");

    if (oauthResult === "success" && provider) {
      setOauthMessage({
        type: "success",
        text: `${provider.charAt(0).toUpperCase() + provider.slice(1)} account connected successfully`,
      });
      // Clean URL params
      window.history.replaceState({}, "", window.location.pathname);
    } else if (oauthResult === "error") {
      setOauthMessage({
        type: "error",
        text: message || `Failed to connect ${provider || "account"}`,
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

  // Auto-dismiss OAuth message after 5 seconds
  useEffect(() => {
    if (oauthMessage) {
      const timer = setTimeout(() => setOauthMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [oauthMessage]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["connections-status"],
    queryFn: async () => {
      const res = await api.get<any>("/connections/status");
      if (!res.ok) throw new Error(res.error || "Failed to load connections");
      return res.data;
    },
  });

  const { data: oauthStatus, refetch: refetchOAuth } = useQuery({
    queryKey: ["oauth-status"],
    queryFn: async () => {
      const res = await api.get<any>("/oauth/status");
      if (!res.ok) throw new Error(res.error || "Failed to load OAuth status");
      return res.data;
    },
  });

  const { data: integrationsData, refetch: refetchIntegrations } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await api.get<any>("/integrations");
      if (!res.ok) return [];
      return res.data?.integrations || [];
    },
  });

  const setModelMutation = useMutation({
    mutationFn: async (model: string) => {
      const res = await api.post("/connections/set-model", { model });
      if (!res.ok) throw new Error(res.error || "Failed to set model");
      return res.data;
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["dashboard-status"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const configData = data?.config?.config || {};
  const channels = data?.channels || {};
  const currentModel = configData?.agents?.defaults?.model?.primary || "";
  // Provider keys come from .env file detection on the server
  const providerKeys = data?.providerKeys || {};
  // Also check config models.providers as fallback
  const configProviders = configData?.models?.providers || {};

  const providers = [
    { id: "openai", name: "OpenAI", configured: !!providerKeys?.openai || !!configProviders?.openai?.apiKey },
    { id: "anthropic", name: "Anthropic", configured: !!providerKeys?.anthropic || !!configProviders?.anthropic?.apiKey },
    { id: "google", name: "Google AI", configured: !!providerKeys?.google || !!configProviders?.google?.apiKey },
    { id: "xai", name: "xAI (Grok)", configured: !!providerKeys?.xai || !!configProviders?.xai?.apiKey },
    { id: "mistral", name: "Mistral", configured: !!providerKeys?.mistral || !!configProviders?.mistral?.apiKey },
    { id: "openrouter", name: "OpenRouter", configured: !!providerKeys?.openrouter || !!configProviders?.openrouter?.apiKey },
  ];

  // Channels
  const channelOrder = channels?.channelOrder || Object.keys(channels?.channels || {});
  const channelLabels = channels?.channelLabels || {};
  const channelData = channels?.channels || channels || {};

  // Env keys from .env file (for service integration status)
  const envKeys = data?.envKeys || {};

  // Build service objects with icons
  const services = SERVICE_DEFINITIONS.map((svc) => ({
    ...svc,
    icon: ICON_MAP[svc.iconName],
  }));

  const googleOAuth = oauthStatus?.google || { connected: false, configured: false };
  const microsoftOAuth = oauthStatus?.microsoft || { connected: false, configured: false };

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-hud-text">Connections</h2>

      {/* OAuth callback message */}
      {oauthMessage && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm ${
            oauthMessage.type === "success"
              ? "bg-hud-success/10 border-hud-success/30 text-hud-success"
              : "bg-hud-error/10 border-hud-error/30 text-hud-error"
          }`}
        >
          {oauthMessage.text}
        </div>
      )}

      {/* Gateway Connection */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Wifi size={18} className="text-hud-success" />
          <h3 className="text-sm font-semibold text-hud-text-secondary uppercase tracking-wider">
            AI Gateway
          </h3>
        </div>
        <GatewayCard />
      </section>

      {/* Connected Accounts — OAuth */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Link2 size={18} className="text-hud-accent" />
          <h3 className="text-sm font-semibold text-hud-text-secondary uppercase tracking-wider">
            Connected Accounts
          </h3>
        </div>
        <p className="text-xs text-hud-text-muted mb-4">
          Connect Google or Microsoft to access Gmail, Calendar, Sheets, Docs, Drive, Outlook, and OneDrive.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <OAuthAccountCard
            provider="google"
            label="Google"
            description="Gmail, Calendar, Sheets, Docs, Drive"
            icon={<Mail size={14} className="text-hud-accent" />}
            status={googleOAuth}
            onStatusChange={() => refetchOAuth()}
          />
          <OAuthAccountCard
            provider="microsoft"
            label="Microsoft"
            description="Outlook, Calendar, OneDrive, Word, Excel"
            icon={<FileText size={14} className="text-hud-accent" />}
            status={microsoftOAuth}
            onStatusChange={() => refetchOAuth()}
          />
        </div>
      </section>

      {/* Active model selector */}
      <GlassPanel className="border-hud-accent/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-hud-accent/20">
            <Brain size={20} className="text-hud-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-hud-text">Active Model</h3>
            <p className="text-xs text-hud-text-muted">
              Currently using: <span className="text-hud-accent font-medium">{currentModel || "None"}</span>
            </p>
          </div>
          {setModelMutation.isPending && <LoadingSpinner size="sm" />}
        </div>

        <ModelDropdown
          currentModel={currentModel}
          onSelect={(model) => setModelMutation.mutate(model)}
          disabled={setModelMutation.isPending}
        />

        {setModelMutation.isError && (
          <p className="text-xs text-hud-error mt-2">{(setModelMutation.error as Error).message}</p>
        )}
        {setModelMutation.isSuccess && (
          <p className="text-xs text-hud-success mt-2">Model updated</p>
        )}
      </GlassPanel>

      {/* LLM Providers — API keys */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Brain size={18} className="text-hud-accent" />
          <h3 className="text-sm font-semibold text-hud-text-secondary uppercase tracking-wider">
            Provider API Keys
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => (
            <ModelProviderCard
              key={provider.id}
              provider={provider}
              onConfigUpdated={() => refetch()}
            />
          ))}
        </div>
      </section>

      {/* Channels */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Radio size={18} className="text-hud-amber" />
          <h3 className="text-sm font-semibold text-hud-text-secondary uppercase tracking-wider">
            Communication Channels
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channelOrder.map((channelId: string) => {
            const ch = channelData[channelId] || {};
            const label = channelLabels[channelId] || channelId;
            return (
              <ChannelCard
                key={channelId}
                channelId={channelId}
                label={label}
                channel={ch}
                onConfigUpdated={() => refetch()}
              />
            );
          })}
          {channelOrder.length === 0 && (
            <GlassPanel>
              <p className="text-sm text-hud-text-muted text-center py-4">
                No channels configured yet.
              </p>
            </GlassPanel>
          )}
        </div>
      </section>

      {/* Service Integrations */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Puzzle size={18} className="text-hud-success" />
          <h3 className="text-sm font-semibold text-hud-text-secondary uppercase tracking-wider">
            Service Integrations
          </h3>
        </div>
        <p className="text-xs text-hud-text-muted mb-4">
          Configure API keys for OpenClaw skills that connect to external services.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((svc) => (
            <ServiceCard
              key={svc.id}
              service={svc}
              savedKeys={envKeys}
              onConfigUpdated={() => refetch()}
            />
          ))}
        </div>
      </section>

      {/* Custom API Integrations */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Plug size={18} className="text-hud-accent" />
          <h3 className="text-sm font-semibold text-hud-text-secondary uppercase tracking-wider">
            Custom API Integrations
          </h3>
        </div>
        <p className="text-xs text-hud-text-muted mb-4">
          Register any external API and automatically scaffold it into an OpenClaw skill.
        </p>

        {/* Existing integration cards */}
        {integrationsData && integrationsData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {integrationsData.map((integration: any) => (
              <IntegrationCard
                key={integration.slug}
                integration={integration}
                onDelete={() => refetchIntegrations()}
              />
            ))}
          </div>
        )}

        {/* Builder form */}
        <IntegrationBuilder
          onCreated={(slug) => {
            refetchIntegrations();
            setSuggestionsSlug(slug);
          }}
        />

        {/* ClawHub suggestions after creation */}
        {suggestionsSlug && (
          <ClawHubSuggestions
            slug={suggestionsSlug}
            onDismiss={() => setSuggestionsSlug(null)}
          />
        )}
      </section>
    </div>
  );
}

// Model dropdown component
function ModelDropdown({
  currentModel,
  onSelect,
  disabled,
}: {
  currentModel: string;
  onSelect: (model: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-hud-bg-secondary/50 border border-hud-border rounded-xl text-sm text-hud-text hover:border-hud-accent/50 transition-colors disabled:opacity-50"
      >
        <span>{currentModel || "Select a model..."}</span>
        <ChevronDown size={16} className={`text-hud-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto bg-hud-bg-primary border border-hud-border rounded-xl shadow-2xl scrollbar-thin">
          {Object.entries(PROVIDER_MODELS).map(([providerId, models]) => (
            <div key={providerId}>
              <div className="px-4 py-1.5 text-[10px] font-bold text-hud-text-muted uppercase tracking-wider bg-white/3 sticky top-0">
                {providerId}
              </div>
              {models.map((model) => {
                const isActive = currentModel === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSelect(model.id);
                      setOpen(false);
                    }}
                    disabled={disabled || isActive}
                    className={`w-full flex items-center justify-between px-4 py-2 text-left text-sm hover:bg-hud-accent/10 transition-colors ${
                      isActive ? "bg-hud-accent/10 text-hud-accent" : "text-hud-text-secondary"
                    }`}
                  >
                    <span>{model.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] text-hud-text-muted font-mono">{model.id}</span>
                      {isActive && <Check size={14} className="text-hud-accent" />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
