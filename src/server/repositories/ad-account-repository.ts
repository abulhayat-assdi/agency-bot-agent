import { and, desc, eq, isNull } from "drizzle-orm";

import { adAccounts, type NewAdAccount } from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

export class AdAccountRepository {
  constructor(private readonly context: RepositoryContext) {}

  listByClient(clientId: string) {
    return this.context.db.query.adAccounts.findMany({
      where: and(
        eq(adAccounts.agencyId, this.context.agencyId),
        eq(adAccounts.clientId, clientId),
        isNull(adAccounts.archivedAt)
      ),
      orderBy: [desc(adAccounts.updatedAt)]
    });
  }

  findByMetaAccountId(metaAccountId: string) {
    return this.context.db.query.adAccounts.findFirst({
      where: and(eq(adAccounts.agencyId, this.context.agencyId), eq(adAccounts.metaAccountId, metaAccountId), isNull(adAccounts.archivedAt))
    });
  }

  async upsert(input: Omit<NewAdAccount, "agencyId" | "provider">) {
    const [account] = await this.context.db
      .insert(adAccounts)
      .values({ ...input, agencyId: this.context.agencyId, provider: "meta" })
      .onConflictDoUpdate({
        target: [adAccounts.provider, adAccounts.metaAccountId],
        set: {
          clientId: input.clientId,
          providerMode: input.providerMode,
          name: input.name,
          currency: input.currency,
          timezone: input.timezone,
          status: input.status,
          accessStatus: input.accessStatus,
          connectionMetadata: input.connectionMetadata,
          updatedAt: new Date(),
          archivedAt: null
        }
      })
      .returning();

    return account;
  }
}
