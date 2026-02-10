"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import type { ChatMessage } from "@/lib/hooks/useChat";
import { useEverydayAIChat } from "@/lib/hooks/useEverydayAIChat";
import { Beaker, Sparkles } from "lucide-react";

type EverydayProvider = {
  id: string;
  name: string;
  models: { id: string; name: string }[];
};

type EverydayModelsResponse = {
  providers: EverydayProvider[];
};

type SubTab = "chat" | "research";

export function EverydayAIPage() {
  const [activeTab, setActiveTab] = useState<SubTab>("chat");
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["everyday-ai-models"],
    queryFn: async () => {
      const res = await api.get<EverydayModelsResponse>("/everyday-ai/models");
      if (!res.ok) throw new Error(res.error || "Failed to load models");
      return res.data;
    },
  });

  const providers = useMemo(() => data?.providers || [], [data]);
  const activeProvider = providers.find((p) => p.id === providerId) || providers[0];
  const activeModels = activeProvider?.models || [];

  useEffect(() => {
    if (!activeProvider) return;
    setProviderId(activeProvider.id);
    if (!activeModels.find((m) => m.id === modelId)) {
      setModelId(activeModels[0]?.id || "");
    }
  }, [activeProvider?.id, activeModels, modelId]);

  const {
    messages,
    streamingText,
    isStreaming,
    awaitingResponse,
    error,
    sendMessage,
    abortMessage,
  } = useEverydayAIChat();

  const {
    messages: researchMessages,
    streamingText: researchStreaming,
    isStreaming: researchStreamingActive,
    awaitingResponse: researchAwaiting,
    error: researchError,
    sendResearchMessage,
    abortMessage: abortResearch,
  } = useEverydayAIChat();

  const canChat = !!providerId && !!modelId;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-hud-text">Your everyday AI</h2>
          <p className="text-xs text-hud-text-muted">
            BYOK chat wrapper with memory and provider controls.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-hud-text-muted hover:text-hud-text transition-colors"
        >
          Refresh models
        </button>
      </div>

      <div className="flex gap-1 border-b border-hud-border pb-0 overflow-x-auto">
        {[
          { key: "chat", label: "Chat", icon: Sparkles },
          { key: "research", label: "Active research", icon: Beaker },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as SubTab)}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg
                transition-all duration-200 whitespace-nowrap border-b-2 -mb-[1px]
                ${
                  isActive
                    ? "text-hud-accent border-hud-accent bg-hud-accent/5"
                    : "text-hud-text-secondary border-transparent hover:text-hud-text hover:border-hud-border"
                }
              `}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "chat" && (
        <div className="flex flex-col h-full gap-3">
          <GlassPanel className="border-hud-border/70">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-[11px] text-hud-text-muted uppercase tracking-wide">
                  Provider
                </label>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
                >
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-hud-text-muted uppercase tracking-wide">
                  Model
                </label>
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
                >
                  {activeModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-hud-text-muted uppercase tracking-wide">
                  Advanced options
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-hud-text-secondary">
                    <input
                      type="checkbox"
                      checked={thinkingEnabled}
                      onChange={(e) => setThinkingEnabled(e.target.checked)}
                      className="rounded border-hud-border"
                    />
                    Thinking
                  </label>
                  <label className="flex items-center gap-2 text-xs text-hud-text-secondary">
                    <input
                      type="checkbox"
                      checked={deepResearchEnabled}
                      onChange={(e) => setDeepResearchEnabled(e.target.checked)}
                      className="rounded border-hud-border"
                    />
                    Deep research
                  </label>
                </div>
              </div>
            </div>

            {!providers.length && !isLoading && (
              <p className="text-xs text-hud-text-muted mt-3">
                No provider keys found. Add one in Connections → Provider API Keys.
              </p>
            )}
          </GlassPanel>

          <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-hud-border bg-hud-bg-primary/30">
            {error && (
              <div className="px-4 py-2 bg-hud-error/10 border-b border-hud-error/20 text-xs text-hud-error">
                {error}
              </div>
            )}
            <ChatMessages
              messages={messages as ChatMessage[]}
              streamingText={streamingText}
              isStreaming={isStreaming}
              awaitingResponse={awaitingResponse}
              actionContext={null}
            />
            <ChatInput
              onSend={(text) =>
                sendMessage({
                  provider: providerId,
                  model: modelId,
                  message: text,
                  thinkingLevel: thinkingEnabled ? "medium" : undefined,
                  deepResearch: deepResearchEnabled,
                })
              }
              onAbort={abortMessage}
              isProcessing={awaitingResponse || isStreaming}
              disabled={!canChat}
            />
          </div>
        </div>
      )}

      {activeTab === "research" && (
        <div className="flex flex-col h-full gap-3">
          <GlassPanel className="border-hud-border/70">
            <p className="text-xs text-hud-text-muted">
              Research-only mode using OpenClaw with strict tool limits. It will ask
              before any non-research action.
            </p>
          </GlassPanel>

          <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-hud-border bg-hud-bg-primary/30">
            {researchError && (
              <div className="px-4 py-2 bg-hud-error/10 border-b border-hud-error/20 text-xs text-hud-error">
                {researchError}
              </div>
            )}
            <ChatMessages
              messages={researchMessages as ChatMessage[]}
              streamingText={researchStreaming}
              isStreaming={researchStreamingActive}
              awaitingResponse={researchAwaiting}
              actionContext={null}
            />
            <ChatInput
              onSend={(text) => sendResearchMessage({ message: text })}
              onAbort={abortResearch}
              isProcessing={researchAwaiting || researchStreamingActive}
              disabled={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
