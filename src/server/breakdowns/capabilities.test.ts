import { describe, expect, it } from "vitest";

import { breakdownCapabilities, validateBreakdownRequest } from "./capabilities";

describe("breakdown capability metadata", () => {
  it("allows known supported Meta-compatible combinations", () => {
    expect(validateBreakdownRequest("age,gender", "ad")).toMatchObject({ supported: true });
    expect(validateBreakdownRequest("publisher_platform,platform_position", "campaign")).toMatchObject({ supported: true });
    expect(validateBreakdownRequest("hourly_stats_aggregated_by_advertiser_time_zone", "account")).toMatchObject({ supported: true });
  });

  it("rejects unknown or conditional combinations before provider calls", () => {
    expect(validateBreakdownRequest("age,publisher_platform", "account")).toMatchObject({ supported: false });
    expect(validateBreakdownRequest("hourly_stats_aggregated_by_audience_time_zone", "account")).toMatchObject({ supported: false });
  });

  it("documents hourly metric limitations", () => {
    const hourly = breakdownCapabilities.find((capability) => capability.key === "hourly_stats_aggregated_by_advertiser_time_zone");

    expect(hourly?.incompatibleFields).toContain("reach");
    expect(hourly?.incompatibleFields).toContain("frequency");
    expect(hourly?.incompatibleFields).toContain("video_*");
  });
});
