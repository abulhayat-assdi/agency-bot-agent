import { Activity, BarChart3, Database, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const foundations = [
  {
    title: "Multi-client hierarchy",
    description: "Agency → clients → ad accounts → campaigns → ad sets → ads route model is established.",
    icon: Database
  },
  {
    title: "Deterministic analytics boundary",
    description: "Metric calculations will live in server analytics modules, not UI or AI prompts.",
    icon: BarChart3
  },
  {
    title: "Read-only Meta posture",
    description: "The architecture excludes Meta write capabilities and prepares a read-only provider interface.",
    icon: ShieldCheck
  },
  {
    title: "Operational readiness",
    description: "Environment validation, health endpoint, structured logging, and deployment docs are started.",
    icon: Activity
  }
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-sky-500/20 via-slate-900 to-violet-600/20 p-8 shadow-glow">
        <Badge variant="success">Production architecture in progress</Badge>
        <div className="mt-6 max-w-4xl">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Trustworthy Meta Ads intelligence for agency teams.</h2>
          <p className="mt-4 text-lg leading-8 text-slate-300">
            This foundation prioritizes accurate ingestion, normalized metrics, explainable analytics, and guarded AI analysis. Live KPIs remain unavailable until mock and real sync milestones populate verified data.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {foundations.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Data availability</CardTitle>
            <CardDescription>Milestone 1 intentionally avoids fake performance metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-muted-foreground">
              Spend, impressions, clicks, conversions, ROAS, breakdowns, trends, and anomalies will show only after the mock Meta adapter, ingestion layer, and analytics engine are implemented in subsequent milestones.
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next milestone focus</CardTitle>
            <CardDescription>Admin authentication and route protection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Secure login, password hashing, sessions, secure cookies, and server-side authorization will be added before any sensitive reporting surfaces become operational.</p>
            <Badge variant="warning">No production secrets required</Badge>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
