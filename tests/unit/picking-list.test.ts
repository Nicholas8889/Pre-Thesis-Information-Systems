import { describe, expect, it } from "vitest";
import {
  canCreatePickingList,
  canFulfillOrder,
  isPickingComplete,
  validatePickingQuantities,
} from "../../src/lib/picking-list";

const readyOrder = {
  status: "Invoiced",
  approvalStatus: "Approved",
  invoice: { status: "Unpaid", paymentTermType: "CREDIT" as const },
  hasPickingList: false,
  deliveryNoteCount: 0,
};

describe("warehouse eligibility", () => {
  it.each(["IMMEDIATE", "CREDIT"] as const)("allows %s picking regardless of payment progress", (paymentTermType) => {
    for (const status of ["Unpaid", "Partial", "Overdue", "Paid"]) {
      for (const approvalStatus of ["Approved", "NotRequired"]) {
        const order = { ...readyOrder, approvalStatus, invoice: { status, paymentTermType } };
        expect(canFulfillOrder(order)).toBe(true);
        expect(canCreatePickingList(order)).toBe(true);
      }
    }
  });
  it.each(["IMMEDIATE", "CREDIT"] as const)("blocks cancelled %s invoices", (paymentTermType) => {
    const order = { ...readyOrder, invoice: { status: "Cancelled", paymentTermType } };
    expect(canFulfillOrder(order)).toBe(false);
    expect(canCreatePickingList(order)).toBe(false);
  });
  it.each(["Pending", "Rejected"])("blocks %s approval", (approvalStatus) => {
    expect(canCreatePickingList({ ...readyOrder, approvalStatus })).toBe(false);
  });
  it.each(["Draft", "Cancelled", "Shipped"])("blocks %s orders", (status) => {
    expect(canCreatePickingList({ ...readyOrder, status })).toBe(false);
  });
  it("blocks missing/cancelled credit invoices and already-started fulfillment", () => {
    expect(canCreatePickingList({ ...readyOrder, invoice: null })).toBe(false);
    expect(
      canCreatePickingList({
        ...readyOrder,
        invoice: { status: "Cancelled", paymentTermType: "CREDIT" },
      }),
    ).toBe(false);
    expect(canCreatePickingList({ ...readyOrder, hasPickingList: true })).toBe(
      false,
    );
    expect(canCreatePickingList({ ...readyOrder, deliveryNoteCount: 1 })).toBe(
      false,
    );
  });
});

describe("picking quantity verification", () => {
  it("allows partial progress but cannot mark it Packed", () => {
    const items = [
      { orderedQuantity: 10, pickedQuantity: 7, packedQuantity: 5 },
    ];
    expect(validatePickingQuantities(items)).toBe(true);
    expect(isPickingComplete(items)).toBe(false);
  });
  it.each([
    { orderedQuantity: 10, pickedQuantity: 11, packedQuantity: 10 },
    { orderedQuantity: 10, pickedQuantity: 8, packedQuantity: 9 },
    { orderedQuantity: 10, pickedQuantity: -1, packedQuantity: 0 },
    { orderedQuantity: 10, pickedQuantity: 2.5, packedQuantity: 2 },
    { orderedQuantity: 10, pickedQuantity: NaN, packedQuantity: 0 },
    { orderedQuantity: 0, pickedQuantity: 0, packedQuantity: 0 },
  ])("rejects invalid quantities %o", (item) => {
    expect(validatePickingQuantities([item])).toBe(false);
    expect(isPickingComplete([item])).toBe(false);
  });
  it("requires every line to be complete and rejects empty lists", () => {
    const complete = {
      orderedQuantity: 10,
      pickedQuantity: 10,
      packedQuantity: 10,
    };
    expect(isPickingComplete([complete])).toBe(true);
    expect(
      isPickingComplete([
        complete,
        { orderedQuantity: 5, pickedQuantity: 5, packedQuantity: 0 },
      ]),
    ).toBe(false);
    expect(isPickingComplete([])).toBe(false);
  });
});
