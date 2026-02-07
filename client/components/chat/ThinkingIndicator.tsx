"use client";

export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex items-center gap-1">
        <span
          className="inline-block w-2 h-2 rounded-full bg-hud-accent animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="inline-block w-2 h-2 rounded-full bg-hud-accent animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="inline-block w-2 h-2 rounded-full bg-hud-accent animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-sm text-hud-text-muted">Thinking...</span>
    </div>
  );
}
