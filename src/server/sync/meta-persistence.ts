import { createHash } from "node:crypto";

import type { Database } from "@/server/db/client";
import type { MetaAvailabilityState } from "@/server/meta/types";
import type {
  MetaAd,
  MetaAdAccount,
  MetaAdSet,
  MetaBreakdownRow,
  MetaCampaign,
  MetaCreative,
  MetaDateRange,
  MetaEntityLevel,
  MetaInsightRow
} from "@/server/meta/types";
import type { MetaAdsProvider } from "@/server/meta/types";
import { MetaApiError } from "@/server/meta/errors";
import { logger } from "@/server/observability/logger";
import { AdRepository } from "@/server/repositories/ad-repository";
import { AdAccountRepository } from "@/server/repositories/ad-account-repository";
import { AdSetRepository } from "@/server/repositories/adset-repository";
import { CampaignRepository } from "@/server/repositories/campaign-repository";
import { ClientRepository } from "@/server/repositories/client-repository";
import { CreativeRepository } from "@/server/repositories/creative-repository";
import { MetricsRepository } from "@/server/repositories/metrics-repository";
import { SyncRepository } from "@/server/repositories/sync-repository";
import type { RepositoryContext } from "@/server/repositories/types";
import { syncAccount, type RawIngestionRecord, type SyncAccountResult, type SyncPersistHooks } from "@/server/sync/meta-sync";

const BATCH_SIZE = 100;

export type PersistedSyncScope = {
  agencyId: string;
  clientId: string;
  providerMode: "mock" | "graph_api";
  apiVersion: string;
};

export type PersistedSyncOptions = {
  includeBreakdowns?: boolean;
  includeCreatives?: boolean;
  syncType?: "scheduled" | "manual" | "backfill" | "incremental";
};

/** Numeric columns use PostgreSQL numeric: pass exact decimal strings, never floats. Null stays null. */
export function toNumeric(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return String(value);
}

/** Bigint columns: pass integers or null. Meta values arrive as whole counts. */
export function toBigint(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
}

const STATE_SEVERITY: Record<MetaAvailabilityState, number> = {
  available: 0,
  actual_zero: 0,
  null_from_source: 1,
  insufficient_data: 2,
  partial: 3,
  unavailable: 4,
  unsupported: 5,
  api_error: 6
};

/** Roll a per-metric availability map up to one row-level state. available wins only when nothing worse exists. */
export function rollupAvailability(availability: Partial<Record<string, MetaAvailabilityState | undefined>>): MetaAvailabilityState {
  let worst: MetaAvailabilityState = "available";
  for (const state of Object.values(availability)) {
    if (!state) continue;
    if ((STATE_SEVERITY[state] ?? 0) > (STATE_SEVERITY[worst] ?? 0)) worst = state;
  }
  return worst;
}

function mapEntityStatus(effectiveStatus: string): "active" | "paused" | "deleted" | "archived" | "unknown" {
  const normalized = effectiveStatus.toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "PAUSED") return "paused";
  if (normalized === "DELETED") return "deleted";
  if (normalized === "ARCHIVED") return "archived";
  return "unknown";
}

export function breakdownHash(breakdownKey: string, values: Record<string, string>) {
  return createHash("sha256").update(`${breakdownKey}:${JSON.stringify(values)}`).digest("hex").slice(0, 128);
}

export async function ensureDefaultScope(db: Database, agencyId?: string): Promise<{ agencyId: string; clientId: string }> {
  if (agencyId) {
    const context: RepositoryContext = { db, agencyId };
    const clients = new ClientRepository(context);
    const existing = await clients.list({ limit: 1 });
    if (existing[0]) return { agencyId, clientId: existing[0].id };
    const created = await clients.upsert({ name: "Default Client", slug: "default", status: "active" });
    return { agencyId, clientId: created.id };
  }
  const agencies = await db.query.agencies.findMany({ limit: 1 });
  const agency = agencies[0];
  if (!agency) throw new Error("No agency available for Meta sync persistence");
  return ensureDefaultScope(db, agency.id);
}

type EntityCache = {
  campaigns: Map<string, string>;
  adSets: Map<string, string>;
  ads: Map<string, string>;
};

export function createDrizzlePersistenceHooks(
  db: Database,
  scope: PersistedSyncScope,
  run: { id: string },
  cache: EntityCache = { campaigns: new Map(), adSets: new Map(), ads: new Map() }
): SyncPersistHooks & { accountUuid: () => string | null } {
  const context: RepositoryContext = { db, agencyId: scope.agencyId };
  const accounts = new AdAccountRepository(context);
  const campaigns = new CampaignRepository(context);
  const adSets = new AdSetRepository(context);
  const ads = new AdRepository(context);
  const metrics = new MetricsRepository(context);
  const sync = new SyncRepository(context);

  let accountUuid: string | null = null;
  const activeRunId: string | null = run.id;

  async function inBatches<T>(rows: T[], write: (batch: T[]) => Promise<unknown>) {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await write(rows.slice(i, i + BATCH_SIZE));
    }
  }

  function metricColumns(row: MetaInsightRow) {
    return {
      timezone: row.timezone,
      currency: row.currency.slice(0, 3),
      attributionContext: row.attributionContext,
      spend: toNumeric(row.spend),
      impressions: toBigint(row.impressions),
      reach: toBigint(row.reach),
      clicks: toBigint(row.clicks),
      linkClicks: toBigint(row.linkClicks),
      outboundClicks: toBigint(row.outboundClicks),
      conversions: toNumeric(row.conversions),
      conversionValue: toNumeric(row.conversionValue),
      videoMetrics: row.videoMetrics ?? {},
      engagementMetrics: row.engagementMetrics ?? {},
      actionMetrics: row.actionMetrics ?? {},
      // Provenance: Meta-returned derived values are kept for reference only.
      // The deterministic engine recalculates CTR/CPC/CPM/frequency at read time.
      sourceFields: {
        providerCtr: row.ctr ?? null,
        providerCpc: row.cpc ?? null,
        providerCpm: row.cpm ?? null,
        providerFrequency: row.frequency ?? null,
        entityName: row.entityName,
        availability: row.availability
      },
      availabilityState: rollupAvailability(row.availability),
      syncRunId: activeRunId
    };
  }

  async function resolveEntityUuid(level: MetaEntityLevel, accountDbId: string, metaEntityId: string): Promise<string | null> {
    if (level === "account") return accountDbId;
    if (level === "campaign") {
      const cached = cache.campaigns.get(metaEntityId);
      if (cached) return cached;
      const found = await campaigns.findByMetaId(accountDbId, metaEntityId);
      if (found) {
        cache.campaigns.set(metaEntityId, found.id);
        return found.id;
      }
      return null;
    }
    if (level === "adset") {
      const cached = cache.adSets.get(metaEntityId);
      if (cached) return cached;
      const found = await adSets.findByMetaId(accountDbId, metaEntityId);
      if (found) {
        cache.adSets.set(metaEntityId, found.id);
        return found.id;
      }
      return null;
    }
    const cached = cache.ads.get(metaEntityId);
    if (cached) return cached;
    const found = await ads.findByMetaId(accountDbId, metaEntityId);
    if (found) {
      cache.ads.set(metaEntityId, found.id);
      return found.id;
    }
    return null;
  }

  return {
    accountUuid: () => accountUuid,

    upsertAccount: async (account: MetaAdAccount) => {
      const persisted = await accounts.upsert({
        clientId: scope.clientId,
        providerMode: scope.providerMode,
        metaAccountId: account.accountId,
        name: account.name,
        currency: account.currency.slice(0, 3),
        timezone: account.timezone,
        status: account.accessStatus === "revoked" ? "disabled" : "active",
        accessStatus: account.accessStatus,
        connectionMetadata: {
          provider: scope.providerMode,
          apiVersion: scope.apiVersion,
          metaAccountId: account.accountId,
          accessStatus: account.accessStatus
        }
      });
      accountUuid = persisted.id;
    },

    upsertCampaigns: async (rows: MetaCampaign[]) => {
      if (!accountUuid) return;
      const accountDbId = accountUuid;
      await inBatches(rows, async (batch) => {
        for (const campaign of batch) {
          const persisted = await campaigns.upsert({
            adAccountId: accountDbId,
            metaCampaignId: campaign.id,
            name: campaign.name,
            status: mapEntityStatus(campaign.effectiveStatus),
            effectiveStatus: campaign.effectiveStatus,
            objective: campaign.objective,
            buyingType: campaign.buyingType,
            startedAt: null,
            stoppedAt: null,
            rawLastSeenAt: new Date()
          });
          cache.campaigns.set(campaign.id, persisted.id);
        }
      });
    },

    upsertAdSets: async (rows: MetaAdSet[]) => {
      if (!accountUuid) return;
      const accountDbId = accountUuid;
      await inBatches(rows, async (batch) => {
        for (const adSet of batch) {
          let campaignUuid = cache.campaigns.get(adSet.campaignId) ?? null;
          if (!campaignUuid) {
            const found = await campaigns.findByMetaId(accountDbId, adSet.campaignId);
            if (found) {
              campaignUuid = found.id;
              cache.campaigns.set(adSet.campaignId, found.id);
            }
          }
          if (!campaignUuid) continue;
          const persisted = await adSets.upsert({
            adAccountId: accountDbId,
            campaignId: campaignUuid,
            metaAdsetId: adSet.id,
            name: adSet.name,
            status: mapEntityStatus(adSet.effectiveStatus),
            effectiveStatus: adSet.effectiveStatus,
            optimizationGoal: adSet.optimizationGoal,
            billingEvent: adSet.billingEvent,
            attributionSpec: adSet.attributionSpec,
            startedAt: null,
            stoppedAt: null,
            rawLastSeenAt: new Date()
          });
          cache.adSets.set(adSet.id, persisted.id);
        }
      });
    },

    upsertAds: async (rows: MetaAd[]) => {
      if (!accountUuid) return;
      const accountDbId = accountUuid;
      await inBatches(rows, async (batch) => {
        for (const ad of batch) {
          const campaignUuid = cache.campaigns.get(ad.campaignId) ?? (await campaigns.findByMetaId(accountDbId, ad.campaignId))?.id ?? null;
          if (campaignUuid && !cache.campaigns.has(ad.campaignId)) cache.campaigns.set(ad.campaignId, campaignUuid);
          const adSetUuid = cache.adSets.get(ad.adSetId) ?? (await adSets.findByMetaId(accountDbId, ad.adSetId))?.id ?? null;
          if (adSetUuid && !cache.adSets.has(ad.adSetId)) cache.adSets.set(ad.adSetId, adSetUuid);
          if (!campaignUuid || !adSetUuid) continue;
          const persisted = await ads.upsert({
            adAccountId: accountDbId,
            campaignId: campaignUuid,
            adSetId: adSetUuid,
            metaAdId: ad.id,
            name: ad.name,
            status: mapEntityStatus(ad.effectiveStatus),
            effectiveStatus: ad.effectiveStatus,
            creativeId: ad.creativeId === "unknown_creative" ? null : ad.creativeId,
            rawLastSeenAt: new Date()
          });
          cache.ads.set(ad.id, persisted.id);
        }
      });
    },

    upsertInsights: async (rows: MetaInsightRow[]) => {
      if (!accountUuid) return;
      const accountDbId = accountUuid;
      await inBatches(rows, async (batch) => {
        for (const row of batch) {
          const entityUuid = await resolveEntityUuid(row.level, accountDbId, row.entityId);
          await metrics.upsertDaily({
            adAccountId: accountDbId,
            entityLevel: row.level,
            entityId: entityUuid,
            entityKey: row.entityId,
            date: row.dateStart,
            ...metricColumns(row)
          });
        }
      });
    },

    upsertBreakdowns: async (rows: MetaBreakdownRow[]) => {
      if (!accountUuid) return;
      const accountDbId = accountUuid;
      await inBatches(rows, async (batch) => {
        for (const row of batch) {
          const entityUuid = await resolveEntityUuid(row.level, accountDbId, row.entityId);
          await metrics.upsertBreakdownDaily({
            adAccountId: accountDbId,
            entityLevel: row.level,
            entityId: entityUuid,
            entityKey: row.entityId,
            date: row.dateStart,
            breakdownKey: row.breakdownKey,
            breakdownValues: row.breakdownValues,
            breakdownHash: breakdownHash(row.breakdownKey, row.breakdownValues),
            ...metricColumns(row)
          });
        }
      });
    },

    recordRaw: async (record: RawIngestionRecord) => {
      if (!accountUuid || !activeRunId) return;
      await sync.recordRaw({
        syncRunId: activeRunId,
        adAccountId: accountUuid,
        source: record.source,
        sourceObjectId: record.sourceObjectId,
        endpoint: record.endpoint,
        requestHash: record.requestHash,
        responsePageCursor: record.responsePageCursor,
        payload: record.payload,
        payloadHash: record.payloadHash
      });
    }
  };
}

export type PersistedSyncResult = {
  runId: string;
  accountDbId: string | null;
  result: SyncAccountResult;
};

export async function runPersistedSync(
  db: Database,
  provider: MetaAdsProvider,
  metaAccountId: string,
  dateRange: MetaDateRange,
  scope: PersistedSyncScope,
  options: PersistedSyncOptions = {}
): Promise<PersistedSyncResult> {
  const context: RepositoryContext = { db, agencyId: scope.agencyId };
  const sync = new SyncRepository(context);

  const run = await sync.startRun({
    adAccountId: null,
    providerMode: scope.providerMode,
    type: options.syncType ?? "manual",
    checkpoint: { metaAccountId, dateRange, provider: scope.providerMode, apiVersion: scope.apiVersion },
    stats: {}
  });

  // Hooks are bound to the real run id (the run row must exist before raw rows reference it).
  const bound = createDrizzlePersistenceHooks(db, scope, { id: run.id });

  let result: SyncAccountResult;
  try {
    result = await syncAccount(provider, metaAccountId, dateRange, bound, {
      providerName: scope.providerMode === "graph_api" ? "graph-api" : "mock",
      apiVersion: scope.apiVersion,
      includeBreakdowns: options.includeBreakdowns ?? true
    });
  } catch (error) {
    const safeMessage = error instanceof MetaApiError ? `Meta ${error.kind} during sync.` : "Meta sync failed unexpectedly.";
    await bound.recordRaw?.({
      source: scope.providerMode,
      endpoint: "sync_fatal",
      requestHash: "fatal",
      payload: { provider: scope.providerMode, endpoint: "sync_fatal", accountId: metaAccountId },
      payloadHash: "fatal",
      receivedAt: new Date().toISOString()
    }).catch(() => undefined);
    await sync.finishRun(run.id, { status: "failed", errorSummary: safeMessage, stats: {} });
    throw error;
  }

  const accountDbId = bound.accountUuid();
  const errorCount = result.stages.reduce((total, stage) => total + stage.errors.length, 0);

  // Persist stage errors and availability with safe details only.
  for (const stage of result.stages) {
    for (const stageError of stage.errors) {
      if (!accountDbId) break;
      await sync
        .recordError({
          syncRunId: run.id,
          adAccountId: accountDbId,
          severity: result.status === "failed" ? "error" : "warning",
          providerCode: stageError.code,
          safeMessage: `${stage.stage}: ${stageError.safeMessage}`.slice(0, 2000),
          retryable: stageError.retryable,
          requestContext: { stage: stage.stage }
        })
        .catch(() => undefined);
    }
  }

  if (accountDbId) {
    await sync
      .recordAvailabilityMany(
        result.availability.map((item) => ({
          adAccountId: accountDbId,
          entityLevel: item.entityLevel,
          entityKey: item.entityKey,
          metricKey: item.metricKey,
          breakdownKey: null,
          dateStart: dateRange.since,
          dateStop: dateRange.until,
          state: item.state,
          reason: "Preserved from provider availability during sync.",
          syncRunId: run.id
        }))
      )
      .catch(() => undefined);
  }

  // Optional creative enrichment: bounded, best-effort, never fails the sync.
  if (options.includeCreatives && accountDbId) {
    try {
      const creativeRepo = new CreativeRepository(context);
      const adRepo = new AdRepository(context);
      const persistedAds = await adRepo.listByAccount(accountDbId);
      for (const persistedAd of persistedAds.slice(0, 50)) {
        const creative: MetaCreative | null = await provider.getCreative(persistedAd.metaAdId);
        if (!creative || creative.id === "unknown_creative") continue;
        await creativeRepo.upsert({
          adId: persistedAd.id,
          metaCreativeId: creative.id,
          name: creative.name,
          pageId: creative.pageId,
          instagramActorId: creative.instagramActorId,
          thumbnailUrl: creative.thumbnailUrl,
          objectType: creative.objectType,
          metadata: creative.metadata
        });
      }
    } catch {
      logger.warn("Creative enrichment skipped after persisted sync", { metaAccountId });
      if (accountDbId) {
        await sync
          .recordError({
            syncRunId: run.id,
            adAccountId: accountDbId,
            severity: "warning",
            safeMessage: "Creative enrichment was skipped; core metrics are unaffected.",
            retryable: false,
            requestContext: { stage: "fetch_creatives" }
          })
          .catch(() => undefined);
      }
    }
  }

  const stats = {
    stages: result.stages.map((stage) => ({ stage: stage.stage, scanned: stage.scanned, rawRecords: stage.rawRecords, errors: stage.errors.length })),
    rawRecords: result.rawRecords.length,
    availabilityStates: result.availability.length,
    errorCount
  };

  await sync.finishRun(run.id, {
    status: result.status,
    stats,
    checkpoint: { metaAccountId, dateRange, provider: scope.providerMode, apiVersion: scope.apiVersion },
    errorSummary: errorCount > 0 ? `${errorCount} stage warning(s) preserved; see sync_errors.` : null
  });

  if (accountDbId) {
    const accounts = new AdAccountRepository(context);
    await accounts.markSynced(accountDbId, result.status).catch(() => undefined);
  }

  return { runId: run.id, accountDbId, result };
}
