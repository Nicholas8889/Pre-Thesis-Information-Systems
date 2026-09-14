import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { customerInvoiceBalanceSelect } from "../../src/lib/customer-payment-query";
import { getCustomerPaymentSummary } from "../../src/lib/customer-intelligence";

const context = vi.hoisted(() => ({
  tx: null as Prisma.TransactionClient | null,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/session", () => ({
  requireCurrentUser: async () => ({ id: "test-admin", role: "ADMIN" }),
}));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, key) {
        const tx = context.tx;
        if (!tx) throw new Error("Missing test transaction");
        if (key === "$transaction")
          return async (
            work: (client: Prisma.TransactionClient) => Promise<unknown>,
          ) => work(tx);
        return Reflect.get(tx, key);
      },
    },
  ),
}));

import {
  createDeliveryNote,
  updateDeliveryNoteStatus,
} from "../../src/lib/actions";

const prisma = new PrismaClient();
const ROLLBACK = "ROLLBACK_COMBINED_DELIVERY";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}


describe("combined delivery with the real database", () => {
  afterAll(() => prisma.$disconnect());
  it.each(["Delivered", "Cancelled"] as const)("links every order and preserves invoices when %s", async status => {
    const marker = "COMBINED-" + Date.now() + "-" + status;
    let customerId = "";
    await expect(prisma.$transaction(async tx => {
      context.tx = tx;
      const customer = await tx.customer.create({ data: {
        name: marker, companyName: marker, phone: "", email: "", address: "Shared destination", customerSegment: "Retail"
      } });
      customerId = customer.id;
      const lists = [];
      const invoicesBefore = [];
      for (const [index, source] of (["DIRECT", "CUSTOMER_PO"] as const).entries()) {
        const order = await tx.salesOrder.create({ data: {
          orderNumber: marker + "-" + index, customerPoNumber: source === "CUSTOMER_PO" ? "PO-" + marker : null,
          source, customerId, orderDate: new Date(), status: "Invoiced", approvalStatus: "Approved",
          subtotal: 1000, total: 1000,
          items: { create: { itemName: "Shared product", quantity: 10, finalUnitPrice: 100, subtotal: 1000 } }
        }, include: { items: true } });
        const invoice = await tx.invoice.create({ data: {
          invoiceNumber: "INV-" + marker + "-" + index, salesOrderId: order.id, customerId,
          issueDate: new Date(), dueDate: new Date(), totalAmount: 1000, paidAmount: index ? 400 : 0,
          remainingAmount: index ? 600 : 1000, status: index ? "Partial" : "Unpaid",
          payments: index ? { create: { amount: 400, paymentDate: new Date(), paymentMethod: "Cash" } } : undefined
        } });
        invoicesBefore.push(invoice);
        await tx.customerInquiry.create({ data: {
          inquiryNumber: "INQ-" + marker + "-" + index, customerId, salesOrderId: order.id,
          status: source === "DIRECT" ? "ConvertedToSO" : "ConvertedToCustomerPO"
        } });
        lists.push(await tx.pickingList.create({ data: {
          pickingListNumber: "PL-" + marker + "-" + index, salesOrderId: order.id, status: "Packed",
          pickerName: "Picker", packerName: "Packer", packageCount: 1, packedAt: new Date(),
          items: { create: { salesOrderItemId: order.items[0].id, itemName: "Shared product",
            orderedQuantity: 10, pickedQuantity: 10, packedQuantity: 10 } }
        } }));
      }
      const summary = async () => getCustomerPaymentSummary(await tx.customer.findUniqueOrThrow({
        where: { id: customerId }, include: { invoices: { select: customerInvoiceBalanceSelect } }
      }));
      const data = form({ recipientName: customer.name, recipientAddress: customer.address,
        deliveryDate: "2026-09-13", driverName: "Budi Santoso", vehiclePlateNumber: "B 1234 TJK" });
      lists.forEach(list => data.append("pickingListId", list.id));
      await expect(createDeliveryNote(data)).rejects.toThrow("tab=open");
      const note = await tx.deliveryNote.findFirstOrThrow({
        where: { customerId }, include: { sources: true, items: true }
      });
      expect(note.sources).toHaveLength(2);
      expect(note.items).toHaveLength(2);
      expect(new Set(note.items.map(item => item.sourceId)).size).toBe(2);
      expect(note.items.map(item => item.quantity)).toEqual([10, 10]);
      expect(note.salesOrderId).toBeNull();
      expect(await summary()).toMatchObject({ outstandingAmount: 0, openInvoiceCount: 0 });
      await expect(createDeliveryNote(data)).rejects.toThrow("Picking%20List%20is%20not%20ready");
      expect(await tx.deliveryNote.count({ where: { customerId } })).toBe(1);
      await expect(updateDeliveryNoteStatus(form({ id: note.id, status }))).rejects.toThrow("tab=completed");
      expect(await summary()).toMatchObject({
        outstandingAmount: status === "Delivered" ? 1600 : 0,
        openInvoiceCount: status === "Delivered" ? 2 : 0
      });
      for (const invoice of invoicesBefore) {
        expect(await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toEqual(invoice);
      }
      const inquiryStates = await tx.customerInquiry.findMany({ where: { customerId } });
      expect(inquiryStates.every(inquiry => status === "Delivered" ? inquiry.status === "Done" : inquiry.status !== "Done")).toBe(true);
      const linkedOrders = await tx.salesOrder.findMany({
        where: { customerId }, include: { deliverySources: { include: { deliveryNote: true } } }
      });
      expect(linkedOrders.every(order => order.deliverySources[0].deliveryNote.status === status)).toBe(true);
      throw new Error(ROLLBACK);
    }, { timeout: 45000 })).rejects.toThrow(ROLLBACK);
    context.tx = null;
    expect(await prisma.customer.findUnique({ where: { id: customerId } })).toBeNull();
  }, 60000);
});
