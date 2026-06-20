import { describe, expect, it } from "vitest";
import {
  isDoneDeliveryNote,
  isDoneFollowUp,
  isDoneInvoice,
  isDoneReceivable,
  isDoneSalesOrder,
  isOngoingDeliveryNote,
  isOngoingFollowUp,
  isOngoingInvoice,
  isOngoingReceivable,
  isOngoingSalesOrder
} from "../../src/lib/process-status";

describe("process status helpers", () => {
  it("separates ongoing and done invoice statuses", () => {
    expect(isOngoingInvoice("Unpaid")).toBe(true);
    expect(isOngoingInvoice("Partial")).toBe(true);
    expect(isOngoingInvoice("Overdue")).toBe(true);
    expect(isDoneInvoice("Paid")).toBe(true);
    expect(isDoneInvoice("Cancelled")).toBe(true);
    expect(isOngoingInvoice("Paid")).toBe(false);
  });

  it("separates ongoing and done delivery note statuses", () => {
    expect(isOngoingDeliveryNote("Draft")).toBe(true);
    expect(isOngoingDeliveryNote("Issued")).toBe(true);
    expect(isDoneDeliveryNote("Delivered")).toBe(true);
    expect(isDoneDeliveryNote("Cancelled")).toBe(true);
    expect(isOngoingDeliveryNote("Delivered")).toBe(false);
  });

  it("separates ongoing and done sales order statuses", () => {
    expect(isOngoingSalesOrder("Draft")).toBe(true);
    expect(isOngoingSalesOrder("Confirmed")).toBe(true);
    expect(isOngoingSalesOrder("Invoiced")).toBe(true);
    expect(
      isDoneSalesOrder({
        status: "Invoiced",
        deliveryNoteCount: 1
      })
    ).toBe(true);
    expect(isDoneSalesOrder("Shipped")).toBe(true);
    expect(isDoneSalesOrder("Cancelled")).toBe(true);
    expect(
      isOngoingSalesOrder({
        status: "Invoiced",
        deliveryNoteCount: 1
      })
    ).toBe(false);
  });

  it("separates receivables by remaining amount and closed statuses", () => {
    expect(isOngoingReceivable({ status: "Unpaid", remainingAmount: 1000 })).toBe(true);
    expect(isOngoingReceivable({ status: "Partial", remainingAmount: 500 })).toBe(true);
    expect(isOngoingReceivable({ status: "Cancelled", remainingAmount: 500 })).toBe(false);
    expect(isDoneReceivable({ status: "Paid", remainingAmount: 0 })).toBe(true);
    expect(isDoneReceivable({ status: "Cancelled", remainingAmount: 500 })).toBe(true);
  });

  it("separates ongoing and done follow-up statuses", () => {
    expect(isOngoingFollowUp("Planned")).toBe(true);
    expect(isDoneFollowUp("Done")).toBe(true);
    expect(isDoneFollowUp("Cancelled")).toBe(true);
    expect(isOngoingFollowUp("Done")).toBe(false);
  });
});
