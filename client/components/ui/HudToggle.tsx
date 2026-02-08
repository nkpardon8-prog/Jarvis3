"use client";

interface HudToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  activeColor?: "accent" | "success";
  label?: string;
}

const sizes = {
  sm: {
    track: "w-9 h-5",
    thumb: "w-4 h-4",
    translate: "translate-x-4",
  },
  md: {
    track: "w-11 h-6",
    thumb: "w-5 h-5",
    translate: "translate-x-5",
  },
};

const colors = {
  accent: "bg-hud-accent shadow-[0_0_6px_rgba(0,212,255,0.3)]",
  success: "bg-hud-success shadow-[0_0_6px_rgba(0,255,136,0.3)]",
};

export function HudToggle({
  checked,
  onChange,
  disabled = false,
  size = "sm",
  activeColor = "accent",
  label,
}: HudToggleProps) {
  const s = sizes[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        relative ${s.track} rounded-full transition-all duration-200 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/50
        ${checked ? colors[activeColor] : "bg-hud-surface border border-hud-border"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <span
        className={`
          absolute top-0.5 left-0.5 ${s.thumb} rounded-full
          bg-white shadow-sm
          transition-transform duration-200 ease-in-out
          ${checked ? s.translate : "translate-x-0"}
        `}
      />
    </button>
  );
}
