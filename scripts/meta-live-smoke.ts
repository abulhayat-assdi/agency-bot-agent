/**
 * Safe optional live Meta Graph API smoke test.
 *
 * Runs only when META_LIVE_TEST=true and META_SYSTEM_USER_ACCESS_TOKEN exists.
 * Verifies /me, /me/adaccounts, and one Insights request, then exits.
 * Never prints tokens or secrets.
 */
import { getAppConfig } from "../src/server/config/env";
import { createGraphApiMetaAdsProvider } from "../src/server/meta/adapters/graph-api/graph-api-provider";

async function main() {
  const config = getAppConfig(process.env);

  if (process.env.META_LIVE_TEST !== "true") {
    console.log("META_LIVE_TEST is not true; skipping live Meta smoke test.");
    return;
  }

  if (!config.META_SYSTEM_USER_ACCESS_TOKEN) {
    console.error("META_SYSTEM_USER_ACCESS_TOKEN is required for the live smoke test.");
    process.exit(2);
  }

  const provider = createGraphApiMetaAdsProvider({
    accessToken: config.META_SYSTEM_USER_ACCESS_TOKEN,
    appSecret: config.META_APP_SECRET,
    graphApiVersion: config.META_GRAPH_API_VERSION,
    maxRetries: 1
  });

  const user = await provider.getCurrentUser();
  console.log(`Live /me OK (id length ${user.id.length}, name length ${user.name.length}).`);

  const accounts = await provider.listAdAccounts({ limit: 5 });
  console.log(`Live /me/adaccounts OK (${accounts.data.length} account(s) on first page).`);

  const first = accounts.data[0];
  if (!first) {
    console.log("No accessible ad accounts; smoke test ends here.");
    return;
  }

  const insights = await provider.getInsights({
    accountId: first.id,
    level: "account",
    dateRange: { since: "2026-08-14", until: "2026-09-12" },
    datePreset: undefined
  });
  console.log(`Live insights OK (${insights.data.length} row(s) for ${first.id}, ${first.currency}, ${first.timezone}).`);
  console.log("Live Meta smoke test passed without exposing secrets.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.slice(0, 300) : "Unknown live smoke error";
  // Never print tokens: only a truncated safe message.
  console.error(`Live Meta smoke test failed: ${message.replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")}`);
  process.exit(1);
});
