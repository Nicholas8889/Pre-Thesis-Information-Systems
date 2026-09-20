import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  getEffectiveInvoiceStatus,
  getEffectiveInvoiceStatusWhere
} from "../../src/lib/invoice-status";

const prisma = new PrismaClient();
const ROLLBACK_MARKER = "ROLLBACK_EFFECTIVE_INVOICE_STATUS_TEST";

describe("effective invoice status integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("finds an overdue invoice without writing during the read", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date("2026-09-20T05:00:00.000Z");

    await expect(
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: `Effective Status Customer ${marker}`,
            companyName: `Effective Status Company ${marker}`,
            phone: "",
            email: "",
            address: "",
            customerSegment: "Retail"
          }
        });
        const order = await tx.salesOrder.create({
          data: {
            orderNumber: `SO-EFFECTIVE-${marker}`,
            customerId: customer.id,
            orderDate: new Date("2026-09-01T00:00:00.000Z"),
            status: "Invoiced",
            subtotal: 1_000,
            total: 1_000,
            netSalesAmount: 1_000
          }
        });
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: `INV-EFFECTIVE-${marker}`,
            salesOrderId: order.id,
            customerId: customer.id,
            issueDate: new Date("2026-09-01T00:00:00.000Z"),
            dueDate: new Date("2026-09-10T00:00:00.000Z"),
            totalAmount: 1_000,
            remainingAmount: 1_000,
            netSalesAmount: 1_000,
            status: "Unpaid"
          }
        });

        const overdue = await tx.invoice.findFirst({
          where: {
            id: invoice.id,
            ...getEffectiveInvoiceStatusWhere("Overdue", now)
          }
        });
        expect(overdue).not.toBeNull();
        expect(getEffectiveInvoiceStatus(invoice, now)).toBe("Overdue");

        const unchanged = await tx.invoice.findUniqueOrThrow({
          where: { id: invoice.id }
        });
        expect(unchanged.status).toBe("Unpaid");

        throw new Error(ROLLBACK_MARKER);
      }, { timeout: 20_000 })
    ).rejects.toThrow(ROLLBACK_MARKER);
  }, 25_000);
});
