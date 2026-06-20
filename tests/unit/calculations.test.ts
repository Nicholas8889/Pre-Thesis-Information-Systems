import { describe, expect, it } from "vitest";
import {
  canRecordPayment,
  buildDeliveryNoteItemsFromSalesOrder,
  buildInvoiceDraftFromSalesOrder,
  calculateDueDateForPaymentTerm,
  calculateInvoiceStatus,
  calculateRemainingAmount,
  calculateRemainingBalance,
  calculateSalesOrderTotal,
  calculateTotalPaidFromPayments,
  canCreateDeliveryNoteForInvoice,
  canGenerateInvoice,
  getSalesOrderProgressStatus,
  isActiveReceivable,
  isFullyPaidTransaction,
  isValidSalesOrderPaymentTerm
} from "../../src/lib/calculations";
import { amountToWords, formatInvoiceCurrency } from "../../src/lib/format";
import { hashPassword, verifyPassword } from "../../src/lib/auth";

describe("revenue cycle calculations", () => {
  it("calculates sales order total from item quantity and unit price", () => {
    const total = calculateSalesOrderTotal([
      { quantity: 2, unitPrice: 100000 },
      { quantity: 3, unitPrice: 250000 }
    ]);

    expect(total).toBe(950000);
  });

  it("calculates remaining invoice amount", () => {
    expect(calculateRemainingAmount(1000000, 350000)).toBe(650000);
  });

  it("calculates total paid from related payment records", () => {
    expect(
      calculateTotalPaidFromPayments([
        { amount: 1000000 },
        { amount: 250000 },
        { amount: 500000 }
      ])
    ).toBe(1750000);
  });

  it("calculates remaining balance from total paid records", () => {
    expect(calculateRemainingBalance(2000000, 1250000)).toBe(750000);
    expect(calculateRemainingBalance(2000000, 2500000)).toBe(0);
  });

  it("marks invoice as paid when paid amount equals total", () => {
    expect(
      calculateInvoiceStatus({
        totalAmount: 1000000,
        paidAmount: 1000000,
        dueDate: new Date("2026-06-18"),
        asOfDate: new Date("2026-06-10")
      })
    ).toBe("Paid");
  });

  it("marks invoice as unpaid when no payment exists and due date has not passed", () => {
    expect(
      calculateInvoiceStatus({
        totalAmount: 1000000,
        paidAmount: 0,
        dueDate: new Date("2026-06-18"),
        asOfDate: new Date("2026-06-10")
      })
    ).toBe("Unpaid");
  });

  it("marks invoice as partial when payment is incomplete and not overdue", () => {
    expect(
      calculateInvoiceStatus({
        totalAmount: 1000000,
        paidAmount: 400000,
        dueDate: new Date("2026-06-18"),
        asOfDate: new Date("2026-06-10")
      })
    ).toBe("Partial");
  });

  it("marks invoice as overdue when due date passed and balance remains", () => {
    expect(
      calculateInvoiceStatus({
        totalAmount: 1000000,
        paidAmount: 400000,
        dueDate: new Date("2026-06-01"),
        asOfDate: new Date("2026-06-10")
      })
    ).toBe("Overdue");
  });

  it("formats invoice currency and amount in words for demo invoice output", () => {
    expect(formatInvoiceCurrency(40200000)).toBe("Rp 40,200,000");
    expect(amountToWords(40200000)).toBe("FORTY MILLION TWO HUNDRED THOUSAND RUPIAH");
  });

  it("prevents payment amount from exceeding remaining invoice amount", () => {
    expect(canRecordPayment(1500000, 1000000)).toBe(true);
    expect(canRecordPayment(1500000, 1500001)).toBe(false);
    expect(canRecordPayment(1500000, 0)).toBe(false);
  });

  it("builds a debit invoice draft from sales order data with immediate due date", () => {
    const invoice = buildInvoiceDraftFromSalesOrder({
      salesOrderId: "so-001",
      customerId: "cust-001",
      total: 1250000,
      issueDate: new Date("2026-06-01"),
      paymentTermType: "DEBIT"
    });

    expect(invoice).toMatchObject({
      salesOrderId: "so-001",
      customerId: "cust-001",
      totalAmount: 1250000,
      paidAmount: 0,
      remainingAmount: 1250000,
      paymentTermType: "DEBIT",
      creditTermMonths: null,
      status: "Unpaid"
    });
    expect(invoice.dueDate.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  it("calculates credit invoice due date from selected credit term", () => {
    const dueDate = calculateDueDateForPaymentTerm({
      issueDate: new Date("2026-01-01"),
      paymentTermType: "CREDIT",
      creditTermMonths: 3
    });

    expect(dueDate.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("copies payment term from sales order to invoice draft", () => {
    const invoice = buildInvoiceDraftFromSalesOrder({
      salesOrderId: "so-002",
      customerId: "cust-002",
      total: 2000000,
      issueDate: new Date("2026-06-01"),
      paymentTermType: "CREDIT",
      creditTermMonths: 2
    });

    expect(invoice).toMatchObject({
      paymentTermType: "CREDIT",
      creditTermMonths: 2
    });
    expect(invoice.dueDate.toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("validates payment term rules for sales order creation", () => {
    expect(isValidSalesOrderPaymentTerm({ paymentTermType: "DEBIT" })).toBe(true);
    expect(
      isValidSalesOrderPaymentTerm({ paymentTermType: "CREDIT", creditTermMonths: 3 })
    ).toBe(true);
    expect(isValidSalesOrderPaymentTerm({ paymentTermType: "CREDIT" })).toBe(false);
    expect(
      isValidSalesOrderPaymentTerm({ paymentTermType: "CREDIT", creditTermMonths: 13 })
    ).toBe(false);
  });

  it("prevents duplicate invoice generation for one sales order", () => {
    expect(canGenerateInvoice(null)).toBe(true);
    expect(canGenerateInvoice("inv-001")).toBe(false);
  });

  it("derives active receivables from invoice remaining amount and status", () => {
    expect(isActiveReceivable({ remainingAmount: 1000000, status: "Unpaid" })).toBe(true);
    expect(isActiveReceivable({ remainingAmount: 500000, status: "Partial" })).toBe(true);
    expect(isActiveReceivable({ remainingAmount: 500000, status: "Overdue" })).toBe(true);
    expect(isActiveReceivable({ remainingAmount: 0, status: "Paid" })).toBe(false);
  });

  it("detects fully paid transactions and excludes unpaid or partial transactions", () => {
    expect(
      isFullyPaidTransaction({
        invoiceStatus: "Paid",
        remainingAmount: 1000,
        totalPaid: 0,
        totalAmount: 1000000
      })
    ).toBe(true);
    expect(
      isFullyPaidTransaction({
        invoiceStatus: "Partial",
        remainingAmount: 0,
        totalPaid: 500000,
        totalAmount: 1000000
      })
    ).toBe(true);
    expect(
      isFullyPaidTransaction({
        invoiceStatus: "Unpaid",
        remainingAmount: 1000000,
        totalPaid: 1000000,
        totalAmount: 1000000
      })
    ).toBe(true);
    expect(
      isFullyPaidTransaction({
        invoiceStatus: "Partial",
        remainingAmount: 500000,
        totalPaid: 500000,
        totalAmount: 1000000
      })
    ).toBe(false);
    expect(
      isFullyPaidTransaction({
        invoiceStatus: "Unpaid",
        remainingAmount: 1000000,
        totalPaid: 0,
        totalAmount: 1000000
      })
    ).toBe(false);
  });

  it("summarizes sales order transaction progress without missing related records crashing", () => {
    expect(
      getSalesOrderProgressStatus({
        hasInvoice: false,
        paymentCount: 0,
        deliveryNoteCount: 0,
        remainingAmount: 0,
        followUpCount: 0
      })
    ).toBe("Sales Order Only");

    expect(
      getSalesOrderProgressStatus({
        hasInvoice: true,
        paymentCount: 0,
        deliveryNoteCount: 0,
        remainingAmount: 1000000,
        followUpCount: 0
      })
    ).toBe("Invoice Open");

    expect(
      getSalesOrderProgressStatus({
        hasInvoice: true,
        paymentCount: 1,
        deliveryNoteCount: 0,
        remainingAmount: 500000,
        followUpCount: 0
      })
    ).toBe("Payment In Progress");

    expect(
      getSalesOrderProgressStatus({
        hasInvoice: true,
        paymentCount: 1,
        deliveryNoteCount: 1,
        remainingAmount: 0,
        followUpCount: 0
      })
    ).toBe("Paid and Delivered");
  });

  it("applies Debit and Credit Surat Jalan creation rules", () => {
    expect(
      canCreateDeliveryNoteForInvoice({ paymentTermType: "DEBIT", status: "Unpaid" })
    ).toBe(false);
    expect(canCreateDeliveryNoteForInvoice({ paymentTermType: "DEBIT", status: "Paid" })).toBe(
      true
    );
    expect(
      canCreateDeliveryNoteForInvoice({ paymentTermType: "CREDIT", status: "Unpaid" })
    ).toBe(true);
  });

  it("copies sales order items into Surat Jalan item drafts", () => {
    expect(
      buildDeliveryNoteItemsFromSalesOrder([
        { itemName: "Product A", quantity: 2 },
        { itemName: "Product B", quantity: 1 }
      ])
    ).toEqual([
      {
        productCode: "",
        itemName: "Product A",
        quantity: 2,
        unit: "PCS",
        description: ""
      },
      {
        productCode: "",
        itemName: "Product B",
        quantity: 1,
        unit: "PCS",
        description: ""
      }
    ]);
  });

  it("verifies demo account password hashes without storing plain text", () => {
    const passwordHash = hashPassword("PrabowoBiji1", "demo-salt");

    expect(passwordHash).not.toContain("PrabowoBiji1");
    expect(verifyPassword("PrabowoBiji1", passwordHash)).toBe(true);
    expect(verifyPassword("wrong-password", passwordHash)).toBe(false);
  });
});
