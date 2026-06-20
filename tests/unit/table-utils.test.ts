import { describe, expect, it } from "vitest";
import {
  compareTableValues,
  parseTableDate,
  parseTableNumber,
  shouldOfferCheckboxFilter
} from "../../src/lib/table-utils";

describe("table sorting and filtering utilities", () => {
  it("parses displayed dates for range filtering", () => {
    expect(parseTableDate("20/06/2026")?.getFullYear()).toBe(2026);
    expect(parseTableDate("20 Jun 2026")?.getMonth()).toBe(5);
    expect(parseTableDate("-")).toBeNull();
  });

  it("parses currency and quantity values", () => {
    expect(parseTableNumber("Rp 1.250.000")).toBe(1250000);
    expect(parseTableNumber("15 records")).toBe(15);
  });

  it("sorts dates, numbers, and text values", () => {
    expect(compareTableValues("2", "10")).toBeLessThan(0);
    expect(compareTableValues("Alpha", "Beta")).toBeLessThan(0);
    expect(compareTableValues("01 Jun 2026", "20 Jun 2026")).toBeLessThan(0);
  });

  it("offers checkbox filters only when values repeat meaningfully", () => {
    expect(shouldOfferCheckboxFilter(["Paid", "Paid", "Unpaid", "Paid"])).toBe(true);
    expect(shouldOfferCheckboxFilter(["INV-001", "INV-002", "INV-003"])).toBe(false);
    expect(shouldOfferCheckboxFilter(["Only one"])).toBe(false);
  });
});
