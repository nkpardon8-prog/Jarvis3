// ─── Workflow Icon Registry ──────────────────────────────────────
// Centralizes all lucide-react icon imports for workflow templates & cards.
// Import getWorkflowIcon(name) wherever you need to resolve a template icon.

import {
  Sunrise,
  Mail,
  Receipt,
  CalendarCheck,
  UtensilsCrossed,
  Package,
  Share2,
  FolderSync,
  Home,
  Plane,
  FileText,
  ShieldCheck,
  Activity,
  Newspaper,
  Image,
  FileSpreadsheet,
  Bookmark,
  Leaf,
  TrendingDown,
  ClipboardList,
  Puzzle,
  type LucideIcon,
} from "lucide-react";

export const WORKFLOW_ICON_MAP: Record<string, LucideIcon> = {
  Sunrise,
  Mail,
  Receipt,
  CalendarCheck,
  UtensilsCrossed,
  Package,
  Share2,
  FolderSync,
  Home,
  Plane,
  FileText,
  ShieldCheck,
  Activity,
  Newspaper,
  Image,
  FileSpreadsheet,
  Bookmark,
  Leaf,
  TrendingDown,
  ClipboardList,
  Puzzle,
};

/** Resolve a lucide-react icon component by name. Falls back to Puzzle. */
export function getWorkflowIcon(name: string): LucideIcon {
  return WORKFLOW_ICON_MAP[name] || Puzzle;
}
