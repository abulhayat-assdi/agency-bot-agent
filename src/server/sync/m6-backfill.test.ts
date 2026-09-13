import { UnrecoverableError } from "bullmq";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Database } from "../db/client";
import { MetaApiError } from "../meta/errors";
import {
  assertPayloadHasNoSecrets,
  assertRunTransition,
  backfillPlannerPayloadSchema,
  backoffDelayMs,
  canTransitionRun,
  checkpointSummary,
  chunkJobId,
  chunkJobPayloadSchema,
  createCheckpoint,
  incrementalSyncRange,
  initialSyncRange,
  markChunkComplete,
  markChunkFailed,
  pendingChunks,
  planDateChunks,
  remediationForKind,
  retryDecisionForKind
} from "./chunks";
import { SyncThrottleController } from "./throttle";

describe("M6 date chunking", () => {
  it("splits a 90-day backfill into thirteen 7-day chunks", () => {
    const chunks = planDateChunks("2026-06-15", "2026-09-12", 7);
    expect(chunks).toHaveLength(13);
    expect(chunks[0]).toEqual({ index: 0, since: "2026-06-15", until: "2026-06-21" });
    expect(chunks[12]).toEqual({ index: 12, since: "2026-09-07", until: "2026-09-12" });
    // Full coverage, no gaps or overlaps.
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].since).toBe(addOneDay(chunks[i - 1].until));
    }
  });

  it("keeps an uneven final chunk instead of dropping days", () => {
    const chunks = planDateChunks("2026-09-01", "2026-09-10", 7);
    expect(chunks).toEqual([
      { index: 0, since: "2026-09-01", until: "2026-09-07" },
      { index: 1, since: "2026-09-08", until: "2026-09-10" }
    ]);
  });

  it("rejects invalid ranges and unbounded history", () => {
    expect(() => planDateChunks("2026-09-10", "2026-09-01", 7)).toThrow("before dateStart");
    expect(() => planDateChunks("not-a-date", "2026-09-10", 7)).toThrow("Invalid dateStart");
    expect(() => planDateChunks("2020-01-01", "2026-09-12", 7, 400)).toThrow("exceeds the 400-day");
  });

  it("builds initial and incremental ranges in account timezone", () => {
    const ref = new Date("2026-09-12T12:00:00.000Z");
    expect(initialSyncRange("Asia/Dhaka", 30, ref)).toEqual({ since: "2026-08-14", until: "2026-09-12" });
    expect(incrementalSyncRange("Asia/Dhaka", 3, ref)).toEqual({ since: "2026-09-10", until: "2026-09-12" });
  });

  function addOneDay(date: string) {
    return new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
  }
});

describe("M6 checkpoint and resume", () => {
  it("tracks completion and skips completed chunks on resume", () => {
    let checkpoint = createCheckpoint("act_1", "backfill", "2026-09-01", "2026-09-14", 7, "UTC");
    expect(checkpoint.chunks).toHaveLength(2);
    checkpoint = markChunkComplete(checkpoint, 0);
    expect(pendingChunks(checkpoint).map((chunk) => chunk.index)).toEqual([1]);
    expect(checkpointSummary(checkpoint)).toMatchObject({ totalChunks: 2, completedChunks: 1, pendingChunks: 1 });
  });

  it("records failed chunks with retry counts without losing completed work", () => {
    let checkpoint = createCheckpoint("act_1", "backfill", "2026-09-01", "2026-09-14", 7, "UTC");
    checkpoint = markChunkComplete(checkpoint, 0);
    checkpoint = markChunkFailed(checkpoint, 1, "rate_limit");
    checkpoint = markChunkFailed(checkpoint, 1, "rate_limit");
    expect(checkpoint.failedChunks).toEqual([{ index: 1, kind: "rate_limit", attempts: 2 }]);
    expect(pendingChunks(checkpoint).map((chunk) => chunk.index)).toEqual([1]);
    // A retried chunk clears its failure record on success.
    checkpoint = markChunkComplete(checkpoint, 1);
    expect(checkpoint.failedChunks).toEqual([]);
    expect(pendingChunks(checkpoint)).toEqual([]);
  });
});

describe("M6 deterministic job IDs and payload safety", () => {
  it("produces stable, distinct chunk job IDs", () => {
    const a = chunkJobId("act_1", "backfill", "2026-09-01", "2026-09-07");
    expect(chunkJobId("act_1", "backfill", "2026-09-01", "2026-09-07")).toBe(a);
    expect(chunkJobId("act_1", "backfill", "2026-09-08", "2026-09-14")).not.toBe(a);
    expect(chunkJobId("act_2", "backfill", "2026-09-01", "2026-09-07")).not.toBe(a);
  });

  it("rejects payloads carrying credential fields", () => {
    expect(() => assertPayloadHasNoSecrets({ accountId: "act_1", traceId: "t" })).not.toThrow();
    expect(() => assertPayloadHasNoSecrets({ accountId: "act_1", access_token: "EAAxxx" })).toThrow("must not contain credentials");
  });

  it("validates chunk and planner payload shapes", () => {
    const chunk = {
      agencyId: "a",
      accountId: "act_1",
      traceId: "t",
      parentRunId: "123e4567-e89b-12d3-a456-426614174000",
      chunkIndex: 0,
      totalChunks: 2,
      dateRange: { since: "2026-09-01", until: "2026-09-07" },
      syncKind: "backfill",
      syncType: "backfill"
    };
    expect(chunkJobPayloadSchema.safeParse(chunk).success).toBe(true);
    expect(chunkJobPayloadSchema.safeParse({ ...chunk, chunkIndex: -1 }).success).toBe(false);
    expect(
      backfillPlannerPayloadSchema.safeParse({
        agencyId: "a",
        accountId: "act_1",
        traceId: "t",
        parentRunId: "123e4567-e89b-12d3-a456-426614174000",
        dateStart: "2026-09-01",
        dateEnd: "2026-09-14",
        syncKind: "backfill",
        syncType: "backfill",
        chunkDays: 7
      }).success
    ).toBe(true);
  });
});

describe("M6 retry policy and state machine", () => {
  it.each([
    ["authentication", false],
    ["permission", false],
    ["invalid_request", false],
    ["unsupported_breakdown", false],
    ["not_found", false],
    ["rate_limit", true],
    ["transient", true],
    ["network", true]
  ] as const)("kind %s retryable=%s", (kind, retryable) => {
    expect(retryDecisionForKind(kind).retryable).toBe(retryable);
  });

  it("bounds backoff and honors Retry-After", () => {
    expect(backoffDelayMs(1, 30_000)).toBeGreaterThanOrEqual(30_000);
    expect(backoffDelayMs(99, 30_000)).toBeLessThanOrEqual(600_000);
    expect(backoffDelayMs(1, 30_000, 5_000)).toBe(5_000);
    expect(backoffDelayMs(1, 30_000, 99_999_999)).toBe(600_000);
  });

  it("enforces deterministic run transitions", () => {
    expect(canTransitionRun("queued", "running")).toBe(true);
    expect(canTransitionRun("running", "success")).toBe(true);
    expect(canTransitionRun("running", "partial")).toBe(true);
    expect(canTransitionRun("running", "cancelled")).toBe(true);
    expect(canTransitionRun("success", "running")).toBe(false);
    expect(canTransitionRun("cancelled", "success")).toBe(false);
    expect(() => assertRunTransition("success", "failed")).toThrow("Illegal sync run transition");
    expect(canTransitionRun("failed", "running")).toBe(true);
  });

  it("explains every failure category safely", () => {
    for (const kind of ["authentication", "permission", "rate_limit", "transient", "network", "invalid_request", "unsupported_breakdown", "not_found"]) {
      const message = remediationForKind(kind);
      expect(message.length).toBeGreaterThan(10);
      // Env var names are fine; token values / auth headers are not.
      expect(message).not.toMatch(/EAA[a-zA-Z0-9]{8,}|Bearer\s+[A-Za-z0-9._~-]{10,}|"access_token"\s*:/i);
    }
  });
});

describe("M6 adaptive throttle", () => {
  let throttle: SyncThrottleController;
  beforeEach(() => {
    throttle = new SyncThrottleController({ baseDelayMs: 500, maxDelayMs: 4_000 });
  });

  it("starts with no delay and grows under pressure within bounds", () => {
    expect(throttle.snapshot("act_1").currentDelayMs).toBe(0);
    throttle.recordOutcome("act_1", "pressure");
    expect(throttle.snapshot("act_1").currentDelayMs).toBe(500);
    throttle.recordOutcome("act_1", "pressure");
    expect(throttle.snapshot("act_1").currentDelayMs).toBe(1_000);
    for (let i = 0; i < 10; i += 1) throttle.recordOutcome("act_1", "pressure");
    expect(throttle.snapshot("act_1").currentDelayMs).toBeLessThanOrEqual(4_000);
  });

  it("jumps to Retry-After when Meta provides one", () => {
    throttle.recordOutcome("act_1", "pressure", 2_500);
    expect(throttle.snapshot("act_1").currentDelayMs).toBe(2_500);
  });

  it("decays after sustained health and isolates accounts", () => {
    throttle.recordOutcome("act_1", "pressure");
    throttle.recordOutcome("act_1", "healthy");
    throttle.recordOutcome("act_1", "healthy");
    throttle.recordOutcome("act_1", "healthy");
    expect(throttle.snapshot("act_1").currentDelayMs).toBeLessThan(500);
    expect(throttle.snapshot("act_2").currentDelayMs).toBe(0);
  });
});

describe("M6 worker chunk behavior", () => {
  const chunkData = {
    agencyId: "agency-1",
    accountId: "act_100000000000001",
    traceId: "trace-1",
    parentRunId: "123e4567-e89b-12d3-a456-426614174000",
    chunkIndex: 0,
    totalChunks: 2,
    dateRange: { since: "2026-09-01", until: "2026-09-07" },
    syncKind: "backfill" as const,
    syncType: "backfill" as const,
    includeBreakdowns: false
  };

  function chunkJob(overrides: Record<string, unknown> = {}) {
    return {
      name: "sync-account-chunk",
      data: { ...chunkData, ...overrides },
      id: "job-1",
      attemptsMade: 0,
      updateProgress: vi.fn(async () => undefined)
    };
  }

  it("rejects invalid chunk payloads without retry", async () => {
    const { processJob } = await import("../jobs/sync-worker");
    await expect(processJob(chunkJob({ chunkIndex: -1 }), { getDb: () => null })).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("fails the planner fast when no database backs the checkpoint", async () => {
    const { processJob } = await import("../jobs/sync-worker");
    await expect(
      processJob(
        {
          name: "sync-backfill-planner",
          data: {
            agencyId: "agency-1",
            accountId: "act_1",
            traceId: "t",
            parentRunId: "123e4567-e89b-12d3-a456-426614174000",
            dateStart: "2026-09-01",
            dateEnd: "2026-09-14",
            syncKind: "backfill",
            syncType: "backfill",
            chunkDays: 7
          },
          updateProgress: vi.fn(async () => undefined)
        },
        { getDb: () => null }
      )
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("skips chunks cooperatively when the parent run was cancelled", async () => {
    const { processJob } = await import("../jobs/sync-worker");
    const fakeDb = {
      query: {
        syncRuns: { findFirst: async () => ({ id: chunkData.parentRunId, status: "cancelled", checkpoint: {} }) }
      }
    } as unknown as Database;
    const result = (await processJob(chunkJob(), { getDb: () => fakeDb })) as { status: string };
    expect(result.status).toBe("cancelled");
  });

  it("persists chunk success and completes the parent checkpoint", async () => {
    const metaPersistence = await import("./meta-persistence");
    const runSpy = vi.spyOn(metaPersistence, "runPersistedSync").mockResolvedValue({
      runId: "chunk-run",
      accountDbId: "db-account",
      result: {
        account: { id: chunkData.accountId, accountId: "100000000000001", name: "A", currency: "USD", timezone: "UTC", accessStatus: "connected" },
        stages: [],
        availability: [],
        rawRecords: [],
        status: "success"
      }
    } as never);

    const checkpoint = createCheckpoint(chunkData.accountId, "backfill", "2026-09-01", "2026-09-14", 7, "UTC");
    const saved: unknown[] = [];
    const finished: unknown[] = [];
    let liveCheckpoint: unknown = checkpoint;
    const fakeDb = {
      query: {
        syncRuns: { findFirst: async () => ({ id: chunkData.parentRunId, status: "running", checkpoint: liveCheckpoint, stats: {} }) },
        adAccounts: { findFirst: async () => null },
        clients: { findMany: async () => [{ id: "client-1" }] }
      }
    } as unknown as Database;
    // SyncRepository saves checkpoints and finalizes through update(); capture both.
    const { SyncRepository } = await import("../repositories/sync-repository");
    const saveSpy = vi.spyOn(SyncRepository.prototype, "saveCheckpoint").mockImplementation(async (_id, cp) => {
      saved.push(cp);
      return { id: chunkData.parentRunId } as never;
    });
    const finishSpy = vi.spyOn(SyncRepository.prototype, "finishRun").mockImplementation(async (_id, patch) => {
      finished.push(patch);
      return { id: chunkData.parentRunId } as never;
    });
    vi.spyOn(SyncRepository.prototype, "recordError").mockResolvedValue({} as never);
    vi.spyOn(SyncRepository.prototype, "recordAvailabilityMany").mockResolvedValue([]);

    const { processJob } = await import("../jobs/sync-worker");
    const throttle = new SyncThrottleController();
    // Complete the sibling chunk first so this chunk finalizes the parent.
    liveCheckpoint = markChunkComplete(checkpoint, 1);

    const result = (await processJob(chunkJob(), { getDb: () => fakeDb, throttle })) as { status: string };
    expect(result.status).toBe("success");
    expect(finished).toHaveLength(1);
    expect(throttle.snapshot(chunkData.accountId).currentDelayMs).toBe(0);

    runSpy.mockRestore();
    saveSpy.mockRestore();
    finishSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("fails permanent chunk errors fast and retries rate limits", async () => {
    const metaPersistence = await import("./meta-persistence");
    const permanent = new MetaApiError("Denied", "permission", "200", false);
    const runSpy = vi.spyOn(metaPersistence, "runPersistedSync").mockRejectedValue(permanent);
    const fakeDb = {
      query: {
        syncRuns: { findFirst: async () => ({ id: chunkData.parentRunId, status: "running", checkpoint: createCheckpoint(chunkData.accountId, "backfill", "2026-09-01", "2026-09-14", 7, "UTC"), stats: {} }) },
        adAccounts: { findFirst: async () => null },
        clients: { findMany: async () => [{ id: "client-1" }] }
      }
    } as unknown as Database;
    const { SyncRepository } = await import("../repositories/sync-repository");
    vi.spyOn(SyncRepository.prototype, "saveCheckpoint").mockResolvedValue({} as never);
    vi.spyOn(SyncRepository.prototype, "recordError").mockResolvedValue({} as never);
    vi.spyOn(SyncRepository.prototype, "recordAvailabilityMany").mockResolvedValue([]);

    const { processJob } = await import("../jobs/sync-worker");
    await expect(processJob(chunkJob(), { getDb: () => fakeDb })).rejects.toBeInstanceOf(UnrecoverableError);

    runSpy.mockRejectedValue(new MetaApiError("Busy", "rate_limit", "4", true));
    await expect(processJob(chunkJob(), { getDb: () => fakeDb })).rejects.toMatchObject({ kind: "rate_limit" });

    runSpy.mockRestore();
    vi.restoreAllMocks();
  });
});
