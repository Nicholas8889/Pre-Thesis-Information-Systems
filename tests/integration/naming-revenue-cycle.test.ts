import type { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  canCreateDeliveryNoteForInvoice,
  calculateDueDateForPaymentTerm
} from "../../src/lib/calculations";
import { prisma } from "../../src/lib/prisma";

const ROLLBACK = "ROLLBACK_NAMING_REVENUE_CYCLE";

async function withRollback(
  scenario: (tx: Prisma.TransactionClient, marker: string) => Promise<void>
) {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await expect(
    prisma.$transaction(
      async (tx) => {
        await scenario(tx, marker);
        throw new Error(ROLLBACK);
      },
      { maxWait: 10_000, timeout: 30_000 }
    )
  ).rejects.toThrow(ROLLBACK);
}

async function createCustomerAndProduct(tx: Prisma.TransactionClient, marker: string) {
  const customer = await tx.customer.create({
    data: {
      name: "Naming QA Contact",
      companyName: `Naming QA ${marker}`,
      phone: "-",
      email: "",
      address: "Test",
      customerSegment: "Test"
    }
  });
  const product = await tx.product.create({
    data: { productName: `Naming Product ${marker}`, listPrice: 100_000 }
  });
  return { customer, product };
}

async function createOrder(
  tx: Prisma.TransactionClient,
  marker: string,
  options: { source: "DIRECT" | "CUSTOMER_PO"; paymentTermType: "IMMEDIATE" | "CREDIT" }
) {
  const { customer, product } = await createCustomerAndProduct(tx, marker);
  const order = await tx.salesOrder.create({
    data: {
      orderNumber: `SO-${marker}`,
      customerPoNumber: options.source === "CUSTOMER_PO" ? `PO-${marker}` : null,
      source: options.source,
      customerPoDocumentName:
        options.source === "CUSTOMER_PO" ? `customer-po-${marker}.pdf` : null,
      customerPoDocumentStoredName:
        options.source === "CUSTOMER_PO" ? `qa/customer-po-${marker}.pdf` : null,
      customerPoDocumentMimeType:
        options.source === "CUSTOMER_PO" ? "application/pdf" : null,
      customerId: customer.id,
      orderDate: new Date("2026-08-13T00:00:00.000Z"),
      status: "Invoiced",
      subtotal: 100_000,
      total: 100_000,
      netSalesAmount: 100_000,
      paymentTermType: options.paymentTermType,
      creditTermMonths: options.paymentTermType === "CREDIT" ? 2 : null,
      items: {
        create: {
          productId: product.id,
          itemName: product.productName,
          quantity: 1,
          baseUnitPrice: 90_000,
          markupPercent: 20,
          discountPercent: 10,
          finalUnitPrice: 100_000,
          subtotal: 100_000
        }
      }
    },
    include: { items: true }
  });
  return { customer, product, order };
}

describe("canonical naming revenue cycle integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("converts an inquiry to customer PO without changing items or agreed price", async () => {
    await withRollback(async (tx, marker) => {
      const { customer, product, order } = await createOrder(tx, marker, {
        source: "CUSTOMER_PO",
        paymentTermType: "CREDIT"
      });
      const inquiry = await tx.customerInquiry.create({
        data: {
          inquiryNumber: `INQ-${marker}`,
          customerId: customer.id,
          status: "ConvertedToCustomerPO",
          salesOrderId: order.id,
          items: {
            create: {
              productId: product.id,
              itemName: product.productName,
              quantity: 1,
              requestedUnitPrice: 105_000,
              agreedUnitPrice: 100_000
            }
          }
        },
        include: { items: true, salesOrder: true }
      });

      expect(inquiry.salesOrder).toMatchObject({
        source: "CUSTOMER_PO",
        customerPoNumber: `PO-${marker}`,
        customerPoDocumentMimeType: "application/pdf"
      });
      expect(inquiry.items[0]).toMatchObject({
        quantity: 1,
        requestedUnitPrice: 105_000,
        agreedUnitPrice: 100_000
      });
    });
  }, 40_000);

  it("persists the complete customer PO revenue cycle with canonical relations", async () => {
    await withRollback(async (tx, marker) => {
      const { customer, order } = await createOrder(tx, marker, {
        source: "CUSTOMER_PO",
        paymentTermType: "CREDIT"
      });
      const issueDate = new Date("2026-08-13T00:00:00.000Z");
      const dueDate = calculateDueDateForPaymentTerm({
        issueDate,
        paymentTermType: "CREDIT",
        creditTermMonths: 2
      });
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${marker}`,
          salesOrderId: order.id,
          customerId: customer.id,
          issueDate,
          dueDate,
          totalAmount: order.total,
          paidAmount: 40_000,
          remainingAmount: 60_000,
          netSalesAmount: order.netSalesAmount,
          paymentTermType: "CREDIT",
          creditTermMonths: 2,
          status: "Partial",
          payments: {
            create: {
              paymentDate: issueDate,
              amount: 40_000,
              paymentMethod: "BankTransfer"
            }
          },
          collectionTasks: {
            create: {
              customerId: customer.id,
              scheduledDate: dueDate,
              status: "Planned",
              notes: "Confirm remaining payment"
            }
          },
          deliveryNotes: {
            create: {
              deliveryNoteNumber: `SJ-${marker}`,
              salesOrderId: order.id,
              customerId: customer.id,
              recipientName: customer.name,
              recipientPhone: customer.phone,
              recipientAddress: customer.address,
              deliveryDate: issueDate,
              status: "Issued",
              items: { create: { itemName: order.items[0].itemName, quantity: 1 } }
            }
          }
        },
        include: { payments: true, collectionTasks: true, deliveryNotes: true }
      });

      expect(invoice.payments).toHaveLength(1);
      expect(invoice.collectionTasks[0]).toMatchObject({
        scheduledDate: dueDate,
        status: "Planned"
      });
      expect(invoice.deliveryNotes).toHaveLength(1);
      expect(invoice.remainingAmount).toBe(invoice.totalAmount - invoice.paidAmount);
    });
  }, 40_000);

  it("preserves immediate payment workflow eligibility and due date", async () => {
    await withRollback(async (tx, marker) => {
      const { customer, order } = await createOrder(tx, marker, {
        source: "DIRECT",
        paymentTermType: "IMMEDIATE"
      });
      const issueDate = new Date("2026-08-13T00:00:00.000Z");
      const dueDate = calculateDueDateForPaymentTerm({
        issueDate,
        paymentTermType: "IMMEDIATE"
      });
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${marker}`,
          salesOrderId: order.id,
          customerId: customer.id,
          issueDate,
          dueDate,
          totalAmount: order.total,
          remainingAmount: order.total,
          netSalesAmount: order.netSalesAmount,
          paymentTermType: "IMMEDIATE",
          status: "Unpaid"
        }
      });

      expect(invoice.dueDate).toEqual(invoice.issueDate);
      expect(
        canCreateDeliveryNoteForInvoice({
          paymentTermType: invoice.paymentTermType,
          status: invoice.status
        })
      ).toBe(false);
      expect(
        canCreateDeliveryNoteForInvoice({ paymentTermType: "IMMEDIATE", status: "Paid" })
      ).toBe(true);
    });
  }, 40_000);

  it("preserves credit workflow due date and collection scheduling", async () => {
    await withRollback(async (tx, marker) => {
      const { customer, order } = await createOrder(tx, marker, {
        source: "DIRECT",
        paymentTermType: "CREDIT"
      });
      const issueDate = new Date("2026-01-31T00:00:00.000Z");
      const dueDate = calculateDueDateForPaymentTerm({
        issueDate,
        paymentTermType: "CREDIT",
        creditTermMonths: 2
      });
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${marker}`,
          salesOrderId: order.id,
          customerId: customer.id,
          issueDate,
          dueDate,
          totalAmount: order.total,
          remainingAmount: order.total,
          netSalesAmount: order.netSalesAmount,
          paymentTermType: "CREDIT",
          creditTermMonths: 2,
          status: "Unpaid"
        }
      });
      const task = await tx.collectionTask.create({
        data: {
          customerId: customer.id,
          invoiceId: invoice.id,
          scheduledDate: dueDate,
          notes: "Payment due-date reminder"
        }
      });

      expect(task.scheduledDate).toEqual(invoice.dueDate);
      expect(
        canCreateDeliveryNoteForInvoice({
          paymentTermType: invoice.paymentTermType,
          status: invoice.status
        })
      ).toBe(true);
    });
  }, 40_000);

  it("keeps collection task status changes separate from outreach", async () => {
    await withRollback(async (tx, marker) => {
      const { customer } = await createCustomerAndProduct(tx, marker);
      const task = await tx.collectionTask.create({
        data: {
          customerId: customer.id,
          scheduledDate: new Date("2026-08-20T00:00:00.000Z"),
          notes: "Request payment"
        }
      });
      const completed = await tx.collectionTask.update({
        where: { id: task.id },
        data: { status: "Done" }
      });

      expect(completed).toMatchObject({ status: "Done", invoiceId: null });
      expect(await tx.customerOutreach.count({ where: { customerId: customer.id } })).toBe(0);
    });
  }, 40_000);

  it("stores customer outreach without an invoice relation", async () => {
    await withRollback(async (tx, marker) => {
      const { customer } = await createCustomerAndProduct(tx, marker);
      const outreach = await tx.customerOutreach.create({
        data: {
          customerId: customer.id,
          contactDate: new Date("2026-08-21T00:00:00.000Z"),
          notes: "Shared product information"
        },
        include: { customer: true }
      });

      expect(outreach.customer.companyName).toBe(`Naming QA ${marker}`);
      expect(outreach.notes).toBe("Shared product information");
      expect("invoiceId" in outreach).toBe(false);
    });
  }, 40_000);
});
