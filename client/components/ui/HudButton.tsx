"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

interface HudButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variants = {
  primary:
    "bg-hud-accent/20 text-hud-accent border-hud-accent/40 hover:bg-hud-accent/30 hover:shadow-[0_0_15px_rgba(0,212,255,0.2)]",
  secondary:
    "bg-transparent text-hud-text-secondary border-hud-border hover:bg-hud-surface-hover hover:text-hud-text",
  danger:
    "bg-hud-error/20 text-hud-error border-hud-error/40 hover:bg-hud-error/30",
  ghost:
    "bg-transparent text-hud-text-secondary border-transparent hover:bg-hud-surface-hover hover:text-hud-text",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function HudButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: HudButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 rounded-lg border
        font-medium transition-all duration-200 cursor-pointer
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
