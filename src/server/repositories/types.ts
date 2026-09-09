import type { Database } from "@/server/db/client";

export interface RepositoryContext {
  db: Database;
  agencyId: string;
}
