import {
  Activity,
  BarChart3,
  BookOpen,
  Building,
  Building2,
  CalendarDays,
  CalendarX,
  ClipboardList,
  Coins,
  FilePlus,
  FileText,
  GitFork,
  HardDrive,
  Hash,
  History,
  Inbox,
  Library,
  ListChecks,
  ListTree,
  Megaphone,
  MessageSquare,
  Network,
  Package,
  Plus,
  RadioTower,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * apps/web/components/layout/icon-map.ts
 *
 * Map string icon names (as stored in `menu_item.icon`) to lucide-react
 * components. The seed in `packages/db/seed/menus.ts` writes these exact
 * strings; if a new menu seed introduces a new icon name, add the import +
 * map entry here. Unknown / null names fall back to `ShieldCheck`.
 *
 * Cross-checked against `packages/db/seed/menus.ts` (31 unique icon strings,
 * plus `ShieldCheck` reserved for the fallback).
 */
export const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  BarChart3,
  BookOpen,
  Building,
  Building2,
  CalendarDays,
  CalendarX,
  ClipboardList,
  Coins,
  FilePlus,
  FileText,
  GitFork,
  HardDrive,
  Hash,
  History,
  Inbox,
  Library,
  ListChecks,
  ListTree,
  Megaphone,
  MessageSquare,
  Network,
  Package,
  Plus,
  RadioTower,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
};

export function resolveIcon(name: string | null | undefined): LucideIcon {
  if (name && ICON_MAP[name]) return ICON_MAP[name];
  return ShieldCheck;
}
