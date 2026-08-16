import { describe, expect, it } from "vitest";
import {
  getCustomerCategory,
  getCustomerPaymentBehaviour,
  getCustomerPaymentRisk
} from "../../src/lib/customer-intelligence";

describe("customer intelligence", () => {
  const now = new Date("2026-06-19T05:00:00.000Z");

  it("prioritizes new customer category for customers added within one month", () => {
    expect(
      getCustomerCategory(
        {
          createdAt: new Date("2026-06-01"),
          salesOrders: [{ orderDate: new Date("2026-06-10") }]
        },
        now
      )
    ).toMatchObject({ category: "New", markup: "0%" });
  });

  it("classifies loyal, normal, and occasional customers from three-month order activity", () => {
    const oldCustomer = new Date("2025-01-01");
    const recentOrder = () => ({ orderDate: new Date("2026-06-01") });

    expect(
      getCustomerCategory(
        { createdAt: oldCustomer, salesOrders: Array.from({ length: 10 }, recentOrder) },
        now
      ).category
    ).toBe("Loyal");
    expect(
      getCustomerCategory(
        { createdAt: oldCustomer, salesOrders: Array.from({ length: 3 }, recentOrder) },
        now
      )
    ).toMatchObject({ category: "Normal", markup: "5%" });
    expect(
      getCustomerCategory(
        { createdAt: oldCustomer, salesOrders: [recentOrder()] },
        now
      )
    ).toMatchObject({ category: "Occasional", markup: "10–15%" });
  });

  it("marks a customer with a current overdue balance as late payment", () => {
    expect(
      getCustomerPaymentRisk(
        {
          invoices: [
            {
              dueDate: new Date("2026-06-01"),
              remainingAmount: 500000,
              status: "Overdue",
              payments: []
            }
          ]
        },
        now
      )
    ).toBe("Late Payment");
  });

  it("marks payment recorded after due date as historically late", () => {
    expect(
      getCustomerPaymentRisk(
        {
          invoices: [
            {
              dueDate: new Date("2026-05-01"),
              remainingAmount: 0,
              status: "Paid",
              payments: [{ paymentDate: new Date("2026-05-05") }]
            }
          ]
        },
        now
      )
    ).toBe("Historically Late");
  });

  it("marks customers without late payment evidence as clean", () => {
    expect(
      getCustomerPaymentRisk(
        {
          invoices: [
            {
              dueDate: new Date("2026-06-30"),
              remainingAmount: 0,
              status: "Paid",
              payments: [{ paymentDate: new Date("2026-06-10") }]
            }
          ]
        },
        now
      )
    ).toBe("Clean");
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
