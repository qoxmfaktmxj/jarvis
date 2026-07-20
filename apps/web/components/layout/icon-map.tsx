import {
  BookOpen,
  Braces,
  ChartNoAxesColumn,
  Circle,
  FileText,
  LayoutDashboard,
  ListChecks,
  Menu as MenuIcon,
  MessageSquare,
  Search,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Braces,
  ChartNoAxesColumn,
  FileText,
  LayoutDashboard,
  ListChecks,
  Menu: MenuIcon,
  MessageSquare,
  Search,
  ShieldCheck,
  Users,
};

export function getMenuIcon(name: string | null): LucideIcon {
  return name ? ICONS[name] ?? Circle : Circle;
}
