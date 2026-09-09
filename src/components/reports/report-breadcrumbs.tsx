import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { EntityContext } from "@/server/reports/mock-report-data";

export function ReportBreadcrumbs({ context }: { context: EntityContext }) {
  const items = [
    { href: "/clients", label: "Clients" },
    { href: `/clients/${context.client.id}`, label: context.client.name },
    { href: `/ad-accounts/${context.account.id}`, label: context.account.name },
    context.campaign ? { href: `/campaigns/${context.campaign.id}`, label: context.campaign.name } : null,
    context.adSet ? { href: `/adsets/${context.adSet.id}`, label: context.adSet.name } : null,
    context.ad ? { href: `/ads/${context.ad.id}`, label: context.ad.name } : null
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.href} className="flex items-center gap-2">
          {index > 0 ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
          {index === items.length - 1 ? (
            <span className="font-medium text-foreground">{item.label}</span>
          ) : (
            <Link className="transition hover:text-foreground" href={item.href}>
              {item.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
