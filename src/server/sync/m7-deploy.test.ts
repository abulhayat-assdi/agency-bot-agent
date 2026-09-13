import { describe, expect, it } from "vitest";

import { getAppConfig } from "../config/env";
import { createShutdownCoordinator } from "../process/shutdown";
import { evaluateRunAlerts } from "./alerts";
import { resolveReportingSource } from "./reporting-source";
import { isRunStale, STALE_RUN_THRESHOLD_MINUTES } from "./run-health";
import { runProgressView } from "./run-service";
import { filterRunnableSpecs, incrementalDedupKey, planIncrementalSyncs } from "./scheduler";

const REF = new Date("2026-09-13T12:00:00.000Z");

describe("M7 scheduler planning and duplicate safety", () => {
  const accounts = [
    { agencyId: "agency-1", metaAccountId: "act_1", accountDbId: "db-1", timezone: "Asia/Dhaka" },
    { agencyId: "agency-1", metaAccountId: "act_2", accountDbId: "db-2", timezone: "America/New_York" }
  ];

  it("plans per-account incremental ranges in account timezones", () => {
    const specs = planIncrementalSyncs(accounts, { lookbackDays: 3, chunkDays: 7, traceId: "t", referenceInstant: REF });
    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({ syncKind: "incremental", syncType: "scheduled", dateStart: "2026-09-11", dateEnd: "2026-09-13" });
    // New York is behind UTC: same instant is still Sep 13 there in this case, range stays calendar-correct.
    expect(specs[1].dateEnd).toBe("2026-09-13");
    expect(specs[0].dedupKey).toBe(incrementalDedupKey("act_1", specs[0].dateStart, specs[0].dateEnd));
  });

  it("produces stable dedup keys across restarts", () => {
    const first = planIncrementalSyncs(accounts, { lookbackDays: 3, chunkDays: 7, traceId: "t-1", referenceInstant: REF });
    const second = planIncrementalSyncs(accounts, { lookbackDays: 3, chunkDays: 7, traceId: "t-2", referenceInstant: REF });
    expect(first.map((spec) => spec.dedupKey)).toEqual(second.map((spec) => spec.dedupKey));
  });

  it("skips accounts with an active run for the same kind", () => {
    const specs = planIncrementalSyncs(accounts, { lookbackDays: 3, chunkDays: 7, traceId: "t", referenceInstant: REF });
    const active = [{ metaAccountId: "act_1", syncKind: "incremental", status: "running" }];
    const { runnable, skipped } = filterRunnableSpecs(specs, active);
    expect(runnable.map((spec) => spec.accountId)).toEqual(["act_2"]);
    expect(skipped).toBe(1);
  });

  it("does not skip for terminal or unrelated runs", () => {
    const specs = planIncrementalSyncs(accounts.slice(0, 1), { lookbackDays: 3, chunkDays: 7, traceId: "t", referenceInstant: REF });
    const active = [
      { metaAccountId: "act_1", syncKind: "incremental", status: "success" },
      { metaAccountId: "act_1", syncKind: "backfill", status: "running" },
      { metaAccountId: "act_9", syncKind: "incremental", status: "running" }
    ];
    expect(filterRunnableSpecs(specs, active).runnable).toHaveLength(1);
  });
});

describe("M7 stale run detection", () => {
  it("flags long-running runs without touching terminal states", () => {
    const old = new Date(REF.getTime() - (STALE_RUN_THRESHOLD_MINUTES + 5) * 60_000).toISOString();
    expect(isRunStale({ status: "running", startedAt: old, createdAt: old }, REF)).toBe(true);
    expect(isRunStale({ status: "success", startedAt: old, createdAt: old }, REF)).toBe(false);
    expect(isRunStale({ status: "failed", startedAt: old, createdAt: old }, REF)).toBe(false);
    expect(isRunStale({ status: "running", startedAt: REF.toISOString(), createdAt: REF.toISOString() }, REF)).toBe(false);
  });

  it("surfaces staleness in run progress views", () => {
    const old = new Date(REF.getTime() - 120 * 60_000).toISOString();
    const view = runProgressView(
      {
        id: "run-1",
        status: "running",
        type: "backfill",
        adAccountId: null,
        checkpoint: {},
        stats: {},
        startedAt: old,
        finishedAt: null,
        createdAt: old,
        errorSummary: null
      },
      REF
    );
    expect(view.stale).toBe(true);
    expect(view.staleRemediation).toMatch(/cancel and resume/i);
  });
});

describe("M7 alert events", () => {
  const base = { type: "backfill", errorSummary: null as string | null, checkpoint: {}, startedAt: "2026-09-13T10:00:00.000Z", createdAt: "2026-09-13T10:00:00.000Z" };

  it("raises critical auth/permission alerts, not generic failures", () => {
    const runs = [
      { ...base, id: "r1", status: "failed" },
      { ...base, id: "r2", status: "failed" }
    ];
    const events = evaluateRunAlerts(runs, {
      r1: [{ category: "authentication", safeMessage: "Meta authentication failed.", retryable: false }],
      r2: [{ category: "permission", safeMessage: "Meta permission denied.", retryable: false }]
    }, { now: REF });
    expect(events.map((event) => event.code).sort()).toEqual(["meta_auth_failure", "meta_permission_failure"]);
    expect(events.every((event) => event.severity === "critical")).toBe(true);
    expect(events[0].remediation.length).toBeGreaterThan(10);
  });

  it("escalates repeated failures and flags stale runs", () => {
    const old = new Date(REF.getTime() - 180 * 60_000).toISOString();
    const events = evaluateRunAlerts(
      [
        { ...base, id: "r3", status: "failed", errorSummary: "3 stage warnings" },
        { ...base, id: "r4", status: "running", startedAt: old, createdAt: old }
      ],
      {
        r3: [
          { category: "transient", safeMessage: "a", retryable: true },
          { category: "transient", safeMessage: "b", retryable: true },
          { category: "transient", safeMessage: "c", retryable: true }
        ]
      },
      { now: REF }
    );
    expect(events.find((event) => event.runId === "r3")?.code).toBe("sync_failed");
    expect(events.find((event) => event.runId === "r3")?.severity).toBe("critical");
    expect(events.find((event) => event.runId === "r4")?.code).toBe("sync_stale");
  });

  it("stays silent for healthy runs", () => {
    const events = evaluateRunAlerts(
      [
        { ...base, id: "r5", status: "success" },
        { ...base, id: "r6", status: "running", startedAt: REF.toISOString(), createdAt: REF.toISOString() }
      ],
      {},
      { now: REF }
    );
    expect(events).toEqual([]);
  });
});

describe("M7 reporting source policy", () => {
  it("never mixes: persisted wins, production+live+empty stays empty", () => {
    expect(resolveReportingSource({ appEnv: "production", metaProvider: "graph-api", hasPersistedSelection: true, hasMockSelection: true })).toBe("persisted");
    expect(resolveReportingSource({ appEnv: "production", metaProvider: "graph-api", hasPersistedSelection: false, hasMockSelection: true })).toBe("empty");
    expect(resolveReportingSource({ appEnv: "development", metaProvider: "mock", hasPersistedSelection: false, hasMockSelection: true })).toBe("mock");
    expect(resolveReportingSource({ appEnv: "development", metaProvider: "mock", hasPersistedSelection: false, hasMockSelection: false })).toBe("empty");
  });
});

describe("M7 graceful shutdown coordinator", () => {
  it("runs closers in order and tolerates individual failures", async () => {
    const order: string[] = [];
    const exits: number[] = [];
    const coordinator = createShutdownCoordinator({ exit: (code) => void exits.push(code) });
    coordinator.register("first", async () => void order.push("first"));
    coordinator.register("broken", async () => {
      order.push("broken");
      throw new Error("closer failed");
    });
    coordinator.register("last", async () => void order.push("last"));
    await coordinator.shutdown("SIGTERM");
    expect(order).toEqual(["first", "broken", "last"]);
    expect(exits).toEqual([0]);
    expect(coordinator.isShuttingDown()).toBe(true);
  });

  it("handles shutdown signals exactly once", async () => {
    let calls = 0;
    const exits: number[] = [];
    const coordinator = createShutdownCoordinator({ exit: (code) => void exits.push(code) });
    coordinator.register("work", async () => void (calls += 1));
    await coordinator.shutdown("SIGINT");
    await coordinator.shutdown("SIGTERM");
    expect(calls).toBe(1);
    expect(exits).toEqual([0]);
  });
});

describe("M7 production env validation", () => {
  it("parses sync tuning with safe defaults and rejects bad values", () => {
    const config = getAppConfig({ APP_ENV: "test" });
    expect(config.META_SYNC_CONCURRENCY).toBe(2);
    expect(config.BACKFILL_CHUNK_DAYS).toBe(7);
    expect(config.META_INITIAL_SYNC_DAYS).toBe(30);
    expect(config.META_INCREMENTAL_LOOKBACK_DAYS).toBe(3);
    expect(() => getAppConfig({ APP_ENV: "test", BACKFILL_CHUNK_DAYS: "99" })).toThrow();
    expect(() => getAppConfig({ APP_ENV: "test", META_SYNC_CONCURRENCY: "0" })).toThrow();
  });
});
