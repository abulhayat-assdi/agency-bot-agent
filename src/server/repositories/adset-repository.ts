import { and, eq, isNull } from "drizzle-orm";

import { adSets, type NewAdSet } from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

export class AdSetRepository {
  constructor(private readonly context: RepositoryContext) {}

  listByAccount(adAccountId: string) {
    return this.context.db.query.adSets.findMany({
      where: and(eq(adSets.adAccountId, adAccountId), isNull(adSets.archivedAt))
    });
  }

  listByCampaign(campaignId: string) {
    return this.context.db.query.adSets.findMany({
      where: and(eq(adSets.campaignId, campaignId), isNull(adSets.archivedAt))
    });
  }

  findByMetaId(adAccountId: string, metaAdsetId: string) {
    return this.context.db.query.adSets.findFirst({
      where: and(eq(adSets.adAccountId, adAccountId), eq(adSets.metaAdsetId, metaAdsetId), isNull(adSets.archivedAt))
    });
  }

  async upsert(input: Omit<NewAdSet, "id" | "createdAt" | "updatedAt">) {
    const [row] = await this.context.db
      .insert(adSets)
      .values(input)
      .onConflictDoUpdate({
        target: [adSets.adAccountId, adSets.metaAdsetId],
        set: {
          campaignId: input.campaignId,
          name: input.name,
          status: input.status,
          effectiveStatus: input.effectiveStatus,
          optimizationGoal: input.optimizationGoal,
          billingEvent: input.billingEvent,
          attributionSpec: input.attributionSpec,
          startedAt: input.startedAt,
          stoppedAt: input.stoppedAt,
          rawLastSeenAt: input.rawLastSeenAt ?? new Date(),
          updatedAt: new Date(),
          archivedAt: null
        }
      })
      .returning();

    return row;
  }

  async upsertMany(inputs: Array<Omit<NewAdSet, "id" | "createdAt" | "updatedAt">>) {
    const rows = [];
    for (const input of inputs) {
      rows.push(await this.upsert(input));
    }
    return rows;
  }
}
