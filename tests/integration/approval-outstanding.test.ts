import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: { id: "approval-regression-sales", username: "approval-regression-sales", displayName: "Approval regression", role: "SALES", status: "Active" },
  duringUpload: null as null | (() => Promise<void>)
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: async () => ({ ...state.actor }) }));
vi.mock("@/lib/customer-po-storage", async () => {
  const policy = await import("../../src/lib/customer-po-document");
  return { ...policy,
    uploadCustomerPoDocument: async (document: object) => {
      await state.duringUpload?.();
      return { ...document, storedName: `test/${randomUUID()}.pdf` };
    },
    deleteCustomerPoDocument: async () => {}
  };
});
import { createSalesOrder, decideSalesOrderApproval } from "../../src/lib/actions";
import { prisma as appDb } from "../../src/lib/prisma";

const db = new PrismaClient();
beforeAll(async () => {
  const [scope] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  expect(scope.schema).toBe(process.env.SIT_UMKM_SCHEMA);
  expect(scope.schema).toMatch(/^sit_umkm_[a-f0-9_]+$/);
  await db.user.create({ data: { ...state.actor, role: "SALES", status: "Active", passwordHash: "test-only" } });
});
afterAll(async () => { await Promise.all([db.$disconnect(), appDb.$disconnect()]); });

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function fixture(source: string, term: string, remaining: number, status: "Unpaid" | "Partial" | "Paid" | "Cancelled") {
  state.actor.role = "SALES";
  const marker = randomUUID();
  const customer = await db.customer.create({ data: {
    companyName: marker, name: marker, address: "Jakarta", phone: "", email: "", customerSegment: "Retail", portfolioOwnerUserId: state.actor.id
  } });
  const product = await db.product.create({ data: { productName: marker, listPrice: 100 } });
  const oldOrder = await db.salesOrder.create({ data: { orderNumber: marker, customerId: customer.id, orderDate: new Date(), status: "Invoiced", subtotal: 1000, total: 1000, netSalesAmount: 1000 } });
  const oldInvoice = await db.invoice.create({ data: {
    invoiceNumber: marker, customerId: customer.id, salesOrderId: oldOrder.id, issueDate: new Date(), dueDate: new Date("2099-01-01"),
    totalAmount: 1000, netSalesAmount: 1000, paidAmount: status === "Cancelled" ? 0 : 1000 - remaining, remainingAmount: remaining, status
  } });
  const data = form({ source, customerId: customer.id, idempotencyKey: randomUUID(), paymentTermType: term,
    ...(term === "CREDIT" ? { creditTerm: "3m" } : {}), requiredDate: "2026-12-31",
    items: JSON.stringify([{ productId: product.id, quantity: 1, baseUnitPrice: 100, markupPercent: 0, discountPercent: 0 }]) });
  data.set("customerPoDocument", new File(["%PDF-1.4\n%%EOF\n"], "approval.pdf", { type: "application/pdf" }));
  return { customer, oldInvoice, data };
}

describe("approval for unpaid invoices without delivery", () => {
  it.each([
    ["DIRECT", "IMMEDIATE", 1000, "Unpaid"],
    ["DIRECT", "CREDIT", 400, "Partial"],
    ["CUSTOMER_PO", "IMMEDIATE", 400, "Partial"],
    ["CUSTOMER_PO", "CREDIT", 1000, "Unpaid"]
  ] as const)("requests approval for %s / %s with %s remaining", async (source, term, remaining, status) => {
    const f = await fixture(source, term, remaining, status);
    await expect(createSalesOrder(f.data)).rejects.toThrow(/tab=approval.*success=/);
    const order = await db.salesOrder.findFirstOrThrow({ where: { idempotencyKey: String(f.data.get("idempotencyKey")) }, include: { invoice: true } });
    expect(order).toMatchObject({ source, status: "Draft", approvalStatus: "Pending", approvalRisk: "Outstanding Payment", invoice: null });
    expect(await db.auditTrail.count({ where: { entityId: order.id, action: "APPROVAL_REQUESTED" } })).toBe(1);
    expect(await db.deliveryNote.count({ where: { customerId: f.customer.id } })).toBe(0);
    state.actor.role = "MANAGER";
    const approval = form({ salesOrderId: order.id, expectedVersion: String(order.version), decision: "Approved" });
    await expect(decideSalesOrderApproval(approval)).rejects.toThrow(/success=.*approved/);
    await expect(decideSalesOrderApproval(approval)).rejects.toThrow(/error=/);
    expect(await db.invoice.count({ where: { salesOrderId: order.id } })).toBe(1);
  }, 30_000);

  it.each([[0, "Paid"], [1000, "Cancelled"]] as const)("does not request approval for %s / %s", async (remaining, status) => {
    const f = await fixture("CUSTOMER_PO", "CREDIT", remaining, status);
    await expect(createSalesOrder(f.data)).rejects.toThrow(/success=/);
    expect(await db.salesOrder.findUniqueOrThrow({ where: { idempotencyKey: String(f.data.get("idempotencyKey")) } })).toMatchObject({ status: "Confirmed", approvalStatus: "NotRequired" });
  }, 30_000);

  it.each([true, false])("re-reads balances after upload when paidDuringUpload=%s", async paidDuringUpload => {
    const f = await fixture("CUSTOMER_PO", "IMMEDIATE", paidDuringUpload ? 1000 : 0, paidDuringUpload ? "Unpaid" : "Paid");
    state.duringUpload = async () => {
      await db.invoice.update({ where: { id: f.oldInvoice.id }, data: paidDuringUpload
        ? { status: "Paid", paidAmount: 1000, remainingAmount: 0 }
        : { status: "Unpaid", paidAmount: 0, remainingAmount: 1000 } });
    };
    try {
      await expect(createSalesOrder(f.data)).rejects.toThrow(/success=/);
      expect(await db.salesOrder.findUniqueOrThrow({ where: { idempotencyKey: String(f.data.get("idempotencyKey")) } })).toMatchObject({
        status: paidDuringUpload ? "Confirmed" : "Draft", approvalStatus: paidDuringUpload ? "NotRequired" : "Pending"
      });
    } finally { state.duringUpload = null; }
  }, 30_000);
});
