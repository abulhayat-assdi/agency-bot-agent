import { and, desc, eq, ilike, isNull } from "drizzle-orm";

import { clients, type NewClient } from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

export class ClientRepository {
  constructor(private readonly context: RepositoryContext) {}

  list(params: { search?: string; limit?: number; offset?: number } = {}) {
    const filters = [eq(clients.agencyId, this.context.agencyId), isNull(clients.archivedAt)];

    if (params.search) {
      filters.push(ilike(clients.name, `%${params.search}%`));
    }

    return this.context.db.query.clients.findMany({
      where: and(...filters),
      orderBy: [desc(clients.updatedAt)],
      limit: params.limit ?? 50,
      offset: params.offset ?? 0
    });
  }

  findById(id: string) {
    return this.context.db.query.clients.findFirst({
      where: and(eq(clients.agencyId, this.context.agencyId), eq(clients.id, id), isNull(clients.archivedAt))
    });
  }

  async upsert(input: Omit<NewClient, "agencyId">) {
    const [client] = await this.context.db
      .insert(clients)
      .values({ ...input, agencyId: this.context.agencyId })
      .onConflictDoUpdate({
        target: [clients.agencyId, clients.slug],
        set: {
          name: input.name,
          status: input.status,
          defaultTimezone: input.defaultTimezone,
          notes: input.notes,
          updatedAt: new Date(),
          archivedAt: null
        }
      })
      .returning();

    return client;
  }
}
