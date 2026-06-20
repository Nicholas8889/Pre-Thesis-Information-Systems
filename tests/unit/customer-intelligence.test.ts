import { describe, expect, it } from "vitest";
import {
  getCustomerCategory,
  getCustomerPaymentRisk
} from "../../src/lib/customer-intelligence";

describe("customer intelligence", () => {
  const now = new Date("2026-06-19T12:00:00");

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
});
