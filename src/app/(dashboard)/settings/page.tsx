import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Agency configuration</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Settings</h2>
        </div>
        <Badge variant="secondary">Foundation shell</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Accuracy-first implementation path</CardTitle>
          <CardDescription>Settings will include connected accounts, thresholds, sync interval, security options, and provider configuration status.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Verified data not connected yet"
            description="This route is intentionally present as navigation and layout foundation only. Mock data ingestion, deterministic analytics, and persistence will be added in upcoming milestones before metrics are displayed."
          />
        </CardContent>
      </Card>
    </div>
  );
}
