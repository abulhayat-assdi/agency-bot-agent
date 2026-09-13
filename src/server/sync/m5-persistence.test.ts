import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createMockMetaAdsProvider } from "../meta/adapters/mock/mock-meta-provider";
import { syncAccount } from "./meta-sync";
import {
  breakdownHash,
  createDrizzlePersistenceHooks,
  rollupAvailability,
  runPersistedSync,
  toBigint,
  toNumeric,
  type PersistedSyncScope
} from "./meta-persistence";

type ColumnRef = { name: string };

// Minimal in-memory drizzle double: emulates unique constraints declared via
// onConflictDoUpdate targets so idempotency behavior is genuinely exercised.
function createStubDb(overrides: { findFirst?: () => Promise<null>; findMany?: () => Promise<never[]> } = {}) {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const seenTargets = new Map<string, string[]>();
  let counter = 0;

  const tableKey = (table: object) => getTableName(table as never);

  const keyFor = (table: object, target: ColumnRef[] | undefined, values: Record<string, unknown>) => {
    if (!target) return null;
    seenTargets.set(tableKey(table), target.map((column) => column.name));
    return target.map((column) => `${column.name}=${JSON.stringify(values[column.name] ?? null)}`).join("|");
  };

  const insertInto = (table: object) => ({
    values: (values: Record<string, unknown>) => {
      const chain = {
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
            else {
              counter += 1;
              store.set(`row-${counter}`, row);
            }
            return [row];
          }
        }),
        returning: async () => {
          const store = tables.get(tableKey(table)) ?? new Map<string, Record<string, unknown>>();
          tables.set(tableKey(table), store);
          counter += 1;
          const row = { ...values, id: values.id ?? `uuid-${counter}` };
          store.set(`row-${counter}`, row);
          return [row];
        }
      };
      return chain;
    }
  });

  const db = {
    insert: vi.fn((table: object) => insertInto(table)),
    update: vi.fn(() => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [{ ...patch, id: "uuid-updated" }]
        })
      })
    })),
    query: new Proxy(
      {},
      {
        get: () => ({
          findFirst: overrides.findFirst ?? (async () => null),
          findMany: overrides.findMany ?? (async () => [])
        })
      }
    )
  };

  return { db: db as unknown as import("@/server/db/client").Database, tables, seenTargets };
}

const scope: PersistedSyncScope = {
  agencyId: "agency-1",
  clientId: "client-1",
  providerMode: "mock",
  apiVersion: "v26.0"
};

describe("M5 numeric and availability mapping", () => {
  it("preserves null, keeps genuine zero, and stringifies numerics exactly", () => {
    expect(toNumeric(null)).toBeNull();
    expect(toNumeric(undefined)).toBeNull();
    expect(toNumeric(0)).toBe("0");
    expect(toNumeric(179.39)).toBe("179.39");
    expect(toNumeric(Number.NaN)).toBeNull();
    expect(toBigint(null)).toBeNull();
    expect(toBigint(0)).toBe(0);
    expect(toBigint(102905.7)).toBe(102906);
  });

  it("rolls availability up with unsupported/api_error winning over available", () => {
    expect(rollupAvailability({ spend: "available", clicks: "actual_zero" })).toBe("available");
    expect(rollupAvailability({ spend: "available", reach: "null_from_source" })).toBe("null_from_source");
    expect(rollupAvailability({ spend: "unavailable", reach: "unsupported" })).toBe("unsupported");
    expect(rollupAvailability({})).toBe("available");
  });

  it("hashes breakdown dimensions deterministically", () => {
    expect(breakdownHash("age", { age: "25-34" })).toBe(breakdownHash("age", { age: "25-34" }));
    expect(breakdownHash("age", { age: "25-34" })).not.toBe(breakdownHash("age", { age: "35-44" }));
  });
});

describe("M5 persisted sync hooks", () => {
  it("persists hierarchy, daily metrics, breakdowns, and raw envelopes with nulls intact", async () => {
    const { db, tables } = createStubDb();
    const hooks = createDrizzlePersistenceHooks(db, scope, { id: "run-1" });
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];

    const result = await syncAccount(provider, account.id, { since: "2026-09-01", until: "2026-09-02" }, hooks, {
      providerName: "mock",
      apiVersion: "v26.0",
      includeBreakdowns: true
    });

    expect(result.account?.id).toBe(account.id);
    expect(tables.get("ad_accounts")?.size).toBe(1);
    expect((tables.get("campaigns")?.size ?? 0)).toBeGreaterThan(0);
    expect((tables.get("ad_sets")?.size ?? 0)).toBeGreaterThan(0);
    expect((tables.get("ads")?.size ?? 0)).toBeGreaterThan(0);
    expect((tables.get("metric_daily")?.size ?? 0)).toBeGreaterThan(0);
    expect((tables.get("breakdown_metric_daily")?.size ?? 0)).toBeGreaterThan(0);
    expect((tables.get("raw_ingestion_records")?.size ?? 0)).toBeGreaterThan(0);

    const dailyRows = [...(tables.get("metric_daily")?.values() ?? [])];
    // Null preservation: at least one row keeps a null metric instead of zero.
    expect(dailyRows.some((row) => row.conversionValue === null || row.outboundClicks === null)).toBe(true);
    // Numeric exactness: spend stored as decimal string, counts as integers.
    const withSpend = dailyRows.find((row) => row.spend !== null);
    expect(typeof withSpend?.spend).toBe("string");
    // Provenance: Meta-returned derived values kept in sourceFields, availability map preserved.
    expect(withSpend?.sourceFields).toMatchObject({ availability: expect.any(Object) });
    // Breakdown dimensions preserved for filtering.
    const breakdownRows = [...(tables.get("breakdown_metric_daily")?.values() ?? [])];
    expect(breakdownRows[0]).toMatchObject({ breakdownKey: expect.any(String), breakdownValues: expect.any(Object), breakdownHash: expect.any(String) });
  });

  it("uses the schema unique scope (entityKey, not entityId) for daily upserts", async () => {
    const { db, seenTargets } = createStubDb();
    const hooks = createDrizzlePersistenceHooks(db, scope, { id: "run-1" });
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];

    await syncAccount(provider, account.id, { since: "2026-09-01", until: "2026-09-01" }, hooks, {
      providerName: "mock",
      apiVersion: "v26.0",
      includeBreakdowns: false
    });

    expect(seenTargets.get("metric_daily")).toEqual(["ad_account_id", "entity_level", "entity_key", "date"]);
  });

  it("is idempotent: a repeated sync creates no duplicate rows", async () => {
    const { db, tables } = createStubDb();
    const range = { since: "2026-09-01", until: "2026-09-02" };
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];

    const first = createDrizzlePersistenceHooks(db, scope, { id: "run-1" });
    await syncAccount(provider, account.id, range, first, { providerName: "mock", apiVersion: "v26.0", includeBreakdowns: true });
    const sizesAfterFirst = new Map([...tables.entries()].map(([table, rows]) => [table, rows.size]));

    const second = createDrizzlePersistenceHooks(db, scope, { id: "run-2" });
    await syncAccount(provider, account.id, range, second, { providerName: "mock", apiVersion: "v26.0", includeBreakdowns: true });

    for (const [table, size] of sizesAfterFirst) {
      // raw_ingestion_records intentionally grows (audit trail); everything else must be stable.
      if (table === "raw_ingestion_records") continue;
      expect(tables.get(table)?.size, table).toBe(size);
    }
  });

  it("never persists secrets to any table", async () => {
    const { db, tables } = createStubDb();
    const hooks = createDrizzlePersistenceHooks(db, scope, { id: "run-1" });
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];

    await syncAccount(provider, account.id, { since: "2026-09-01", until: "2026-09-01" }, hooks, {
      providerName: "mock",
      apiVersion: "v26.0",
      includeBreakdowns: true
    });

    const dump = JSON.stringify([...tables.entries()].map(([table, rows]) => [table, [...rows.values()]]));
    expect(dump).not.toMatch(/access_token|appsecret|authorization/i);
  });
});

describe("M5 runPersistedSync lifecycle", () => {
  it("finalizes the run and records availability without leaving it running", async () => {
    const { db } = createStubDb();
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];

    const { runId, accountDbId, result } = await runPersistedSync(db, provider, account.id, { since: "2026-09-01", until: "2026-09-01" }, scope, {
      includeBreakdowns: false
    });

    expect(runId).toBeTruthy();
    expect(accountDbId).toBeTruthy();
    expect(["success", "partial"]).toContain(result.status);
    const updates = (db.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updates.length).toBeGreaterThan(0);
  });
});
