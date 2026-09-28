import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  failAudit: true,
  user: {
    id: "",
    username: "",
    displayName: "Batch 3 Manager",
    role: "MANAGER",
    status: "Active"
  }
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }
}));
vi.mock("@/lib/session", () => ({ requireCurrentUser: async () => context.user }));
vi.mock("@/lib/audit", () => ({
  createAuditTrailLog: vi.fn(async (input, options) => {
    if (context.failAudit) throw new Error("FAULT_INJECTED_AUDIT");
    const entries = Array.isArray(input) ? input : [input];
    await options.transaction.auditTrail.createMany({
      data: entries.map(entry => ({
        actorUserId: entry.actor.id,
        actorUsername: entry.actor.username,
        actorDisplayName: entry.actor.displayName,
        actorRole: entry.actor.role,
        moduleName: entry.moduleName,
        entityType: entry.entityType,
        entityId: entry.entityId,
        recordReference: entry.recordReference,
        action: entry.action,
        changeSummary: entry.changeSummary,
        actionNote: entry.actionNote ?? null
      }))
    });
  })
}));

import { cancelInvoice, decideSalesOrderApproval, generateInvoice } from "../../src/lib/actions";
import { PaymentRecordingError, recordInvoicePayment } from "../../src/lib/payment-recording";

const prisma = new PrismaClient();

describe("Batch 3 approval atomicity", () => {
  it("rolls back decision, invoice, number, and audit on fault, then retries once", async () => {
    const marker = `sit_b3_atomic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const manager = await prisma.user.create({
      data: { username: marker, displayName: "Batch 3 Manager", passwordHash: "test", role: "MANAGER" }
    });
    context.user = { ...context.user, id: manager.id, username: manager.username };
    const customer = await prisma.customer.create({
      data: {
        name: marker, companyName: marker, phone: "", email: "", address: "SIT",
        customerSegment: "SIT"
      }
    });
    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: `SO-${marker}`, customerId: customer.id, orderDate: new Date(),
        status: "Draft", approvalStatus: "Pending", subtotal: 1_000, total: 1_000,
        netSalesAmount: 1_000,
        items: { create: { itemName: "Atomic item", quantity: 1, baseUnitPrice: 1_000, finalUnitPrice: 1_000, subtotal: 1_000 } }
      }
    });
    const sequenceBefore = await prisma.documentSequence.findUnique({
      where: { documentType_year: { documentType: "INV", year: 2026 } }
    });
    const form = () => {
      const data = new FormData();
      data.set("salesOrderId", order.id);
      data.set("expectedVersion", "1");
      data.set("decision", "Approved");
      return data;
    };

    try {
      context.failAudit = true;
      await expect(decideSalesOrderApproval(form())).rejects.toThrow("FAULT_INJECTED_AUDIT");
      expect(await prisma.salesOrder.findUnique({ where: { id: order.id } })).toMatchObject({
        status: "Draft", approvalStatus: "Pending", version: 1
      });
      expect(await prisma.invoice.count({ where: { salesOrderId: order.id } })).toBe(0);
      expect(await prisma.auditTrail.count({ where: { entityId: order.id } })).toBe(0);
      const sequenceAfterFault = await prisma.documentSequence.findUnique({
        where: { documentType_year: { documentType: "INV", year: 2026 } }
      });
      expect(sequenceAfterFault?.lastValue ?? null).toBe(sequenceBefore?.lastValue ?? null);

      context.failAudit = false;
      await expect(decideSalesOrderApproval(form())).rejects.toThrow(/REDIRECT:.*success=/);
      expect(await prisma.salesOrder.findUnique({ where: { id: order.id } })).toMatchObject({
        status: "Invoiced", approvalStatus: "Approved", version: 2
      });
      expect(await prisma.invoice.count({ where: { salesOrderId: order.id } })).toBe(1);
      expect(await prisma.auditTrail.count({ where: { entityId: order.id } })).toBe(1);
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { salesOrderId: order.id } });
      expect(await prisma.auditTrail.count({ where: { entityId: invoice.id } })).toBe(2);
    } finally {
      await prisma.auditTrail.deleteMany({ where: { OR: [{ entityId: order.id }, { recordReference: { contains: marker } }] } });
      await prisma.collectionTask.deleteMany({ where: { invoice: { salesOrderId: order.id } } });
      await prisma.invoice.deleteMany({ where: { salesOrderId: order.id } });
      await prisma.salesOrder.deleteMany({ where: { id: order.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.user.deleteMany({ where: { id: manager.id } });
    }
  }, 40_000);

  it("cancels only an unpaid invoice, closes planned collection, and rejects later payment", async () => {
    const marker = `sit_b3_cancel_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const manager = await prisma.user.create({
      data: { username: marker, displayName: "Batch 3 Manager", passwordHash: "test", role: "MANAGER" }
    });
    context.user = { ...context.user, id: manager.id, username: manager.username };
    context.failAudit = false;
    const customer = await prisma.customer.create({
      data: { name: marker, companyName: marker, phone: "", email: "", address: "SIT", customerSegment: "SIT" }
    });
    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: `SO-${marker}`, customerId: customer.id, orderDate: new Date(),
        status: "Invoiced", subtotal: 1_000, total: 1_000, netSalesAmount: 1_000
      }
    });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${marker}`, salesOrderId: order.id, customerId: customer.id,
        issueDate: new Date(), dueDate: new Date("2026-09-20T00:00:00.000Z"),
        totalAmount: 1_000, remainingAmount: 1_000, netSalesAmount: 1_000,
        collectionTasks: { create: {
          scheduledDate: new Date(), status: "Planned", notes: "SIT"
        } }
      }
    });
    const form = new FormData();
    form.set("invoiceId", invoice.id);
    form.set("expectedVersion", "1");
    form.set("cancellationReason", "Duplicate commercial document");

    try {
      await expect(cancelInvoice(form)).rejects.toThrow(/REDIRECT:.*success=/);
      expect(await prisma.invoice.findUnique({ where: { id: invoice.id } })).toMatchObject({
        status: "Cancelled",
        paidAmount: 0,
        remainingAmount: 1_000,
        version: 2,
        cancellationReason: "Duplicate commercial document",
        cancelledByUserId: manager.id
      });
      expect(await prisma.collectionTask.findFirst({ where: { invoiceId: invoice.id } })).toMatchObject({
        status: "Cancelled"
      });
      expect(await prisma.auditTrail.count({ where: { entityId: invoice.id } })).toBe(2);
      await expect(prisma.$transaction(tx => recordInvoicePayment(tx, {
        invoiceId: invoice.id,
        paymentDate: new Date(),
        amount: 1,
        paymentMethod: "Cash",
        notes: null
      }))).rejects.toMatchObject({ code: "INVOICE_CANCELLED" } satisfies Partial<PaymentRecordingError>);
      expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
    } finally {
      await prisma.auditTrail.deleteMany({ where: { entityId: invoice.id } });
      await prisma.collectionTask.deleteMany({ where: { invoiceId: invoice.id } });
      await prisma.invoice.deleteMany({ where: { id: invoice.id } });
      await prisma.salesOrder.deleteMany({ where: { id: order.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.user.deleteMany({ where: { id: manager.id } });
    }
  }, 40_000);

  it("lets one of two parallel invoice generations win without duplicate invoice or audit", async () => {
    const marker = `sit_b3_generate_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const manager = await prisma.user.create({
      data: { username: marker, displayName: "Batch 3 Manager", passwordHash: "test", role: "MANAGER" }
    });
    context.user = { ...context.user, id: manager.id, username: manager.username };
    context.failAudit = false;
    const customer = await prisma.customer.create({
      data: { name: marker, companyName: marker, phone: "", email: "", address: "SIT", customerSegment: "SIT" }
    });
    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: `SO-${marker}`, customerId: customer.id, orderDate: new Date(),
        status: "Confirmed", approvalStatus: "Approved", subtotal: 1_000, total: 1_000,
        netSalesAmount: 1_000,
        items: { create: { itemName: "Concurrent item", quantity: 1, baseUnitPrice: 1_000, finalUnitPrice: 1_000, subtotal: 1_000 } }
      }
    });
    const form = () => {
      const data = new FormData();
      data.set("salesOrderId", order.id);
      return data;
    };

    try {
      const attempts = await Promise.allSettled([generateInvoice(form()), generateInvoice(form())]);
      expect(attempts).toHaveLength(2);
      expect(attempts.every(result => result.status === "rejected")).toBe(true);
      expect(await prisma.invoice.count({ where: { salesOrderId: order.id } })).toBe(1);
      const saved = await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(saved).toMatchObject({ status: "Invoiced", version: 2 });
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { salesOrderId: order.id } });
      expect(await prisma.auditTrail.count({ where: { entityId: invoice.id } })).toBe(2);
    } finally {
      const invoice = await prisma.invoice.findUnique({ where: { salesOrderId: order.id } });
      await prisma.auditTrail.deleteMany({ where: { OR: [{ entityId: order.id }, ...(invoice ? [{ entityId: invoice.id }] : [])] } });
      await prisma.collectionTask.deleteMany({ where: { invoice: { salesOrderId: order.id } } });
      await prisma.invoice.deleteMany({ where: { salesOrderId: order.id } });
      await prisma.salesOrder.deleteMany({ where: { id: order.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.user.deleteMany({ where: { id: manager.id } });
    }
  }, 40_000);
});

afterAll(async () => {
  await prisma.$disconnect();
});
