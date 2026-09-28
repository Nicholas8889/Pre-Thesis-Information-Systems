import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { deleteSalesOrderProcess } from "../../src/lib/sales-order-deletion";

describe("sales order process deletion integration", () => {
  it("deletes only a disposable Draft and keeps downstream history", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await expect(prisma.$transaction(async tx => {
      const customer = await tx.customer.create({
        data: { name: marker, companyName: marker, phone: "-", email: "", address: "Test", customerSegment: "SIT" }
      });
      const draft = await tx.salesOrder.create({
        data: {
          orderNumber: `TEST-DRAFT-${marker}`,
          customerId: customer.id,
          orderDate: new Date(),
          status: "Draft",
          subtotal: 100,
          total: 100,
          netSalesAmount: 100,
          items: { create: { itemName: "Draft Item", quantity: 1, finalUnitPrice: 100, subtotal: 100 } }
        }
      });
      await deleteSalesOrderProcess(tx, { salesOrderId: draft.id });
      expect(await tx.salesOrder.count({ where: { id: draft.id } })).toBe(0);
      expect(await tx.salesOrderItem.count({ where: { salesOrderId: draft.id } })).toBe(0);

      const historical = await tx.salesOrder.create({
        data: {
          orderNumber: `TEST-HISTORY-${marker}`,
          customerId: customer.id,
          orderDate: new Date(),
          status: "Invoiced",
          subtotal: 100,
          total: 100,
          netSalesAmount: 100,
          items: { create: { itemName: "History Item", quantity: 1, finalUnitPrice: 100, subtotal: 100 } }
        }
      });
      await tx.invoice.create({
        data: {
          invoiceNumber: `TEST-INV-${marker}`,
          salesOrderId: historical.id,
          customerId: customer.id,
          issueDate: new Date(),
          dueDate: new Date(),
          totalAmount: 100,
          netSalesAmount: 100,
          remainingAmount: 100
        }
      });
      await expect(deleteSalesOrderProcess(tx, { salesOrderId: historical.id })).rejects.toThrow("unlinked Draft");
      expect(await tx.salesOrder.count({ where: { id: historical.id } })).toBe(1);
      expect(await tx.invoice.count({ where: { salesOrderId: historical.id } })).toBe(1);
      throw new Error("ROLLBACK_DELETION_TEST");
    }, { maxWait: 10_000, timeout: 20_000 })).rejects.toThrow("ROLLBACK_DELETION_TEST");
  }, 30_000);
});
