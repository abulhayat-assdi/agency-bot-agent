import { eq } from "drizzle-orm";

import { creativeMetadata, type NewCreativeMetadata } from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

type CreativeMetadataInsert = Omit<NewCreativeMetadata, "id" | "createdAt" | "updatedAt">;

export class CreativeRepository {
  // creativeMetadata has no agency scoping; context is accepted for API consistency.
  constructor(private readonly context: RepositoryContext) {}

  findByAd(adId: string) {
    return this.context.db.query.creativeMetadata.findMany({
      where: eq(creativeMetadata.adId, adId)
    });
  }

  async upsert(input: CreativeMetadataInsert) {
    const [row] = await this.context.db
      .insert(creativeMetadata)
      .values(input)
      .onConflictDoUpdate({
        target: [creativeMetadata.adId, creativeMetadata.metaCreativeId],
        set: {
          name: input.name,
          pageId: input.pageId,
          instagramActorId: input.instagramActorId,
          thumbnailUrl: input.thumbnailUrl,
          objectType: input.objectType,
          metadata: input.metadata,
          updatedAt: new Date()
        }
      })
      .returning();

    return row;
  }
}
