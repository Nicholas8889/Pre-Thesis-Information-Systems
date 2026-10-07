import { describe, expect, it } from "vitest";
import { canDeleteOngoingSalesOrder } from "../../src/lib/sales-order-deletion";

describe("ongoing sales order deletion", () => {
  it("allows only a disposable Draft without downstream evidence", () => {
    expect(
      canDeleteOngoingSalesOrder({
        salesOrderStatus: "Draft",
        deliveryNoteStatuses: []
      })
    ).toBe(true);
    expect(canDeleteOngoingSalesOrder({ salesOrderStatus: "Draft", deliveryNoteStatuses: [], hasInquiry: true })).toBe(false);
    expect(canDeleteOngoingSalesOrder({ salesOrderStatus: "Draft", deliveryNoteStatuses: [], hasItemRevisions: true })).toBe(false);
  });

  it("protects completed or cancelled processes", () => {
    expect(
      canDeleteOngoingSalesOrder({
        salesOrderStatus: "Invoiced",
        invoiceStatus: "Paid",
        deliveryNoteStatuses: []
      })
    ).toBe(false);
    expect(canDeleteOngoingSalesOrder({
      salesOrderStatus: "Invoiced",
      invoiceStatus: "Unpaid",
      deliveryNoteStatuses: []
    })).toBe(false);
    expect(
      canDeleteOngoingSalesOrder({
        salesOrderStatus: "Shipped",
        invoiceStatus: "Unpaid",
        deliveryNoteStatuses: ["Delivered"]
      })
    ).toBe(false);
  });
});
