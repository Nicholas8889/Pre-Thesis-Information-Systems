import { describe, expect, it } from "vitest";
import {
  calculateTaxInclusiveAmounts,
  DEFAULT_PPN_RATE_BASIS_POINTS,
  getConfiguredPpnRateBasisPoints
} from "../../src/lib/tax";

describe("integer Rupiah tax policy", () => {
  it("uses the explicit 1100 bps default only for empty configuration", () => {
    expect(getConfiguredPpnRateBasisPoints(undefined)).toBe(DEFAULT_PPN_RATE_BASIS_POINTS);
    expect(getConfiguredPpnRateBasisPoints("   ")).toBe(DEFAULT_PPN_RATE_BASIS_POINTS);
    for (const value of ["11.5", "invalid", "-1", "10001"]) {
      expect(() => getConfiguredPpnRateBasisPoints(value)).toThrow();
    }
  });

  it.each([1, 10_001, 3_420_000])("reconciles net plus tax exactly to gross Rp%i", gross => {
    const tax = calculateTaxInclusiveAmounts({ totalAmount: gross, ppnApplied: true, ppnRateBasisPoints: 1100 });
    expect(tax.netSalesAmount + tax.ppnAmount).toBe(gross);
    expect(Number.isSafeInteger(tax.netSalesAmount)).toBe(true);
    expect(Number.isSafeInteger(tax.ppnAmount)).toBe(true);
  });
});
