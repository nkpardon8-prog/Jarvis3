"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Send, Sparkles, X } from "lucide-react";

interface ComposePaneProps {
  initialTo?: string;
  initialSubject?: string;
  onClearInitial?: () => void;
}

export function ComposePane({ initialTo, initialSubject, onClearInitial }: ComposePaneProps) {
  const [to, setTo] = useState(initialTo || "");
  const [subject, setSubject] = useState(initialSubject || "");
  const [body, setBody] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showContacts, setShowContacts] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (initialTo) setTo(initialTo);
    if (initialSubject) setSubject(initialSubject);
  }, [initialTo, initialSubject]);

  // Debounce contact search (300ms delay)
  const updateContactQuery = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, 300);
  };

  // Contact search — triggers on debounced query, min 1 character
  const { data: contactsData, isFetching: contactsFetching } = useQuery({
    queryKey: ["email-contacts", debouncedQuery],
    queryFn: async () => {
      const res = await api.get<any>(`/email/search-contacts?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) return { contacts: [] };
      return res.data;
    },
    enabled: debouncedQuery.length >= 1,
    staleTime: 30 * 1000,
  });

  const sendEmail = useMutation({
    mutationFn: async () => {
      const res = await api.post("/email/send", { to, subject, body });
      if (!res.ok) throw new Error(res.error || "Failed to send");
      return res.data;
    },
    onSuccess: () => {
      setTo("");
      setSubject("");
      setBody("");
      setAiSuggestion(null);
      onClearInitial?.();
    },
  });

  const aiAssist = useMutation({
    mutationFn: async () => {
      const prompt = `Help me compose a professional email.\n\nTo: ${to}\nSubject: ${subject}\nDraft so far: ${body || "(empty)"}\n\nPlease write or improve the email body. Return only the email body text, no subject line or headers.`;
      const res = await api.post<{ response: string }>("/automation/assist", { prompt });
      if (!res.ok) throw new Error(res.error || "AI assist not available");
      return res.data!;
    },
    onSuccess: (data) => {
      const text = typeof data?.response === "string" ? data.response : JSON.stringify(data?.response ?? "");
      setAiSuggestion(text);
    },
  });

  const contacts = contactsData?.contacts || [];
  const canSend = to.trim() && subject.trim() && body.trim();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-hud-text">Compose</h3>
        {(initialTo || initialSubject) && (
          <button
            onClick={() => {
              setTo("");
              setSubject("");
              onClearInitial?.();
            }}
            className="p-1 text-hud-text-muted hover:text-hud-text"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* To field with contact search */}
      <div className="relative mb-2">
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-hud-text-muted w-12 shrink-0">To:</label>
          <div className="flex-1 relative">
            <input
              type="text"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                updateContactQuery(e.target.value);
                setShowContacts(true);
              }}
              onBlur={() => setTimeout(() => setShowContacts(false), 200)}
              onFocus={() => { if (to.length >= 1) setShowContacts(true); }}
              placeholder="recipient@email.com"
              className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-1.5 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
            />
            {showContacts && to.length >= 1 && (
              <div className="absolute z-50 top-full mt-1 w-full bg-hud-bg border border-hud-border rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                {contactsFetching && contacts.length === 0 && (
                  <div className="px-3 py-2 text-[10px] text-hud-text-muted">Searching...</div>
                )}
                {contacts.length > 0 ? (
                  contacts.map((c: any) => (
                    <button
                      key={c.email}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setTo(c.email);
                        setShowContacts(false);
                        setDebouncedQuery("");
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-hud-accent/10 transition-colors border-b border-hud-border/30 last:border-b-0"
                    >
                      <p className="text-xs text-hud-text truncate">{c.name}</p>
                      <p className="text-[10px] text-hud-text-muted truncate">{c.email}</p>
                    </button>
                  ))
                ) : (
                  !contactsFetching && debouncedQuery.length >= 1 && (
                    <div className="px-3 py-2 text-[10px] text-hud-text-muted">No contacts found</div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subject */}
      <div className="flex items-center gap-2 mb-2">
        <label className="text-[10px] text-hud-text-muted w-12 shrink-0">Subject:</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject"
          className="flex-1 bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-1.5 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
        />
      </div>

      {/* Body */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your message..."
        className="flex-1 min-h-[120px] bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 resize-none focus:outline-none focus:border-hud-accent/50 mb-2"
      />

      {/* AI suggestion */}
      {aiSuggestion && (
        <div className="mb-2 p-2 bg-hud-accent/5 border border-hud-accent/20 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-hud-accent font-medium">AI Suggestion</span>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setBody(aiSuggestion);
                  setAiSuggestion(null);
                }}
                className="text-[10px] text-hud-success hover:underline"
              >
                Use
              </button>
              <button
                onClick={() => setAiSuggestion(null)}
                className="text-[10px] text-hud-text-muted hover:text-hud-text"
              >
                Dismiss
              </button>
            </div>
          </div>
          <p className="text-[10px] text-hud-text-secondary whitespace-pre-wrap max-h-32 overflow-y-auto">
            {aiSuggestion}
          </p>
        </div>
      )}

      {/* AI Help — prominent button */}
      <HudButton
        size="lg"
        onClick={() => aiAssist.mutate()}
        disabled={aiAssist.isPending}
        className="w-full justify-center py-3 text-sm mb-2"
      >
        {aiAssist.isPending ? <LoadingSpinner size="sm" /> : <Sparkles size={18} />}
        AI Help
      </HudButton>
      {aiAssist.isError && (
        <p className="text-xs text-hud-amber mb-2">{(aiAssist.error as Error).message}</p>
      )}

      {/* Send */}
      <div className="flex items-center gap-2">
        <HudButton
          size="sm"
          onClick={() => sendEmail.mutate()}
          disabled={!canSend || sendEmail.isPending}
        >
          {sendEmail.isPending ? <LoadingSpinner size="sm" /> : <Send size={12} />}
          Send
        </HudButton>
        {sendEmail.isSuccess && (
          <span className="text-[10px] text-hud-success">Sent!</span>
        )}
        {sendEmail.isError && (
          <span className="text-[10px] text-hud-error">{(sendEmail.error as Error).message}</span>
        )}
      </div>
    </div>
  );
}
