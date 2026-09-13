import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { getAppConfig } from "../config/env";
import type { Database } from "../db/client";
import {
  assertAnalyticsRange,
  clampPageLimit,
  clampPageOffset,
  clampRowLimit,
  ENTITY_PAGE_DEFAULT_LIMIT,
  ENTITY_PAGE_MAX_LIMIT,
  ANALYTICS_ROW_LIMIT_MAX
} from "../analytics/query-bounds";
import { getSyncQueueMetrics } from "../jobs/queues";
import { MetricsRepository } from "../repositories/metrics-repository";
import { getSharedRateLimiter, RedisApiRateLimiter } from "../security/redis-rate-limit";
import { getPersistedTrend } from "../analytics/persisted/service";
import { findPersistedAccount } from "../analytics/persisted/store";

vi.mock("../analytics/persisted/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../analytics/persisted/store")>();
  return { ...actual, findPersistedAccount: vi.fn() };
});

function fakeRedisClient(responses: Array<[number, number]> | Error) {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = [];
  let index = 0;
  return {
    calls,
    client: {
      eval: vi.fn(async (script: string, numKeys: number, ...rest: string[]) => {
        calls.push({ script, keys: rest.slice(0, numKeys), args: rest.slice(numKeys) });
        if (responses instanceof Error) throw responses;
        const response = responses[Math.min(index, responses.length - 1)];
        index += 1;
        return response;
      }),
      scanStream: () => (async function* () { yield ["rl:test:k1", "rl:test:k2"]; })(),
      del: vi.fn(async () => 2)
    } as never
  };
}

describe("M8 Redis-backed rate limiting", () => {
  it("allows under the limit and blocks past it with retry metadata", async () => {
    const { client, calls } = fakeRedisClient([[1, 60_000], [11, 45_000]]);
    const limiter = new RedisApiRateLimiter("test", { limit: 10, windowMs: 60_000 }, () => client);
    const first = await limiter.check("ip-1", 1_000);
    expect(first).toMatchObject({ allowed: true, remaining: 9 });
    expect(calls[0].keys).toEqual(["rl:test:ip-1"]);
    expect(calls[0].args).toEqual(["60000"]);
    const blocked = await limiter.check("ip-1", 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(45);
  });

  it("fails open when Redis is unavailable", async () => {
    const { client } = fakeRedisClient(new Error("connection lost"));
    const limiter = new RedisApiRateLimiter("test", { limit: 2, windowMs: 60_000 }, () => client);
    const result = await limiter.check("ip-9");
    expect(result.allowed).toBe(true);
  });

  it("shares one instance per name and falls back without REDIS_URL", async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      const first = getSharedRateLimiter("m8-shared-test", { limit: 1, windowMs: 60_000 });
      const second = getSharedRateLimiter("m8-shared-test", { limit: 1, windowMs: 60_000 });
      expect(second).toBe(first);
      expect((await first.check("k")).allowed).toBe(true);
      expect((await first.check("k")).allowed).toBe(false);
    } finally {
      if (saved !== undefined) process.env.REDIS_URL = saved;
    }
  });
});

describe("M8 DB pool configuration", () => {
  it("defaults to 10 and accepts per-process overrides", () => {
    expect(getAppConfig({ APP_ENV: "test" }).DATABASE_POOL_MAX).toBe(10);
    expect(getAppConfig({ APP_ENV: "test", DATABASE_POOL_MAX: "5" }).DATABASE_POOL_MAX).toBe(5);
    expect(() => getAppConfig({ APP_ENV: "test", DATABASE_POOL_MAX: "0" })).toThrow();
    expect(() => getAppConfig({ APP_ENV: "test", DATABASE_POOL_MAX: "51" })).toThrow();
  });
});

describe("M8 analytics query bounds", () => {
  it("accepts sane ranges and rejects pathological ones", async () => {
    const { addDays } = await import("../../lib/dates/reporting");
    expect(assertAnalyticsRange("2026-09-01", "2026-09-07")).toBe(7);
    expect(assertAnalyticsRange(addDays("2026-09-12", -399), "2026-09-12")).toBe(400);
    expect(() => assertAnalyticsRange("2026-09-07", "2026-09-01")).toThrow("before start");
    expect(() => assertAnalyticsRange("not-a-date", "2026-09-07")).toThrow("bad start");
    expect(() => assertAnalyticsRange(addDays("2026-09-12", -400), "2026-09-12")).toThrow("exceeds the 400-day");
  });

  it("clamps pagination and row limits", () => {
    expect(clampPageLimit(undefined)).toBe(ENTITY_PAGE_DEFAULT_LIMIT);
    expect(clampPageLimit(500)).toBe(ENTITY_PAGE_MAX_LIMIT);
    expect(clampPageLimit(-3)).toBe(1);
    expect(clampPageOffset(undefined)).toBe(0);
    expect(clampPageOffset(-9)).toBe(0);
    expect(clampRowLimit(undefined)).toBe(ANALYTICS_ROW_LIMIT_MAX);
    expect(clampRowLimit(99_999)).toBe(ANALYTICS_ROW_LIMIT_MAX);
  });

  it("resolves data-through dates with MAX(date) instead of row scans", async () => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: async () => [{ value: "2026-09-10" }]
        })
      })
    } as never;
    const repo = new MetricsRepository({ db: fakeDb, agencyId: "" });
    expect(await repo.maxDailyDate("account-1")).toBe("2026-09-10");
  });
});

describe("M8 SQL trend rollup", () => {
  it("aggregates daily totals in PostgreSQL with honest availability", async () => {
    vi.mocked(findPersistedAccount).mockResolvedValue({
      dbRowId: "db-1",
      clientId: "c-1",
      clientName: "Test",
      account: { id: "act_1", accountId: "1", name: "A", currency: "USD", timezone: "UTC", accessStatus: "connected" },
      lastSyncAt: "2026-09-10T00:00:00.000Z",
      lastSyncState: "success"
    });
    const spy = vi.spyOn(MetricsRepository.prototype, "sumDailyByDate").mockResolvedValue([
      { date: "2026-09-01", spend: "200", impressions: "4000", clicks: "100", conversions: "10", rowCount: "2", spendCount: "2", impressionsCount: "2", clicksCount: "2", conversionsCount: "2" },
      { date: "2026-09-02", spend: null, impressions: null, clicks: null, conversions: null, rowCount: "1", spendCount: "0", impressionsCount: "0", clicksCount: "0", conversionsCount: "0" }
    ] as never);
    const result = await getPersistedTrend({} as unknown as Database, "act_1", { since: "2026-09-01", until: "2026-09-02" });
    expect(result?.points).toHaveLength(2);
    expect(result?.points[0]).toMatchObject({ date: "2026-09-01", spend: 200, impressions: 4000, clicks: 100, conversions: 10 });
    expect(result?.points[0]?.roas).toBeNull();
    // All-null day stays a zero chart point, not a fabricated value.
    expect(result?.points[1]).toMatchObject({ date: "2026-09-02", spend: 0, conversions: 0 });
    spy.mockRestore();
  });
});

describe("M8 queue metrics observability", () => {
  it("returns null without Redis and maps live counts otherwise", async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      expect(await getSyncQueueMetrics()).toBeNull();
    } finally {
      if (saved !== undefined) process.env.REDIS_URL = saved;
    }
    const fakeQueue = {
      getJobCounts: async () => ({ waiting: 3, active: 2, completed: 10, failed: 1, delayed: 0 }),
      close: async () => undefined
    };
    const metrics = await getSyncQueueMetrics({ REDIS_URL: "redis://localhost:6379" }, () => fakeQueue as never);
    expect(metrics).toEqual({ waiting: 3, active: 2, completed: 10, failed: 1, delayed: 0 });
  });
});

describe("M8 readiness endpoint", () => {
  it("reports unready without secrets when dependencies are missing", async () => {
    const savedDb = process.env.DATABASE_URL;
    const savedRedis = process.env.REDIS_URL;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    try {
      const { GET } = await import("../../app/api/ready/route");
      const response = await GET();
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.ready).toBe(false);
      expect(body.database).toEqual({ configured: false, reachable: false });
      expect(body.redis.configured).toBe(false);
      expect(body.meta.provider).toBe("mock");
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/postgres:\/\/|redis:\/\/|EAA|BEGIN .*PRIVATE KEY/i);
    } finally {
      if (savedDb !== undefined) process.env.DATABASE_URL = savedDb;
      if (savedRedis !== undefined) process.env.REDIS_URL = savedRedis;
    }
  });
});

describe("M8 backup runbook validation", () => {
  it("documents every required operational section", () => {
    const docs = readFileSync(join(process.cwd(), "docs", "DEPLOYMENT.md"), "utf8");
    for (const heading of [
      "## Database migration runbook",
      "### Backup/restore drill",
      "## Connection budget and concurrency",
      "## Analytics query safety",
      "## Meta API throttling model",
      "## Redis persistence and resources",
      "Redis loss recovery",
      "## Production go-live runbook",
      "Stale runs and alerting"
    ]) {
      expect(docs, heading).toContain(heading);
    }
    expect(docs).toMatch(/ANALYTICS_SOURCE/);
    expect(docs).toMatch(/DATABASE_POOL_MAX/);
  });
});
