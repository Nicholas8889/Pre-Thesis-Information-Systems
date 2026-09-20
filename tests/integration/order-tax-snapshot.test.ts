import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { buildOrderTaxSnapshot } from "../../src/lib/tax";

const prisma = new PrismaClient();
const ROLLBACK_MARKER = "ROLLBACK_ORDER_TAX_SNAPSHOT_TEST";

describe("order and invoice tax snapshots integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps the finalized Customer PO tax identity after the customer NPWP changes", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const npwp = `${Date.now()}${Math.floor(Math.random() * 1_000)}`
      .padStart(16, "0")
      .slice(-16);
    const total = 1_110_000;
    const taxSnapshot = buildOrderTaxSnapshot({
      totalAmount: total,
      customerNpwp: npwp,
      ppnRateBasisPoints: 1100
    });

    await expect(
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: `Tax Customer ${marker}`,
            companyName: `Tax Company ${marker}`,
            npwp,
            phone: "",
            email: "",
            address: "",
            customerSegment: "Retail"
          }
        });
        const product = await tx.product.create({
          data: {
            productName: `Tax Product ${marker}`,
            listPrice: total
          }
        });
        const order = await tx.salesOrder.create({
          data: {
            orderNumber: `SO-TAX-${marker}`,
            customerPoNumber: `PO-TAX-${marker}`,
            source: "CUSTOMER_PO",
            customerId: customer.id,
            orderDate: new Date("2026-08-12T05:00:00.000Z"),
            status: "Confirmed",
            subtotal: total,
            total,
            ...taxSnapshot,
            items: {
              create: {
                productId: product.id,
                itemName: product.productName,
                quantity: 1,
                baseUnitPrice: total,
                finalUnitPrice: total,
                subtotal: total
              }
            }
          }
        });

        await tx.customer.update({
          where: { id: customer.id },
          data: { npwp: null }
        });

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: `INV-TAX-${marker}`,
            salesOrderId: order.id,
            customerId: customer.id,
            issueDate: new Date("2026-08-12T05:00:00.000Z"),
            dueDate: new Date("2026-08-12T05:00:00.000Z"),
            totalAmount: order.total,
            paidAmount: 0,
            remainingAmount: order.total,
            customerNpwpSnapshot: order.customerNpwpSnapshot,
            ppnApplied: order.ppnApplied,
            ppnRateBasisPoints: order.ppnRateBasisPoints,
            ppnAmount: order.ppnAmount,
            netSalesAmount: order.netSalesAmount
          }
        });

        expect(order).toMatchObject({
          customerNpwpSnapshot: npwp,
          ppnApplied: true,
          ppnRateBasisPoints: 1100,
          ppnAmount: 110_000,
          netSalesAmount: 1_000_000
        });
        expect(invoice).toMatchObject({
          customerNpwpSnapshot: npwp,
          ppnApplied: true,
          ppnRateBasisPoints: 1100,
          ppnAmount: 110_000,
          netSalesAmount: 1_000_000,
          totalAmount: total
        });
        expect(invoice.netSalesAmount + invoice.ppnAmount).toBe(invoice.totalAmount);

        throw new Error(ROLLBACK_MARKER);
      }, { timeout: 20_000 })
    ).rejects.toThrow(ROLLBACK_MARKER);
  }, 20_000);
});
