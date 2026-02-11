// ─── Workflow Color Registry ─────────────────────────────────────
// Maps HUD color tokens to Tailwind CSS class sets and maps
// workflow categories to their default color tokens.

export interface ColorClasses {
  bg: string;
  text: string;
  border: string;
}

export const COLOR_CLASSES: Record<string, ColorClasses> = {
  "hud-accent": {
    bg: "bg-hud-accent/15",
    text: "text-hud-accent",
    border: "border-hud-accent/30",
  },
  "hud-success": {
    bg: "bg-hud-success/15",
    text: "text-hud-success",
    border: "border-hud-success/30",
  },
  "hud-amber": {
    bg: "bg-hud-amber/15",
    text: "text-hud-amber",
    border: "border-hud-amber/30",
  },
  "hud-error": {
    bg: "bg-hud-error/15",
    text: "text-hud-error",
    border: "border-hud-error/30",
  },
};

/** Category → default HUD color token */
export const CATEGORY_COLOR_MAP: Record<string, string> = {
  "Daily Productivity": "hud-accent",
  "Email Management": "hud-success",
  "Personal Finance": "hud-amber",
  "Home & Lifestyle": "hud-amber",
  "Content & Social": "hud-error",
  "Digital Organization": "hud-success",
  "Smart Home": "hud-amber",
  "Travel & Logistics": "hud-amber",
  "Work Productivity": "hud-accent",
  "Security & Privacy": "hud-success",
  "Health & Wellness": "hud-error",
  "Information Management": "hud-accent",
  "Shopping & Deals": "hud-error",
};

/** Resolve color classes for a HUD color token. Falls back to hud-accent. */
export function getColorClasses(token: string): ColorClasses {
  return COLOR_CLASSES[token] || COLOR_CLASSES["hud-accent"];
}
