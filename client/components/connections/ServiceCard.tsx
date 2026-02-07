"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { Eye, EyeOff, Check, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

interface ServiceField {
  key: string;
  label: string;
  placeholder: string;
  envVar: string;
}

interface ServiceCardProps {
  service: {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    fields: ServiceField[];
    eligible: boolean;
    missingReason?: string;
  };
  savedKeys: Record<string, boolean>;
  onConfigUpdated: () => void;
}

export function ServiceCard({ service, savedKeys, onConfigUpdated }: ServiceCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSave = async (field: ServiceField) => {
    const val = values[field.key]?.trim();
    if (!val) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await api.post("/connections/store-service-key", {
        envVar: field.envVar,
        value: val,
      });
      if (res.ok) {
        setMessage({ type: "success", text: `${field.label} saved` });
        setValues((prev) => ({ ...prev, [field.key]: "" }));
        onConfigUpdated();
      } else {
        setMessage({ type: "error", text: res.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    }
    setSaving(false);
  };

  const allConfigured = service.fields.every((f) => !!savedKeys[f.envVar]);

  return (
    <GlassPanel className={allConfigured ? "border-hud-success/20" : ""}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-hud-accent/10">{service.icon}</div>
          <div>
            <h4 className="text-sm font-semibold text-hud-text">{service.name}</h4>
            <p className="text-[10px] text-hud-text-muted">{service.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {allConfigured ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-hud-success bg-hud-success/10 px-2 py-0.5 rounded-full">
              <Check size={10} /> Ready
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-medium text-hud-text-muted bg-white/5 px-2 py-0.5 rounded-full">
              <AlertCircle size={10} /> Setup needed
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {service.fields.map((field) => {
          const saved = !!savedKeys[field.envVar];
          return (
            <div key={field.key} className="space-y-1.5">
              <label className="text-[10px] text-hud-text-muted uppercase tracking-wider">
                {field.label}
                {saved && (
                  <span className="ml-2 text-hud-success normal-case tracking-normal">(saved)</span>
                )}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showFields[field.key] ? "text" : "password"}
                    value={values[field.key] || ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={saved ? "••••••• (saved)" : field.placeholder}
                    className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 pr-8 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50 transition-colors"
                  />
                  <button
                    onClick={() =>
                      setShowFields((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-secondary"
                  >
                    {showFields[field.key] ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                {values[field.key]?.trim() && (
                  <HudButton size="sm" onClick={() => handleSave(field)} disabled={saving}>
                    {saving ? "..." : "Save"}
                  </HudButton>
                )}
              </div>
            </div>
          );
        })}

        {!service.eligible && service.missingReason && (
          <p className="text-[10px] text-hud-amber mt-1">{service.missingReason}</p>
        )}

        {message && (
          <p
            className={`text-[10px] ${
              message.type === "success" ? "text-hud-success" : "text-hud-error"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </GlassPanel>
  );
}
