import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";

import {
  emailDeliveryLogs,
  emailRecipients,
  emailReports,
  type NewEmailDeliveryLog,
  type NewEmailRecipient,
  type NewEmailReport
} from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

export class EmailReportRepository {
  constructor(private readonly context: RepositoryContext) {}

  private get scope() {
    return and(eq(emailReports.agencyId, this.context.agencyId), isNull(emailReports.archivedAt));
  }

  list(params: { enabledOnly?: boolean; limit?: number; offset?: number } = {}) {
    const filters = [this.scope];
    if (params.enabledOnly) filters.push(eq(emailReports.enabled, true));
    return this.context.db.query.emailReports.findMany({
      where: and(...filters),
      orderBy: [desc(emailReports.updatedAt)],
      limit: params.limit ?? 100,
      offset: params.offset ?? 0
    });
  }

  findById(id: string) {
    return this.context.db.query.emailReports.findFirst({
      where: and(this.scope, eq(emailReports.id, id))
    });
  }

  async create(input: Omit<NewEmailReport, "agencyId">) {
    const [report] = await this.context.db
      .insert(emailReports)
      .values({ ...input, agencyId: this.context.agencyId })
      .returning();
    return report;
  }

  async update(id: string, patch: Partial<Omit<NewEmailReport, "id" | "agencyId" | "createdAt">>) {
    const [report] = await this.context.db
      .update(emailReports)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(this.scope, eq(emailReports.id, id)))
      .returning();
    return report ?? null;
  }

  async setEnabled(id: string, enabled: boolean) {
    return this.update(id, { enabled });
  }

  async remove(id: string) {
    const [report] = await this.context.db
      .update(emailReports)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(this.scope, eq(emailReports.id, id)))
      .returning();
    return report ?? null;
  }

  /** Reports due for delivery: enabled with no future next run scheduled. */
  findDue(now: Date, limit = 10) {
    return this.context.db.query.emailReports.findMany({
      where: and(
        this.scope,
        eq(emailReports.enabled, true),
        or(isNull(emailReports.nextRunAt), lte(emailReports.nextRunAt, now))
      ),
      orderBy: [asc(emailReports.nextRunAt)],
      limit
    });
  }

  /**
   * Atomically claim a due report for one scheduler: advances next_run_at to a
   * lease timestamp only when the report is still due. Returns the claimed row,
   * or null when another scheduler claimed it first.
   */
  async claimDueReport(id: string, now: Date, leaseUntil: Date) {
    const [report] = await this.context.db
      .update(emailReports)
      .set({ nextRunAt: leaseUntil, updatedAt: new Date() })
      .where(
        and(
          this.scope,
          eq(emailReports.id, id),
          eq(emailReports.enabled, true),
          or(isNull(emailReports.nextRunAt), lte(emailReports.nextRunAt, now))
        )
      )
      .returning();
    return report ?? null;
  }

  async recordRun(id: string, patch: { lastRunAt: Date; lastStatus: string; nextRunAt: Date | null }) {
    const [report] = await this.context.db
      .update(emailReports)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(this.scope, eq(emailReports.id, id)))
      .returning();
    return report ?? null;
  }
}

export class EmailRecipientRepository {
  constructor(private readonly context: RepositoryContext) {}

  /** Recipients are always resolved through an agency-owned report (IDOR-safe). */
  private async ownedReportId(reportId: string) {
    const report = await this.context.db.query.emailReports.findFirst({
      where: and(
        eq(emailReports.agencyId, this.context.agencyId),
        eq(emailReports.id, reportId),
        isNull(emailReports.archivedAt)
      )
    });
    return report?.id ?? null;
  }

  async listByReport(reportId: string) {
    const ownedId = await this.ownedReportId(reportId);
    if (!ownedId) return null;
    return this.context.db.query.emailRecipients.findMany({
      where: eq(emailRecipients.emailReportId, ownedId),
      orderBy: [asc(emailRecipients.email)]
    });
  }

  async add(reportId: string, input: Omit<NewEmailRecipient, "emailReportId">) {
    const ownedId = await this.ownedReportId(reportId);
    if (!ownedId) return null;
    const [recipient] = await this.context.db
      .insert(emailRecipients)
      .values({ ...input, emailReportId: ownedId })
      .onConflictDoUpdate({
        target: [emailRecipients.emailReportId, emailRecipients.email],
        set: { name: input.name, status: input.status ?? "active", updatedAt: new Date() }
      })
      .returning();
    return recipient;
  }

  async update(reportId: string, recipientId: string, patch: Partial<Pick<NewEmailRecipient, "name" | "status">>) {
    const ownedId = await this.ownedReportId(reportId);
    if (!ownedId) return null;
    const [recipient] = await this.context.db
      .update(emailRecipients)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(emailRecipients.emailReportId, ownedId), eq(emailRecipients.id, recipientId)))
      .returning();
    return recipient ?? null;
  }

  async remove(reportId: string, recipientId: string) {
    const ownedId = await this.ownedReportId(reportId);
    if (!ownedId) return null;
    const [recipient] = await this.context.db
      .delete(emailRecipients)
      .where(and(eq(emailRecipients.emailReportId, ownedId), eq(emailRecipients.id, recipientId)))
      .returning();
    return recipient ?? null;
  }
}

export class EmailDeliveryLogRepository {
  constructor(private readonly context: RepositoryContext) {}

  private async ownedReportId(reportId: string) {
    const report = await this.context.db.query.emailReports.findFirst({
      where: and(eq(emailReports.agencyId, this.context.agencyId), eq(emailReports.id, reportId))
    });
    return report?.id ?? null;
  }

  async record(input: Omit<NewEmailDeliveryLog, "id" | "createdAt">) {
    const ownedId = await this.ownedReportId(input.emailReportId);
    if (!ownedId) return null;
    const [log] = await this.context.db
      .insert(emailDeliveryLogs)
      .values({ ...input, emailReportId: ownedId })
      .returning();
    return log;
  }

  async listByReport(reportId: string, limit = 20) {
    const ownedId = await this.ownedReportId(reportId);
    if (!ownedId) return null;
    return this.context.db.query.emailDeliveryLogs.findMany({
      where: eq(emailDeliveryLogs.emailReportId, ownedId),
      orderBy: [desc(emailDeliveryLogs.createdAt)],
      limit
    });
  }

  async listRecentFailures(limit = 20) {
    const reports = await this.context.db.query.emailReports.findMany({
      where: and(eq(emailReports.agencyId, this.context.agencyId), isNull(emailReports.archivedAt)),
      limit: 200
    });
    if (reports.length === 0) return [];
    return this.context.db.query.emailDeliveryLogs.findMany({
      where: and(
        inArray(
          emailDeliveryLogs.emailReportId,
          reports.map((report) => report.id)
        ),
        eq(emailDeliveryLogs.status, "failed")
      ),
      orderBy: [desc(emailDeliveryLogs.createdAt)],
      limit
    });
  }
}
