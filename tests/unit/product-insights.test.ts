import { describe, expect, it } from "vitest";
import { buildPopularProducts } from "../../src/lib/product-insights";

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
});
