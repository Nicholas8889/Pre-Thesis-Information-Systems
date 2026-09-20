import { describe, expect, it } from "vitest";
import {
  getClosedInvoiceWhere,
  getEffectiveInvoiceStatus,
  getEffectiveInvoiceStatusWhere,
  getOpenInvoiceWhere,
  withEffectiveInvoiceStatus
} from "../../src/lib/invoice-status";

const now = new Date("2026-09-20T05:00:00.000Z");

describe("effective invoice status", () => {
  it("derives overdue without changing the stored invoice", () => {
    const invoice = {
      dueDate: new Date("2026-09-19T00:00:00.000Z"),
      paidAmount: 0,
      status: "Unpaid" as const,
      totalAmount: 1_000
    };

    expect(getEffectiveInvoiceStatus(invoice, now)).toBe("Overdue");
    expect(withEffectiveInvoiceStatus(invoice, now)).toMatchObject({
      status: "Overdue"
    });
    expect(invoice.status).toBe("Unpaid");
  });

  it("preserves cancellation and derives current paid states", () => {
    expect(
      getEffectiveInvoiceStatus(
        {
          dueDate: new Date("2026-01-01T00:00:00.000Z"),
          paidAmount: 0,
          status: "Cancelled",
          totalAmount: 1_000
        },
        now
      )
    ).toBe("Cancelled");
    expect(
      getEffectiveInvoiceStatus(
        {
          dueDate: new Date("2026-09-20T00:00:00.000Z"),
          paidAmount: 400,
          status: "Overdue",
          totalAmount: 1_000
        },
        now
      )
    ).toBe("Partial");
  });

  it("builds read filters from balances, cancellation, and due dates", () => {
    expect(getOpenInvoiceWhere()).toEqual({
      remainingAmount: { gt: 0 },
      status: { not: "Cancelled" }
    });
    expect(getClosedInvoiceWhere()).toEqual({
      OR: [{ remainingAmount: { lte: 0 } }, { status: "Cancelled" }]
    });
    expect(getEffectiveInvoiceStatusWhere("Overdue", now)).toMatchObject({
      dueDate: { lt: expect.any(Date) },
      remainingAmount: { gt: 0 },
      status: { not: "Cancelled" }
    });
  });
});
