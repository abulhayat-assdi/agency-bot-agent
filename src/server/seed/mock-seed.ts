import { getDatabase, closeDatabaseConnection } from "@/server/db/client";
import { AgencyRepository } from "@/server/repositories/agency-repository";
import { ClientRepository } from "@/server/repositories/client-repository";
import { AdAccountRepository } from "@/server/repositories/ad-account-repository";
import { logger } from "@/server/observability/logger";

export async function seedMockData() {
  const db = getDatabase();
  const agencyRepo = new AgencyRepository(db);
  const agency = await agencyRepo.upsert({
    name: "Demo Performance Agency",
    slug: "demo-performance-agency",
    timezone: "Asia/Dhaka"
  });

  const clientRepo = new ClientRepository({ db, agencyId: agency.id });
  const client = await clientRepo.upsert({
    name: "Northstar Commerce",
    slug: "northstar-commerce",
    status: "active",
    defaultTimezone: "Asia/Dhaka",
    notes: "Mock seed client for local analytics development."
  });

  const accountRepo = new AdAccountRepository({ db, agencyId: agency.id });
  const account = await accountRepo.upsert({
    clientId: client.id,
    providerMode: "mock",
    metaAccountId: "act_100000000000001",
    name: "Northstar Commerce - BD",
    currency: "BDT",
    timezone: "Asia/Dhaka",
    status: "active",
    accessStatus: "connected",
    connectionMetadata: {
      source: "mock-seed",
      readOnly: true,
      oauthReady: true
    }
  });

  logger.info("mock seed completed", { agencyId: agency.id, clientId: client.id, adAccountId: account.id });

  return { agency, client, account };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedMockData()
    .catch((error) => {
      logger.error("mock seed failed", { message: error instanceof Error ? error.message : "unknown" });
      process.exitCode = 1;
    })
    .finally(() => closeDatabaseConnection());
}
