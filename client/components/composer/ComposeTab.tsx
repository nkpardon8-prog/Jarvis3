"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  PenLine,
  AlignLeft,
  Sparkles,
  Check,
  X,
  Upload,
  FileText,
  Trash2,
} from "lucide-react";

interface ComposeTabProps {
  recipient?: string;
  onClearRecipient?: () => void;
}

const AI_ACTIONS = [
  { key: "rewrite", label: "Rewrite", instruction: "Rewrite this text to be clearer and more effective. Maintain the same meaning." },
  { key: "summarize", label: "Summarize", instruction: "Summarize this text concisely, keeping the key points." },
  { key: "expand", label: "Expand", instruction: "Expand this text with more detail and supporting points." },
  { key: "formal", label: "Formal", instruction: "Rewrite this text in a formal, professional tone." },
  { key: "friendly", label: "Friendly", instruction: "Rewrite this text in a warm, friendly tone." },
  { key: "grammar", label: "Fix Grammar", instruction: "Fix all grammar, spelling, and punctuation errors in this text. Keep the original meaning and style." },
] as const;

interface UploadedFileInfo {
  id: string;
  filename: string;
  textContent: string | null;
}

export function ComposeTab({ recipient, onClearRecipient }: ComposeTabProps) {
  const [text, setText] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [attachedFile, setAttachedFile] = useState<UploadedFileInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aiHelp = useMutation({
    mutationFn: async () => {
      const prompt = `Help me write or improve this text.\n\nText so far: ${text || "(empty)"}\n${context ? `\nContext: ${context}` : ""}\n\nPlease write or improve the text. Return only the improved text, nothing else.`;
      const res = await api.post<{ response: string }>("/automation/assist", { prompt });
      if (!res.ok) throw new Error(res.error || "AI Help not available. Configure Automation AI in Connections.");
      return res.data!;
    },
    onSuccess: (data) => {
      const result = typeof data?.response === "string" ? data.response : JSON.stringify(data?.response ?? "");
      setSuggestion(result);
    },
  });

  const assist = useMutation({
    mutationFn: async ({ instruction }: { instruction: string }) => {
      const res = await api.post<{ improved: string }>("/composer/compose/assist", {
        text,
        instruction,
        context: context || (attachedFile?.textContent ? `Attached file: ${attachedFile.filename}\n${attachedFile.textContent.slice(0, 4000)}` : undefined),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: (data) => {
      setSuggestion(data.improved);
    },
  });

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", "compose-attachment");
      const res = await api.upload<UploadedFileInfo>("/composer/upload", formData);
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: (data) => {
      setAttachedFile(data);
    },
  });

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile.mutate(file);
      if (e.target) e.target.value = "";
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) uploadFile.mutate(file);
    },
    [uploadFile]
  );

  const acceptSuggestion = () => {
    if (suggestion) {
      setText(suggestion);
      setSuggestion(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PenLine size={16} className="text-hud-accent" />
        <h3 className="text-sm font-semibold text-hud-text">AI Writing Assistant</h3>
      </div>

      {/* Recipient (from People tab) */}
      {recipient && (
        <GlassPanel className="border-hud-accent/30">
          <div className="flex items-center justify-between">
            <p className="text-xs text-hud-text">
              <span className="text-hud-text-muted">To: </span>
              {recipient}
            </p>
            <button
              onClick={onClearRecipient}
              className="text-hud-text-muted hover:text-hud-error p-1"
            >
              <X size={12} />
            </button>
          </div>
        </GlassPanel>
      )}

      {/* Main editor */}
      <GlassPanel>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Start writing or paste text here... Use the AI tools below to enhance your writing."
          rows={12}
          className="w-full bg-transparent border-none text-sm text-hud-text placeholder:text-hud-text-muted/50 resize-none focus:outline-none"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        />

        {/* Word count */}
        <div className="flex items-center justify-between pt-2 border-t border-hud-border">
          <p className="text-[10px] text-hud-text-muted">
            {text.split(/\s+/).filter(Boolean).length} words / {text.length} chars
          </p>
          {attachedFile && (
            <div className="flex items-center gap-1.5 text-[10px] text-hud-accent">
              <FileText size={10} />
              {attachedFile.filename}
              <button
                onClick={() => setAttachedFile(null)}
                className="text-hud-text-muted hover:text-hud-error"
              >
                <Trash2 size={10} />
              </button>
            </div>
          )}
        </div>
      </GlassPanel>

      {/* AI suggestion */}
      {suggestion && (
        <GlassPanel className="border-hud-success/30">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-hud-success" />
            <p className="text-xs font-medium text-hud-success">AI Suggestion</p>
          </div>
          <p className="text-xs text-hud-text whitespace-pre-wrap mb-3">{suggestion}</p>
          <div className="flex gap-2">
            <HudButton size="sm" onClick={acceptSuggestion}>
              <Check size={12} /> Accept
            </HudButton>
            <HudButton size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              <X size={12} /> Dismiss
            </HudButton>
          </div>
        </GlassPanel>
      )}

      {/* AI Help — big prominent button */}
      <HudButton
        size="lg"
        onClick={() => aiHelp.mutate()}
        disabled={!text.trim() || aiHelp.isPending}
        className="w-full justify-center py-3 text-sm"
      >
        {aiHelp.isPending ? <LoadingSpinner size="sm" /> : <Sparkles size={18} />}
        AI Help
      </HudButton>
      {aiHelp.isError && (
        <p className="text-xs text-hud-amber">{(aiHelp.error as Error).message}</p>
      )}

      {/* Specific AI actions (optional) */}
      <GlassPanel>
        <p className="text-[10px] text-hud-text-muted mb-2">(optional) Or choose a specific action:</p>
        <div className="flex flex-wrap gap-2">
          {AI_ACTIONS.map((action) => (
            <HudButton
              key={action.key}
              size="sm"
              variant="secondary"
              onClick={() => assist.mutate({ instruction: action.instruction })}
              disabled={!text.trim() || assist.isPending}
            >
              {action.label}
            </HudButton>
          ))}
        </div>
        {assist.isPending && (
          <div className="mt-2"><LoadingSpinner size="sm" /></div>
        )}
        {assist.isError && (
          <p className="text-xs text-hud-error mt-2">
            {(assist.error as Error).message}
          </p>
        )}
      </GlassPanel>

      {/* Additional context (optional) */}
      <GlassPanel>
        <div className="flex items-center gap-2 mb-2">
          <AlignLeft size={14} className="text-hud-text-muted" />
          <p className="text-xs font-medium text-hud-text">Additional Context</p>
          <span className="text-[10px] text-hud-text-muted">(optional)</span>
        </div>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Add context for the AI to consider (e.g., who the audience is, the purpose of the text, background info)..."
          rows={3}
          className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 resize-none focus:outline-none focus:border-hud-accent/50"
        />
      </GlassPanel>

      {/* Attach file */}
      <div className="flex gap-2">
        <HudButton
          size="sm"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadFile.isPending}
        >
          <Upload size={12} />
          {uploadFile.isPending ? "Uploading..." : "Attach File"}
        </HudButton>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.csv,.docx,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}
