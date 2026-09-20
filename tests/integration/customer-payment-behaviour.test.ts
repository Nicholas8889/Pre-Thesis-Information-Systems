import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { getCustomerPaymentBehaviour } from "../../src/lib/customer-intelligence";

const prisma = new PrismaClient();
const ROLLBACK_MARKER = "ROLLBACK_CUSTOMER_PAYMENT_BEHAVIOUR_TEST";

describe("customer payment behaviour integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("derives behaviour from eligible Supabase order history without persisting a tag", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date("2026-08-12T05:00:00.000Z");

    await expect(
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: `Behaviour Customer ${marker}`,
            companyName: `Behaviour Company ${marker}`,
            phone: "",
            email: "",
            address: "",
            customerSegment: "Retail"
          }
        });
        const baseOrder = {
          customerId: customer.id,
          subtotal: 100_000,
          total: 100_000,
          netSalesAmount: 100_000
        };

        await tx.salesOrder.createMany({
          data: [
            {
              ...baseOrder,
              orderNumber: `SO-BEH-${marker}-1`,
              orderDate: new Date("2026-08-01T05:00:00.000Z"),
              status: "Confirmed",
              paymentTermType: "IMMEDIATE"
            },
            {
              ...baseOrder,
              orderNumber: `SO-BEH-${marker}-2`,
              orderDate: new Date("2026-07-01T05:00:00.000Z"),
              status: "Invoiced",
              paymentTermType: "IMMEDIATE"
            },
            {
              ...baseOrder,
              orderNumber: `SO-BEH-${marker}-3`,
              customerPoNumber: `PO-BEH-${marker}-3`,
              source: "CUSTOMER_PO",
              orderDate: new Date("2026-06-01T05:00:00.000Z"),
              status: "Shipped",
              paymentTermType: "IMMEDIATE"
            },
            {
              ...baseOrder,
              orderNumber: `SO-BEH-${marker}-4`,
              orderDate: new Date("2026-05-01T05:00:00.000Z"),
              status: "Confirmed",
              paymentTermType: "CREDIT",
              creditTermMonths: 1
            },
            {
              ...baseOrder,
              orderNumber: `SO-BEH-${marker}-5`,
              orderDate: new Date("2026-04-01T05:00:00.000Z"),
              status: "Cancelled",
              paymentTermType: "CREDIT",
              creditTermMonths: 6
            },
            {
              ...baseOrder,
              orderNumber: `SO-BEH-${marker}-6`,
              orderDate: new Date("2025-08-12T04:59:59.999Z"),
              status: "Confirmed",
              paymentTermType: "CREDIT",
              creditTermMonths: 6
            }
          ]
        });

        const loadedCustomer = await tx.customer.findUniqueOrThrow({
          where: { id: customer.id },
          include: {
            salesOrders: {
              select: {
                orderDate: true,
                status: true,
                paymentTermType: true,
                creditTermMonths: true
              }
            }
          }
        });
        const result = getCustomerPaymentBehaviour(loadedCustomer, now);

        expect(result).toMatchObject({
          behaviour: "Immediate Payment",
          orderCount: 4,
          counts: { immediatePayment: 3, shortTermCredit: 1, longTermCredit: 0 }
        });
        throw new Error(ROLLBACK_MARKER);
      }, { timeout: 20_000 })
    ).rejects.toThrow(ROLLBACK_MARKER);
  }, 25_000);
});
