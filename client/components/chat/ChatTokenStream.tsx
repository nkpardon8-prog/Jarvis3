"use client";

import { MarkdownRenderer } from "./MarkdownRenderer";

interface ChatTokenStreamProps {
  text: string;
}

export function ChatTokenStream({ text }: ChatTokenStreamProps) {
  if (!text) return null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-sm bg-[#0d1a2a] border border-hud-border/50">
        <div className="text-sm text-hud-text-secondary">
          <MarkdownRenderer content={text} />
          <span className="inline-block w-0.5 h-4 bg-hud-accent animate-pulse ml-0.5 align-middle" />
        </div>
      </div>
    </div>
  );
}
