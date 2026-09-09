import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { adAccounts, breakdownMetricDaily, metricDaily, rawIngestionRecords } from "./schema";

describe("database schema", () => {
  it("defines core provenance and analytics tables", () => {
    expect(getTableName(adAccounts)).toBe("ad_accounts");
    expect(getTableName(rawIngestionRecords)).toBe("raw_ingestion_records");
    expect(getTableName(metricDaily)).toBe("metric_daily");
    expect(getTableName(breakdownMetricDaily)).toBe("breakdown_metric_daily");
  });
});
