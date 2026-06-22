import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { deleteSalesOrderProcess } from "../../src/lib/sales-order-deletion";

describe("sales order process deletion integration", () => {
  it(
    "removes the order, invoice, payment, billing, delivery note, and their items atomically",
    async () => {
      const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await expect(
        prisma.$transaction(async (tx) => {
          const customer = await tx.customer.create({
            data: {
              name: "Deletion Test",
              companyName: `Deletion Test ${marker}`,
              phone: "-",
              email: "",
              address: "Test",
              customerType: "Test"
            }
          });
          const order = await tx.salesOrder.create({
            data: {
              orderNumber: `TEST-SO-${marker}`,
              customerId: customer.id,
              orderDate: new Date(),
              status: "Invoiced",
              subtotal: 100,
              total: 100,
              items: {
                create: { itemName: "Test Item", quantity: 1, unitPrice: 100, subtotal: 100 }
              }
            },
            include: { items: true }
          });
          const invoice = await tx.invoice.create({
            data: {
              invoiceNumber: `TEST-INV-${marker}`,
              salesOrderId: order.id,
              customerId: customer.id,
              issueDate: new Date(),
              dueDate: new Date(),
              totalAmount: 100,
              paidAmount: 50,
              remainingAmount: 50,
              status: "Partial"
            }
          });
          const payment = await tx.payment.create({
            data: {
              invoiceId: invoice.id,
              paymentDate: new Date(),
              amount: 50,
              paymentMethod: "Cash"
            }
          });
          const followUp = await tx.followUp.create({
            data: {
              customerId: customer.id,
              invoiceId: invoice.id,
              followUpDate: new Date(),
              status: "Planned",
              notes: "Test billing"
            }
          });
          const deliveryNote = await tx.deliveryNote.create({
            data: {
              deliveryNoteNumber: `TEST-SJ-${marker}`,
              invoiceId: invoice.id,
              salesOrderId: order.id,
              customerId: customer.id,
              recipientName: "Test",
              recipientPhone: "-",
              recipientAddress: "Test",
              deliveryDate: new Date(),
              status: "Issued",
              items: {
                create: { itemName: "Test Item", quantity: 1, unit: "PCS" }
              }
            },
            include: { items: true }
          });

          await deleteSalesOrderProcess(tx, {
            salesOrderId: order.id,
            invoiceId: invoice.id
          });

          expect(await tx.salesOrder.count({ where: { id: order.id } })).toBe(0);
          expect(await tx.salesOrderItem.count({ where: { id: order.items[0].id } })).toBe(0);
          expect(await tx.invoice.count({ where: { id: invoice.id } })).toBe(0);
          expect(await tx.payment.count({ where: { id: payment.id } })).toBe(0);
          expect(await tx.followUp.count({ where: { id: followUp.id } })).toBe(0);
          expect(await tx.deliveryNote.count({ where: { id: deliveryNote.id } })).toBe(0);
          expect(
            await tx.deliveryNoteItem.count({ where: { id: deliveryNote.items[0].id } })
          ).toBe(0);
          expect(await tx.customer.count({ where: { id: customer.id } })).toBe(1);

          throw new Error("ROLLBACK_DELETION_TEST");
        })
      ).rejects.toThrow("ROLLBACK_DELETION_TEST");
    },
    15_000
  );
});
