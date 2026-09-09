import { describe, expect, it } from "vitest";

import { formatDateRange, getZonedDateString, hourLabel, previousEquivalentPeriod, resolveDatePreset } from "./reporting";

describe("account timezone reporting dates", () => {
  it("uses the account timezone instead of the server timezone", () => {
    const instant = new Date("2026-09-09T20:30:00.000Z");

    expect(getZonedDateString(instant, "Asia/Dhaka")).toBe("2026-09-10");
    expect(getZonedDateString(instant, "America/New_York")).toBe("2026-09-09");
  });

  it("resolves date presets in the account timezone", () => {
    const range = resolveDatePreset("last_7_days", "Asia/Dhaka", new Date("2026-09-09T20:30:00.000Z"));

    expect(range).toEqual({ since: "2026-09-04", until: "2026-09-10", timezone: "Asia/Dhaka" });
  });

  it("calculates previous equivalent periods", () => {
    expect(previousEquivalentPeriod({ since: "2026-09-04", until: "2026-09-10", timezone: "Asia/Dhaka" })).toEqual({
      since: "2026-08-28",
      until: "2026-09-03",
      timezone: "Asia/Dhaka"
    });
  });

  it("formats report date context and hourly labels", () => {
    expect(formatDateRange({ since: "2026-09-01", until: "2026-09-07", timezone: "Asia/Dhaka" })).toBe(
      "2026-09-01 – 2026-09-07 (Asia/Dhaka)"
    );
    expect(hourLabel(9)).toBe("09:00–09:59");
  });
});
