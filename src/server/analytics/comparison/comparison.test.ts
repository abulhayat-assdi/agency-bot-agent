import { describe, expect, it } from "vitest";

import { compareMetric, metricValue } from "@/server/analytics";

describe("comparison engine", () => {
  it("calculates absolute and percentage change", () => {
    const comparison = compareMetric(metricValue(150), metricValue(100));

    expect(comparison.absoluteChange.value).toBe(50);
    expect(comparison.percentageChange.value).toBe(50);
    expect(comparison.direction).toBe("up");
  });

  it("handles zero comparison values without invalid percentage change", () => {
    const comparison = compareMetric(metricValue(10), metricValue(0));

    expect(comparison.absoluteChange.value).toBe(10);
    expect(comparison.percentageChange.value).toBeNull();
    expect(comparison.percentageChange.state).toBe("insufficient_data");
    expect(comparison.direction).toBe("up");
  });

  it("refuses unavailable comparisons", () => {
    const comparison = compareMetric(metricValue(null, "unavailable"), metricValue(100));

    expect(comparison.direction).toBe("not_comparable");
    expect(comparison.absoluteChange.value).toBeNull();
  });
});
