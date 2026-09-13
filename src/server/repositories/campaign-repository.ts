import { and, eq, isNull } from "drizzle-orm";

import { campaigns, type NewCampaign } from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

export class CampaignRepository {
  constructor(private readonly context: RepositoryContext) {}

  listByAccount(adAccountId: string) {
    return this.context.db.query.campaigns.findMany({
      where: and(eq(campaigns.adAccountId, adAccountId), isNull(campaigns.archivedAt))
    });
  }

  findByMetaId(adAccountId: string, metaCampaignId: string) {
    return this.context.db.query.campaigns.findFirst({
      where: and(eq(campaigns.adAccountId, adAccountId), eq(campaigns.metaCampaignId, metaCampaignId), isNull(campaigns.archivedAt))
    });
  }

  async upsert(input: Omit<NewCampaign, "id" | "createdAt" | "updatedAt">) {
    const [row] = await this.context.db
      .insert(campaigns)
      .values(input)
      .onConflictDoUpdate({
        target: [campaigns.adAccountId, campaigns.metaCampaignId],
        set: {
          name: input.name,
          status: input.status,
          effectiveStatus: input.effectiveStatus,
          objective: input.objective,
          buyingType: input.buyingType,
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

  async upsertMany(inputs: Array<Omit<NewCampaign, "id" | "createdAt" | "updatedAt">>) {
    const rows = [];
    for (const input of inputs) {
      rows.push(await this.upsert(input));
    }
    return rows;
  }
}
