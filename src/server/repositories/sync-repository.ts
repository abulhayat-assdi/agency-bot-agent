import { and, desc, eq, inArray } from "drizzle-orm";

import {
  dataAvailability,
  rawIngestionRecords,
  syncErrors,
  syncRuns,
  type NewSyncError,
  type NewSyncRun
} from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

type RawInsert = typeof rawIngestionRecords.$inferInsert;
type AvailabilityInsert = typeof dataAvailability.$inferInsert;

export class SyncRepository {
  constructor(private readonly context: RepositoryContext) {}

  async startRun(input: Omit<NewSyncRun, "agencyId" | "provider" | "status"> & { provider?: NewSyncRun["provider"] }, initialStatus: "queued" | "running" = "running") {
    const [run] = await this.context.db
      .insert(syncRuns)
      .values({
        ...input,
        agencyId: this.context.agencyId,
        provider: input.provider ?? "meta",
        status: initialStatus,
        startedAt: initialStatus === "running" ? new Date() : null
      })
      .returning();
    return run;
  }

  async finishRun(
    id: string,
    patch: Partial<Pick<NewSyncRun, "status" | "stats" | "checkpoint" | "errorSummary" | "finishedAt">> & {
      status: NewSyncRun["status"];
    }
  ) {
    const [run] = await this.context.db
      .update(syncRuns)
      .set({ ...patch, finishedAt: patch.finishedAt ?? new Date() })
      .where(eq(syncRuns.id, id))
      .returning();
    return run;
  }

  findRun(id: string) {
    return this.context.db.query.syncRuns.findFirst({
      where: eq(syncRuns.id, id)
    });
  }

  /** Cooperative cancellation / resume support: checkpoint + status updates without touching stats. */
  async saveCheckpoint(id: string, checkpoint: Record<string, unknown>) {
    const [run] = await this.context.db
      .update(syncRuns)
      .set({ checkpoint })
      .where(eq(syncRuns.id, id))
      .returning();
    return run;
  }

  async markRunning(id: string) {
    const [run] = await this.context.db
      .update(syncRuns)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(syncRuns.id, id))
      .returning();
    return run;
  }

  async markCancelled(id: string) {
    const [run] = await this.context.db
      .update(syncRuns)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(eq(syncRuns.id, id))
      .returning();
    return run;
  }

  latestRuns(adAccountId: string | null, limit = 10) {
    if (!adAccountId) {
      return this.context.db.query.syncRuns.findMany({
        orderBy: [desc(syncRuns.createdAt)],
        limit
      });
    }
    return this.context.db.query.syncRuns.findMany({
      where: eq(syncRuns.adAccountId, adAccountId),
      orderBy: [desc(syncRuns.createdAt)],
      limit
    });
  }

  async recordError(input: Omit<NewSyncError, "id" | "occurredAt">) {
    const [row] = await this.context.db.insert(syncErrors).values(input).returning();
    return row;
  }

  errorsForRun(syncRunId: string) {
    return this.context.db.query.syncErrors.findMany({
      where: eq(syncErrors.syncRunId, syncRunId)
    });
  }

  /** Runs that are still in flight (used by the scheduler for duplicate suppression). */
  findActiveRuns(limit = 200) {
    return this.context.db.query.syncRuns.findMany({
      where: inArray(syncRuns.status, ["queued", "running", "partial"]),
      orderBy: [desc(syncRuns.createdAt)],
      limit
    });
  }

  /** Candidate stale runs: status still "running". Age filtering happens in JS via isRunStale. */
  findRunning(limit = 200) {
    return this.context.db.query.syncRuns.findMany({
      where: eq(syncRuns.status, "running"),
      orderBy: [desc(syncRuns.createdAt)],
      limit
    });
  }

  findActiveRunsForAccount(adAccountId: string) {
    return this.context.db.query.syncRuns.findMany({
      where: and(eq(syncRuns.adAccountId, adAccountId), inArray(syncRuns.status, ["queued", "running", "partial"])),
      orderBy: [desc(syncRuns.createdAt)],
      limit: 50
    });
  }

  async recordRaw(input: Omit<RawInsert, "id" | "receivedAt">) {
    const [row] = await this.context.db.insert(rawIngestionRecords).values(input).returning();
    return row;
  }

  async recordAvailability(input: Omit<AvailabilityInsert, "id" | "createdAt">) {
    const [row] = await this.context.db.insert(dataAvailability).values(input).returning();
    return row;
  }

  async recordAvailabilityMany(inputs: Array<Omit<AvailabilityInsert, "id" | "createdAt">>) {
    if (inputs.length === 0) return [];
    const rows = [];
    for (const input of inputs) {
      rows.push(await this.recordAvailability(input));
    }
    return rows;
  }
}
