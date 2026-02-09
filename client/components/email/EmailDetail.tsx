"use client";

import { useMemo } from "react";
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

  const bodyContent = data?.body || "";
  const isHtml = /<\s*(html|head|body|div|table|p|br|span|img)\b/i.test(bodyContent);

  const plainTextElements = useMemo(() => {
    if (!bodyContent || isHtml) return null;
    return linkifyPlainText(cleanPlainText(bodyContent));
  }, [bodyContent, isHtml]);

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
            {plainTextElements}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Convert URLs in cleaned plain text into short clickable hyperlinks.
 * Returns React elements instead of a raw string.
 */
function linkifyPlainText(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<>]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const url = match[1];
    let label: string;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      // Use pathname hint if short enough, otherwise just domain
      const path = parsed.pathname.replace(/\/$/, "");
      if (path && path !== "/" && path.length <= 20) {
        label = host + path;
      } else {
        label = host;
      }
    } catch {
      label = "link";
    }

    parts.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-hud-accent hover:underline"
        title={url}
      >
        {label}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last URL
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/**
 * Clean plain text email: collapse tracking/marketing URLs into readable text,
 * strip base64 noise, and remove excessive whitespace.
 */
function cleanPlainText(text: string): string {
  return text
    // Remove known tracking/redirect URLs entirely (these add no value)
    .replace(/(https?:\/\/[^\s]*)/g, (url) => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (/ablink|click\.|track\.|links\.|sendgrid|mailchimp|list-manage|email\.|mandrillapp|mailgun/i.test(host)) return "";
        return url; // Keep non-tracking URLs — linkifyPlainText will shorten them
      } catch {
        return url;
      }
    })
    // Clean up parentheses/brackets left empty after URL removal
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    // Remove leftover base64-like gibberish lines (30+ alphanumeric with dashes/underscores)
    .replace(/^[A-Za-z0-9\-_+=\/]{30,}$/gm, "")
    // Remove "view in browser" / "view as webpage" standalone lines
    .replace(/^\s*(view (this )?(email |message )?(in (your )?browser|as a? ?web ?page|online)).*$/gim, "")
    // Collapse 3+ blank lines into 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Sanitize email HTML: strip scripts, event handlers, and dangerous elements
 * while preserving layout, images, links, and formatting.
 */
function sanitizeEmailHtml(html: string): string {
  return html
    // Remove script tags and their content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Remove on* event handlers
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Remove javascript: URLs
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    // Remove form/input elements (but keep button-styled <a> links)
    .replace(/<\/?form[\s\S]*?>/gi, "")
    .replace(/<input[\s\S]*?\/?>/gi, "")
    // Strip dangerous CSS properties from inline styles (position, expression, etc.)
    .replace(/style\s*=\s*"([^"]*)"/gi, (_match, styles: string) => {
      const clean = styles
        .replace(/position\s*:\s*(fixed|absolute)/gi, "")
        .replace(/expression\s*\([^)]*\)/gi, "")
        .replace(/-moz-binding\s*:[^;]*/gi, "")
        .replace(/behavior\s*:[^;]*/gi, "");
      return `style="${clean}"`;
    })
    // Make links open in new tab
    .replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ')
    // Remove iframes
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<iframe[\s\S]*?\/?>/gi, "");
}
