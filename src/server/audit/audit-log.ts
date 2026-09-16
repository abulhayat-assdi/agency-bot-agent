import { createHash } from "node:crypto";

import type { Database } from "@/server/db/client";
import { logger } from "@/server/observability/logger";
import { AuditLogRepository } from "@/server/repositories/audit-repository";
import { toUuidOrNull } from "@/server/repositories/types";

export type AuditAction =
  | "admin.login.success"
  | "admin.login.failure"
  | "meta.sync.trigger"
  | "meta.sync.complete"
  | "meta.backfill.trigger"
  | "meta.sync.cancel"
  | "email.report.create"
  | "email.report.update"
  | "email.report.enable"
  | "email.report.disable"
  | "email.report.delete"
  | "email.recipient.add"
  | "email.recipient.update"
  | "email.recipient.remove"
  | "email.report.send"
  | "ai.conversation.create";

const SECRET_KEY_PARTS = ["token", "secret", "password", "apikey", "api_key", "authorization", "bearer", "cookie", "session"];

function isSecretKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  return SECRET_KEY_PARTS.some((part) => normalized.includes(part.replace(/[^a-z]/g, "")));
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (/^(EAA|sk-|ghp_|xox|resend_)/.test(value) || value.length > 200) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, isSecretKey(key) ? "[redacted]" : scrubValue(entry)])
    );
  }
  return value;
}

/** Drop credential-shaped metadata before it can reach the audit table. */
export function scrubAuditMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return scrubValue(metadata) as Record<string, unknown>;
}

export function hashForAudit(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

export type AuditEntry = {
  db: Database;
  agencyId: string;
  userId?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
  userAgentHash?: string | null;
};

/** Persist one audit record. Throws on DB failure — callers that must not fail should use auditLogSafe. */
export async function auditLog(entry: AuditEntry) {
  const repository = new AuditLogRepository({ db: entry.db, agencyId: entry.agencyId });
  const actorId = toUuidOrNull(entry.userId);
  const metadata = scrubAuditMetadata(entry.metadata ?? {});
  // Non-UUID actors (e.g. the bootstrap admin, which has no admin_users row)
  // cannot satisfy the user_id foreign key — keep them in metadata instead.
  if (entry.userId && !actorId && !("actor" in metadata)) {
    metadata.actor = entry.userId;
  }
  return repository.record({
    userId: actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    metadata,
    ipHash: entry.ipHash ?? null,
    userAgentHash: entry.userAgentHash ?? null
  });
}

/** Best-effort audit write: audit logging must never break the primary action. */
export async function auditLogSafe(entry: AuditEntry): Promise<void> {
  try {
    await auditLog(entry);
  } catch (error) {
    logger.warn("Audit log write failed", {
      action: entry.action,
      resourceType: entry.resourceType,
      errorName: error instanceof Error ? error.name : "unknown"
    });
  }
}

/** Hash raw request identifiers for privacy-preserving audit metadata. */
export function auditRequestHashes(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || null;
  return {
    ipHash: hashForAudit(ip),
    userAgentHash: hashForAudit(request.headers.get("user-agent"))
  };
}
