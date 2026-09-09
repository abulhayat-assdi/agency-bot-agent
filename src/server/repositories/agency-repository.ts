import { eq } from "drizzle-orm";

import { agencies, type NewAgency } from "@/server/db/schema";
import type { Database } from "@/server/db/client";

export class AgencyRepository {
  constructor(private readonly db: Database) {}

  findBySlug(slug: string) {
    return this.db.query.agencies.findFirst({ where: eq(agencies.slug, slug) });
  }

  async upsert(input: NewAgency) {
    const [agency] = await this.db
      .insert(agencies)
      .values(input)
      .onConflictDoUpdate({
        target: agencies.slug,
        set: {
          name: input.name,
          timezone: input.timezone,
          updatedAt: new Date(),
          archivedAt: null
        }
      })
      .returning();

    return agency;
  }
}
