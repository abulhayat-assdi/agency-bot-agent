import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BreakdownCapability } from "@/server/breakdowns";
import type { MetaAdAccount } from "@/server/meta";
import type { DateRangePreset } from "@/lib/dates/reporting";

function href(params: { accountId: string; preset: DateRangePreset; breakdownKey: string }) {
  return `/breakdowns?accountId=${encodeURIComponent(params.accountId)}&preset=${params.preset}&breakdownKey=${encodeURIComponent(params.breakdownKey)}`;
}

export function CapabilityGrid({
  capabilities,
  selectedKey,
  selectedAccount,
  preset
}: {
  capabilities: BreakdownCapability[];
  selectedKey: string;
  selectedAccount: MetaAdAccount;
  preset: DateRangePreset;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {capabilities.map((capability) => (
        <Card key={capability.key} className={capability.key === selectedKey ? "border-sky-400/50" : undefined}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{capability.label}</CardTitle>
                <CardDescription>{capability.dimensions.join(" + ")}</CardDescription>
              </div>
              <Badge variant={capability.supported ? "success" : "warning"}>{capability.supported ? "supported" : "conditional"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{capability.category}</Badge>
              {capability.requiresFeature ? <Badge variant="warning">feature: {capability.requiresFeature}</Badge> : null}
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {capability.metricLimitations.slice(0, 2).map((note) => <li key={note}>• {note}</li>)}
            </ul>
            {capability.supported ? (
              <Button asChild size="sm" variant={capability.key === selectedKey ? "default" : "outline"}>
                <Link href={href({ accountId: selectedAccount.id, preset, breakdownKey: capability.key })}>
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Analyze
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                <Lock className="h-4 w-4" aria-hidden="true" />
                Disabled by capability rules
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
