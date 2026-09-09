import { describe, expect, it } from "vitest";

import { assertSingleCurrency, formatCurrency } from "./format";

describe("currency utilities", () => {
  it("formats values in the account currency without converting", () => {
    expect(formatCurrency(1234.5, "USD", "en-US")).toBe("$1,234.50");
  });

  it("rejects silent mixed-currency aggregation", () => {
    expect(() => assertSingleCurrency(["USD", "BDT"])).toThrow("Cannot aggregate mixed currencies");
  });
});
