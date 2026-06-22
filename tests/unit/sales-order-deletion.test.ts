import { describe, expect, it } from "vitest";
import { canDeleteOngoingSalesOrder } from "../../src/lib/sales-order-deletion";

describe("ongoing sales order deletion", () => {
  it("allows draft, unpaid, partial, and overdue processes", () => {
    expect(
      canDeleteOngoingSalesOrder({
        salesOrderStatus: "Draft",
        deliveryNoteStatuses: []
      })
    ).toBe(true);
    expect(
      canDeleteOngoingSalesOrder({
        salesOrderStatus: "Invoiced",
        invoiceStatus: "Partial",
        deliveryNoteStatuses: ["Issued"]
      })
    ).toBe(true);
  });

  it("protects completed or cancelled processes", () => {
    expect(
      canDeleteOngoingSalesOrder({
        salesOrderStatus: "Invoiced",
        invoiceStatus: "Paid",
        deliveryNoteStatuses: []
      })
    ).toBe(false);
    expect(
      canDeleteOngoingSalesOrder({
        salesOrderStatus: "Shipped",
        invoiceStatus: "Unpaid",
        deliveryNoteStatuses: ["Delivered"]
      })
    ).toBe(false);
  });
});
