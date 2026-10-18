// Targeted recovery for the two orders reported with the old delivery-gated policy.
// Preview: node scripts/repair-order-approval.mjs
// Apply after reviewing the preview: node scripts/repair-order-approval.mjs --apply
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
assert.ok(process.argv.slice(2).every(arg => arg === "--apply"), "Only --apply is supported");
const db = new PrismaClient();
const orderNumbers = ["SO-2026-045", "SO-2026-047"];
const actorUsername = "system:approval-policy-repair";
const include = {
  invoice: true, pickingList: true, deliveryNotes: true, deliverySources: true,
  customer: { include: { invoices: {
    where: { status: { not: "Cancelled" }, remainingAmount: { gt: 0 } },
    select: { id: true, invoiceNumber: true, createdAt: true, remainingAmount: true }
  } } }
};

async function inspect(client) {
  const orders = await client.salesOrder.findMany({ where: { orderNumber: { in: orderNumbers } }, include, orderBy: { orderNumber: "asc" } });
  assert.equal(orders.length, orderNumbers.length, "Both reported orders must exist");
  for (const order of orders) {
    if (order.status === "Draft" && order.approvalStatus === "Pending") continue;
    assert.equal(order.status, "Confirmed", `${order.orderNumber}: status changed; stop for review`);
    assert.equal(order.approvalStatus, "NotRequired", `${order.orderNumber}: approval changed; stop for review`);
    assert.equal(order.invoice, null, "An invoice already exists; do not rewind this order");
    assert.equal(order.pickingList, null, "Packing already exists; do not rewind this order");
    assert.equal(order.packStartedAt, null, "Packing has started; do not rewind this order");
    assert.equal(order.deliveryNotes.length + order.deliverySources.length, 0, "Delivery already exists; do not rewind this order");
    assert.equal(order.approvalDecidedAt, null, "An approval decision already exists");
    const creation = await client.auditTrail.findFirst({ where: { entityId: order.id, action: "CREATED", actorRole: "Sales" } });
    assert.ok(creation, "Original creation must be attributed to Sales");
    assert.ok(order.customer.invoices.some(invoice => invoice.createdAt <= order.createdAt), "A prior unpaid invoice is required");
  }
  return orders;
}

function summary(order) {
  return {
    id: order.id, orderNumber: order.orderNumber, customerPoNumber: order.customerPoNumber,
    status: order.status, approvalStatus: order.approvalStatus, version: order.version,
    priorOutstanding: order.customer.invoices.filter(invoice => invoice.createdAt <= order.createdAt)
      .reduce((sum, invoice) => sum + invoice.remainingAmount, 0)
  };
}

try {
  const before = await inspect(db);
  console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "preview", orders: before.map(summary) }, null, 2));
  if (process.argv.includes("--apply")) {
    const directory = "outputs/approval-fix-2026-10-18";
    mkdirSync(directory, { recursive: true });
    const backup = `${directory}/reported-orders-before-${Date.now()}.json`;
    writeFileSync(backup, JSON.stringify(before, null, 2), { flag: "wx" });
    await db.$transaction(async tx => {
      for (const order of before) {
        await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${order.id} FOR UPDATE`;
      }
      const current = await inspect(tx);
      for (const order of current) {
        if (order.status === "Draft" && order.approvalStatus === "Pending") continue;
        const previous = before.find(candidate => candidate.id === order.id);
        assert.equal(order.version, previous.version, "Order changed since backup; retry preview");
        const changed = await tx.salesOrder.updateMany({
          where: { id: order.id, version: order.version, status: "Confirmed", approvalStatus: "NotRequired" },
          data: { status: "Draft", approvalStatus: "Pending", approvalRisk: "Outstanding Payment", version: { increment: 1 } }
        });
        assert.equal(changed.count, 1);
        await tx.auditTrail.create({ data: {
          actorUserId: null, actorUsername, actorDisplayName: "Approval policy repair", actorRole: "System",
          moduleName: order.source === "CUSTOMER_PO" ? "Customer Purchase Orders" : "Sales Orders",
          entityType: "SALES_ORDER", entityId: order.id, recordReference: order.orderNumber,
          action: "APPROVAL_REQUESTED",
          actionNote: "Correct approval routing: prior unpaid invoices require Manager review regardless of delivery status.",
          changeSummary: `${order.orderNumber} routed to Manager approval after correcting the outstanding-invoice policy`,
          oldValue: JSON.stringify(summary(order)),
          newValue: JSON.stringify({ ...summary(order), status: "Draft", approvalStatus: "Pending", approvalRisk: "Outstanding Payment", version: order.version + 1 })
        } });
      }
    }, { timeout: 20000 });
    const after = await inspect(db);
    console.log(JSON.stringify({ backup, after: after.map(summary) }, null, 2));
  }
} finally { await db.$disconnect(); }
