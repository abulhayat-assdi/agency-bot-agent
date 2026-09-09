import { ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden flex-col justify-between border-r border-white/10 bg-slate-950/60 p-10 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-200">Agency AI</p>
            <p className="text-sm text-muted-foreground">Meta Ads Intelligence</p>
          </div>
        </div>
        <div className="max-w-2xl">
          <Badge variant="success">Read-only analytics platform</Badge>
          <h1 className="mt-6 text-5xl font-bold tracking-tight">Secure admin access for verified ad intelligence.</h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            Authentication is enforced server-side before protected reporting surfaces load. Meta mutations remain outside the Phase 1 architecture.
          </p>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-sm text-emerald-100/80">
          <div className="flex items-center gap-2 font-semibold text-emerald-100">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Security foundation
          </div>
          <p className="mt-2">Password verification, rate limiting, signed HTTP-only cookies, and route protection are active.</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin sign in</CardTitle>
            <CardDescription>Use the bootstrap admin credentials configured in environment variables.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
