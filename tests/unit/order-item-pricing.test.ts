import { describe, expect, it } from "vitest";
import { normalizeOrderItems } from "../../src/lib/workflow";

describe("sales order product pricing", () => {
  it("recalculates adjusted Unit Price from Base Price, Markup, and Discount", () => {
    expect(
      normalizeOrderItems([
        {
          productId: "product-1",
          itemName: "Selected Product",
          quantity: 2,
          basePrice: 100000,
          markupPercent: 10,
          discountPercent: 5,
          unitPrice: 1
        }
      ])
    ).toEqual([
      {
        productId: "product-1",
        itemName: "Selected Product",
        quantity: 2,
        basePrice: 100000,
        markupPercent: 10,
        discountPercent: 5,
        unitPrice: 105000
      }
    ]);
  });

  it("rejects items without a Product selection or with invalid percentages", () => {
    expect(
      normalizeOrderItems([
        { productId: "", quantity: 1, basePrice: 100000 },
        {
          productId: "product-1",
          quantity: 1,
          basePrice: 100000,
          markupPercent: 101,
          discountPercent: 0
        }
      ])
    ).toEqual([]);
  });
});
