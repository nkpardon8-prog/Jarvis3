"use client";

import { useState, useEffect, useRef } from "react";

const STATUS_MESSAGES = [
  "Reading your request",
  "Planning the best response",
  "Checking context",
  "Composing answer",
  "Gathering information",
  "Analyzing details",
];

const ROTATE_INTERVAL = 1500; // ms between status message changes
const SHOW_DELAY = 80; // ms before showing full indicator (avoids flicker)

export function ThinkingIndicator() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);
  const startTime = useRef(Date.now());

  // Delay showing the full indicator to avoid flicker on fast responses
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY);
    return () => clearTimeout(timer);
  }, []);

  // Rotate status messages
  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Elapsed time counter
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!visible) {
    // Minimal placeholder during delay to keep layout stable
    return <div className="h-16" />;
  }

  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="thinking-card max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-sm bg-[#0d1a2a] border border-hud-accent/15 relative overflow-hidden">
        {/* Shimmer sweep */}
        <div className="thinking-shimmer absolute inset-0 pointer-events-none" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          {/* Animated rings */}
          <div className="relative w-8 h-8 flex-shrink-0" aria-hidden="true">
            <div className="thinking-ring-outer absolute inset-0 rounded-full border-2 border-hud-accent/25" />
            <div className="thinking-ring-inner absolute inset-1 rounded-full border-2 border-hud-accent/40" />
            <div className="absolute inset-2.5 rounded-full bg-hud-accent/15 thinking-pulse" />
          </div>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-hud-text-secondary thinking-text-fade">
              {STATUS_MESSAGES[msgIndex]}
            </p>
          </div>

          {/* Elapsed time */}
          {elapsed > 0 && (
            <span className="text-[10px] text-hud-text-muted tabular-nums flex-shrink-0">
              ~{elapsed}s
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
