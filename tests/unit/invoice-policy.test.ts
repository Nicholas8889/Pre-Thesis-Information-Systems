import { describe, expect, it } from "vitest";
import { canCancelInvoice, canGenerateInvoiceForOrder } from "../../src/lib/invoice-policy";

describe("invoice lifecycle policy", () => {
  it("only generates from a confirmed approved/not-required order without an invoice", () => {
    expect(canGenerateInvoiceForOrder({ status: "Confirmed", approvalStatus: "Approved", hasInvoice: false })).toBe(true);
    expect(canGenerateInvoiceForOrder({ status: "Confirmed", approvalStatus: "NotRequired", hasInvoice: false })).toBe(true);
    for (const input of [
      { status: "Draft", approvalStatus: "NotRequired", hasInvoice: false },
      { status: "Confirmed", approvalStatus: "Pending", hasInvoice: false },
      { status: "Cancelled", approvalStatus: "Rejected", hasInvoice: false },
      { status: "Confirmed", approvalStatus: "Approved", hasInvoice: true }
    ]) expect(canGenerateInvoiceForOrder(input)).toBe(false);
  });

  it("only cancels Unpaid invoices with zero paid amount and no payment rows", () => {
    expect(canCancelInvoice({ status: "Unpaid", paidAmount: 0, paymentCount: 0 })).toBe(true);
    expect(canCancelInvoice({ status: "Partial", paidAmount: 1, paymentCount: 1 })).toBe(false);
    expect(canCancelInvoice({ status: "Paid", paidAmount: 100, paymentCount: 1 })).toBe(false);
    expect(canCancelInvoice({ status: "Unpaid", paidAmount: 0, paymentCount: 1 })).toBe(false);
  });
});
