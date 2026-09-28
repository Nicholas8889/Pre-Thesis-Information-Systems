import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { buildInvoiceSnapshot, parseInvoiceItemSnapshots } from "../../src/lib/invoice-snapshot";

describe("Batch 3 immutable invoice snapshot", () => {
  it("keeps customer, order, item, price, term, due date, and tax data after source mutation", async () => {
    const marker = `sit_b3_snapshot_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await expect(prisma.$transaction(async tx => {
      const customer = await tx.customer.create({
        data: {
          name: `${marker} Contact`, companyName: `${marker} Company`, phone: "021-old",
          email: `${marker}@example.com`, address: "Old address", customerSegment: "SIT"
        }
      });
      const order = await tx.salesOrder.create({
        data: {
          orderNumber: `SO-${marker}`, customerId: customer.id, orderDate: new Date(),
          status: "Confirmed", subtotal: 10_001, total: 10_001,
          netSalesAmount: 9_010, ppnApplied: true, ppnRateBasisPoints: 1100, ppnAmount: 991,
          paymentTermType: "CREDIT", creditTermWeeks: 1,
          items: { create: {
            itemName: "Old product", productSkuSnapshot: "OLD-SKU", quantity: 1,
            baseUnitPrice: 10_001, finalUnitPrice: 10_001, subtotal: 10_001
          } }
        },
        include: { customer: true, items: true }
      });
      const dueDate = new Date("2026-10-04T17:00:00.000Z");
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${marker}`, salesOrderId: order.id, customerId: customer.id,
          issueDate: new Date("2026-09-27T17:00:00.000Z"), dueDate,
          totalAmount: order.total, remainingAmount: order.total,
          netSalesAmount: order.netSalesAmount, ppnApplied: order.ppnApplied,
          ppnRateBasisPoints: order.ppnRateBasisPoints, ppnAmount: order.ppnAmount,
          paymentTermType: order.paymentTermType, creditTermWeeks: order.creditTermWeeks,
          ...buildInvoiceSnapshot(order)
        }
      });

      await tx.customer.update({
        where: { id: customer.id },
        data: { name: "Changed", companyName: "Changed", phone: "new", address: "New address" }
      });
      await tx.salesOrder.update({ where: { id: order.id }, data: { orderNumber: `CHANGED-${marker}` } });
      await tx.salesOrderItem.update({
        where: { id: order.items[0].id },
        data: { itemName: "Changed product", finalUnitPrice: 1, subtotal: 1 }
      });

      const historical = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(historical).toMatchObject({
        orderNumberSnapshot: `SO-${marker}`,
        customerNameSnapshot: `${marker} Contact`,
        customerCompanySnapshot: `${marker} Company`,
        customerPhoneSnapshot: "021-old",
        customerAddressSnapshot: "Old address",
        totalAmount: 10_001,
        netSalesAmount: 9_010,
        ppnAmount: 991,
        ppnRateBasisPoints: 1100,
        paymentTermType: "CREDIT",
        creditTermWeeks: 1,
        dueDate
      });
      expect(parseInvoiceItemSnapshots(historical.itemsSnapshot)).toEqual([
        expect.objectContaining({
          itemName: "Old product", productSku: "OLD-SKU", quantity: 1,
          finalUnitPrice: 10_001, subtotal: 10_001
        })
      ]);
      throw new Error("ROLLBACK_BATCH_THREE_SNAPSHOT");
    }, { maxWait: 10_000, timeout: 20_000 })).rejects.toThrow("ROLLBACK_BATCH_THREE_SNAPSHOT");
  }, 30_000);
});
