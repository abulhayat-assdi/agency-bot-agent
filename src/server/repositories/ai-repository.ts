import { and, desc, eq, isNull } from "drizzle-orm";

import {
  aiConversations,
  aiMessages,
  type NewAiConversation,
  type NewAiMessage
} from "@/server/db/schema";
import { toUuidOrNull, type RepositoryContext } from "@/server/repositories/types";

export class AiConversationRepository {
  constructor(private readonly context: RepositoryContext) {}

  list(params: { userId?: string; limit?: number; offset?: number } = {}) {
    const filters = [eq(aiConversations.agencyId, this.context.agencyId), isNull(aiConversations.archivedAt)];
    // Non-UUID actors (bootstrap admin) own rows stored with user_id NULL —
    // comparing a uuid column to such a string would throw, so skip the filter.
    const ownerId = toUuidOrNull(params.userId);
    if (ownerId) filters.push(eq(aiConversations.userId, ownerId));
    return this.context.db.query.aiConversations.findMany({
      where: and(...filters),
      orderBy: [desc(aiConversations.updatedAt)],
      limit: params.limit ?? 20,
      offset: params.offset ?? 0
    });
  }

  findById(id: string) {
    return this.context.db.query.aiConversations.findFirst({
      where: and(
        eq(aiConversations.agencyId, this.context.agencyId),
        eq(aiConversations.id, id),
        isNull(aiConversations.archivedAt)
      )
    });
  }

  async create(input: Omit<NewAiConversation, "agencyId">) {
    const [conversation] = await this.context.db
      .insert(aiConversations)
      .values({ ...input, userId: toUuidOrNull(input.userId), agencyId: this.context.agencyId })
      .returning();
    return conversation;
  }

  async touch(id: string) {
    const [conversation] = await this.context.db
      .update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(and(eq(aiConversations.agencyId, this.context.agencyId), eq(aiConversations.id, id)))
      .returning();
    return conversation ?? null;
  }
}

export class AiMessageRepository {
  constructor(private readonly context: RepositoryContext) {}

  /** Messages resolve through an agency-owned conversation (IDOR-safe). */
  private async ownedConversationId(conversationId: string) {
    const conversation = await this.context.db.query.aiConversations.findFirst({
      where: and(
        eq(aiConversations.agencyId, this.context.agencyId),
        eq(aiConversations.id, conversationId),
        isNull(aiConversations.archivedAt)
      )
    });
    return conversation?.id ?? null;
  }

  async listByConversation(conversationId: string, limit = 50) {
    const ownedId = await this.ownedConversationId(conversationId);
    if (!ownedId) return null;
    return this.context.db.query.aiMessages.findMany({
      where: eq(aiMessages.conversationId, ownedId),
      orderBy: [desc(aiMessages.createdAt)],
      limit
    });
  }

  async add(conversationId: string, input: Omit<NewAiMessage, "conversationId">) {
    const ownedId = await this.ownedConversationId(conversationId);
    if (!ownedId) return null;
    const [message] = await this.context.db
      .insert(aiMessages)
      .values({ ...input, conversationId: ownedId })
      .returning();
    return message;
  }
}
