import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { logger } from "@/server/observability/logger";

// Applies pending Drizzle migrations using runtime dependencies only (drizzle-kit
// is a dev dependency and absent from the production image). Idempotent: the
// web service runs it on every start before serving traffic.
// No top-level await: the production image runs scripts as CJS through tsx.
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.error("Cannot run migrations because DATABASE_URL is not configured");
    process.exit(1);
  }

  const client = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    logger.info("Database migrations are up to date");
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  logger.error("Database migration failed", {
    errorName: error instanceof Error ? error.name : "unknown",
    errorMessage: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
