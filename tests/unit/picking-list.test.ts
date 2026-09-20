import { describe, expect, it } from "vitest";
import {
  canCreateDeliveryFromPickingList,
  canCreatePickingList,
  canFulfillOrder,
  getPickingTotals,
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
  it.each(["IMMEDIATE", "CREDIT"] as const)(
    "allows %s picking regardless of payment progress",
    (paymentTermType) => {
      for (const status of ["Unpaid", "Partial", "Overdue", "Paid"]) {
        for (const approvalStatus of ["Approved", "NotRequired"]) {
          const order = {
            ...readyOrder,
            approvalStatus,
            invoice: { status, paymentTermType },
          };
          expect(canFulfillOrder(order)).toBe(true);
          expect(canCreatePickingList(order)).toBe(true);
        }
      }
    },
  );

  it.each(["IMMEDIATE", "CREDIT"] as const)(
    "blocks cancelled %s invoices",
    (paymentTermType) => {
      const order = {
        ...readyOrder,
        invoice: { status: "Cancelled", paymentTermType },
      };
      expect(canFulfillOrder(order)).toBe(false);
      expect(canCreatePickingList(order)).toBe(false);
    },
  );

  it.each(["Pending", "Rejected"])(
    "blocks %s approval",
    (approvalStatus) => {
      expect(canCreatePickingList({ ...readyOrder, approvalStatus })).toBe(
        false,
      );
    },
  );

  it.each(["Draft", "Cancelled", "Shipped"])(
    "blocks %s orders",
    (status) => {
      expect(canCreatePickingList({ ...readyOrder, status })).toBe(false);
    },
  );

  it("blocks missing invoices and already-started fulfillment", () => {
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

describe("Pick & Pack quantity verification", () => {
  it("allows partial progress but does not complete until available stock is packed", () => {
    const items = [
      {
        orderedQuantity: 10,
        availableQuantity: 7,
        packedQuantity: 5,
        availabilityStatus: "Partial",
        notes: "Three units unavailable",
      },
    ];
    expect(validatePickingQuantities(items)).toBe(true);
    expect(isPickingComplete(items)).toBe(false);
  });

  it("allows completion with a documented shortage", () => {
    const items = [
      {
        orderedQuantity: 10,
        availableQuantity: 7,
        packedQuantity: 7,
        availabilityStatus: "Partial",
        notes: "Three units unavailable",
      },
      {
        orderedQuantity: 5,
        availableQuantity: 0,
        packedQuantity: 0,
        availabilityStatus: "Unavailable",
        notes: "Awaiting supplier",
      },
    ];
    expect(isPickingComplete(items)).toBe(true);
    expect(canCreateDeliveryFromPickingList(items)).toBe(true);
    expect(getPickingTotals(items)).toEqual({
      ordered: 15,
      available: 7,
      packed: 7,
      shortage: 8,
    });
  });

  it("requires a note for every shortage", () => {
    expect(
      isPickingComplete([
        {
          orderedQuantity: 10,
          availableQuantity: 7,
          packedQuantity: 7,
          availabilityStatus: "Partial",
          notes: " ",
        },
      ]),
    ).toBe(false);
  });

  it("records an all-unavailable result but does not allow Surat Jalan", () => {
    const items = [
      {
        orderedQuantity: 10,
        availableQuantity: 0,
        packedQuantity: 0,
        availabilityStatus: "Unavailable",
        notes: "Out of stock",
      },
    ];
    expect(isPickingComplete(items)).toBe(true);
    expect(canCreateDeliveryFromPickingList(items)).toBe(false);
  });

  it.each([
    {
      orderedQuantity: 10,
      availableQuantity: 11,
      packedQuantity: 10,
      availabilityStatus: "Available",
    },
    {
      orderedQuantity: 10,
      availableQuantity: 8,
      packedQuantity: 9,
      availabilityStatus: "Partial",
    },
    {
      orderedQuantity: 10,
      availableQuantity: -1,
      packedQuantity: 0,
      availabilityStatus: "Unavailable",
    },
    {
      orderedQuantity: 10,
      availableQuantity: 2.5,
      packedQuantity: 2,
      availabilityStatus: "Partial",
    },
    {
      orderedQuantity: 10,
      availableQuantity: 0,
      packedQuantity: 0,
      availabilityStatus: "Available",
    },
    {
      orderedQuantity: 10,
      availableQuantity: 10,
      packedQuantity: 0,
      availabilityStatus: "Unchecked",
    },
    {
      orderedQuantity: 0,
      availableQuantity: 0,
      packedQuantity: 0,
      availabilityStatus: "Unavailable",
    },
  ])("rejects invalid quantities or inconsistent availability %o", (item) => {
    expect(validatePickingQuantities([item])).toBe(false);
    expect(isPickingComplete([item])).toBe(false);
  });

  it("completes a fully available and packed list", () => {
    const complete = {
      orderedQuantity: 10,
      availableQuantity: 10,
      packedQuantity: 10,
      availabilityStatus: "Available",
      notes: null,
    };
    expect(isPickingComplete([complete])).toBe(true);
    expect(canCreateDeliveryFromPickingList([complete])).toBe(true);
    expect(isPickingComplete([])).toBe(false);
  });
});
