import { describe, expect, it } from "vitest";
import { getOppositeCustomerStatus } from "../../src/lib/customer-status";

describe("customer status detail action", () => {
  it("switches active customers to inactive and back", () => {
    expect(getOppositeCustomerStatus("Active")).toBe("Inactive");
    expect(getOppositeCustomerStatus("Inactive")).toBe("Active");
  });
});
