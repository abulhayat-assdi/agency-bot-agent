import { z } from "zod";

import { addDays, resolveDatePreset } from "@/lib/dates/reporting";
import type { MetaApiErrorKind } from "@/server/meta/errors";

export type SyncRunState = "queued" | "running" | "partial" | "success" | "failed" | "cancelled";

export type SyncKind = "initial" | "incremental" | "backfill" | "manual";

export type DateChunk = {
  index: number;
  since: string;
  until: string;
};

export type ChunkCheckpoint = {
  version: 1;
  metaAccountId: string;
  syncKind: SyncKind;
  requestedSince: string;
  requestedUntil: string;
  chunkDays: number;
  timezone: string;
  chunks: DateChunk[];
  completedChunks: number[];
  failedChunks: Array<{ index: number; kind?: string; attempts: number }>;
  currentChunk: number | null;
  lastCheckpointAt: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string, label: string) {
  if (!DATE_RE.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error(`Invalid ${label}: expected YYYY-MM-DD`);
  }
}

/**
 * Split a closed date range into bounded chunks. Date strings are calendar
 * days in the account timezone, so chunking never splits a day and is
 * immune to server-timezone boundaries.
 */
export function planDateChunks(since: string, until: string, chunkDays: number, maxDays = 400): DateChunk[] {
  assertDate(since, "dateStart");
  assertDate(until, "dateEnd");
  if (until < since) throw new Error("Invalid date range: dateEnd is before dateStart");
  const size = Math.max(1, Math.min(Math.floor(chunkDays) || 7, 31));
  const totalDays = Math.round((Date.parse(`${until}T00:00:00.000Z`) - Date.parse(`${since}T00:00:00.000Z`)) / 86_400_000) + 1;
  if (totalDays > maxDays) throw new Error(`Requested range of ${totalDays} days exceeds the ${maxDays}-day backfill limit`);

  const chunks: DateChunk[] = [];
  let cursor = since;
  let index = 0;
  while (cursor <= until) {
    const end = addDays(cursor, size - 1);
    chunks.push({ index, since: cursor, until: end <= until ? end : until });
    cursor = addDays(cursor, size);
    index += 1;
  }
  return chunks;
}

export function initialSyncRange(timezone: string, days: number, referenceInstant = new Date()) {
  const clamped = Math.max(1, Math.min(days, 365));
  const until = resolveDatePreset("today", timezone, referenceInstant).until;
  return { since: addDays(until, -(clamped - 1)), until };
}

/** Incremental sync re-reads today plus a lookback window: Meta data stays mutable for a few days. */
export function incrementalSyncRange(timezone: string, lookbackDays: number, referenceInstant = new Date()) {
  const clamped = Math.max(1, Math.min(lookbackDays, 30));
  const until = resolveDatePreset("today", timezone, referenceInstant).until;
  return { since: addDays(until, -(clamped - 1)), until };
}

export function createCheckpoint(metaAccountId: string, syncKind: SyncKind, since: string, until: string, chunkDays: number, timezone: string): ChunkCheckpoint {
  const chunks = planDateChunks(since, until, chunkDays);
  return {
    version: 1,
    metaAccountId,
    syncKind,
    requestedSince: since,
    requestedUntil: until,
    chunkDays,
    timezone,
    chunks,
    completedChunks: [],
    failedChunks: [],
    currentChunk: null,
    lastCheckpointAt: new Date().toISOString()
  };
}

export function markChunkComplete(checkpoint: ChunkCheckpoint, index: number): ChunkCheckpoint {
  const completedChunks = [...new Set([...checkpoint.completedChunks, index])].sort((a, b) => a - b);
  return {
    ...checkpoint,
    completedChunks,
    failedChunks: checkpoint.failedChunks.filter((entry) => entry.index !== index),
    currentChunk: null,
    lastCheckpointAt: new Date().toISOString()
  };
}

export function markChunkFailed(checkpoint: ChunkCheckpoint, index: number, kind?: string): ChunkCheckpoint {
  const existing = checkpoint.failedChunks.find((entry) => entry.index === index);
  const failedChunks = existing
    ? checkpoint.failedChunks.map((entry) => (entry.index === index ? { ...entry, kind: kind ?? entry.kind, attempts: entry.attempts + 1 } : entry))
    : [...checkpoint.failedChunks, { index, kind, attempts: 1 }];
  return { ...checkpoint, failedChunks, currentChunk: null, lastCheckpointAt: new Date().toISOString() };
}

/** Chunks still needing work: never repeats completed chunks; failed chunks are retried. */
export function pendingChunks(checkpoint: ChunkCheckpoint): DateChunk[] {
  const done = new Set(checkpoint.completedChunks);
  return checkpoint.chunks.filter((chunk) => !done.has(chunk.index));
}

export function checkpointSummary(checkpoint: ChunkCheckpoint) {
  return {
    totalChunks: checkpoint.chunks.length,
    completedChunks: checkpoint.completedChunks.length,
    failedChunks: checkpoint.failedChunks.length,
    pendingChunks: pendingChunks(checkpoint).length,
    currentChunk: checkpoint.currentChunk,
    lastCheckpointAt: checkpoint.lastCheckpointAt
  };
}

// --- State machine ---

const ALLOWED_TRANSITIONS: Record<SyncRunState, SyncRunState[]> = {
  queued: ["running", "cancelled", "failed"],
  running: ["success", "partial", "failed", "cancelled"],
  partial: ["running", "success", "failed", "cancelled"],
  success: [],
  failed: ["running", "queued"],
  cancelled: ["running", "queued"]
};

export function canTransitionRun(from: SyncRunState, to: SyncRunState) {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertRunTransition(from: SyncRunState, to: SyncRunState) {
  if (!canTransitionRun(from, to)) throw new Error(`Illegal sync run transition from ${from} to ${to}`);
}

// --- Retry policy ---

export type RetryDecision = {
  retryable: boolean;
  maxAttempts: number;
  baseDelayMs: number;
};

const RETRYABLE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 10 * 60_000;

export function retryDecisionForKind(kind: MetaApiErrorKind): RetryDecision {
  switch (kind) {
    case "rate_limit":
      return { retryable: true, maxAttempts: 8, baseDelayMs: 60_000 };
    case "transient":
    case "network":
      return { retryable: true, maxAttempts: 5, baseDelayMs: RETRYABLE_DELAY_MS };
    case "authentication":
    case "permission":
    case "invalid_request":
    case "unsupported_breakdown":
    case "not_found":
      return { retryable: false, maxAttempts: 1, baseDelayMs: 0 };
  }
}

/** Bounded exponential backoff with jitter; never exceeds the cap. Respects Retry-After when Meta sends one. */
export function backoffDelayMs(attempt: number, baseDelayMs: number, retryAfterMs?: number) {
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return Math.min(Math.round(retryAfterMs), MAX_DELAY_MS);
  }
  const exponential = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential + Math.floor(Math.random() * 1000), MAX_DELAY_MS);
}

export function remediationForKind(kind: string): string {
  switch (kind) {
    case "authentication":
      return "Meta credential is invalid or expired. Rotate META_SYSTEM_USER_ACCESS_TOKEN and retry.";
    case "permission":
      return "Reconnect/update Meta permissions. The token lacks ads_read on this ad account.";
    case "rate_limit":
      return "Meta rate limit reached. The worker backs off and retries automatically.";
    case "transient":
    case "network":
      return "Meta API was temporarily unavailable. The worker retries automatically.";
    case "invalid_request":
      return "The request was rejected by Meta. Narrow the date range and retry; escalate if it persists.";
    case "unsupported_breakdown":
      return "One requested breakdown is not supported for this account/request. It is skipped, not retried.";
    case "not_found":
      return "The Meta object was not found. Verify the account ID and discovery.";
    default:
      return "An unexpected sync error occurred. Check sync run details and retry.";
  }
}

// --- Deterministic job IDs and payload validation ---

export function chunkJobId(metaAccountId: string, syncKind: SyncKind, since: string, until: string) {
  // BullMQ forbids ":" in custom job IDs (it separates Redis key segments).
  return `chunk|${metaAccountId}|${syncKind}|${since}|${until}`;
}

export function backfillPlannerJobId(parentRunId: string) {
  return `backfill-planner|${parentRunId}`;
}

const safePayloadBase = z.object({
  agencyId: z.string().min(1).max(120),
  accountId: z.string().min(1).max(120),
  traceId: z.string().min(1).max(120)
});

export const chunkJobPayloadSchema = safePayloadBase.extend({
  parentRunId: z.string().uuid(),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().min(1),
  dateRange: z.object({ since: z.string().regex(DATE_RE), until: z.string().regex(DATE_RE) }),
  syncKind: z.enum(["initial", "incremental", "backfill", "manual"]),
  syncType: z.enum(["scheduled", "manual", "backfill", "incremental"]),
  includeBreakdowns: z.boolean().optional(),
  requestedByUserId: z.string().min(1).max(120).optional()
});

export const backfillPlannerPayloadSchema = safePayloadBase.extend({
  parentRunId: z.string().uuid(),
  dateStart: z.string().regex(DATE_RE),
  dateEnd: z.string().regex(DATE_RE),
  timezone: z.string().min(1).max(80).optional(),
  syncKind: z.enum(["initial", "incremental", "backfill", "manual"]),
  syncType: z.enum(["scheduled", "manual", "backfill", "incremental"]),
  chunkDays: z.number().int().min(1).max(31),
  includeBreakdowns: z.boolean().optional(),
  requestedByUserId: z.string().min(1).max(120).optional()
});

export type ChunkJobPayload = z.infer<typeof chunkJobPayloadSchema>;
export type BackfillPlannerPayload = z.infer<typeof backfillPlannerPayloadSchema>;

/** Defense in depth: job payloads must carry only identifiers/config — never credentials. */
export function assertPayloadHasNoSecrets(payload: unknown) {
  const serialized = JSON.stringify(payload ?? {});
  if (/"(access_token|appsecret_proof|app_secret|authorization|api_key|password|client_secret)"\s*:/i.test(serialized)) {
    throw new Error("Sync job payload must not contain credentials");
  }
}
