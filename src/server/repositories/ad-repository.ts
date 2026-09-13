import { and, eq, isNull } from "drizzle-orm";

import { ads, type NewAd } from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

export class AdRepository {
  constructor(private readonly context: RepositoryContext) {}

  listByAccount(adAccountId: string) {
    return this.context.db.query.ads.findMany({
      where: and(eq(ads.adAccountId, adAccountId), isNull(ads.archivedAt))
    });
  }

  listByAdSet(adSetId: string) {
    return this.context.db.query.ads.findMany({
      where: and(eq(ads.adSetId, adSetId), isNull(ads.archivedAt))
    });
  }

  findByMetaId(adAccountId: string, metaAdId: string) {
    return this.context.db.query.ads.findFirst({
      where: and(eq(ads.adAccountId, adAccountId), eq(ads.metaAdId, metaAdId), isNull(ads.archivedAt))
    });
  }

  async upsert(input: Omit<NewAd, "id" | "createdAt" | "updatedAt">) {
    const [row] = await this.context.db
      .insert(ads)
      .values(input)
      .onConflictDoUpdate({
        target: [ads.adAccountId, ads.metaAdId],
        set: {
          campaignId: input.campaignId,
          adSetId: input.adSetId,
          name: input.name,
          status: input.status,
          effectiveStatus: input.effectiveStatus,
          creativeId: input.creativeId,
          rawLastSeenAt: input.rawLastSeenAt ?? new Date(),
          updatedAt: new Date(),
          archivedAt: null
        }
      })
      .returning();

    return row;
  }

  async upsertMany(inputs: Array<Omit<NewAd, "id" | "createdAt" | "updatedAt">>) {
    const rows = [];
    for (const input of inputs) {
      rows.push(await this.upsert(input));
    }
    return rows;
  }
}
