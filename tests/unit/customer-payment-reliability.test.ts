import { describe, expect, it } from "vitest";
import {
  getCustomerPaymentReliability,
  getCustomerPaymentReliabilityFromCounts
} from "../../src/lib/customer-payment-reliability";

describe("customer payment reliability", () => {
  it.each([
    [59, 41, "Late Payer"],
    [60, 40, "On-Time Payer"],
    [61, 39, "On-Time Payer"]
  ] as const)("classifies %i%% with integer threshold comparison", (onTimeCount, lateCount, label) => {
    expect(getCustomerPaymentReliabilityFromCounts({ onTimeCount, lateCount })).toMatchObject({
      label,
      onTimePercentage: onTimeCount
    });
  });

  it("uses explicit zero and limited-history states", () => {
    expect(getCustomerPaymentReliabilityFromCounts({ onTimeCount: 0, lateCount: 0 })).toMatchObject({
      label: "No Payment History",
      onTimePercentage: null,
      limitedHistory: false
    });
    expect(getCustomerPaymentReliabilityFromCounts({ onTimeCount: 1, lateCount: 1 })).toMatchObject({
      label: "Insufficient Payment History",
      onTimePercentage: null,
      limitedHistory: true
    });
  });

  it("requires a settled invoice, related Delivered evidence, and lookback eligibility", () => {
    const invoice = {
      status: "Paid",
      dueDate: new Date("2026-09-10T00:00:00.000Z"),
      remainingAmount: 0,
      payments: [{ paymentDate: new Date("2026-09-10T16:00:00.000Z"), amount: 100 }],
      deliveryNotes: [{ status: "Delivered" }],
      deliverySources: [],
      salesOrder: { deliveryNotes: [] }
    };
    const result = getCustomerPaymentReliability(
      { invoices: [invoice, { ...invoice, deliveryNotes: [] }] },
      new Date("2026-09-20T00:00:00.000Z")
    );
    expect(result).toMatchObject({
      eligibleInvoiceCount: 1,
      onTimeCount: 1,
      label: "Insufficient Payment History"
    });
  });
});
