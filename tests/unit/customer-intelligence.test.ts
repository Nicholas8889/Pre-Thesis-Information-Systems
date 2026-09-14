import { describe, expect, it } from "vitest";
import {
  buildCustomerInsights,
  getCustomerPaymentBehaviour,
  getCustomerPaymentSummary
} from "../../src/lib/customer-intelligence";

type InvoiceBalance = Parameters<typeof getCustomerPaymentSummary>[0]["invoices"][number];

function invoiceBalance(overrides: Partial<InvoiceBalance> = {}): InvoiceBalance {
  return {
    status: "Unpaid", remainingAmount: 100, deliveryNotes: [],
    salesOrder: { deliveryNotes: [] }, ...overrides
  };
}

describe("customer intelligence", () => {
  const now = new Date("2026-06-19T05:00:00.000Z");

  it("is clean when there are no outstanding delivered invoices", () => {
    expect(getCustomerPaymentSummary({ invoices: [] })).toEqual({
      paymentStatus: "Clean", outstandingAmount: 0, openInvoiceCount: 0
    });
    expect(getCustomerPaymentSummary({ invoices: [invoiceBalance()] }).paymentStatus).toBe("Clean");
  });

  it.each(["Draft", "Issued", "Cancelled"])("does not count an overdue invoice when its Surat Jalan is %s", (status) => {
    expect(getCustomerPaymentSummary({ invoices: [
      invoiceBalance({ status: "Overdue", deliveryNotes: [{ status }] })
    ] })).toEqual({ paymentStatus: "Clean", outstandingAmount: 0, openInvoiceCount: 0 });
  });

  it("counts the remaining invoice balance after delivery even before the due date", () => {
    const invoice = {
      ...invoiceBalance({ remainingAmount: 1_850_000, deliveryNotes: [{ status: "Delivered" }] }),
      dueDate: new Date("2099-12-31")
    };
    expect(getCustomerPaymentSummary({ invoices: [invoice] })).toEqual({
      paymentStatus: "Outstanding Payment", outstandingAmount: 1_850_000, openInvoiceCount: 1
    });
  });

  it("sums only partial and overdue balances with delivered shipments", () => {
    expect(getCustomerPaymentSummary({ invoices: [
      invoiceBalance({ status: "Partial", remainingAmount: 300_000, deliveryNotes: [{ status: "Delivered" }] }),
      invoiceBalance({ status: "Overdue", remainingAmount: 450_000, deliveryNotes: [{ status: "Delivered" }] }),
      invoiceBalance({ status: "Overdue", remainingAmount: 900_000 })
    ] })).toEqual({
      paymentStatus: "Outstanding Payment", outstandingAmount: 750_000, openInvoiceCount: 2
    });
  });

  it("excludes cancelled invoices and non-positive balances even after delivery", () => {
    expect(getCustomerPaymentSummary({ invoices: [
      invoiceBalance({ status: "Cancelled", remainingAmount: 900_000, deliveryNotes: [{ status: "Delivered" }] }),
      invoiceBalance({ status: "Paid", remainingAmount: 0, deliveryNotes: [{ status: "Delivered" }] }),
      invoiceBalance({ status: "Paid", remainingAmount: -10_000, deliveryNotes: [{ status: "Delivered" }] })
    ] })).toEqual({ paymentStatus: "Clean", outstandingAmount: 0, openInvoiceCount: 0 });
  });

  it("counts a Surat Jalan linked only through the invoice's Sales Order", () => {
    expect(getCustomerPaymentSummary({ invoices: [
      invoiceBalance({ salesOrder: { deliveryNotes: [{ status: "Delivered", invoiceId: null }] } })
    ] })).toEqual({ paymentStatus: "Outstanding Payment", outstandingAmount: 100, openInvoiceCount: 1 });
  });

  it("does not use a Sales Order delivery linked explicitly to another invoice", () => {
    expect(getCustomerPaymentSummary({ invoices: [
      invoiceBalance({ salesOrder: { deliveryNotes: [{ status: "Delivered", invoiceId: "other-invoice" }] } })
    ] }).paymentStatus).toBe("Clean");
  });

  it("counts the full remaining balance once when any of several Surat Jalan is delivered", () => {
    expect(getCustomerPaymentSummary({ invoices: [
      invoiceBalance({
        remainingAmount: 1_850_000,
        deliveryNotes: [{ status: "Issued" }, { status: "Delivered" }, { status: "Delivered" }],
        salesOrder: { deliveryNotes: [{ status: "Delivered", invoiceId: null }] }
      })
    ] })).toEqual({ paymentStatus: "Outstanding Payment", outstandingAmount: 1_850_000, openInvoiceCount: 1 });
  });

  it("stops counting an invoice when its only delivered shipment is reverted", () => {
    const invoice = invoiceBalance({ deliveryNotes: [{ status: "Delivered" }] });
    expect(getCustomerPaymentSummary({ invoices: [invoice] }).paymentStatus).toBe("Outstanding Payment");
    invoice.deliveryNotes[0].status = "Issued";
    expect(getCustomerPaymentSummary({ invoices: [invoice] }).paymentStatus).toBe("Clean");
  });

  it("returns to Clean on settlement regardless of past lateness", () => {
    const invoice = invoiceBalance({ status: "Overdue", remainingAmount: 500_000, deliveryNotes: [{ status: "Delivered" }] });
    expect(getCustomerPaymentSummary({ invoices: [invoice] }).paymentStatus).toBe("Outstanding Payment");
    invoice.remainingAmount = 0;
    invoice.status = "Paid";
    expect(getCustomerPaymentSummary({ invoices: [invoice] })).toEqual({
      paymentStatus: "Clean", outstandingAmount: 0, openInvoiceCount: 0
    });
  });

  it("stays Clean when the invoice is paid before the shipment becomes Delivered", () => {
    const invoice = invoiceBalance({ status: "Paid", remainingAmount: 0, deliveryNotes: [{ status: "Issued" }] });
    expect(getCustomerPaymentSummary({ invoices: [invoice] }).paymentStatus).toBe("Clean");
    invoice.deliveryNotes[0].status = "Delivered";
    expect(getCustomerPaymentSummary({ invoices: [invoice] }).paymentStatus).toBe("Clean");
  });

  it("keeps customer segment while building independent delivery-based payment summaries", () => {
    expect(buildCustomerInsights([
      { id: "one", companyName: "One", name: "First", customerSegment: "Retail",
        invoices: [invoiceBalance({ deliveryNotes: [{ status: "Delivered" }] })] },
      { id: "two", companyName: "Two", name: "Second", customerSegment: "Wholesale",
        invoices: [invoiceBalance({ remainingAmount: 900_000 })] }
    ])).toEqual([
      { id: "one", companyName: "One", contactName: "First", customerSegment: "Retail",
        paymentStatus: "Outstanding Payment", outstandingAmount: 100, openInvoiceCount: 1 },
      { id: "two", companyName: "Two", contactName: "Second", customerSegment: "Wholesale",
        paymentStatus: "Clean", outstandingAmount: 0, openInvoiceCount: 0 }
    ]);
  });

  it("returns no payment history when orders are outside the window or ineligible", () => {
    const result = getCustomerPaymentBehaviour(
      {
        salesOrders: [
          paymentOrder({ status: "Draft" }),
          paymentOrder({ status: "Cancelled" }),
          paymentOrder({ orderDate: new Date("2025-06-19T04:59:59.999Z") })
        ]
      },
      now
    );

    expect(result).toMatchObject({
      behaviour: "No Payment History",
      orderCount: 0,
      limitedHistory: false,
      counts: { immediatePayment: 0, shortTermCredit: 0, longTermCredit: 0 }
    });
    expect(result.evidence).toContain("last 12 months");
  });

  it("classifies immediate payment at the exact 60 percent threshold", () => {
    const result = getCustomerPaymentBehaviour(
      {
        salesOrders: [
          paymentOrder({ status: "Confirmed" }),
          paymentOrder({ status: "Invoiced" }),
          paymentOrder({ status: "Shipped" }),
          paymentOrder({ paymentTermType: "CREDIT", creditTermMonths: 1 }),
          paymentOrder({ paymentTermType: "CREDIT", creditTermMonths: 3 })
        ]
      },
      now
    );

    expect(result).toMatchObject({
      behaviour: "Immediate Payment",
      orderCount: 5,
      limitedHistory: false,
      counts: { immediatePayment: 3, shortTermCredit: 1, longTermCredit: 1 }
    });
    expect(result.evidence).toContain("3 of 5 eligible orders used immediate payment");
  });

  it("classifies short and long credit and marks one or two orders as limited history", () => {
    const shortTerm = getCustomerPaymentBehaviour(
      {
        salesOrders: [
          paymentOrder({ paymentTermType: "CREDIT", creditTermMonths: 1 })
        ]
      },
      now
    );
    const longTerm = getCustomerPaymentBehaviour(
      {
        salesOrders: [
          paymentOrder({ paymentTermType: "CREDIT", creditTermMonths: 2 }),
          paymentOrder({ paymentTermType: "CREDIT", creditTermMonths: 12 })
        ]
      },
      now
    );

    expect(shortTerm).toMatchObject({
      behaviour: "Short-Term Credit",
      limitedHistory: true
    });
    expect(shortTerm.evidence).toContain("Limited history");
    expect(longTerm).toMatchObject({
      behaviour: "Long-Term Credit",
      limitedHistory: true
    });
  });

  it("returns mixed when no payment bucket reaches 60 percent", () => {
    const result = getCustomerPaymentBehaviour(
      {
        salesOrders: [
          paymentOrder(),
          paymentOrder({ paymentTermType: "CREDIT", creditTermMonths: 1 }),
          paymentOrder({ paymentTermType: "CREDIT", creditTermMonths: 3 })
        ]
      },
      now
    );

    expect(result).toMatchObject({
      behaviour: "Mixed",
      orderCount: 3,
      limitedHistory: false
    });
    expect(result.evidence).toContain(
      "1 immediate payment, 1 short-term credit, and 1 long-term credit"
    );
  });
});

function paymentOrder(
  overrides: Partial<{
    orderDate: Date;
    status: string;
    paymentTermType: string;
    creditTermMonths: number | null;
  }> = {}
) {
  return {
    orderDate: new Date("2026-06-01T05:00:00.000Z"),
    status: "Confirmed",
    paymentTermType: "IMMEDIATE",
    creditTermMonths: null,
    ...overrides
  };
}
