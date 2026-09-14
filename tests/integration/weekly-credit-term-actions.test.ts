import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getPaymentTermLabel } from "../../src/lib/calculations";

const context = vi.hoisted(() => ({
  tx: null as Prisma.TransactionClient | null,
  user: { id: "", role: "MANAGER" }
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error("REDIRECT:" + path); }
}));
vi.mock("@/lib/session", () => ({ requireCurrentUser: async () => context.user }));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: vi.fn() }));
vi.mock("@/lib/customer-po-storage", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/lib/customer-po-storage")>(),
  uploadCustomerPoDocument: vi.fn(async (file: File, storedName: string) => ({
    originalName: file.name, storedName, mimeType: file.type
  }))
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, {
    get(_target, key) {
      const tx = context.tx;
      if (!tx) throw new Error("Missing weekly-credit test transaction");
      if (key === "$transaction") return (work: (client: Prisma.TransactionClient) => Promise<unknown>) => work(tx);
      return Reflect.get(tx, key);
    }
  })
}));

import { createSalesOrder, decideSalesOrderApproval, generateInvoice } from "../../src/lib/actions";

const prisma = new PrismaClient();
const ROLLBACK = "ROLLBACK_WEEKLY_CREDIT";
type Source = "DIRECT" | "CUSTOMER_PO";
type Flow = "automatic" | "generate" | "approval";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

async function verifyFlow(source: Source, weeks: number, flow: Flow) {
  const marker = "WEEKLY-QA-" + Date.now() + "-" + source;
  let customerId = "";
  try {
    await expect(prisma.$transaction(async tx => {
      context.tx = tx;
      const user = await tx.user.create({
        data: { username: marker, displayName: marker, passwordHash: "test-only", role: "MANAGER" }
      });
      context.user = { id: user.id, role: flow === "automatic" ? "MANAGER" : "SALES" };
      const customer = await tx.customer.create({
        data: { name: marker, companyName: marker, phone: "", email: "", address: "QA", customerSegment: "Retail" }
      });
      customerId = customer.id;
      const product = await tx.product.create({ data: { productName: marker, listPrice: 100_000 } });

      if (flow === "approval") {
        const debtOrder = await tx.salesOrder.create({
          data: {
            orderNumber: marker + "-DEBT", customerId, orderDate: new Date(),
            status: "Invoiced", subtotal: 100, total: 100, paymentTermType: "CREDIT", creditTermMonths: 1
          }
        });
        const debtInvoice = await tx.invoice.create({
          data: {
            invoiceNumber: marker + "-DEBT", salesOrderId: debtOrder.id, customerId,
            issueDate: new Date(), dueDate: new Date("2099-12-31"), totalAmount: 100,
            remainingAmount: 100, status: "Unpaid", paymentTermType: "CREDIT", creditTermMonths: 1
          }
        });
        await tx.deliveryNote.create({
          data: {
            deliveryNoteNumber: marker + "-DEBT", salesOrderId: debtOrder.id, invoiceId: debtInvoice.id,
            customerId, recipientName: "QA", recipientPhone: "", recipientAddress: "QA",
            deliveryDate: new Date(), status: "Delivered"
          }
        });
      }

      const input = form({
        source, customerId, paymentTermType: "CREDIT", creditTerm: weeks + "w",
        notes: marker, requiredDate: "2099-12-31",
        items: JSON.stringify([{
          productId: product.id, itemName: product.productName, quantity: 10,
          baseUnitPrice: 100_000, markupPercent: 0, discountPercent: 0
        }])
      });
      if (source === "CUSTOMER_PO") {
        input.set("customerPoDocument", new File(["QA"], "qa.pdf", { type: "application/pdf" }));
      }
      await expect(createSalesOrder(input)).rejects.toThrow(/REDIRECT:.*success=/);
      const order = await tx.salesOrder.findFirstOrThrow({ where: { customerId, notes: marker }, include: { invoice: true } });
      expect(order).toMatchObject({ source, paymentTermType: "CREDIT", creditTermMonths: null, creditTermWeeks: weeks });

      if (flow !== "automatic") {
        expect(order.invoice).toBeNull();
        context.user.role = "MANAGER";
        if (flow === "approval") {
          expect(order.approvalStatus).toBe("Pending");
          await expect(decideSalesOrderApproval(form({ salesOrderId: order.id, decision: "Approved" })))
            .rejects.toThrow(/REDIRECT:.*success=/);
        } else {
          expect(order.status).toBe("Confirmed");
          await expect(generateInvoice(form({ salesOrderId: order.id }))).rejects.toThrow(/REDIRECT:.*success=/);
        }
      }

      const saved = await tx.salesOrder.findUniqueOrThrow({
        where: { id: order.id }, include: { invoice: { include: { collectionTasks: true } } }
      });
      const invoice = saved.invoice!;
      expect(saved.status).toBe("Invoiced");
      expect(invoice).toMatchObject({
        salesOrderId: order.id, paymentTermType: "CREDIT",
        creditTermWeeks: weeks, creditTermMonths: null, totalAmount: 1_000_000
      });
      expect(invoice.dueDate.getTime() - invoice.issueDate.getTime()).toBe(weeks * 7 * 86_400_000);
      expect(invoice.collectionTasks).toHaveLength(1);
      expect(invoice.collectionTasks[0].scheduledDate).toEqual(invoice.dueDate);
      expect(getPaymentTermLabel(saved)).toBe(getPaymentTermLabel(invoice));
      expect(getPaymentTermLabel(invoice)).toContain(weeks === 1 ? "1 Week" : weeks + " Weeks");
      throw new Error(ROLLBACK);
    }, { maxWait: 10_000, timeout: 40_000 })).rejects.toThrow(ROLLBACK);
  } finally {
    context.tx = null;
  }
  expect(await prisma.customer.count({ where: { id: customerId } })).toBe(0);
}

describe("weekly credit across SO and Customer PO actions", () => {
  afterAll(() => prisma.$disconnect());

  it.each(
    (["DIRECT", "CUSTOMER_PO"] as const).flatMap(source =>
      [1, 2, 3, 4].map(weeks => ({ source, weeks }))
    )
  )("saves $weeks weeks through automatic invoicing for $source", async ({ source, weeks }) => {
    await verifyFlow(source, weeks, "automatic");
  }, 50_000);

  it.each(["DIRECT", "CUSTOMER_PO"] as const)("preserves weekly terms when %s is invoiced later", async source => {
    await verifyFlow(source, 2, "generate");
  }, 50_000);

  it.each(["DIRECT", "CUSTOMER_PO"] as const)("preserves weekly terms through Manager approval for %s", async source => {
    await verifyFlow(source, 4, "approval");
  }, 50_000);

  it.each(["DIRECT", "CUSTOMER_PO"])("rejects an invalid weekly term before saving %s", async source => {
    const input = form({
      source, customerId: "not-needed", paymentTermType: "CREDIT", creditTerm: "5w",
      items: JSON.stringify([{ productId: "p", itemName: "p", quantity: 1, baseUnitPrice: 100 }])
    });
    await expect(createSalesOrder(input)).rejects.toThrow(/error=.*1%20to%204%20weeks/);
  });
});

