"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  FileText,
  Upload,
  MessageSquare,
  Send,
  Trash2,
  Wand2,
  Plus,
  GripVertical,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface PdfSessionSummary {
  id: string;
  fileName: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PdfMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface FormField {
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

interface PdfForm {
  id: string;
  title: string;
  description: string | null;
  fields: FormField[];
  prompt: string;
  createdAt: string;
}

// ─── PDF Analyzer section ───────────────────────────────────

function PdfAnalyzer() {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PdfMessage[]>([]);
  const [question, setQuestion] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: sessions } = useQuery({
    queryKey: ["pdf-sessions"],
    queryFn: async () => {
      const res = await api.get<PdfSessionSummary[]>("/composer/pdf/sessions");
      if (!res.ok) throw new Error(res.error);
      return res.data || [];
    },
  });

  const analyzePdf = useMutation({
    mutationFn: async ({ file, question }: { file: File; question: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("question", question || "Summarize this document.");
      const res = await api.upload<any>("/composer/pdf/analyze", formData);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      setActiveSessionId(data.session.id);
      setMessages(data.session.messages);
      queryClient.invalidateQueries({ queryKey: ["pdf-sessions"] });
    },
  });

  const askFollowup = useMutation({
    mutationFn: async ({ sessionId, question }: { sessionId: string; question: string }) => {
      const res = await api.post<any>(`/composer/pdf/sessions/${sessionId}/ask`, { question });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      setMessages(data.messages);
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/composer/pdf/sessions/${id}`);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      if (activeSessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
      queryClient.invalidateQueries({ queryKey: ["pdf-sessions"] });
    },
  });

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) analyzePdf.mutate({ file, question: "Summarize this document." });
      if (e.target) e.target.value = "";
    },
    [analyzePdf]
  );

  const handleAsk = () => {
    if (!question.trim() || !activeSessionId) return;
    askFollowup.mutate({ sessionId: activeSessionId, question });
    setQuestion("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-hud-accent" />
        <h3 className="text-sm font-semibold text-hud-text">PDF Analyzer</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sessions sidebar */}
        <div className="lg:col-span-1 space-y-2">
          <HudButton
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzePdf.isPending}
          >
            <Upload size={12} />
            {analyzePdf.isPending ? "Analyzing..." : "Upload PDF"}
          </HudButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />

          {(sessions || []).map((s) => (
            <div
              key={s.id}
              onClick={() => {
                setActiveSessionId(s.id);
                // Load messages for this session
                api.post<any>(`/composer/pdf/sessions/${s.id}/ask`, { question: "" }).catch(() => {});
              }}
              className={`
                p-2 rounded-lg border cursor-pointer transition-colors
                ${activeSessionId === s.id
                  ? "border-hud-accent/30 bg-hud-accent/5"
                  : "border-hud-border hover:border-hud-accent/20"}
              `}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium text-hud-text truncate">
                  {s.fileName}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession.mutate(s.id);
                  }}
                  className="text-hud-text-muted hover:text-hud-error p-0.5"
                >
                  <Trash2 size={10} />
                </button>
              </div>
              <p className="text-[9px] text-hud-text-muted">
                {s.messageCount} messages
              </p>
            </div>
          ))}
        </div>

        {/* Chat area */}
        <div className="lg:col-span-3">
          {activeSessionId ? (
            <GlassPanel>
              <div className="space-y-3 max-h-96 overflow-y-auto mb-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg ${
                      msg.role === "user"
                        ? "bg-hud-accent/5 border border-hud-accent/10 ml-8"
                        : "bg-white/3 mr-8"
                    }`}
                  >
                    <p className="text-[10px] text-hud-text-muted mb-0.5">
                      {msg.role === "user" ? "You" : "AI"}
                    </p>
                    <p className="text-xs text-hud-text whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                ))}
                {askFollowup.isPending && (
                  <div className="flex items-center gap-2 p-2 text-hud-text-muted">
                    <LoadingSpinner size="sm" />
                    <span className="text-xs">Thinking...</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                  placeholder="Ask a question about this document..."
                  className="flex-1 bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
                />
                <HudButton
                  size="sm"
                  onClick={handleAsk}
                  disabled={!question.trim() || askFollowup.isPending}
                >
                  <Send size={12} />
                </HudButton>
              </div>
            </GlassPanel>
          ) : (
            <GlassPanel>
              <div className="text-center py-12">
                <MessageSquare size={32} className="mx-auto text-hud-text-muted mb-3" />
                <p className="text-xs text-hud-text-secondary">
                  Upload a PDF to start asking questions
                </p>
                <p className="text-[10px] text-hud-text-muted mt-1">
                  AI will analyze the document and answer your questions
                </p>
              </div>
            </GlassPanel>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Form Builder section ───────────────────────────────────

function FormBuilder() {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null);

  const { data: forms } = useQuery({
    queryKey: ["pdf-forms"],
    queryFn: async () => {
      const res = await api.get<PdfForm[]>("/composer/pdf/forms");
      if (!res.ok) throw new Error(res.error);
      return res.data || [];
    },
  });

  const generateForm = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await api.post<PdfForm>("/composer/pdf/forms/generate", { prompt });
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: () => {
      setPrompt("");
      queryClient.invalidateQueries({ queryKey: ["pdf-forms"] });
    },
  });

  const deleteForm = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/composer/pdf/forms/${id}`);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdf-forms"] });
    },
  });

  const FIELD_TYPE_LABELS: Record<string, string> = {
    text: "Text",
    email: "Email",
    phone: "Phone",
    number: "Number",
    date: "Date",
    select: "Dropdown",
    textarea: "Long Text",
    checkbox: "Checkbox",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wand2 size={16} className="text-hud-accent" />
        <h3 className="text-sm font-semibold text-hud-text">Form Builder</h3>
      </div>

      {/* Generator */}
      <GlassPanel>
        <p className="text-xs text-hud-text-muted mb-2">
          Describe the form you need and AI will generate it
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && prompt.trim() && generateForm.mutate(prompt)}
            placeholder='e.g., "Client intake form for a law firm" or "Employee feedback survey"'
            className="flex-1 bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
          />
          <HudButton
            size="sm"
            onClick={() => generateForm.mutate(prompt)}
            disabled={!prompt.trim() || generateForm.isPending}
          >
            {generateForm.isPending ? <LoadingSpinner size="sm" /> : <Wand2 size={12} />}
            Generate
          </HudButton>
        </div>
        {generateForm.isError && (
          <p className="text-xs text-hud-error mt-2">{(generateForm.error as Error).message}</p>
        )}
      </GlassPanel>

      {/* Forms list */}
      {(forms || []).length === 0 ? (
        <GlassPanel>
          <p className="text-xs text-hud-text-muted text-center py-8">
            No forms generated yet. Describe a form above to get started.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {(forms || []).map((form) => {
            const isExpanded = expandedFormId === form.id;

            return (
              <GlassPanel key={form.id}>
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpandedFormId(isExpanded ? null : form.id)}
                >
                  <FileText size={16} className="text-hud-accent mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-hud-text">{form.title}</p>
                    {form.description && (
                      <p className="text-[10px] text-hud-text-muted truncate">{form.description}</p>
                    )}
                    <p className="text-[10px] text-hud-text-muted">
                      {form.fields.length} fields
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteForm.mutate(form.id);
                      }}
                      className="text-hud-text-muted hover:text-hud-error p-1"
                    >
                      <Trash2 size={12} />
                    </button>
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-hud-text-muted" />
                    ) : (
                      <ChevronDown size={14} className="text-hud-text-muted" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-hud-border">
                    <p className="text-[10px] text-hud-text-muted mb-3 uppercase">Form Preview</p>
                    <div className="space-y-3 bg-white/3 rounded-lg p-4">
                      {form.fields.map((field, i) => (
                        <div key={i} className="space-y-1">
                          <label className="text-xs font-medium text-hud-text">
                            {field.label}
                            {field.required && (
                              <span className="text-hud-error ml-0.5">*</span>
                            )}
                          </label>
                          {field.type === "textarea" ? (
                            <textarea
                              placeholder={`Enter ${field.label.toLowerCase()}...`}
                              rows={3}
                              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 resize-none"
                              disabled
                            />
                          ) : field.type === "select" ? (
                            <select
                              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text"
                              disabled
                            >
                              <option>Select {field.label.toLowerCase()}...</option>
                              {(field.options || []).map((opt, j) => (
                                <option key={j}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === "checkbox" ? (
                            <div className="flex items-center gap-2">
                              <input type="checkbox" disabled className="rounded" />
                              <span className="text-xs text-hud-text-secondary">
                                {field.label}
                              </span>
                            </div>
                          ) : (
                            <input
                              type={field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                              placeholder={`Enter ${field.label.toLowerCase()}...`}
                              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50"
                              disabled
                            />
                          )}
                          <p className="text-[9px] text-hud-text-muted">
                            Type: {FIELD_TYPE_LABELS[field.type] || field.type}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main PdfsTab ───────────────────────────────────────────

export function PdfsTab() {
  const [section, setSection] = useState<"analyzer" | "forms">("analyzer");

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-2">
        <HudButton
          size="sm"
          variant={section === "analyzer" ? "primary" : "secondary"}
          onClick={() => setSection("analyzer")}
        >
          <FileText size={12} /> PDF Analyzer
        </HudButton>
        <HudButton
          size="sm"
          variant={section === "forms" ? "primary" : "secondary"}
          onClick={() => setSection("forms")}
        >
          <Wand2 size={12} /> Form Builder
        </HudButton>
      </div>

      {section === "analyzer" ? <PdfAnalyzer /> : <FormBuilder />}
    </div>
  );
}
