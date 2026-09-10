import { ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden flex-col justify-between border-r border-border/80 bg-white/70 p-10 dark:border-white/10 dark:bg-slate-950/60 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-foreground">Agency AI</p>
            <p className="text-sm text-muted-foreground">Meta Ads Intelligence</p>
          </div>
        </div>
        <div className="max-w-2xl">
          <Badge variant="success">Read-only analytics</Badge>
          <h1 className="mt-6 text-5xl font-bold tracking-tight">Secure ad intelligence.</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">Server-side auth protects every reporting surface. Meta write actions stay blocked.</p>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-sm text-emerald-700 dark:text-emerald-300">
          <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-100">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Protected access
          </div>
          <p className="mt-2">Password checks, rate limits, signed cookies, and route protection are active.</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin sign in</CardTitle>
            <CardDescription>Use the configured bootstrap admin credentials.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
