import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-eyebrow">Reports</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Saved reports</h2>
        </div>
        <Badge variant="secondary">Export queue</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Report library</CardTitle>
          <CardDescription>Exports, freshness, and metric provenance.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState title="No saved exports yet" description="Create scheduled reports from Email Reports or export account tables after live data is connected." />
        </CardContent>
      </Card>
    </div>
  );
}
