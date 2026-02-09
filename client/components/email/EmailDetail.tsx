"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { HudButton } from "@/components/ui/HudButton";
import { X, Reply } from "lucide-react";

interface EmailDetailProps {
  messageId: string;
  provider: "google" | "microsoft";
  onClose: () => void;
  onReply: (to: string, subject: string) => void;
}

export function EmailDetail({ messageId, provider, onClose, onReply }: EmailDetailProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["email-message", messageId],
    queryFn: async () => {
      const res = await api.get<any>(`/email/message/${messageId}?provider=${provider}`);
      if (!res.ok) throw new Error(res.error || "Failed to load message");
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <GlassPanel className="h-full flex items-center justify-center">
        <LoadingSpinner size="md" />
      </GlassPanel>
    );
  }

  if (error || !data) {
    return (
      <GlassPanel className="h-full">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-hud-error">{(error as Error)?.message || "Failed to load"}</p>
          <button onClick={onClose} className="p-1 text-hud-text-muted hover:text-hud-text">
            <X size={16} />
          </button>
        </div>
      </GlassPanel>
    );
  }

  const handleReply = () => {
    const fromMatch = data.from?.match(/<([^>]+)>/);
    const replyTo = fromMatch ? fromMatch[1] : data.from || "";
    const replySubject = data.subject?.startsWith("Re: ") ? data.subject : `Re: ${data.subject}`;
    onReply(replyTo, replySubject);
  };

  const bodyContent = data.body || "";
  const isHtml = /<[a-z][\s\S]*>/i.test(bodyContent);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b border-hud-border mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-hud-text truncate">{data.subject}</h3>
          <p className="text-xs text-hud-text-secondary mt-1">From: {data.from}</p>
          {data.to && <p className="text-[10px] text-hud-text-muted">To: {data.to}</p>}
          <p className="text-[10px] text-hud-text-muted">
            {new Date(data.date).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <HudButton size="sm" variant="secondary" onClick={handleReply}>
            <Reply size={12} />
            Reply
          </HudButton>
          <button onClick={onClose} className="p-1 text-hud-text-muted hover:text-hud-text">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isHtml ? (
          <div
            className="email-body-html text-xs text-hud-text-secondary leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(bodyContent) }}
          />
        ) : (
          <div className="text-xs text-hud-text-secondary leading-relaxed whitespace-pre-wrap break-words">
            {bodyContent}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sanitize email HTML: strip scripts, event handlers, and dangerous elements
 * while preserving layout, images, links, and formatting.
 */
function sanitizeEmailHtml(html: string): string {
  return html
    // Remove script tags and their content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Remove style tags (we'll apply our own)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Remove on* event handlers
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Remove javascript: URLs
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    // Remove form elements
    .replace(/<\/?form[\s\S]*?>/gi, "")
    .replace(/<\/?input[\s\S]*?>/gi, "")
    .replace(/<\/?button[\s\S]*?>/gi, "")
    // Make links open in new tab
    .replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ')
    // Remove iframes
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<iframe[\s\S]*?\/?>/gi, "");
}
