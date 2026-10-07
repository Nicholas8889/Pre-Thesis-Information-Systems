import "server-only";
import type { Prisma, UserRole } from "@prisma/client";
import { normalizeActionNote } from "@/lib/action-notes";
import { createAuditTrailLog } from "@/lib/audit";
import { customerInvoiceBalanceSelect } from "@/lib/customer-payment-query";
import { getCustomerPaymentSummary } from "@/lib/customer-intelligence";
import { buildInvoiceSnapshot } from "@/lib/invoice-snapshot";
import { lockOrderItemEditContext, loadOrderItemEditContext, OrderItemEditError, type OrderItemEditRecord } from "@/lib/order-item-edit-context";
import { parseOrderItemEditLines } from "@/lib/order-item-edit-payload";
import { buildOrderItemEditPlan, resolveEditApprovalPlan, type EditApprovalPlan } from "@/lib/order-item-edit-plan";
import { persistOrderItemRevision } from "@/lib/order-item-revisions";
import { getInvoiceStatusForAmounts } from "@/lib/workflow";

export type OrderItemEditActor = { id: string; role: UserRole; username: string; displayName: string };
export type OrderItemEditRequest = { id: string; expectedVersion: number; items: unknown };

async function approvalPlan(tx: Prisma.TransactionClient, before: OrderItemEditRecord, actor: OrderItemEditActor): Promise<EditApprovalPlan> {
  if (before.invoice) return resolveEditApprovalPlan(before, actor.role, "Clean");
  const customer = await tx.customer.findUniqueOrThrow({ where: { id: before.customerId },
    select: { invoices: { select: customerInvoiceBalanceSelect } } });
  const risk = getCustomerPaymentSummary(customer).paymentStatus;
  return resolveEditApprovalPlan(before, actor.role, risk);
}

async function prepare(tx: Prisma.TransactionClient, request: OrderItemEditRequest, actor: OrderItemEditActor) {
  if (!request.id || !Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 1) throw new OrderItemEditError("INVALID_PAYLOAD", "A valid transaction and version are required.");
  const lines = parseOrderItemEditLines(request.items);
  if (!lines) throw new OrderItemEditError("INVALID_PAYLOAD", "Submit only valid item IDs, products and quantities.");
  const before = await lockOrderItemEditContext(tx, request.id, actor, request.expectedVersion);
  const originals = new Map(before.items.map(item => [item.id, item]));
  for (const line of lines) {
    if (line.itemId && !originals.has(line.itemId)) throw new OrderItemEditError("FOREIGN_ITEM", "An item does not belong to this transaction.");
  }
  const productIds = [...new Set(lines.flatMap(line =>
    line.productId && (!line.itemId || originals.get(line.itemId)?.productId !== line.productId) ? [line.productId] : [],
  ))].sort();
  if (productIds.length) {
    // Serialize default-price resolution with product price/status changes.
    await tx.$queryRaw`SELECT id FROM products WHERE id = ANY(${productIds}::text[]) ORDER BY id FOR SHARE`;
  }
  const products = productIds.length ? await tx.product.findMany({ where: { id: { in: productIds } },
    select: { id: true, productName: true, sku: true, listPrice: true, status: true } }) : [];
  const approval = await approvalPlan(tx, before, actor);
  return { before, plan: buildOrderItemEditPlan(before, lines, products, approval) };
}

export async function previewOrderItemEdit(tx: Prisma.TransactionClient, request: OrderItemEditRequest, actor: OrderItemEditActor) {
  const { before, plan } = await prepare(tx, request, actor);
  return {
    id: before.id, source: before.source, version: before.version, quoteHash: plan.quoteHash,
    revisionNumber: before.revisionNumber + 1, items: plan.items,
    removedItems: before.items.filter(item => plan.removedItemIds.includes(item.id)),
    previousTotal: before.total, total: plan.total, ppnAmount: plan.ppnAmount, netSalesAmount: plan.netSalesAmount,
    invoiceId: before.invoice?.id ?? null, invoiceRevisionNumber: before.invoice ? before.invoice.revisionNumber + 1 : null,
    pickingListId: before.pickingList?.id ?? null, approvalStatus: plan.approval.approvalStatus,
  };
}

export async function applyOrderItemEdit(
  tx: Prisma.TransactionClient, request: OrderItemEditRequest & { quoteHash: string; reason: string },
  actor: OrderItemEditActor, now = new Date(),
) {
  const reason = normalizeActionNote(request.reason, "required");
  if (!/^[a-f0-9]{64}$/.test(request.quoteHash)) throw new OrderItemEditError("PREVIEW_REQUIRED", "Review the latest item-change preview before saving.");
  const { before, plan } = await prepare(tx, request, actor);
  if (plan.quoteHash !== request.quoteHash) throw new OrderItemEditError("PREVIEW_CHANGED", "Prices or transaction state changed. Review a fresh preview before saving.");
  const updated = await tx.salesOrder.updateMany({ where: { id: before.id, version: before.version,
    revisionNumber: before.revisionNumber, packStartedAt: null }, data: {
    subtotal: plan.subtotal, total: plan.total, ppnAmount: plan.ppnAmount, netSalesAmount: plan.netSalesAmount,
    status: plan.approval.status, approvalStatus: plan.approval.approvalStatus, approvalRisk: plan.approval.approvalRisk,
    ...(plan.approval.clearDecision ? { approvalDecisionNote: null, approvalDecidedAt: null, approvalDecidedById: null } : {}),
    ...(plan.approval.reaffirmDecision ? { approvalDecisionNote: reason, approvalDecidedAt: now, approvalDecidedById: actor.id } : {}),
    revisionNumber: { increment: 1 }, version: { increment: 1 },
  } });
  if (updated.count !== 1) throw new OrderItemEditError("STALE_VERSION", "The transaction changed. Reload it before editing items.");

  if (before.pickingList && plan.removedItemIds.length) await tx.pickingListItem.deleteMany({
    where: { pickingListId: before.pickingList.id, salesOrderItemId: { in: plan.removedItemIds } },
  });
  if (plan.removedItemIds.length) await tx.salesOrderItem.deleteMany({ where: { salesOrderId: before.id, id: { in: plan.removedItemIds } } });
  const retained = plan.items.filter(item => item.itemId !== null);
  if (retained.length) {
    const count = await tx.$executeRaw`
      UPDATE sales_order_items AS item SET
        product_id = patch."productId", item_name = patch."itemName", product_sku_snapshot = patch."productSkuSnapshot",
        quantity = patch.quantity, base_unit_price = patch."baseUnitPrice", markup_percent = patch."markupPercent",
        discount_percent = patch."discountPercent", final_unit_price = patch."finalUnitPrice", subtotal = patch.subtotal
      FROM jsonb_to_recordset(${JSON.stringify(retained.map(item => ({ ...item, id: item.itemId })))}::jsonb) AS patch(
        id TEXT, "productId" TEXT, "itemName" TEXT, "productSkuSnapshot" TEXT, quantity INTEGER,
        "baseUnitPrice" INTEGER, "markupPercent" INTEGER, "discountPercent" INTEGER, "finalUnitPrice" INTEGER, subtotal INTEGER
      )
      WHERE item.sales_order_id = ${before.id} AND item.id = patch.id
    `;
    if (count !== retained.length) throw new OrderItemEditError("ITEM_CHANGED", "An order item changed. Reload the transaction.");
  }
  const added = plan.items.filter(item => item.itemId === null);
  if (added.length) await tx.salesOrderItem.createMany({ data: added.map(item => ({
    salesOrderId: before.id, productId: item.productId, itemName: item.itemName, productSkuSnapshot: item.productSkuSnapshot,
    quantity: item.quantity, baseUnitPrice: item.baseUnitPrice, markupPercent: item.markupPercent,
    discountPercent: item.discountPercent, finalUnitPrice: item.finalUnitPrice, subtotal: item.subtotal,
  })) });
  const items = await tx.salesOrderItem.findMany({ where: { salesOrderId: before.id }, orderBy: { id: "asc" } });
  if (before.pickingList) {
    const listId = before.pickingList.id;
    await tx.pickingListItem.deleteMany({ where: { pickingListId: listId, salesOrderItemId: { notIn: items.map(item => item.id) } } });
    await tx.pickingListItem.updateMany({ where: { pickingListId: listId }, data: {
      isChecked: false, availabilityStatus: "Unchecked", availableQuantity: 0, packedQuantity: 0, notes: null,
    } });
    await tx.$executeRaw`
      UPDATE picking_list_items AS picked SET item_name = ordered.item_name, ordered_quantity = ordered.quantity
      FROM sales_order_items AS ordered
      WHERE picked.picking_list_id = ${listId} AND picked.sales_order_item_id = ordered.id AND ordered.sales_order_id = ${before.id}
    `;
    const existingIds = new Set(before.pickingList.items.map(item => item.salesOrderItemId));
    const newPickItems = items.filter(item => !existingIds.has(item.id));
    if (newPickItems.length) await tx.pickingListItem.createMany({ data: newPickItems.map(item => ({
      pickingListId: listId, salesOrderItemId: item.id, itemName: item.itemName, orderedQuantity: item.quantity,
    })) });
    // Invalidate any old Pick/Pack form while preserving sheet identity and PIC.
    const sheetUpdated = await tx.pickingList.updateMany({ where: { id: before.pickingList.id,
      status: "Pending", updatedAt: before.pickingList.updatedAt, deliveryNote: { is: null }, deliverySource: { is: null } },
      data: { usesChecklist: true, updatedAt: new Date(Math.max(now.getTime(), before.pickingList.updatedAt.getTime() + 1)) } });
    if (sheetUpdated.count !== 1) throw new OrderItemEditError("PACK_STARTED", "The sheet changed or has entered Pack.");
  }
  if (before.invoice) {
    const invoice = before.invoice;
    const snapshot = buildInvoiceSnapshot({ orderNumber: before.orderNumber, source: before.source, customerPoNumber: before.customerPoNumber,
      customer: { name: invoice.customerNameSnapshot, companyName: invoice.customerCompanySnapshot,
        phone: invoice.customerPhoneSnapshot, email: invoice.customerEmailSnapshot, address: invoice.customerAddressSnapshot }, items });
    const invoiceUpdated = await tx.invoice.updateMany({ where: { id: invoice.id, version: invoice.version,
      revisionNumber: invoice.revisionNumber, paidAmount: 0, status: { in: ["Unpaid", "Overdue"] }, payments: { none: {} } }, data: {
      totalAmount: plan.total, remainingAmount: plan.total, ppnAmount: plan.invoiceTax!.ppnAmount, netSalesAmount: plan.invoiceTax!.netSalesAmount,
      status: getInvoiceStatusForAmounts({ totalAmount: plan.total, paidAmount: 0, dueDate: invoice.dueDate, asOfDate: now }),
      itemsSnapshot: snapshot.itemsSnapshot, revisionNumber: { increment: 1 }, version: { increment: 1 },
    } });
    if (invoiceUpdated.count !== 1) throw new OrderItemEditError("INVOICE_CHANGED", "The invoice changed or has recorded a payment.");
  }
  const after = (await loadOrderItemEditContext(before.id, actor, tx)).order!;
  const revision = await persistOrderItemRevision(tx, { actor, before, after, reason });
  const additionalAudits = [];
  if (after.invoice) additionalAudits.push({ actor, moduleName: "Invoices", entityType: "INVOICE", entityId: after.invoice.id,
    recordReference: after.invoice.invoiceNumber, action: "ITEMS_REVISED", actionNote: reason,
    changeSummary: `Invoice synchronized with order item revision ${after.revisionNumber}`,
    oldValue: before.invoice, newValue: after.invoice });
  if (after.invoice) additionalAudits.push({ actor, moduleName: "Receivables", entityType: "RECEIVABLE", entityId: after.invoice.id,
    recordReference: after.invoice.invoiceNumber, action: "ITEMS_REVISED", actionNote: reason,
    changeSummary: "Receivable amount updated from the revised invoice",
    oldValue: before.invoice, newValue: after.invoice });
  if (after.invoice?.remainingAmount === 0) {
    const tasks = await tx.collectionTask.findMany({ where: { invoiceId: after.invoice.id, status: "Planned" } });
    for (const task of tasks) {
      const closed = await tx.collectionTask.updateMany({ where: { id: task.id, status: "Planned", version: task.version },
        data: { status: "Done", version: { increment: 1 } } });
      if (closed.count === 1) additionalAudits.push({ actor, moduleName: "Collections", entityType: "COLLECTION_TASK", entityId: task.id,
        recordReference: after.invoice.invoiceNumber, action: "STATUS_CHANGED", actionNote: reason,
        changeSummary: "Planned collection completed because the revised invoice has zero remaining balance",
        oldValue: task, newValue: { ...task, status: "Done", version: task.version + 1 } });
    }
  }
  if (after.pickingList) additionalAudits.push({ actor, moduleName: "Pick & Pack", entityType: "PICKING_LIST", entityId: after.pickingList.id,
    recordReference: after.pickingList.pickingListNumber, action: "ITEMS_REVISED", actionNote: reason,
    changeSummary: `Pick sheet synchronized with order item revision ${after.revisionNumber}`,
    oldValue: before.pickingList, newValue: after.pickingList });
  if (additionalAudits.length) await createAuditTrailLog(additionalAudits, { transaction: tx });
  return { id: after.id, source: after.source, revisionId: revision.id, revisionNumber: after.revisionNumber, version: after.version,
    invoiceId: after.invoice?.id ?? null, invoiceRevisionNumber: after.invoice?.revisionNumber ?? null,
    pickingListId: after.pickingList?.id ?? null, approvalStatus: after.approvalStatus };
}
