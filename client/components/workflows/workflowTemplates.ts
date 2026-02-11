// ── Workflow Template Definitions & Types ────────────────────────────
// Client-side template metadata for the 20 everyday automations.
// Server-side templates (with full prompts + SKILL.md) live in
// server/src/routes/workflow-templates/templates.ts

export interface CredentialField {
  envVar: string;
  label: string;
  placeholder: string;
  helpUrl?: string;
}

export interface ScheduleValue {
  kind: "cron" | "every";
  expr?: string;
  intervalMs?: number;
}

export interface SchedulePreset {
  label: string;
  value: ScheduleValue;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide-react icon name
  accentColor: string; // HUD color token
  category: string;
  complexity: "easy" | "medium" | "hard";
  requiredSkills: string[];
  credentialFields: CredentialField[];
  oauthProviders?: string[];
  defaultSchedule: ScheduleValue;
  schedulePresets: SchedulePreset[];
  sessionTarget: "isolated" | "main";
}

export interface WorkflowInstance {
  id: string;
  templateId: string;
  name: string;
  status: "setting-up" | "active" | "paused" | "error";
  schedule: { kind: string; expr?: string; intervalMs?: number; tz?: string };
  customTrigger?: string;
  additionalInstructions: string;
  cronJobId?: string;
  cronJobName: string;
  installedSkills: string[];
  storedCredentials: string[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

// ── The 20 Everyday Automation Templates ─────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ─── 01. Morning Briefing ───────────────────────
  {
    id: "morning-briefing",
    name: "Morning Briefing",
    description: "Delivers a personalized daily briefing with calendar, weather, news, and email highlights.",
    icon: "Sunrise",
    accentColor: "hud-accent",
    category: "Daily Productivity",
    complexity: "easy",
    requiredSkills: ["google-calendar", "web-search"],
    credentialFields: [
      { envVar: "OPENWEATHERMAP_KEY", label: "OpenWeatherMap API Key", placeholder: "Enter your OpenWeatherMap API key" },
      { envVar: "NEWS_API_KEY", label: "News API Key", placeholder: "Enter your NewsAPI key" },
    ],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "cron", expr: "0 7 * * *" },
    schedulePresets: [
      { label: "6 AM", value: { kind: "cron", expr: "0 6 * * *" } },
      { label: "7 AM", value: { kind: "cron", expr: "0 7 * * *" } },
      { label: "8 AM", value: { kind: "cron", expr: "0 8 * * *" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 02. Email Triage ───────────────────────────
  {
    id: "email-triage",
    name: "Email Triage",
    description: "Automatically classifies, labels, and prioritizes your inbox every 30 minutes.",
    icon: "Mail",
    accentColor: "hud-success",
    category: "Email Management",
    complexity: "easy",
    requiredSkills: ["gmail"],
    credentialFields: [],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "every", intervalMs: 1800000 },
    schedulePresets: [
      { label: "Every 15 min", value: { kind: "every", intervalMs: 900000 } },
      { label: "Every 30 min", value: { kind: "every", intervalMs: 1800000 } },
      { label: "Every hour", value: { kind: "every", intervalMs: 3600000 } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 03. Bill & Receipt Tracker ─────────────────
  {
    id: "bill-tracker",
    name: "Bill & Receipt Tracker",
    description: "Scans your email for bills and receipts, extracts amounts, and logs them to a spreadsheet.",
    icon: "Receipt",
    accentColor: "hud-amber",
    category: "Personal Finance",
    complexity: "medium",
    requiredSkills: ["gmail", "google-drive"],
    credentialFields: [],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "cron", expr: "0 20 * * *" },
    schedulePresets: [
      { label: "Daily at 8 PM", value: { kind: "cron", expr: "0 20 * * *" } },
      { label: "Daily at 9 PM", value: { kind: "cron", expr: "0 21 * * *" } },
      { label: "Weekly Sunday", value: { kind: "cron", expr: "0 20 * * 0" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 04. Calendar Assistant ─────────────────────
  {
    id: "calendar-assistant",
    name: "Calendar Assistant",
    description: "Reviews your upcoming schedule, detects conflicts, and suggests optimizations daily.",
    icon: "CalendarCheck",
    accentColor: "hud-accent",
    category: "Daily Productivity",
    complexity: "easy",
    requiredSkills: ["google-calendar", "gmail"],
    credentialFields: [],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "cron", expr: "0 7 * * 1-5" },
    schedulePresets: [
      { label: "7 AM Weekdays", value: { kind: "cron", expr: "0 7 * * 1-5" } },
      { label: "6 AM Daily", value: { kind: "cron", expr: "0 6 * * *" } },
      { label: "8 AM Daily", value: { kind: "cron", expr: "0 8 * * *" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 05. Meal Planner ──────────────────────────
  {
    id: "meal-planner",
    name: "Meal Planner",
    description: "Generates a weekly meal plan with recipes and a consolidated grocery list in Notion.",
    icon: "UtensilsCrossed",
    accentColor: "hud-amber",
    category: "Home & Lifestyle",
    complexity: "medium",
    requiredSkills: ["notion"],
    credentialFields: [
      { envVar: "NOTION_API_KEY", label: "Notion API Key", placeholder: "secret_..." },
    ],
    defaultSchedule: { kind: "cron", expr: "0 10 * * 0" },
    schedulePresets: [
      { label: "Sunday 10 AM", value: { kind: "cron", expr: "0 10 * * 0" } },
      { label: "Saturday 9 AM", value: { kind: "cron", expr: "0 9 * * 6" } },
      { label: "Friday 6 PM", value: { kind: "cron", expr: "0 18 * * 5" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 06. Package Tracker ────────────────────────
  {
    id: "package-tracker",
    name: "Package Tracker",
    description: "Monitors your email for shipping notifications and tracks all packages in one place.",
    icon: "Package",
    accentColor: "hud-amber",
    category: "Home & Lifestyle",
    complexity: "easy",
    requiredSkills: ["gmail"],
    credentialFields: [
      { envVar: "AFTERSHIP_API_KEY", label: "AfterShip API Key (optional)", placeholder: "Enter API key for enhanced tracking" },
    ],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "every", intervalMs: 14400000 },
    schedulePresets: [
      { label: "Every 2 hours", value: { kind: "every", intervalMs: 7200000 } },
      { label: "Every 4 hours", value: { kind: "every", intervalMs: 14400000 } },
      { label: "Every 8 hours", value: { kind: "every", intervalMs: 28800000 } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 07. Social Media Scheduler ─────────────────
  {
    id: "social-scheduler",
    name: "Social Media Scheduler",
    description: "Finds trending content in your niche, repurposes it, and schedules posts across platforms.",
    icon: "Share2",
    accentColor: "hud-error",
    category: "Content & Social",
    complexity: "hard",
    requiredSkills: ["web-search"],
    credentialFields: [
      { envVar: "TWITTER_API_KEY", label: "Twitter/X API Key", placeholder: "Enter your Twitter API key" },
      { envVar: "LINKEDIN_API_KEY", label: "LinkedIn API Key", placeholder: "Enter your LinkedIn API key" },
    ],
    defaultSchedule: { kind: "cron", expr: "0 9 * * 1,3,5" },
    schedulePresets: [
      { label: "Mon/Wed/Fri 9 AM", value: { kind: "cron", expr: "0 9 * * 1,3,5" } },
      { label: "Daily 10 AM", value: { kind: "cron", expr: "0 10 * * *" } },
      { label: "Weekdays 8 AM", value: { kind: "cron", expr: "0 8 * * 1-5" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 08. Smart File Organizer ───────────────────
  {
    id: "file-organizer",
    name: "Smart File Organizer",
    description: "Analyzes your Downloads and Desktop folders, then organizes files by type and project.",
    icon: "FolderSync",
    accentColor: "hud-success",
    category: "Digital Organization",
    complexity: "medium",
    requiredSkills: [],
    credentialFields: [],
    defaultSchedule: { kind: "cron", expr: "0 22 * * 5" },
    schedulePresets: [
      { label: "Friday 10 PM", value: { kind: "cron", expr: "0 22 * * 5" } },
      { label: "Daily Midnight", value: { kind: "cron", expr: "0 0 * * *" } },
      { label: "Sunday 8 PM", value: { kind: "cron", expr: "0 20 * * 0" } },
    ],
    sessionTarget: "main",
  },
  // ─── 09. Smart Home Automator ───────────────────
  {
    id: "smart-home",
    name: "Smart Home Automator",
    description: "Creates and manages Home Assistant routines, monitors device status, and handles alerts.",
    icon: "Home",
    accentColor: "hud-amber",
    category: "Smart Home",
    complexity: "hard",
    requiredSkills: ["home-assistant"],
    credentialFields: [
      { envVar: "HOME_ASSISTANT_TOKEN", label: "Home Assistant Token", placeholder: "Enter your long-lived access token" },
      { envVar: "HOME_ASSISTANT_URL", label: "Home Assistant URL", placeholder: "http://homeassistant.local:8123" },
    ],
    defaultSchedule: { kind: "every", intervalMs: 3600000 },
    schedulePresets: [
      { label: "Every 30 min", value: { kind: "every", intervalMs: 1800000 } },
      { label: "Every hour", value: { kind: "every", intervalMs: 3600000 } },
      { label: "Every 4 hours", value: { kind: "every", intervalMs: 14400000 } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 10. Travel Planner ─────────────────────────
  {
    id: "travel-planner",
    name: "Travel Planner",
    description: "Researches destinations, builds itineraries, tracks prices, and organizes travel documents.",
    icon: "Plane",
    accentColor: "hud-amber",
    category: "Travel & Logistics",
    complexity: "medium",
    requiredSkills: ["gmail", "web-search"],
    credentialFields: [
      { envVar: "SERPAPI_KEY", label: "SerpAPI Key (for flight search)", placeholder: "Enter your SerpAPI key" },
    ],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "cron", expr: "0 9 * * 1" },
    schedulePresets: [
      { label: "Monday 9 AM", value: { kind: "cron", expr: "0 9 * * 1" } },
      { label: "Daily 8 AM", value: { kind: "cron", expr: "0 8 * * *" } },
      { label: "Wed/Sat 10 AM", value: { kind: "cron", expr: "0 10 * * 3,6" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 11. Meeting Notes & Actions ────────────────
  {
    id: "meeting-notes",
    name: "Meeting Notes & Actions",
    description: "Summarizes meeting transcripts, extracts action items, and syncs to Notion and Slack.",
    icon: "FileText",
    accentColor: "hud-accent",
    category: "Work Productivity",
    complexity: "medium",
    requiredSkills: ["notion", "slack"],
    credentialFields: [
      { envVar: "NOTION_API_KEY", label: "Notion API Key", placeholder: "secret_..." },
      { envVar: "SLACK_WEBHOOK_URL", label: "Slack Webhook URL", placeholder: "https://hooks.slack.com/services/..." },
      { envVar: "ZOOM_API_KEY", label: "Zoom API Key (optional)", placeholder: "Enter your Zoom API key" },
    ],
    defaultSchedule: { kind: "cron", expr: "0 18 * * 1-5" },
    schedulePresets: [
      { label: "5 PM Weekdays", value: { kind: "cron", expr: "0 17 * * 1-5" } },
      { label: "6 PM Weekdays", value: { kind: "cron", expr: "0 18 * * 1-5" } },
      { label: "Every 2 hours", value: { kind: "every", intervalMs: 7200000 } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 12. Security & Privacy Auditor ─────────────
  {
    id: "security-auditor",
    name: "Security & Privacy Auditor",
    description: "Checks for data breaches, password reuse, and privacy exposure on a regular schedule.",
    icon: "ShieldCheck",
    accentColor: "hud-success",
    category: "Security & Privacy",
    complexity: "medium",
    requiredSkills: [],
    credentialFields: [
      { envVar: "HIBP_API_KEY", label: "Have I Been Pwned API Key", placeholder: "Enter your HIBP API key" },
    ],
    defaultSchedule: { kind: "cron", expr: "0 10 * * 1" },
    schedulePresets: [
      { label: "Weekly Monday", value: { kind: "cron", expr: "0 10 * * 1" } },
      { label: "Daily 9 AM", value: { kind: "cron", expr: "0 9 * * *" } },
      { label: "Monthly 1st", value: { kind: "cron", expr: "0 10 1 * *" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 13. Fitness & Habit Tracker ────────────────
  {
    id: "fitness-tracker",
    name: "Fitness & Habit Tracker",
    description: "Tracks daily habits, logs workouts, and generates weekly progress reports.",
    icon: "Activity",
    accentColor: "hud-error",
    category: "Health & Wellness",
    complexity: "easy",
    requiredSkills: [],
    credentialFields: [
      { envVar: "STRAVA_API_KEY", label: "Strava API Key (optional)", placeholder: "Enter your Strava API key" },
    ],
    defaultSchedule: { kind: "cron", expr: "0 21 * * *" },
    schedulePresets: [
      { label: "9 PM Daily", value: { kind: "cron", expr: "0 21 * * *" } },
      { label: "10 PM Daily", value: { kind: "cron", expr: "0 22 * * *" } },
      { label: "Sunday 8 PM", value: { kind: "cron", expr: "0 20 * * 0" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 14. News & Research Digest ─────────────────
  {
    id: "news-digest",
    name: "News & Research Digest",
    description: "Curates personalized news from multiple sources and delivers a formatted digest.",
    icon: "Newspaper",
    accentColor: "hud-accent",
    category: "Information Management",
    complexity: "easy",
    requiredSkills: ["web-search"],
    credentialFields: [
      { envVar: "NEWS_API_KEY", label: "News API Key (optional)", placeholder: "Enter your NewsAPI key" },
    ],
    defaultSchedule: { kind: "cron", expr: "0 8 * * *" },
    schedulePresets: [
      { label: "8 AM Daily", value: { kind: "cron", expr: "0 8 * * *" } },
      { label: "7 AM / 5 PM", value: { kind: "cron", expr: "0 7,17 * * *" } },
      { label: "Monday Morning", value: { kind: "cron", expr: "0 8 * * 1" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 15. Photo Organizer ────────────────────────
  {
    id: "photo-organizer",
    name: "Photo Organizer",
    description: "Sorts and tags photos in Google Drive by date, location, and content.",
    icon: "Image",
    accentColor: "hud-success",
    category: "Digital Organization",
    complexity: "medium",
    requiredSkills: ["google-drive"],
    credentialFields: [],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "cron", expr: "0 2 * * 0" },
    schedulePresets: [
      { label: "Sunday 2 AM", value: { kind: "cron", expr: "0 2 * * 0" } },
      { label: "Daily Midnight", value: { kind: "cron", expr: "0 0 * * *" } },
      { label: "Monthly 1st", value: { kind: "cron", expr: "0 2 1 * *" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 16. Invoice & Expense Reporter ─────────────
  {
    id: "invoice-generator",
    name: "Invoice & Expense Reporter",
    description: "Generates invoices from templates and compiles monthly expense reports.",
    icon: "FileSpreadsheet",
    accentColor: "hud-amber",
    category: "Personal Finance",
    complexity: "hard",
    requiredSkills: ["gmail", "google-drive"],
    credentialFields: [],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "cron", expr: "0 9 1 * *" },
    schedulePresets: [
      { label: "1st of Month", value: { kind: "cron", expr: "0 9 1 * *" } },
      { label: "15th of Month", value: { kind: "cron", expr: "0 9 15 * *" } },
      { label: "Every Friday", value: { kind: "cron", expr: "0 9 * * 5" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 17. Smart Bookmark Manager ─────────────────
  {
    id: "bookmark-manager",
    name: "Smart Bookmark Manager",
    description: "Organizes bookmarks, checks for dead links, and suggests related content.",
    icon: "Bookmark",
    accentColor: "hud-accent",
    category: "Information Management",
    complexity: "easy",
    requiredSkills: ["web-search"],
    credentialFields: [
      { envVar: "LINKDING_URL", label: "Linkding Server URL (optional)", placeholder: "https://your-linkding-instance.com" },
      { envVar: "LINKDING_API_KEY", label: "Linkding API Key (optional)", placeholder: "Enter your Linkding API key" },
    ],
    defaultSchedule: { kind: "cron", expr: "0 3 * * 0" },
    schedulePresets: [
      { label: "Sunday 3 AM", value: { kind: "cron", expr: "0 3 * * 0" } },
      { label: "Daily 2 AM", value: { kind: "cron", expr: "0 2 * * *" } },
      { label: "Monthly 1st", value: { kind: "cron", expr: "0 3 1 * *" } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 18. Pet & Plant Care Scheduler ─────────────
  {
    id: "pet-plant-care",
    name: "Pet & Plant Care Scheduler",
    description: "Tracks feeding schedules, vet appointments, watering reminders, and seasonal care.",
    icon: "Leaf",
    accentColor: "hud-amber",
    category: "Home & Lifestyle",
    complexity: "easy",
    requiredSkills: ["google-calendar"],
    credentialFields: [
      { envVar: "OPENWEATHERMAP_KEY", label: "OpenWeatherMap Key (for plant care)", placeholder: "Enter your API key" },
    ],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "cron", expr: "0 8 * * *" },
    schedulePresets: [
      { label: "8 AM Daily", value: { kind: "cron", expr: "0 8 * * *" } },
      { label: "7 AM / 6 PM", value: { kind: "cron", expr: "0 7,18 * * *" } },
      { label: "Every 6 hours", value: { kind: "every", intervalMs: 21600000 } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 19. Price Monitor & Deal Finder ────────────
  {
    id: "price-monitor",
    name: "Price Monitor & Deal Finder",
    description: "Tracks product prices across stores and alerts you when prices drop.",
    icon: "TrendingDown",
    accentColor: "hud-error",
    category: "Shopping & Deals",
    complexity: "medium",
    requiredSkills: ["web-search"],
    credentialFields: [],
    defaultSchedule: { kind: "every", intervalMs: 21600000 },
    schedulePresets: [
      { label: "Every 4 hours", value: { kind: "every", intervalMs: 14400000 } },
      { label: "Every 6 hours", value: { kind: "every", intervalMs: 21600000 } },
      { label: "Every 12 hours", value: { kind: "every", intervalMs: 43200000 } },
    ],
    sessionTarget: "isolated",
  },
  // ─── 20. Weekly Review & Planning ───────────────
  {
    id: "weekly-review",
    name: "Weekly Review & Planning",
    description: "Compiles a comprehensive weekly review with highlights, metrics, and plans for next week.",
    icon: "ClipboardList",
    accentColor: "hud-accent",
    category: "Daily Productivity",
    complexity: "medium",
    requiredSkills: ["google-calendar", "gmail", "notion"],
    credentialFields: [
      { envVar: "NOTION_API_KEY", label: "Notion API Key", placeholder: "secret_..." },
    ],
    oauthProviders: ["google"],
    defaultSchedule: { kind: "cron", expr: "0 18 * * 5" },
    schedulePresets: [
      { label: "Friday 6 PM", value: { kind: "cron", expr: "0 18 * * 5" } },
      { label: "Sunday 7 PM", value: { kind: "cron", expr: "0 19 * * 0" } },
      { label: "Saturday 10 AM", value: { kind: "cron", expr: "0 10 * * 6" } },
    ],
    sessionTarget: "isolated",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

/** All unique categories from the template list */
export function getCategories(): string[] {
  const cats = new Set(WORKFLOW_TEMPLATES.map((t) => t.category));
  return Array.from(cats);
}

/** Filter templates by category (pass undefined or "All" for no filter) */
export function getTemplatesByCategory(category?: string): WorkflowTemplate[] {
  if (!category || category === "All") return WORKFLOW_TEMPLATES;
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}

/** Human-readable schedule description */
export function describeSchedule(schedule: {
  kind: string;
  expr?: string;
  intervalMs?: number;
}): string {
  if (schedule.kind === "every" && schedule.intervalMs) {
    const mins = schedule.intervalMs / 60000;
    if (mins < 60) return `Every ${mins} min`;
    const hrs = mins / 60;
    if (hrs === 1) return "Every hour";
    return `Every ${hrs} hours`;
  }
  if (schedule.kind === "cron" && schedule.expr) {
    return describeCronExpr(schedule.expr);
  }
  return "Custom schedule";
}

/** Simple human-readable cron description for common patterns */
export function describeCronExpr(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [min, hour, dom, , dow] = parts;

  // "0 7 * * *" -> "Daily at 7:00 AM"
  if (dom === "*" && dow === "*" && !hour.includes(",") && !hour.includes("/")) {
    const h = parseInt(hour, 10);
    const m = parseInt(min, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const mStr = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
    return `Daily at ${h12}${mStr} ${ampm}`;
  }

  // "0 7,14 * * *" -> "Daily at 7 AM, 2 PM"
  if (dom === "*" && dow === "*" && hour.includes(",")) {
    const hours = hour.split(",").map((h) => {
      const n = parseInt(h, 10);
      const ampm = n >= 12 ? "PM" : "AM";
      const h12 = n === 0 ? 12 : n > 12 ? n - 12 : n;
      return `${h12} ${ampm}`;
    });
    return `Daily at ${hours.join(", ")}`;
  }

  // "0 9,17 * * 1-5" -> "Weekdays at 9 AM, 5 PM"
  if (dom === "*" && dow === "1-5" && hour.includes(",")) {
    const hours = hour.split(",").map((h) => {
      const n = parseInt(h, 10);
      const ampm = n >= 12 ? "PM" : "AM";
      const h12 = n === 0 ? 12 : n > 12 ? n - 12 : n;
      return `${h12} ${ampm}`;
    });
    return `Weekdays at ${hours.join(", ")}`;
  }

  // "0 7 * * 1-5" -> "Weekdays at 7 AM"
  if (dom === "*" && dow === "1-5" && !hour.includes(",") && !hour.includes("/")) {
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Weekdays at ${h12} ${ampm}`;
  }

  // "0 8-18/2 * * 1-5" -> "Weekdays every 2h (work hours)"
  if (dom === "*" && dow === "1-5" && hour.includes("/")) {
    return `Weekdays ${hour}`;
  }

  // "0 9 * * 1,3,5" -> "Mon/Wed/Fri at 9 AM"
  if (dom === "*" && dow.includes(",")) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days = dow.split(",").map((d) => dayNames[parseInt(d, 10)] || d);
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${days.join("/")} at ${h12} ${ampm}`;
  }

  // "0 20 * * 0" -> "Weekly on Sunday at 8 PM"
  if (dom === "*" && /^\d$/.test(dow)) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Weekly on ${days[parseInt(dow, 10)]} at ${h12} ${ampm}`;
  }

  // "0 9 1 * *" -> "Monthly on 1st at 9 AM"
  if (dom !== "*" && dow === "*" && !dom.includes(",")) {
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const d = parseInt(dom, 10);
    const suffix = d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th";
    return `Monthly on ${d}${suffix} at ${h12} ${ampm}`;
  }

  return expr;
}
