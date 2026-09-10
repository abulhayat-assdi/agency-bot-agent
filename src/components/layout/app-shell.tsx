import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { primaryNavigation } from "@/components/layout/navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { logoutAction } from "@/server/auth/actions";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border/80 bg-white/75 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-2xl px-2 py-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold uppercase tracking-[0.22em] text-foreground">Agency AI</span>
            <span className="block text-xs text-muted-foreground">Meta Ads Intelligence</span>
          </span>
        </Link>

        <nav className="mt-8 space-y-1" aria-label="Primary">
          {primaryNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-primary/10 hover:text-foreground dark:hover:bg-white/10"
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute inset-x-5 bottom-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-800 dark:text-emerald-100">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Read-only mode
          </div>
          <p className="mt-2 text-xs leading-5 opacity-75">Meta writes are blocked. AI uses verified metrics only.</p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-white/70 px-4 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/65 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">AI Meta Ads Intelligence</p>
              <h1 className="mt-1 text-xl font-semibold">Agency command center</h1>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success">Mock ready</Badge>
              <Badge variant="secondary">M15</Badge>
              <ThemeToggle />
              <form action={logoutAction}>
                <Button variant="outline" size="sm" type="submit">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
