import { describe, expect, it } from "vitest";
import {
  buildInvoiceDraftFromSalesOrder,
  calculateDueDateForPaymentTerm,
  CREDIT_TERM_OPTIONS,
  getPaymentTermLabel,
  isValidSalesOrderPaymentTerm
} from "../../src/lib/calculations";
import { normalizePaymentTerm } from "../../src/lib/workflow";
import { getCustomerPaymentBehaviour } from "../../src/lib/customer-intelligence";

describe("weekly credit terms", () => {
  it("places 1–4 weeks before the existing 1–12 months", () => {
    expect(CREDIT_TERM_OPTIONS.map(option => option.value)).toEqual([
      "1w", "2w", "3w", "4w",
      "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "10m", "11m", "12m"
    ]);
  });

  it.each([
    [1, "2026-09-30"],
    [2, "2026-10-07"],
    [3, "2026-10-14"],
    [4, "2026-10-21"]
  ])("stores %i weeks and calculates its due date across a month boundary", (weeks, due) => {
    const term = normalizePaymentTerm({ paymentTermType: "CREDIT", creditTerm: weeks + "w" });
    expect(term).toEqual({ paymentTermType: "CREDIT", creditTermMonths: null, creditTermWeeks: weeks });
    expect(isValidSalesOrderPaymentTerm(term)).toBe(true);
    const issueDate = new Date("2026-09-23T00:00:00Z");
    const invoice = buildInvoiceDraftFromSalesOrder({
      salesOrderId: "so-weekly", customerId: "customer", total: 1_000_000, issueDate, ...term
    });
    expect(invoice.creditTermWeeks).toBe(weeks);
    expect(invoice.creditTermMonths).toBeNull();
    expect(invoice.dueDate.toISOString().slice(0, 10)).toBe(due);
    expect(issueDate.toISOString()).toBe("2026-09-23T00:00:00.000Z");
    expect(getPaymentTermLabel(invoice)).toBe("Credit – " + weeks + (weeks === 1 ? " Week" : " Weeks"));
  });

  it("keeps four weeks distinct from one calendar month", () => {
    const issueDate = new Date("2026-01-01T00:00:00Z");
    expect(calculateDueDateForPaymentTerm({ issueDate, paymentTermType: "CREDIT", creditTermWeeks: 4 })
      .toISOString().slice(0, 10)).toBe("2026-01-29");
    expect(calculateDueDateForPaymentTerm({ issueDate, paymentTermType: "CREDIT", creditTermMonths: 1 })
      .toISOString().slice(0, 10)).toBe("2026-02-01");
  });

  it.each(["0w", "5w", "-1w", "1.5w", "1x", "", "13m", "0m"])("rejects invalid term %s", creditTerm => {
    expect(isValidSalesOrderPaymentTerm(normalizePaymentTerm({ paymentTermType: "CREDIT", creditTerm }))).toBe(false);
  });

  it("rejects ambiguous simultaneous week and month values", () => {
    expect(isValidSalesOrderPaymentTerm({ paymentTermType: "CREDIT", creditTermWeeks: 2, creditTermMonths: 1 })).toBe(false);
  });

  it("preserves month terms from both new and older forms", () => {
    for (const creditTermMonths of ["1", "12"]) {
      const expected = { paymentTermType: "CREDIT", creditTermMonths: Number(creditTermMonths), creditTermWeeks: null };
      expect(normalizePaymentTerm({ paymentTermType: "CREDIT", creditTerm: creditTermMonths + "m" })).toEqual(expected);
      expect(normalizePaymentTerm({ paymentTermType: "CREDIT", creditTermMonths })).toEqual(expected);
      expect(isValidSalesOrderPaymentTerm(expected)).toBe(true);
    }
    expect(isValidSalesOrderPaymentTerm(normalizePaymentTerm({ paymentTermType: "CREDIT" }))).toBe(false);
  });

  it("clears credit duration when switching to Immediate Payment", () => {
    const term = normalizePaymentTerm({ paymentTermType: "IMMEDIATE", creditTerm: "2w" });
    expect(term).toEqual({ paymentTermType: "IMMEDIATE", creditTermMonths: null, creditTermWeeks: null });
    const issueDate = new Date("2026-09-13T00:00:00Z");
    expect(calculateDueDateForPaymentTerm({ issueDate, ...term })).toEqual(issueDate);
    expect(getPaymentTermLabel(term)).toBe("Immediate Payment");
  });

  it("counts weekly orders as short-term credit in customer insight", () => {
    const now = new Date("2026-09-13T00:00:00Z");
    const salesOrders = [1, 2, 3, 4].map(creditTermWeeks => ({
      orderDate: now, status: "Invoiced", paymentTermType: "CREDIT", creditTermMonths: null, creditTermWeeks
    }));
    expect(getCustomerPaymentBehaviour({ salesOrders }, now).behaviour).toBe("Short-Term Credit");
  });
});

