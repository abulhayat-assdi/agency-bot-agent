import { and, desc, eq } from "drizzle-orm";

import { auditLogs, type NewAuditLog } from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

export class AuditLogRepository {
  constructor(private readonly context: RepositoryContext) {}

  async record(input: Omit<NewAuditLog, "agencyId" | "id" | "createdAt">) {
    const [row] = await this.context.db
      .insert(auditLogs)
      .values({ ...input, agencyId: this.context.agencyId })
      .returning();
    return row;
  }

  list(params: { resourceType?: string; resourceId?: string; limit?: number; offset?: number } = {}) {
    const filters = [eq(auditLogs.agencyId, this.context.agencyId)];
    if (params.resourceType) filters.push(eq(auditLogs.resourceType, params.resourceType));
    if (params.resourceId) filters.push(eq(auditLogs.resourceId, params.resourceId));
    return this.context.db.query.auditLogs.findMany({
      where: and(...filters),
      orderBy: [desc(auditLogs.createdAt)],
      limit: params.limit ?? 50,
      offset: params.offset ?? 0
    });
  }
}
