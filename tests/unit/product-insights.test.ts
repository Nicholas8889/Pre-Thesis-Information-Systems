import { describe, expect, it } from "vitest";
import {
  buildPopularProducts,
  getCurrentMonthAverageSoldPrice,
  getJakartaCurrentMonthWindow,
  getProductPriceComparison
} from "../../src/lib/product-insights";

describe("buildPopularProducts", () => {
  it("combines matching products and returns the top five by quantity", () => {
    const result = buildPopularProducts([
      { itemName: "Product A", quantity: 3 },
      { itemName: " product a ", quantity: 4 },
      { itemName: "Product B", quantity: 10 },
      { itemName: "Product C", quantity: 6 },
      { itemName: "Product D", quantity: 5 },
      { itemName: "Product E", quantity: 4 },
      { itemName: "Product F", quantity: 2 }
    ]);

    expect(result).toEqual([
      { name: "Product B", quantity: 10 },
      { name: "Product A", quantity: 7 },
      { name: "Product C", quantity: 6 },
      { name: "Product D", quantity: 5 },
      { name: "Product E", quantity: 4 }
    ]);
  });

  it("ignores blank products and non-positive quantities", () => {
    expect(
      buildPopularProducts([
        { itemName: "", quantity: 5 },
        { itemName: "Product A", quantity: 0 },
        { itemName: "Product B", quantity: -2 }
      ])
    ).toEqual([]);
  });

  it("calculates a quantity-weighted average final sold price", () => {
    const result = getCurrentMonthAverageSoldPrice(
      "product-1",
      [
        soldItem({ quantity: 1, subtotal: 100 }),
        soldItem({ quantity: 3, subtotal: 240, status: "Shipped" }),
        soldItem({ productId: "product-2", quantity: 10, subtotal: 10_000 })
      ],
      new Date("2026-08-12T05:00:00.000Z")
    );

    expect(result).toMatchObject({
      averageSoldPrice: 85,
      eligibleQuantity: 4,
      eligibleSalesValue: 340,
      monthLabel: "August 2026"
    });
  });

  it("filters ineligible statuses and respects Jakarta calendar-month boundaries", () => {
    const now = new Date("2026-08-12T05:00:00.000Z");
    const window = getJakartaCurrentMonthWindow(now);
    const result = getCurrentMonthAverageSoldPrice(
      "product-1",
      [
        soldItem({ orderDate: window.monthStart, quantity: 2, subtotal: 101 }),
        soldItem({ orderDate: new Date(window.monthStart.getTime() - 1) }),
        soldItem({ orderDate: new Date(now.getTime() + 1), quantity: 50, subtotal: 50_000 }),
        soldItem({ orderDate: window.nextMonthStart }),
        soldItem({ status: "Draft" }),
        soldItem({ status: "Cancelled" })
      ],
      now
    );

    expect(window.monthStart.toISOString()).toBe("2026-07-31T17:00:00.000Z");
    expect(window.nextMonthStart.toISOString()).toBe("2026-08-31T17:00:00.000Z");
    expect(result).toMatchObject({
      averageSoldPrice: 51,
      eligibleQuantity: 2,
      eligibleSalesValue: 101
    });
  });

  it("returns a null average when there are no eligible current-month sales", () => {
    expect(
      getCurrentMonthAverageSoldPrice(
        "product-1",
        [soldItem({ status: "Cancelled" })],
        new Date("2026-08-12T05:00:00.000Z")
      )
    ).toMatchObject({
      averageSoldPrice: null,
      eligibleQuantity: 0,
      eligibleSalesValue: 0,
      monthLabel: "August 2026"
    });
  });

  it("compares the proposed final unit price with the current-month average", () => {
    expect(getProductPriceComparison(120, 100)).toEqual({
      absoluteDifference: 20,
      percentageDifference: 20
    });
    expect(getProductPriceComparison(75, 100)).toEqual({
      absoluteDifference: -25,
      percentageDifference: -25
    });
  });

  it("does not invent a price comparison without a usable average", () => {
    expect(getProductPriceComparison(120, null)).toEqual({
      absoluteDifference: null,
      percentageDifference: null
    });
    expect(getProductPriceComparison(120, 0)).toEqual({
      absoluteDifference: 120,
      percentageDifference: null
    });
  });
});

function soldItem(
  overrides: Partial<{
    productId: string | null;
    quantity: number;
    subtotal: number;
    orderDate: Date;
    status: string;
  }> = {}
) {
  const {
    orderDate = new Date("2026-08-01T05:00:00.000Z"),
    status = "Confirmed",
    ...itemOverrides
  } = overrides;

  return {
    productId: "product-1",
    quantity: 1,
    subtotal: 100,
    ...itemOverrides,
    salesOrder: { orderDate, status }
  };
}
