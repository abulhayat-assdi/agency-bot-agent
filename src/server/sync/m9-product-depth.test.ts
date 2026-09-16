import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi, afterEach } from "vitest";

import { answerAiQuestion, buildHistoryMessages } from "../ai/service";
import { auditLogSafe, scrubAuditMetadata } from "../audit/audit-log";
import { computeNextRun, isRetryableEmailError, processDueEmailReports } from "../email/scheduler";
import { dbReportToConfig, renderEmailReport, resolveEmailReport, sendPersistedEmailReport } from "../email/service";
import { EmailRecipientRepository, EmailReportRepository } from "../repositories/email-repository";
import { AiConversationRepository } from "../repositories/ai-repository";
import { aiAnalystRateLimiter, emailSendRateLimiter } from "../security/api-rate-limit";
import { InMemoryLoginRateLimiter, RedisLoginRateLimiter } from "../auth/rate-limit";

type ColumnRef = { name: string };

type StubQueryTable = {
  findFirst?: () => Promise<unknown>;
  findMany?: () => Promise<unknown[]>;
};

// Extended in-memory drizzle double: conflict-aware inserts plus programmed
// update/delete outcomes so claim races and CRUD paths are genuinely exercised.
function createM9StubDb(options: {
  query?: Record<string, StubQueryTable>;
  updateResults?: unknown[][];
  deleteResults?: unknown[][];
} = {}) {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const calls: { inserts: unknown[]; updates: unknown[]; deletes: unknown[] } = { inserts: [], updates: [], deletes: [] };
  let counter = 0;

  const tableKey = (table: object) => getTableName(table as never);
  const keyFor = (table: object, target: ColumnRef[] | undefined, values: Record<string, unknown>) => {
    if (!target) return null;
    return target.map((column) => `${column.name}=${JSON.stringify(values[column.name] ?? null)}`).join("|");
  };

  const updateQueue = [...(options.updateResults ?? [])];
  const deleteQueue = [...(options.deleteResults ?? [])];

  const db = {
    insert: vi.fn((table: object) => ({
      values: (values: Record<string, unknown>) => {
        calls.inserts.push({ table: tableKey(table), values });
        return {
          onConflictDoUpdate: ({ target, set }: { target: ColumnRef[]; set: Record<string, unknown> }) => ({
            returning: async () => {
              const store = tables.get(tableKey(table)) ?? new Map<string, Record<string, unknown>>();
              tables.set(tableKey(table), store);
              const key = keyFor(table, target, values);
              const existing = key ? store.get(key) : undefined;
              if (existing && key) {
                Object.assign(existing, set);
                return [existing];
              }
              counter += 1;
              const row = { ...values, id: values.id ?? `uuid-${counter}` };
              if (key) store.set(key, row);
              return [row];
            }
          }),
          returning: async () => {
            counter += 1;
            const row = { ...values, id: values.id ?? `uuid-${counter}`, createdAt: values.createdAt ?? new Date() };
            const store = tables.get(tableKey(table)) ?? new Map<string, Record<string, unknown>>();
            counter += 1;
            store.set(`row-${counter}`, row);
            tables.set(tableKey(table), store);
            return [row];
          }
        };
      }
    })),
    update: vi.fn((table: object) => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            calls.updates.push({ table: tableKey(table), patch });
            if (updateQueue.length > 0) return updateQueue.shift() as unknown[];
            return [];
          }
        })
      })
    })),
    delete: vi.fn((table: object) => ({
      where: async () => {
        calls.deletes.push({ table: tableKey(table) });
        if (deleteQueue.length > 0) return deleteQueue.shift() as unknown[];
        return [{ id: "uuid-del" }];
      }
    })),
    query: new Proxy(
      {},
      {
        get: (_target, table: string) => ({
          findFirst: options.query?.[table]?.findFirst ?? (async () => null),
          findMany: options.query?.[table]?.findMany ?? (async () => [])
        })
      }
    )
  };

  return { db: db as never, tables, calls };
}

const AGENCY = "agency-1";

function emailReportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "report-1",
    agencyId: AGENCY,
    clientId: "client-1",
    adAccountId: "account-1",
    entityLevel: "account",
    entityId: null,
    name: "Weekly digest",
    reportType: "account_summary",
    enabled: true,
    schedule: { cadence: "weekly", dayOfWeek: "monday", localTime: "09:00", timezone: "Asia/Dhaka", datePreset: "last_7_days" },
    timezone: "Asia/Dhaka",
    nextRunAt: new Date("2026-09-08T03:00:00.000Z"),
    lastRunAt: null,
    lastStatus: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    archivedAt: null,
    ...overrides
  };
}

function persistedAccountRow() {
  return {
    id: "account-1",
    agencyId: AGENCY,
    clientId: "client-1",
    metaAccountId: "100000000000001",
    name: "Northstar Commerce - BD",
    currency: "BDT",
    timezone: "Asia/Dhaka",
    status: "active",
    accessStatus: "connected"
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("M9 email scheduling", () => {
  it("computes daily, weekly, and monthly runs in the report timezone", () => {
    // 05:00Z is 11:00 in Dhaka, past the 09:00 slot, so the next run is tomorrow.
    expect(computeNextRun({ cadence: "daily", localTime: "09:00", timezone: "Asia/Dhaka", datePreset: "last_7_days" }, new Date("2026-09-10T05:00:00.000Z")).toISOString()).toBe(
      "2026-09-11T03:00:00.000Z"
    );
    // 02:00Z is 08:00 in Dhaka, before the slot, so the run is later today.
    expect(computeNextRun({ cadence: "daily", localTime: "09:00", timezone: "Asia/Dhaka", datePreset: "last_7_days" }, new Date("2026-09-10T02:00:00.000Z")).toISOString()).toBe(
      "2026-09-10T03:00:00.000Z"
    );
    // Weekly Monday 09:00 Dhaka from Wednesday.
    expect(
      computeNextRun(
        { cadence: "weekly", dayOfWeek: "monday", localTime: "09:00", timezone: "Asia/Dhaka", datePreset: "last_7_days" },
        new Date("2026-09-09T12:00:00.000Z")
      ).toISOString()
    ).toBe("2026-09-14T03:00:00.000Z");
    // Monthly on the 1st.
    expect(
      computeNextRun(
        { cadence: "monthly", dayOfMonth: 1, localTime: "08:30", timezone: "America/New_York", datePreset: "last_30_days" },
        new Date("2026-09-10T12:00:00.000Z")
      ).toISOString()
    ).toBe("2026-10-01T12:30:00.000Z");
    expect(() => computeNextRun({ cadence: "daily", localTime: "25:00", timezone: "UTC", datePreset: "last_7_days" })).toThrow("Invalid schedule localTime");
  });

  it("keeps wall-clock time across a DST transition", () => {
    // US spring forward: 2026-03-08. A daily 09:00 America/New_York run must stay 09:00 local.
    const before = computeNextRun(
      { cadence: "daily", localTime: "09:00", timezone: "America/New_York", datePreset: "last_7_days" },
      new Date("2026-03-07T12:00:00.000Z")
    );
    // 2026-03-08T12:00Z is 08:00 EDT, before the slot, so the run is later the same day.
    const after = computeNextRun(
      { cadence: "daily", localTime: "09:00", timezone: "America/New_York", datePreset: "last_7_days" },
      new Date("2026-03-08T12:00:00.000Z")
    );
    expect(before.toISOString()).toBe("2026-03-07T14:00:00.000Z");
    expect(after.toISOString()).toBe("2026-03-08T13:00:00.000Z");
  });

  it("classifies retryable email failures without endless permanent loops", () => {
    expect(isRetryableEmailError(new Error("fetch failed: socket hang up"))).toBe(true);
    expect(isRetryableEmailError(new Error("Resend request failed with status 429"))).toBe(true);
    expect(isRetryableEmailError(new Error("Resend request failed with status 503"))).toBe(true);
    expect(isRetryableEmailError(new Error("Resend request failed with status 400"))).toBe(false);
    expect(isRetryableEmailError(new Error("Provider rejected recipient domain"))).toBe(false);
    expect(isRetryableEmailError(new Error("At least one email recipient is required"))).toBe(false);
  });
});

describe("M9 email persistence and ownership", () => {
  it("resolves unknown reports as not found (fixture fallback preserved for fixtures)", async () => {
    const { db } = createM9StubDb();
    await expect(resolveEmailReport("missing", { db, agencyId: AGENCY })).rejects.toThrow("not found");
    const fixture = await resolveEmailReport("email_report_northstar_weekly", { db, agencyId: AGENCY });
    expect(fixture.source).toBe("fixture");
  });

  it("returns null for reports and recipients outside the agency (IDOR-safe)", async () => {
    const { db } = createM9StubDb();
    const context = { db, agencyId: AGENCY };
    const reports = new EmailReportRepository(context);
    expect(await reports.findById("other-agency-report")).toBeNull();
    const recipients = new EmailRecipientRepository(context);
    expect(await recipients.listByReport("other-agency-report")).toBeNull();
    expect(await recipients.add("other-agency-report", { email: "x@example.com", status: "active" })).toBeNull();
  });

  it("upserts recipients idempotently on (report, email)", async () => {
    const { db, tables } = createM9StubDb({
      query: { emailReports: { findFirst: async () => ({ id: "report-1" }) } }
    });
    const recipients = new EmailRecipientRepository({ db, agencyId: AGENCY });
    await recipients.add("report-1", { email: "Owner@Example.com".toLowerCase(), name: "Owner", status: "active" });
    await recipients.add("report-1", { email: "owner@example.com", name: "Owner Hire", status: "active" });
    const stored = tables.get("email_recipients");
    expect(stored?.size).toBe(1);
    expect([...(stored?.values() ?? [])][0]).toMatchObject({ email: "owner@example.com", name: "Owner Hire" });
  });

  it("claims a due report once: second claim loses and skips delivery", async () => {
    const report = emailReportRow();
    const { db } = createM9StubDb({
      query: {
        emailReports: { findFirst: async () => report, findMany: async () => [report] },
        adAccounts: { findFirst: async () => persistedAccountRow() },
        emailRecipients: { findMany: async () => [{ email: "owner@example.com", name: "Owner", status: "active" }] },
        emailDeliveryLogs: { findMany: async () => [] }
      },
      updateResults: [[{ ...report }], []]
    });
    const sender = { send: vi.fn(async () => ({ status: "sent" as const, provider: "mock" as const, providerMessageId: "m1", safeMessage: "ok" })), name: "mock" as const };
    const first = await processDueEmailReports(db, AGENCY, {
      now: new Date("2026-09-08T03:00:00.000Z"),
      provider: sender,
      retryDelayMs: 0,
      env: { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" }
    });
    expect(first).toMatchObject({ due: 1, sent: 1 });
    expect(sender.send).toHaveBeenCalledTimes(1);

    const second = await processDueEmailReports(db, AGENCY, {
      now: new Date("2026-09-08T03:01:00.000Z"),
      provider: sender,
      retryDelayMs: 0,
      env: { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" }
    });
    // findDue still returns the row in the stub, but the lost claim skips the send.
    expect(second.sent).toBe(0);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it("skips duplicate sends within the safety window", async () => {
    const report = emailReportRow();
    const env = { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" };
    const config = dbReportToConfig(
      report as never,
      "100000000000001",
      [{ email: "owner@example.com", name: "Owner", status: "active" }]
    );
    const rendered = await renderEmailReport(config, env);
    const { db } = createM9StubDb({
      query: {
        emailReports: { findFirst: async () => report, findMany: async () => [report] },
        adAccounts: { findFirst: async () => persistedAccountRow() },
        emailRecipients: { findMany: async () => [{ email: "owner@example.com", name: "Owner", status: "active" }] },
        emailDeliveryLogs: {
          findMany: async () => [
            {
              id: "log-1",
              status: "sent",
              renderedSubject: rendered.subject,
              createdAt: new Date("2026-09-08T03:00:30.000Z")
            }
          ]
        }
      },
      updateResults: [[{ ...report }]]
    });
    const sender = { send: vi.fn(async () => ({ status: "sent" as const, provider: "mock" as const, providerMessageId: "m2", safeMessage: "ok" })), name: "mock" as const };
    const summary = await processDueEmailReports(db, AGENCY, {
      now: new Date("2026-09-08T03:00:00.000Z"),
      provider: sender,
      retryDelayMs: 0,
      env
    });
    expect(summary).toMatchObject({ due: 1, skipped: 1, sent: 0 });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("records skipped delivery for disabled-by-recipients and persists failure safely", async () => {
    const report = emailReportRow();
    const { db, tables } = createM9StubDb({
      query: {
        emailReports: { findFirst: async () => report, findMany: async () => [report] },
        adAccounts: { findFirst: async () => persistedAccountRow() },
        emailRecipients: { findMany: async () => [] },
        emailDeliveryLogs: { findMany: async () => [] }
      },
      updateResults: [[{ ...report }]]
    });
    const summary = await processDueEmailReports(db, AGENCY, {
      now: new Date("2026-09-08T03:00:00.000Z"),
      retryDelayMs: 0,
      env: { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" }
    });
    expect(summary).toMatchObject({ due: 1, skipped: 1 });
    const dump = JSON.stringify([...tables.values()].map((store) => [...store.values()]));
    expect(dump).not.toMatch(/RESEND_API_KEY|Bearer/);
  });

  it("persists failure logs with attempt counts and advances the schedule", async () => {
    const report = emailReportRow();
    const { db, tables } = createM9StubDb({
      query: {
        emailReports: { findFirst: async () => report, findMany: async () => [report] },
        adAccounts: { findFirst: async () => persistedAccountRow() },
        emailRecipients: { findMany: async () => [{ email: "owner@example.com", name: null, status: "active" }] },
        emailDeliveryLogs: { findMany: async () => [] }
      },
      updateResults: [[{ ...report }]]
    });
    const sender = {
      send: vi.fn(async () => {
        throw new Error("fetch failed: socket hang up");
      }),
      name: "mock" as const
    };
    const summary = await processDueEmailReports(db, AGENCY, {
      now: new Date("2026-09-08T03:00:00.000Z"),
      provider: sender,
      retryDelayMs: 0,
      maxAttempts: 3,
      env: { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" }
    });
    expect(summary).toMatchObject({ due: 1, failed: 1 });
    expect(sender.send).toHaveBeenCalledTimes(3);
    const logs = [...(tables.get("email_delivery_logs")?.values() ?? [])];
    expect(logs.map((log) => log.attempt)).toEqual([1, 2, 3]);
    expect(logs.every((log) => log.status === "failed")).toBe(true);
  });

  it("fails fast on permanent errors without retrying", async () => {
    const report = emailReportRow();
    const { db } = createM9StubDb({
      query: {
        emailReports: { findFirst: async () => report, findMany: async () => [report] },
        adAccounts: { findFirst: async () => persistedAccountRow() },
        emailRecipients: { findMany: async () => [{ email: "owner@example.com", name: null, status: "active" }] },
        emailDeliveryLogs: { findMany: async () => [] }
      },
      updateResults: [[{ ...report }]]
    });
    const sender = {
      send: vi.fn(async () => {
        throw new Error("Provider rejected recipient domain");
      }),
      name: "mock" as const
    };
    const summary = await processDueEmailReports(db, AGENCY, {
      now: new Date("2026-09-08T03:00:00.000Z"),
      provider: sender,
      retryDelayMs: 0,
      env: { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" }
    });
    expect(summary).toMatchObject({ failed: 1 });
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it("sendPersistedEmailReport persists skipped logs for disabled reports", async () => {
    const { db, tables } = createM9StubDb({
      query: {
        emailReports: { findFirst: async () => emailReportRow({ enabled: false }) },
        adAccounts: { findFirst: async () => persistedAccountRow() },
        emailRecipients: { findMany: async () => [{ email: "owner@example.com", name: null, status: "active" }] }
      }
    });
    const sender = { send: vi.fn(), name: "mock" as const };
    const { log } = await sendPersistedEmailReport("report-1", { db, agencyId: AGENCY, provider: sender, env: { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" } });
    expect(log.status).toBe("skipped");
    expect(sender.send).not.toHaveBeenCalled();
    expect(tables.get("email_delivery_logs")?.size).toBe(1);
  });
});

describe("M9 AI conversation persistence", () => {
  const env = { APP_ENV: "test", META_PROVIDER: "mock" };

  it("persists user and assistant messages with null (not zero) usage on fallback", async () => {
    const { db, tables } = createM9StubDb({
      query: { aiConversations: { findFirst: async () => ({ id: "conv-1", agencyId: AGENCY }) } }
    });
    const result = await answerAiQuestion({ question: "Summarize performance", accountId: "act_100000000000001", preset: "last_7_days" }, env, {
      persistence: { db, agencyId: AGENCY }
    });
    expect(result.conversationId).toMatch(/^uuid-/);
    const messages = [...(tables.get("ai_messages")?.values() ?? [])];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user" });
    const assistant = messages[1] as Record<string, unknown>;
    expect(assistant.role).toBe("assistant");
    expect(assistant.provider).toBe("mock-grounded");
    const usage = assistant.usage as Record<string, unknown>;
    expect(usage).toMatchObject({ promptTokens: null, completionTokens: null, totalTokens: null, latencyMs: null });
  });

  it("continues conversations with bounded history excluding tool payloads", async () => {
    const prior = Array.from({ length: 12 }, (_, index) => ({
      id: `m-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message ${index}`
    }));
    const withTool = [...prior, { id: "m-tool", role: "tool", content: "raw tool payload that must not reach the provider" }];
    const { db, tables } = createM9StubDb({
      query: {
        aiConversations: { findFirst: async () => ({ id: "conv-1", agencyId: AGENCY }) },
        aiMessages: { findMany: async () => withTool }
      }
    });
    const result = await answerAiQuestion({ question: "And now?", accountId: "act_100000000000001", preset: "last_7_days" }, env, {
      persistence: { db, agencyId: AGENCY, conversationId: "conv-1" }
    });
    expect(result.conversationId).toBe("conv-1");
    const messages = [...(tables.get("ai_messages")?.values() ?? [])];
    // New user + assistant rows only; history itself is never rewritten.
    expect(messages).toHaveLength(2);
    expect(messages.every((row) => typeof row.content === "string")).toBe(true);
  });

  it("rejects unknown conversation ids instead of forking silently", async () => {
    const { db } = createM9StubDb({
      query: { aiConversations: { findFirst: async () => null } }
    });
    await expect(
      answerAiQuestion({ question: "Hi" }, env, { persistence: { db, agencyId: AGENCY, conversationId: "nope" } })
    ).rejects.toThrow("AI conversation not found");
  });

  it("captures provider usage exactly and keeps unknown usage null", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Grounded test answer" } }],
        model: "gpt-test-model",
        usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 }
      })
    })) as unknown as typeof fetch;
    try {
      const { db, tables } = createM9StubDb({
        query: { aiConversations: { findFirst: async () => ({ id: "conv-1", agencyId: AGENCY }) } }
      });
      const result = await answerAiQuestion({ question: "Summarize performance", accountId: "act_100000000000001", preset: "last_7_days" }, undefined, {
        persistence: { db, agencyId: AGENCY }
      });
      expect(result.answer).toBe("Grounded test answer");
      const assistant = [...(tables.get("ai_messages")?.values() ?? [])].find((row) => row.role === "assistant") as Record<string, unknown>;
      expect(assistant.provider).toBe("openai");
      expect(assistant.model).toBe("gpt-test-model");
      expect(assistant.usage).toMatchObject({ promptTokens: 5, completionTokens: 7, totalTokens: 12 });
      expect(typeof (assistant.usage as Record<string, unknown>).latencyMs).toBe("number");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it("keeps usage null when the provider omits it", async () => {
    const originalFetch = globalThis.fetch;
    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }], model: "gpt-x" })
    })) as unknown as typeof fetch;
    try {
      const { db, tables } = createM9StubDb({
        query: { aiConversations: { findFirst: async () => ({ id: "conv-1", agencyId: AGENCY }) } }
      });
      await answerAiQuestion({ question: "Summarize performance" }, undefined, { persistence: { db, agencyId: AGENCY } });
      const assistant = [...(tables.get("ai_messages")?.values() ?? [])].find((row) => row.role === "assistant") as Record<string, unknown>;
      expect(assistant.usage).toMatchObject({ promptTokens: null, completionTokens: null, totalTokens: null });
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("bounds history window and content size", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 === 0 ? "user" : "assistant", content: `x${index}` }));
    const history = buildHistoryMessages(rows);
    expect(history.length).toBeLessThanOrEqual(10);
    expect(history.every((message) => message.role === "user" || message.role === "assistant")).toBe(true);
    const bulky = [
      { role: "tool", content: "should be excluded" },
      { role: "system", content: "should be excluded" },
      { role: "user", content: "a".repeat(9000) }
    ];
    const bounded = buildHistoryMessages(bulky);
    expect(bounded).toHaveLength(1);
    expect(bounded[0].content.length).toBeLessThanOrEqual(6000);
    expect(bounded[0].role).toBe("user");
  });

  it("lists only agency-owned conversations", async () => {
    const { db } = createM9StubDb({
      query: { aiConversations: { findMany: async () => [{ id: "c1" }] } }
    });
    const repo = new AiConversationRepository({ db, agencyId: AGENCY });
    expect(await repo.list()).toEqual([{ id: "c1" }]);
  });
});

describe("M9 audit logging", () => {
  it("persists bootstrap actor ids without violating uuid foreign keys", async () => {
    const { db, tables } = createM9StubDb();
    const { auditLogSafe } = await import("../audit/audit-log");
    // "bootstrap-admin" is a session placeholder with no admin_users row.
    await auditLogSafe({
      db,
      agencyId: AGENCY,
      userId: "bootstrap-admin",
      action: "meta.sync.trigger",
      resourceType: "sync_run",
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
      metadata: { metaAccountId: "act_1" }
    });
    const rows = [...(tables.get("audit_logs")?.values() ?? [])];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: null, action: "meta.sync.trigger" });
    expect((rows[0].metadata as Record<string, unknown>).actor).toBe("bootstrap-admin");
  });
  it("scrubs credential-shaped metadata before persistence", async () => {
    const { db, tables } = createM9StubDb();
    await auditLogSafe({
      db,
      agencyId: AGENCY,
      userId: "admin-1",
      action: "email.report.send",
      resourceType: "email_report",
      resourceId: "report-1",
      metadata: {
        status: "sent",
        access_token: "EAA_should_be_redacted",
        nested: { apiKey: "sk-should-be-redacted", recipientCount: 2 },
        password: "hunter2"
      }
    });
    const rows = [...(tables.get("audit_logs")?.values() ?? [])];
    expect(rows).toHaveLength(1);
    const dump = JSON.stringify(rows[0]);
    expect(dump).not.toContain("EAA_should_be_redacted");
    expect(dump).not.toContain("sk-should-be-redacted");
    expect(dump).not.toContain("hunter2");
    expect(dump).toContain("recipientCount");
  });

  it("never throws, even when the database write fails", async () => {
    const failing = {
      insert: () => {
        throw new Error("db down");
      },
      query: {}
    } as never;
    await expect(
      auditLogSafe({ db: failing, agencyId: AGENCY, action: "admin.login.success", resourceType: "admin_user", metadata: {} })
    ).resolves.toBeUndefined();
  });

  it("redacts token-valued strings and secret headers", () => {
    expect(scrubAuditMetadata({ authorization: "Bearer abc", limit: 10 })).toEqual({ authorization: "[redacted]", limit: 10 });
  });
});

describe("M9 shared rate limiting", () => {
  it("keeps AI and email singletons working without Redis", async () => {
    await aiAnalystRateLimiter.clear();
    for (let index = 0; index < 30; index += 1) {
      expect((await aiAnalystRateLimiter.check("m9-test")).allowed).toBe(true);
    }
    expect((await aiAnalystRateLimiter.check("m9-test")).allowed).toBe(false);
    await aiAnalystRateLimiter.clear();
    expect((await emailSendRateLimiter.check("m9-test")).allowed).toBe(true);
  });

  it("shares Redis login throttling across instances with fail-open", async () => {
    let count = 0;
    const fake = {
      eval: vi.fn(async () => {
        count += 1;
        return [count, 60_000];
      }),
      del: vi.fn(async () => 1)
    };
    const limiter = new RedisLoginRateLimiter(() => fake as never);
    for (let index = 0; index < 5; index += 1) {
      expect((await limiter.check("admin@example.com")).allowed).toBe(true);
    }
    expect((await limiter.check("admin@example.com")).allowed).toBe(false);
    await limiter.reset("admin@example.com");
    expect(fake.del).toHaveBeenCalled();

    const broken = new RedisLoginRateLimiter(() => {
      throw new Error("redis down");
    });
    expect((await broken.check("admin@example.com")).allowed).toBe(true);
    expect(() => new InMemoryLoginRateLimiter()).not.toThrow();
  });
});


