import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  DatabaseZap,
  Gauge,
  Layers3,
  LineChart,
  Mail,
  Megaphone,
  Settings,
  UsersRound
} from "lucide-react";

// The chat is the home screen; these pages hold the detailed tables and charts.
export const primaryNavigation = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/ad-accounts", label: "Ad Accounts", icon: BriefcaseBusiness },
  { href: "/clients", label: "Clients", icon: UsersRound },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/breakdowns", label: "Breakdowns", icon: Layers3 },
  { href: "/trends", label: "Trends", icon: LineChart },
  { href: "/sync", label: "Sync Ops", icon: DatabaseZap },
  { href: "/email-reports", label: "Email Reports", icon: Mail },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

export const reportNavigation = [
  { label: "Campaign Reports", icon: Megaphone },
  { label: "Ad Set Reports", icon: Layers3 },
  { label: "Individual Ad Reports", icon: CalendarClock }
] as const;
