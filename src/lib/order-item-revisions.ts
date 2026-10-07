import "server-only";
import type { Prisma, UserRole } from "@prisma/client";
import { normalizeActionNote } from "@/lib/action-notes";
import { createAuditTrailLog } from "@/lib/audit";
import { getOrderItemEditEligibility } from "@/lib/order-item-edit-policy";
import { OrderItemEditError, type OrderItemEditRecord } from "@/lib/order-item-edit-context";

type RevisionActor = { id: string; role: UserRole; username: string; displayName: string };
const protectedOrderFields = [
  "id", "orderNumber", "source", "customerPoNumber", "customerId", "orderDate", "requiredDate",
  "deliveryDestinationSnapshot", "paymentTermType", "creditTermMonths", "creditTermWeeks",
  "customerPoDocumentName", "customerPoDocumentStoredName", "customerPoDocumentMimeType",
  "customerPoDocumentSize", "customerPoDocumentSha256", "customerNpwpSnapshot", "ppnApplied", "ppnRateBasisPoints",
  "createdByUserId", "createdAt", "idempotencyKey", "notes",
] as const;
const protectedInvoiceFields = [
  "id", "invoiceNumber", "salesOrderId", "customerId", "issueDate", "dueDate", "paymentTermType",
  "creditTermMonths", "creditTermWeeks", "customerNpwpSnapshot", "ppnApplied", "ppnRateBasisPoints",
  "orderNumberSnapshot", "orderSourceSnapshot", "customerPoNumberSnapshot", "customerNameSnapshot",
  "customerCompanySnapshot", "customerPhoneSnapshot", "customerEmailSnapshot", "customerAddressSnapshot",
] as const;
const signature = (order: OrderItemEditRecord) => JSON.stringify(order.items.map(({ id, productId, quantity }) => ({ id, productId, quantity })).sort((a, b) => a.id.localeCompare(b.id)));
const jsonValue = (record: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(record)) as Prisma.InputJsonObject;

export function buildOrderItemRevisionData({ actor, reason, before, after }: {
  actor: RevisionActor; reason: string; before: OrderItemEditRecord; after: OrderItemEditRecord;
}): Prisma.SalesOrderItemRevisionUncheckedCreateInput {
  const note = normalizeActionNote(reason, "required");
  const eligibility = getOrderItemEditEligibility(actor, before);
  if (!eligibility.allowed) throw new OrderItemEditError(eligibility.code, eligibility.message);
  // A zero-total invoice can become settled without any payment being recorded.
  // Validate the remaining boundaries against that state, while future edits
  // still follow the ordinary settled-invoice policy.
  const zeroSettlement = after.invoice?.status === "Paid" && after.invoice.totalAmount === 0 &&
    after.invoice.paidAmount === 0 && after.invoice._count.payments === 0;
  const afterEligibility = getOrderItemEditEligibility(actor, zeroSettlement
    ? { ...after, invoice: { ...after.invoice!, status: "Unpaid" } } : after);
  if (!afterEligibility.allowed) throw new OrderItemEditError(afterEligibility.code, afterEligibility.message);
  if (protectedOrderFields.some(field => JSON.stringify(before[field]) !== JSON.stringify(after[field])) ||
      Boolean(before.invoice) !== Boolean(after.invoice) ||
      (before.invoice && after.invoice && protectedInvoiceFields.some(field => JSON.stringify(before.invoice![field]) !== JSON.stringify(after.invoice![field]))) ||
      before.pickingList?.id !== after.pickingList?.id) {
    throw new OrderItemEditError("PROTECTED_FIELD", "Item revision cannot change document identity, customer, dates, terms or tax configuration.");
  }
  if (after.revisionNumber !== before.revisionNumber + 1 || after.version !== before.version + 1 ||
      (before.invoice && after.invoice && (after.invoice.revisionNumber !== before.invoice.revisionNumber + 1 || after.invoice.version !== before.invoice.version + 1))) {
    throw new OrderItemEditError("INVALID_REVISION", "Item revisions must advance document revision and concurrency versions once.");
  }
  if (signature(before) === signature(after)) throw new OrderItemEditError("NO_CHANGE", "No transaction items changed.");
  return {
    salesOrderId: before.id, revisionNumber: after.revisionNumber,
    invoiceId: after.invoice?.id ?? null, invoiceRevisionNumber: after.invoice?.revisionNumber ?? null,
    actorUserId: actor.id, actorUsername: actor.username, actorDisplayName: actor.displayName,
    actorRole: actor.role, reason: note, beforeSnapshot: jsonValue(before), afterSnapshot: jsonValue(after),
  };
}

// Called inside the same locked transaction that updates the order, invoice
// and Pick sheet; snapshot history and the existing Audit Trail commit together.
export async function persistOrderItemRevision(
  tx: Prisma.TransactionClient, input: Parameters<typeof buildOrderItemRevisionData>[0],
) {
  const data = buildOrderItemRevisionData(input);
  const revision = await tx.salesOrderItemRevision.create({ data });
  await createAuditTrailLog({
    actor: input.actor,
    moduleName: input.before.source === "CUSTOMER_PO" ? "Customer Purchase Orders" : "Sales Orders",
    entityType: "SALES_ORDER", entityId: input.before.id, recordReference: input.before.orderNumber,
    action: "ITEMS_REVISED", actionNote: data.reason,
    changeSummary: `Transaction items revised to revision ${input.after.revisionNumber}`,
    oldValue: { revisionNumber: input.before.revisionNumber, items: input.before.items, invoice: input.before.invoice },
    newValue: { revisionId: revision.id, revisionNumber: input.after.revisionNumber, items: input.after.items, invoice: input.after.invoice },
  }, { transaction: tx });
  return revision;
}
