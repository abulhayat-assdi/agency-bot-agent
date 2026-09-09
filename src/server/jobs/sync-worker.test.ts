import { describe, expect, it, vi } from "vitest";

import { createMockMetaAdsProvider } from "@/server/meta";
import { getSyncQueueReadiness, processSyncJob, SYNC_AD_ACCOUNT_JOB, SYNC_ALL_ACCOUNTS_JOB, type SyncQueueJobData } from "@/server/jobs";

function createJob(name: string, data: SyncQueueJobData) {
  return {
    name,
    data,
    updateProgress: vi.fn(async () => undefined)
  };
}

const baseData = {
  agencyId: "agency_test",
  dateRange: { since: "2026-09-04", until: "2026-09-10" },
  type: "manual" as const,
  traceId: "trace_test"
};

describe("sync worker", () => {
  it("scans one account without mutating provider state", async () => {
    const job = createJob(SYNC_AD_ACCOUNT_JOB, {
      ...baseData,
      accountId: "act_100000000000001",
      includeBreakdowns: true
    });

    const result = await processSyncJob(job, { provider: createMockMetaAdsProvider() });

    expect(result.accountId).toBe("act_100000000000001");
    expect(result.stats.accountsScanned).toBe(1);
    expect(result.stats.campaignsScanned).toBeGreaterThan(0);
    expect(result.stats.adSetsScanned).toBeGreaterThan(0);
    expect(result.stats.adsScanned).toBeGreaterThan(0);
    expect(result.stats.creativesScanned).toBeGreaterThan(0);
    expect(result.stats.insightsScanned).toBeGreaterThan(0);
    expect(result.stats.breakdownRowsScanned).toBeGreaterThan(0);
    expect(job.updateProgress).toHaveBeenCalledWith(expect.objectContaining({ status: expect.stringMatching(/running|success|partial/) }));
  });

  it("summarizes all account sync jobs", async () => {
    const job = createJob(SYNC_ALL_ACCOUNTS_JOB, baseData);

    const result = await processSyncJob(job, { provider: createMockMetaAdsProvider() });

    expect(result.accountId).toBeUndefined();
    expect(result.stats.accountsScanned).toBeGreaterThan(1);
    expect(result.stats.insightsScanned).toBeGreaterThan(0);
  });

  it("marks missing accounts as partial instead of inventing metrics", async () => {
    const job = createJob(SYNC_AD_ACCOUNT_JOB, {
      ...baseData,
      accountId: "act_missing"
    });

    const result = await processSyncJob(job, { provider: createMockMetaAdsProvider() });

    expect(result.status).toBe("partial");
    expect(result.stats.insightsScanned).toBe(0);
    expect(result.warnings[0]).toContain("was not returned");
  });

  it("converts non-retryable provider errors into failed worker errors", async () => {
    const job = createJob(SYNC_ALL_ACCOUNTS_JOB, baseData);

    await expect(processSyncJob(job, { provider: createMockMetaAdsProvider({ forceError: "permission" }) })).rejects.toThrow("Non-retryable Meta provider error");
  });

  it("reports queue readiness without exposing Redis credentials", () => {
    const readiness = getSyncQueueReadiness({ APP_ENV: "test", REDIS_URL: "redis://:password@example.test:6379", SYNC_INTERVAL_MINUTES: "15" });

    expect(readiness).toEqual({
      configured: true,
      queueName: "meta-sync",
      redisUrlPresent: true,
      workerConcurrency: 2,
      defaultAttempts: 5,
      repeatableSyncIntervalMinutes: 15
    });
    expect(JSON.stringify(readiness)).not.toContain("password");
  });
});
