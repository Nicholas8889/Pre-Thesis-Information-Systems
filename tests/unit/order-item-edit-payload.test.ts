import { describe, expect, it } from "vitest";
import { parseOrderItemEditLines } from "../../src/lib/order-item-edit-payload";

describe("item-only edit payload", () => {
  it("accepts quantity/product edits and new rows with stable original row IDs", () => {
    expect(parseOrderItemEditLines([{ itemId: " line ", productId: " product ", quantity: 2 }, { productId: "new", quantity: 1 }])).toEqual([
      { itemId: "line", productId: "product", quantity: 2 }, { itemId: null, productId: "new", quantity: 1 },
    ]);
  });
  it("can retain a legacy product-less existing row", () => {
    expect(parseOrderItemEditLines([{ itemId: "legacy", productId: null, quantity: 2 }])).not.toBeNull();
  });
  it.each(["baseUnitPrice", "finalUnitPrice", "discountPercent", "customerId", "paymentTermType", "revisionNumber", "packStartedAt", "itemName", "actorUserId"])("rejects forged %s", field => {
    expect(parseOrderItemEditLines([{ itemId: "line", productId: "p", quantity: 2, [field]: "forged" }])).toBeNull();
  });
  it.each([0, -1, 1.5, 1_000_001, "2", null, Number.NaN])("rejects invalid quantity %s", quantity => {
    expect(parseOrderItemEditLines([{ productId: "p", quantity }])).toBeNull();
  });
  it("rejects empty transactions, missing products, duplicate row IDs and malformed rows", () => {
    for (const value of [[], {}, [null], [{ productId: null, quantity: 1 }], [{ productId: "", quantity: 1 }], [{ productId: "p", quantity: 1 }, { itemId: "x", productId: "p", quantity: 1 }, { itemId: "x", productId: "p", quantity: 1 }]]) {
      expect(parseOrderItemEditLines(value)).toBeNull();
    }
  });
});
