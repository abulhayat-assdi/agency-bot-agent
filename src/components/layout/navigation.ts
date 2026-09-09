import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  Gauge,
  Layers3,
  LineChart,
  Mail,
  Megaphone,
  Settings,
  UsersRound
} from "lucide-react";

export const primaryNavigation = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/clients", label: "Clients", icon: UsersRound },
  { href: "/ad-accounts", label: "Ad Accounts", icon: BriefcaseBusiness },
  { href: "/breakdowns", label: "Breakdowns", icon: Layers3 },
  { href: "/trends", label: "Trends", icon: LineChart },
  { href: "/ai-analyst", label: "AI Analyst", icon: Bot },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/email-reports", label: "Email Reports", icon: Mail },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

export const reportNavigation = [
  { label: "Campaign Reports", icon: Megaphone },
  { label: "Ad Set Reports", icon: Layers3 },
  { label: "Individual Ad Reports", icon: CalendarClock }
] as const;
