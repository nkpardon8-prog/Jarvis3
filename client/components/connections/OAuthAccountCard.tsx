"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Check,
  ExternalLink,
  LogOut,
  Eye,
  EyeOff,
  Save,
  Key,
} from "lucide-react";
import { api } from "@/lib/api";

interface OAuthAccountCardProps {
  provider: "google" | "microsoft";
  label: string;
  description: string;
  icon: React.ReactNode;
  status: {
    connected: boolean;
    configured: boolean;
    scopes?: string[];
    expiresAt?: string | null;
  };
  onStatusChange: () => void;
}

const SCOPE_LABELS: Record<string, string> = {
  // Google
  "https://www.googleapis.com/auth/gmail.modify": "Gmail",
  "https://www.googleapis.com/auth/calendar": "Calendar",
  "https://www.googleapis.com/auth/spreadsheets": "Sheets",
  "https://www.googleapis.com/auth/documents": "Docs",
  "https://www.googleapis.com/auth/drive.file": "Drive",
  "https://www.googleapis.com/auth/userinfo.email": "Email",
  "https://www.googleapis.com/auth/userinfo.profile": "Profile",
  // Microsoft
  "Mail.ReadWrite": "Outlook Mail",
  "Calendars.ReadWrite": "Calendar",
  "Files.ReadWrite.All": "OneDrive/Files",
  "User.Read": "Profile",
  openid: "OpenID",
  profile: "Profile",
  email: "Email",
  offline_access: "Offline Access",
};

const PROVIDER_INFO: Record<
  string,
  {
    credentialsUrl: string;
    credentialsLabel: string;
    idPlaceholder: string;
    secretPlaceholder: string;
  }
> = {
  google: {
    credentialsUrl: "https://console.cloud.google.com/apis/credentials",
    credentialsLabel: "Google Cloud Console",
    idPlaceholder: "123456789-abc.apps.googleusercontent.com",
    secretPlaceholder: "GOCSPX-...",
  },
  microsoft: {
    credentialsUrl:
      "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    credentialsLabel: "Azure Portal",
    idPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    secretPlaceholder: "Client secret value",
  },
};

export function OAuthAccountCard({
  provider,
  label,
  description,
  icon,
  status,
  onStatusChange,
}: OAuthAccountCardProps) {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Credential setup fields
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const info = PROVIDER_INFO[provider];

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const res = await api.post("/oauth/store-credentials", {
        provider,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      if (res.ok) {
        setSaveMessage({ type: "success", text: "Credentials saved — redirecting..." });
        setClientId("");
        setClientSecret("");
        // Immediately initiate OAuth flow since credentials are now saved
        const authRes = await api.get<{ url: string }>(`/oauth/${provider}/auth-url`);
        if (authRes.ok && authRes.data?.url) {
          window.location.href = authRes.data.url;
          return;
        }
        // If auth-url fails, just refresh status so user sees the connect button
        onStatusChange();
      } else {
        setSaveMessage({ type: "error", text: res.error || "Failed to save" });
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error" });
    }
    setSaving(false);
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const res = await api.get<{ url: string }>(
        `/oauth/${provider}/auth-url`
      );
      if (res.ok && res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setError(res.error || "Failed to get auth URL");
        setConnecting(false);
      }
    } catch {
      setError("Network error");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);

    try {
      const res = await api.post(`/oauth/disconnect/${provider}`);
      if (res.ok) {
        onStatusChange();
      } else {
        setError(res.error || "Failed to disconnect");
      }
    } catch {
      setError("Network error");
    }
    setDisconnecting(false);
  };

  // Filter out generic scopes to show only service-related ones
  const serviceScopes = (status.scopes || []).filter(
    (s) =>
      !["openid", "profile", "email", "offline_access"].includes(s) &&
      !s.includes("userinfo")
  );

  return (
    <GlassPanel className={status.connected ? "border-hud-success/30" : ""}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-hud-accent/10">{icon}</div>
          <div>
            <h4 className="text-sm font-semibold text-hud-text">{label}</h4>
            <p className="text-[10px] text-hud-text-muted">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {status.connected && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-hud-success bg-hud-success/10 px-2 py-0.5 rounded-full">
              <Check size={10} /> Connected
            </span>
          )}
          <div
            className={`w-2 h-2 rounded-full ${
              status.connected
                ? "bg-hud-success"
                : status.configured
                  ? "bg-gray-500"
                  : "bg-hud-amber"
            }`}
          />
        </div>
      </div>

      {/* ── Connected ── */}
      {status.connected ? (
        <div className="space-y-3">
          {serviceScopes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {serviceScopes.map((scope) => (
                <span
                  key={scope}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-hud-accent/10 text-hud-accent border border-hud-accent/20"
                >
                  {SCOPE_LABELS[scope] || scope.split("/").pop() || scope}
                </span>
              ))}
            </div>
          )}

          <HudButton
            variant="danger"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="w-full"
          >
            {disconnecting ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <LogOut size={12} />
                Disconnect
              </>
            )}
          </HudButton>
        </div>
      ) : !status.configured ? (
        /* ── Not configured — credential input fields ── */
        <div className="space-y-3">
          {/* Helper link to get credentials */}
          <a
            href={info.credentialsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-hud-accent hover:text-hud-accent/80 transition-colors"
          >
            <ExternalLink size={12} />
            Get credentials from {info.credentialsLabel}
          </a>

          {/* Client ID */}
          <div>
            <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={info.idPlaceholder}
              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
            />
          </div>

          {/* Client Secret */}
          <div>
            <label className="block text-[10px] text-hud-text-muted mb-1 uppercase tracking-wider">
              Client Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={info.secretPlaceholder}
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

          {/* Save button — appears when both fields filled */}
          {clientId && clientSecret ? (
            <HudButton
              size="sm"
              onClick={handleSaveCredentials}
              disabled={saving}
              className="w-full"
            >
              {saving ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Save size={12} />
                  Save & Connect {label}
                </>
              )}
            </HudButton>
          ) : null}

          {saveMessage && (
            <p
              className={`text-[10px] ${
                saveMessage.type === "success"
                  ? "text-hud-success"
                  : "text-hud-error"
              }`}
            >
              {saveMessage.text}
            </p>
          )}
        </div>
      ) : (
        /* ── Configured but not connected — connect button + update option ── */
        <div className="space-y-3">
          {/* Collapsible credential update */}
          <details className="group">
            <summary className="flex items-center gap-1.5 text-[10px] text-hud-text-muted cursor-pointer hover:text-hud-text-secondary transition-colors">
              <Key size={10} />
              Update credentials
            </summary>
            <div className="mt-2 space-y-2">
              <a
                href={info.credentialsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-hud-accent hover:text-hud-accent/80 transition-colors"
              >
                <ExternalLink size={10} />
                {info.credentialsLabel}
              </a>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="New Client ID"
                className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-1.5 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
              />
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="New Client Secret"
                  className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-1.5 pr-10 text-xs text-hud-text placeholder:text-hud-text-muted/40 focus:outline-none focus:border-hud-accent/50 transition-colors"
                />
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-secondary transition-colors"
                >
                  {showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              {clientId && clientSecret && (
                <HudButton
                  size="sm"
                  variant="secondary"
                  onClick={handleSaveCredentials}
                  disabled={saving}
                  className="w-full"
                >
                  {saving ? <LoadingSpinner size="sm" /> : "Update Credentials"}
                </HudButton>
              )}
              {saveMessage && (
                <p
                  className={`text-[10px] ${
                    saveMessage.type === "success"
                      ? "text-hud-success"
                      : "text-hud-error"
                  }`}
                >
                  {saveMessage.text}
                </p>
              )}
            </div>
          </details>

          <HudButton
            variant="primary"
            size="sm"
            onClick={handleConnect}
            disabled={connecting}
            className="w-full"
          >
            {connecting ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <ExternalLink size={12} />
                Connect {label}
              </>
            )}
          </HudButton>
        </div>
      )}

      {error && <p className="text-[10px] text-hud-error mt-2">{error}</p>}
    </GlassPanel>
  );
}
