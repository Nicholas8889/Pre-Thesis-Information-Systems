import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { getCustomerPaymentSummary } from "../../src/lib/customer-intelligence";
import { customerInvoiceBalanceSelect } from "../../src/lib/customer-payment-query";
import { requiresManagerApproval } from "../../src/lib/sales-order-approval";
import { calculateInvoiceStatus, calculateRemainingAmount } from "../../src/lib/calculations";

const prisma = new PrismaClient();
const ROLLBACK = "ROLLBACK_CUSTOMER_PAYMENT_STATUS";

describe("customer payment balances", () => {
  afterAll(() => prisma.$disconnect());

  it("starts outstanding on Delivered, counts each invoice once, and reflects payment and cancellation", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let customerId = "";

    await expect(prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data: {
        name: `Payment status ${marker}`, companyName: `Payment status ${marker}`,
        phone: "", email: "", address: "", customerSegment: "Wholesale", status: "Inactive"
      } });
      customerId = customer.id;

      const loadSummary = async () => {
        const record = await tx.customer.findUniqueOrThrow({
          where: { id: customer.id },
          include: { invoices: {
            where: { status: { not: "Cancelled" }, remainingAmount: { gt: 0 } },
            select: customerInvoiceBalanceSelect
          } }
        });
        expect(record.customerSegment).toBe("Wholesale");
        expect(record.status).toBe("Inactive");
        return getCustomerPaymentSummary(record);
      };

      expect(await loadSummary()).toEqual({ paymentStatus: "Clean", outstandingAmount: 0, openInvoiceCount: 0 });

      const dueDate = new Date("2099-12-31T00:00:00.000Z");
      const createInvoice = async (suffix: string, total: number) => {
        const order = await tx.salesOrder.create({ data: {
          orderNumber: `TEST-STATUS-SO-${marker}-${suffix}`, customerId: customer.id,
          orderDate: new Date(), status: "Invoiced", subtotal: total, total
        } });
        return tx.invoice.create({ data: {
          invoiceNumber: `TEST-STATUS-INV-${marker}-${suffix}`, salesOrderId: order.id,
          customerId: customer.id, issueDate: new Date(), dueDate,
          totalAmount: total, paidAmount: 0, remainingAmount: total, status: "Unpaid"
        } });
      };

      const first = await createInvoice("one", 1_850_000);
      const second = await createInvoice("two", 500_000);
      await createInvoice("awaiting-delivery", 900_000);
      const beforeDelivery = await loadSummary();
      expect(beforeDelivery).toEqual({ paymentStatus: "Clean", outstandingAmount: 0, openInvoiceCount: 0 });
      expect(requiresManagerApproval("SALES", beforeDelivery.paymentStatus)).toBe(false);

      const deliveryData = {
        customerId: customer.id, recipientName: customer.name, recipientPhone: "",
        recipientAddress: "Jakarta", deliveryDate: new Date()
      };
      const directNote = await tx.deliveryNote.create({ data: {
        ...deliveryData, deliveryNoteNumber: `TEST-STATUS-SJ-${marker}-direct`,
        invoiceId: first.id, status: "Issued"
      } });
      expect((await loadSummary()).paymentStatus).toBe("Clean");

      await tx.deliveryNote.update({ where: { id: directNote.id }, data: { status: "Delivered" } });
      const afterDelivery = await loadSummary();
      expect(afterDelivery).toEqual({
        paymentStatus: "Outstanding Payment", outstandingAmount: 1_850_000, openInvoiceCount: 1
      });
      expect(requiresManagerApproval("SALES", afterDelivery.paymentStatus)).toBe(true);

      await tx.deliveryNote.update({ where: { id: directNote.id }, data: { status: "Cancelled" } });
      expect((await loadSummary()).paymentStatus).toBe("Clean");
      await tx.deliveryNote.update({ where: { id: directNote.id }, data: { status: "Delivered" } });

      // Legacy Surat Jalan may point only to the order, without an invoice link.
      await tx.deliveryNote.create({ data: {
        ...deliveryData, deliveryNoteNumber: `TEST-STATUS-SJ-${marker}-order`,
        salesOrderId: second.salesOrderId, status: "Delivered"
      } });
      // Multiple Delivered Surat Jalan still qualify one invoice only once.
      await tx.deliveryNote.create({ data: {
        ...deliveryData, deliveryNoteNumber: `TEST-STATUS-SJ-${marker}-both`,
        invoiceId: first.id, salesOrderId: first.salesOrderId, status: "Delivered"
      } });
      expect(await loadSummary()).toEqual({
        paymentStatus: "Outstanding Payment", outstandingAmount: 2_350_000, openInvoiceCount: 2
      });
      expect((await tx.invoice.findUniqueOrThrow({ where: { id: first.id } })).dueDate).toEqual(dueDate);

      const pay = async (amount: number) => {
        await tx.payment.create({ data: { invoiceId: first.id, amount, paymentDate: new Date(), paymentMethod: "BankTransfer" } });
        const payments = await tx.payment.aggregate({ where: { invoiceId: first.id }, _sum: { amount: true } });
        const paidAmount = payments._sum.amount ?? 0;
        await tx.invoice.update({ where: { id: first.id }, data: {
          paidAmount, remainingAmount: calculateRemainingAmount(first.totalAmount, paidAmount),
          status: calculateInvoiceStatus({ totalAmount: first.totalAmount, paidAmount, dueDate })
        } });
      };

      await pay(850_000);
      expect(await loadSummary()).toEqual({
        paymentStatus: "Outstanding Payment", outstandingAmount: 1_500_000, openInvoiceCount: 2
      });
      await pay(1_000_000);
      expect(await loadSummary()).toEqual({
        paymentStatus: "Outstanding Payment", outstandingAmount: 500_000, openInvoiceCount: 1
      });
      await tx.invoice.update({ where: { id: second.id }, data: { status: "Cancelled" } });
      expect(await loadSummary()).toEqual({ paymentStatus: "Clean", outstandingAmount: 0, openInvoiceCount: 0 });

      throw new Error(ROLLBACK);
    }, { maxWait: 10_000, timeout: 30_000 })).rejects.toThrow(ROLLBACK);

    expect(await prisma.customer.findUnique({ where: { id: customerId } })).toBeNull();
  }, 45_000);
});
