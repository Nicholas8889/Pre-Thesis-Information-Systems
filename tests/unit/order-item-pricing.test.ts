import { describe, expect, it } from "vitest";
import {
  calculateAdjustedUnitPriceBasisPoints,
  normalizeOrderItems,
  parseSalesOrderPaymentTerm
} from "../../src/lib/workflow";

describe("sales order product pricing", () => {
  it("recalculates adjusted Unit Price from Price, Markup, and Discount", () => {
    expect(
      normalizeOrderItems([
        {
          productId: "product-1",
          itemName: "Selected Product",
          quantity: 2,
          baseUnitPrice: 100000,
          markupPercent: 10,
          discountPercent: 5,
          finalUnitPrice: 1
        }
      ])
    ).toEqual([
      {
        productId: "product-1",
        itemName: "Selected Product",
        quantity: 2,
        baseUnitPrice: 100000,
        markupPercent: 10,
        discountPercent: 5,
        markupBasisPoints: 1000,
        discountBasisPoints: 500,
        finalUnitPrice: 105000
      }
    ]);
  });

  it("rejects items without a Product selection or with invalid percentages", () => {
    expect(
      normalizeOrderItems([
        { productId: "", quantity: 1, baseUnitPrice: 100000 },
        {
          productId: "product-1",
          quantity: 1,
          baseUnitPrice: 100000,
          markupPercent: 101,
          discountPercent: 0
        }
      ])
    ).toEqual([]);
  });

  it("rejects the whole payload when any line is invalid or overflows", () => {
    expect(normalizeOrderItems([
      { productId: "valid", quantity: 1, baseUnitPrice: 10_000 },
      { productId: "invalid", quantity: 0, baseUnitPrice: 10_000 }
    ])).toEqual([]);
    expect(normalizeOrderItems([
      { productId: "overflow", quantity: 1_000_001, baseUnitPrice: 10_000 }
    ])).toEqual([]);
  });

  it("calculates integer Rupiah from integer basis points", () => {
    expect(calculateAdjustedUnitPriceBasisPoints(1_200_000, 1_000, 500)).toBe(1_260_000);
    expect(calculateAdjustedUnitPriceBasisPoints(101, 50, 0)).toBe(102);
    expect(() => calculateAdjustedUnitPriceBasisPoints(100, -1, 0)).toThrow("INVALID_ORDER_PRICING");
  });

  it("parses payment terms as a strict discriminated union", () => {
    expect(parseSalesOrderPaymentTerm({
      paymentTermType: "IMMEDIATE", creditTerm: null, creditTermMonths: null, creditTermWeeks: null
    })).toEqual({ paymentTermType: "IMMEDIATE", creditTermMonths: null, creditTermWeeks: null });
    expect(parseSalesOrderPaymentTerm({
      paymentTermType: "CREDIT", creditTerm: "4w", creditTermMonths: null, creditTermWeeks: null
    })).toEqual({ paymentTermType: "CREDIT", creditTermMonths: null, creditTermWeeks: 4 });
    expect(parseSalesOrderPaymentTerm({
      paymentTermType: "IMMEDIATE", creditTerm: "1w", creditTermMonths: null, creditTermWeeks: null
    })).toBeNull();
    expect(parseSalesOrderPaymentTerm({
      paymentTermType: "CREDIT", creditTerm: "1w", creditTermMonths: "1", creditTermWeeks: null
    })).toBeNull();
    expect(parseSalesOrderPaymentTerm({
      paymentTermType: "CREDIT", creditTerm: "5w", creditTermMonths: null, creditTermWeeks: null
    })).toBeNull();
  });
});
