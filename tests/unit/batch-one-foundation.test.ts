import { describe, expect, it } from "vitest";
import {
  DELIVERY_DRIVER_OPTIONS,
  DELIVERY_VEHICLE_PLATE_OPTIONS,
  validateDeliveryAssignment
} from "../../src/lib/delivery-options";
import {
  isValidNormalizedNpwp,
  normalizeNpwp,
  parseOptionalNpwp
} from "../../src/lib/npwp";
import {
  buildOrderTaxSnapshot,
  calculateTaxInclusiveAmounts,
  DEFAULT_PPN_RATE_BASIS_POINTS,
  formatPpnRate,
  getConfiguredPpnRateBasisPoints
} from "../../src/lib/tax";

describe("Batch 1 foundation", () => {
  it("normalizes optional NPWP values and validates 15 or 16 digits", () => {
    expect(normalizeNpwp("01.234.567.8-901.234")).toBe("012345678901234");
    expect(normalizeNpwp(" 0123 4567 8901 2345 ")).toBe("0123456789012345");
    expect(parseOptionalNpwp("   ")).toEqual({ valid: true, value: null });
    expect(parseOptionalNpwp("01.234.567.8-901.234")).toEqual({
      valid: true,
      value: "012345678901234"
    });
    expect(isValidNormalizedNpwp("012345678901234")).toBe(true);
    expect(isValidNormalizedNpwp("0123456789012345")).toBe(true);
    expect(parseOptionalNpwp("01A2345678901234")).toMatchObject({
      valid: false,
      value: null
    });
  });

  it("uses an 11 percent default PPN rate and validates configuration", () => {
    expect(getConfiguredPpnRateBasisPoints("")).toBe(
      DEFAULT_PPN_RATE_BASIS_POINTS
    );
    expect(getConfiguredPpnRateBasisPoints("1200")).toBe(1200);
    expect(() => getConfiguredPpnRateBasisPoints("11.5")).toThrow(RangeError);
    expect(() => getConfiguredPpnRateBasisPoints("10001")).toThrow(RangeError);
  });

  it("extracts tax from an inclusive total and always reconciles to the total", () => {
    const amounts = calculateTaxInclusiveAmounts({
      totalAmount: 1_110_000,
      ppnApplied: true,
      ppnRateBasisPoints: 1100
    });

    expect(amounts).toEqual({
      ppnApplied: true,
      ppnRateBasisPoints: 1100,
      ppnAmount: 110_000,
      netSalesAmount: 1_000_000
    });
    expect(amounts.netSalesAmount + amounts.ppnAmount).toBe(1_110_000);
  });

  it("returns the full total as net sales when PPN does not apply", () => {
    expect(
      calculateTaxInclusiveAmounts({ totalAmount: 1_110_000, ppnApplied: false })
    ).toEqual({
      ppnApplied: false,
      ppnRateBasisPoints: 0,
      ppnAmount: 0,
      netSalesAmount: 1_110_000
    });
    expect(() =>
      calculateTaxInclusiveAmounts({ totalAmount: -1, ppnApplied: false })
    ).toThrow(RangeError);
  });

  it("exposes exactly two dummy drivers and two dummy vehicle plates", () => {
    expect(DELIVERY_DRIVER_OPTIONS).toEqual(["Budi Santoso", "Andi Pratama"]);
    expect(DELIVERY_VEHICLE_PLATE_OPTIONS).toEqual(["B 1234 TJK", "B 5678 CVT"]);
  });

  it("validates delivery assignment values against the shared allowlists", () => {
    expect(
      validateDeliveryAssignment({
        driverName: " Budi Santoso ",
        vehiclePlateNumber: "B 1234 TJK"
      })
    ).toEqual({
      valid: true,
      value: {
        driverName: "Budi Santoso",
        vehiclePlateNumber: "B 1234 TJK"
      },
      errors: {}
    });

    expect(
      validateDeliveryAssignment({
        driverName: "Unknown Driver",
        vehiclePlateNumber: ""
      })
    ).toEqual({
      valid: false,
      value: null,
      errors: {
        driverName: "Select a valid driver",
        vehiclePlateNumber: "Select a vehicle plate"
      }
    });
  });

  it("builds an immutable order tax snapshot from the server-side customer NPWP", () => {
    expect(
      buildOrderTaxSnapshot({
        totalAmount: 1_110_000,
        customerNpwp: "1234567890123456",
        ppnRateBasisPoints: 1100
      })
    ).toEqual({
      customerNpwpSnapshot: "1234567890123456",
      ppnApplied: true,
      ppnRateBasisPoints: 1100,
      ppnAmount: 110_000,
      netSalesAmount: 1_000_000
    });

    expect(
      buildOrderTaxSnapshot({
        totalAmount: 1_110_000,
        customerNpwp: null,
        ppnRateBasisPoints: 1100
      })
    ).toEqual({
      customerNpwpSnapshot: null,
      ppnApplied: false,
      ppnRateBasisPoints: 0,
      ppnAmount: 0,
      netSalesAmount: 1_110_000
    });
    expect(formatPpnRate(1100)).toBe("11%");
    expect(formatPpnRate(1125)).toBe("11.25%");
  });
});
