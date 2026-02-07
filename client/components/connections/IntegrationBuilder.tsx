"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SkillGuidelinesPanel } from "./SkillGuidelinesPanel";
import { api } from "@/lib/api";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Rocket,
  FileText,
  Code,
  AlertCircle,
} from "lucide-react";

type AuthMethod =
  | "api-key-header"
  | "api-key-query"
  | "bearer"
  | "oauth2"
  | "basic"
  | "none";

const AUTH_OPTIONS: { value: AuthMethod; label: string }[] = [
  { value: "api-key-header", label: "API Key in Header" },
  { value: "api-key-query", label: "API Key as Query Parameter" },
  { value: "bearer", label: "Bearer Token" },
  { value: "oauth2", label: "OAuth2" },
  { value: "basic", label: "Basic Auth" },
  { value: "none", label: "None" },
];

interface IntegrationBuilderProps {
  onCreated: (slug: string) => void;
}

export function IntegrationBuilder({ onCreated }: IntegrationBuilderProps) {
  const queryClient = useQueryClient();

  // Form state
  const [name, setName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("api-key-header");
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      // Build credentials based on auth method
      let credentials: any = null;
      if (authMethod === "oauth2") {
        credentials = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
      } else if (authMethod === "basic") {
        credentials = { username: username.trim(), password: password.trim() };
      } else if (authMethod !== "none") {
        credentials = apiKey.trim();
      }

      setProgressStep("Storing credentials...");
      await new Promise((r) => setTimeout(r, 300));

      setProgressStep("Saving configuration...");
      const res = await api.post<any>("/integrations", {
        name: name.trim(),
        apiBaseUrl: apiBaseUrl.trim(),
        authMethod,
        credentials,
        description: description.trim(),
        instructions: instructions.trim(),
      });

      if (!res.ok) throw new Error(res.error || "Failed to create integration");

      setProgressStep("Verifying skill...");
      await new Promise((r) => setTimeout(r, 500));

      return res.data;
    },
    onSuccess: (data) => {
      setProgressStep(null);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });

      // Reset form
      setName("");
      setApiBaseUrl("");
      setAuthMethod("api-key-header");
      setApiKey("");
      setClientId("");
      setClientSecret("");
      setUsername("");
      setPassword("");
      setDescription("");
      setInstructions("");
      setShowForm(false);

      // Trigger ClawHub recommendations
      const slug =
        data?.integration?.slug ||
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      onCreated(slug);
    },
    onError: () => {
      setProgressStep(null);
    },
  });

  // Validation
  const hasCredentials =
    authMethod === "none" ||
    (authMethod === "oauth2" && clientId.trim() && clientSecret.trim()) ||
    (authMethod === "basic" && username.trim() && password.trim()) ||
    (!["none", "oauth2", "basic"].includes(authMethod) && apiKey.trim());

  const canSubmit =
    name.trim().length >= 2 &&
    apiBaseUrl.trim() &&
    description.trim() &&
    instructions.trim() &&
    hasCredentials &&
    !createMutation.isPending;

  if (!showForm) {
    return (
      <HudButton
        variant="secondary"
        size="sm"
        onClick={() => setShowForm(true)}
        className="w-full mt-3"
      >
        <Plus size={14} />
        New API Integration
      </HudButton>
    );
  }

  return (
    <GlassPanel className="border-hud-accent/20 mt-3">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-hud-accent" />
          <h4 className="text-sm font-semibold text-hud-text">
            New API Integration
          </h4>
        </div>
        <button
          onClick={() => setShowForm(false)}
          className="text-hud-text-muted hover:text-hud-text-secondary transition-colors text-xs"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-4">
        {/* Connection Name */}
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
            Connection Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g., "Notion", "Stripe", "My Custom CRM"'
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
          />
          {name.trim() && (
            <p className="text-[9px] text-hud-text-muted mt-1">
              Slug:{" "}
              <span className="font-mono text-hud-accent">
                {name
                  .toLowerCase()
                  .trim()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "")}
              </span>
            </p>
          )}
        </div>

        {/* API Base URL */}
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
            API Base URL
          </label>
          <input
            type="text"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors font-mono"
          />
        </div>

        {/* Auth Method */}
        <div>
          <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
            Authentication Method
          </label>
          <select
            value={authMethod}
            onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50 transition-colors appearance-none cursor-pointer"
          >
            {AUTH_OPTIONS.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                className="bg-hud-bg-secondary text-hud-text"
              >
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Credential Fields (dynamic) */}
        {authMethod !== "none" && (
          <div className="space-y-3">
            {authMethod === "oauth2" ? (
              <>
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="OAuth2 Client ID"
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
                    Client Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="OAuth2 Client Secret"
                      className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 pr-10 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
                    />
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-secondary transition-colors"
                    >
                      {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </>
            ) : authMethod === "basic" ? (
              <>
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 pr-10 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
                    />
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-secondary transition-colors"
                    >
                      {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
                  {authMethod === "bearer" ? "Bearer Token" : "API Key"}
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      authMethod === "bearer"
                        ? "Bearer token value"
                        : "Your API key"
                    }
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 pr-10 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
                  />
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-secondary transition-colors"
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Description (collapsible) */}
        <div>
          <button
            onClick={() => setShowDescription(!showDescription)}
            className="flex items-center gap-1.5 text-[11px] text-hud-text-secondary hover:text-hud-text transition-colors"
          >
            <FileText size={12} />
            Description
            {showDescription ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
            {!description.trim() && (
              <span className="text-hud-error text-[9px]">*required</span>
            )}
          </button>
          {showDescription && (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this API does and what you want the agent to be able to do with it..."
              rows={3}
              className="w-full mt-2 bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors resize-y"
            />
          )}
        </div>

        {/* Instructions (collapsible) */}
        <div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-1.5 text-[11px] text-hud-text-secondary hover:text-hud-text transition-colors"
            >
              <Code size={12} />
              Skill Instructions
              {showInstructions ? (
                <ChevronUp size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              {!instructions.trim() && (
                <span className="text-hud-error text-[9px]">*required</span>
              )}
            </button>
            {showInstructions && (
              <button
                onClick={() => setShowGuidelines(!showGuidelines)}
                className="text-[10px] text-hud-amber hover:text-hud-amber/80 transition-colors"
              >
                {showGuidelines ? "Hide" : "Show"} Writing Guidelines
              </button>
            )}
          </div>
          {showInstructions && (
            <>
              {showGuidelines && <SkillGuidelinesPanel />}
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={`Describe how to use this API. List key endpoints, example requests, response formats, error handling, rate limits, etc.\n\nExample:\n## Endpoints\n\nGET /users - List all users\nPOST /users - Create a user with { name, email }\nGET /users/:id - Get user by ID\n\n## Notes\n- Always include Content-Type: application/json\n- Rate limit: 60 requests/minute`}
                rows={12}
                className="w-full mt-2 bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors resize-y font-mono"
              />
            </>
          )}
        </div>

        {/* Progress indicator */}
        {progressStep && (
          <div className="flex items-center gap-2 py-2">
            <LoadingSpinner size="sm" />
            <span className="text-xs text-hud-accent animate-pulse">
              {progressStep}
            </span>
          </div>
        )}

        {/* Error */}
        {createMutation.isError && (
          <div className="flex items-start gap-2 p-2.5 bg-hud-error/10 border border-hud-error/20 rounded-lg">
            <AlertCircle size={14} className="text-hud-error shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] text-hud-error">
                {(createMutation.error as Error).message}
              </p>
              <button
                onClick={() => createMutation.mutate()}
                className="text-[10px] text-hud-accent hover:underline mt-1"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Submit */}
        <HudButton
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit}
          className="w-full"
        >
          {createMutation.isPending ? (
            <LoadingSpinner size="sm" />
          ) : (
            <>
              <Rocket size={14} />
              Create Integration
            </>
          )}
        </HudButton>
      </div>
    </GlassPanel>
  );
}
