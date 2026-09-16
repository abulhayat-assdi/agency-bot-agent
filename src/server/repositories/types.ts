import type { Database } from "@/server/db/client";

export interface RepositoryContext {
  db: Database;
  agencyId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bootstrap sessions use placeholder actor ids (e.g. "bootstrap-admin") while
 * user-id columns are UUID foreign keys into admin_users (which has no
 * bootstrap row). Persist NULL for non-UUID actors instead of failing the
 * write; callers preserve the original string in metadata when it matters.
 */
export function toUuidOrNull(id: string | null | undefined): string | null {
  if (!id) return null;
  return UUID_RE.test(id) ? id : null;
}
