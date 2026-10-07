import { describe, expect, it } from "vitest";
import { buildOrderItemRevisionData } from "../../src/lib/order-item-revisions";
import type { OrderItemEditRecord } from "../../src/lib/order-item-edit-context";

const actor = { id: "manager", role: "MANAGER" as const, username: "manager", displayName: "Manager" };
const base = {
  id: "order", orderNumber: "SO-1", source: "DIRECT", customerId: "customer", createdByUserId: "sales",
  status: "Confirmed", approvalStatus: "NotRequired", packStartedAt: null, revisionNumber: 1, version: 1,
  customer: { status: "Active" }, _count: { deliveryNotes: 0, deliverySources: 0 },
  pickingList: null, invoice: null, items: [{ id: "line", productId: "p", quantity: 1 }],
} as unknown as OrderItemEditRecord;
function changed(before = base): OrderItemEditRecord {
  return { ...before, revisionNumber: before.revisionNumber + 1, version: before.version + 1,
    items: before.items.map(item => ({ ...item, quantity: item.quantity + 1 })),
    invoice: before.invoice ? { ...before.invoice, revisionNumber: before.invoice.revisionNumber + 1, version: before.invoice.version + 1 } : null,
  };
}
describe("revision snapshot contract", () => {
  it("stores complete before/after images and actor/reason without relying on concurrency version as the revision", () => {
    const before = { ...base, version: 8 };
    const record = buildOrderItemRevisionData({ actor, before, after: changed(before), reason: " Correct quantity " });
    expect(record).toMatchObject({ salesOrderId: "order", revisionNumber: 2, actorUserId: actor.id, reason: "Correct quantity", invoiceId: null });
    expect(record.beforeSnapshot).toMatchObject({ version: 8, revisionNumber: 1 });
    expect(record.afterSnapshot).toMatchObject({ version: 9, revisionNumber: 2 });
  });
  it.each(["customerId", "orderNumber", "paymentTermType", "requiredDate", "customerPoDocumentStoredName", "deliveryDestinationSnapshot", "ppnRateBasisPoints", "createdByUserId"])("preserves %s", field => {
    const after = { ...changed(), [field]: "changed" };
    expect(() => buildOrderItemRevisionData({ actor, before: base, after, reason: "Correction" })).toThrow("cannot change document identity");
  });
  it("requires a reason, actual item change and exactly one revision/version increment", () => {
    expect(() => buildOrderItemRevisionData({ actor, before: base, after: changed(), reason: " " })).toThrow("A reason is required");
    expect(() => buildOrderItemRevisionData({ actor, before: base, after: { ...changed(), items: base.items }, reason: "Correction" })).toThrow("No transaction items changed");
    expect(() => buildOrderItemRevisionData({ actor, before: base, after: { ...changed(), revisionNumber: 4 }, reason: "Correction" })).toThrow("must advance");
  });
  it("keeps invoice identity/dates while recording its next independent document revision", () => {
    const before = { ...base, status: "Invoiced", invoice: {
      id: "invoice", invoiceNumber: "INV-1", revisionNumber: 1, version: 7, status: "Unpaid", paidAmount: 0,
      _count: { payments: 0, deliveryNotes: 0, deliverySources: 0 },
    } } as unknown as OrderItemEditRecord;
    const after = changed(before);
    expect(buildOrderItemRevisionData({ actor, before, after, reason: "Correction" })).toMatchObject({ invoiceId: "invoice", invoiceRevisionNumber: 2 });
    expect(() => buildOrderItemRevisionData({ actor, before, after: { ...after, invoice: { ...after.invoice!, invoiceNumber: "changed" } }, reason: "Correction" })).toThrow("cannot change document identity");
    expect(() => buildOrderItemRevisionData({ actor, before, after: { ...after, invoice: { ...after.invoice!, revisionNumber: 1 } }, reason: "Correction" })).toThrow("must advance");
  });
  it("rechecks policy for snapshots instead of accepting edits made after Pack or payment", () => {
    expect(() => buildOrderItemRevisionData({ actor, before: base, after: { ...changed(), packStartedAt: new Date() }, reason: "Correction" })).toThrow("already entered Pack");
  });
  it("records a zero-total settlement without treating it as an actual payment", () => {
    const before = { ...base, status: "Invoiced", invoice: {
      id: "invoice", status: "Unpaid", totalAmount: 100, paidAmount: 0, version: 1, revisionNumber: 1,
      _count: { payments: 0, deliveryNotes: 0, deliverySources: 0 },
    } } as unknown as OrderItemEditRecord;
    const after = changed(before); after.invoice = { ...after.invoice!, status: "Paid", totalAmount: 0 };
    expect(buildOrderItemRevisionData({ actor, before, after, reason: "Free sample" }).invoiceRevisionNumber).toBe(2);
    after.invoice._count.payments = 1;
    expect(() => buildOrderItemRevisionData({ actor, before, after, reason: "Free sample" })).toThrow("payment");
  });
});
