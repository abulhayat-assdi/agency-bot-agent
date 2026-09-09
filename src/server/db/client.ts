import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { getAppConfig } from "@/server/config/env";

export type Database = PostgresJsDatabase<typeof schema>;

let cached: { client: postgres.Sql; db: Database } | undefined;

export function createDatabaseClient(databaseUrl = getAppConfig().DATABASE_URL): { client: postgres.Sql; db: Database } {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database operations");
  }

  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false
  });

  return { client, db: drizzle(client, { schema }) };
}

export function getDatabase(): Database {
  if (!cached) {
    cached = createDatabaseClient();
  }

  return cached.db;
}

export async function closeDatabaseConnection() {
  if (cached) {
    await cached.client.end({ timeout: 5 });
    cached = undefined;
  }
}
