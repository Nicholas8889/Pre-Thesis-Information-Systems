import { createHash } from "node:crypto";
import type { Product, SalesOrderApprovalStatus, SalesOrderStatus } from "@prisma/client";
import { calculateAdjustedUnitPriceBasisPoints } from "@/lib/workflow";
import { calculateTaxInclusiveAmounts } from "@/lib/tax";
import { OrderItemEditError, type OrderItemEditRecord } from "@/lib/order-item-edit-context";
import { requiresManagerApproval } from "@/lib/sales-order-approval";
import type { CustomerPaymentStatus } from "@/lib/customer-intelligence";
import type { OrderItemEditLine } from "@/lib/order-item-edit-payload";

export const MAX_TRANSACTION_AMOUNT = 2_147_483_647;
type ProductSnapshot = Pick<Product, "id" | "productName" | "sku" | "listPrice" | "status">;
export type PlannedOrderItem = {
  itemId: string | null; productId: string | null; itemName: string; productSkuSnapshot: string | null;
  quantity: number; baseUnitPrice: number; markupPercent: number; discountPercent: number;
  finalUnitPrice: number; subtotal: number; priceSource: "stored" | "product-default";
};
export type EditApprovalPlan = {
  status: SalesOrderStatus; approvalStatus: SalesOrderApprovalStatus;
  approvalRisk: string | null; clearDecision: boolean; reaffirmDecision: boolean;
};

export function resolveEditApprovalPlan(
  before: Pick<OrderItemEditRecord, "status" | "approvalStatus" | "approvalRisk" | "invoice">,
  actorRole: string, risk: CustomerPaymentStatus,
): EditApprovalPlan {
  if (before.invoice) return { status: before.status, approvalStatus: before.approvalStatus,
    approvalRisk: before.approvalRisk, clearDecision: false, reaffirmDecision: before.approvalStatus === "Approved" };
  const pending = ["Pending", "Approved"].includes(before.approvalStatus) || requiresManagerApproval(actorRole, risk);
  return pending
    ? { status: "Draft", approvalStatus: "Pending", approvalRisk: risk === "Outstanding Payment" ? risk : before.approvalRisk ?? "Manager review required", clearDecision: true, reaffirmDecision: false }
    : { status: before.status, approvalStatus: "NotRequired", approvalRisk: before.approvalRisk, clearDecision: false, reaffirmDecision: false };
}

function assertAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_TRANSACTION_AMOUNT) {
    throw new OrderItemEditError("AMOUNT_OUT_OF_RANGE", "The revised transaction exceeds the supported rupiah amount range.");
  }
}

export function buildOrderItemEditPlan(
  before: OrderItemEditRecord, lines: OrderItemEditLine[], products: ProductSnapshot[], approval: EditApprovalPlan,
) {
  const originals = new Map(before.items.map(item => [item.id, item]));
  const catalog = new Map(products.map(product => [product.id, product]));
  const items: PlannedOrderItem[] = lines.map(line => {
    const original = line.itemId ? originals.get(line.itemId) : undefined;
    if (line.itemId && !original) throw new OrderItemEditError("FOREIGN_ITEM", "An item does not belong to this transaction.");
    const unchangedProduct = original && original.productId === line.productId;
    let item: PlannedOrderItem;
    if (unchangedProduct) {
      item = { itemId: original.id, productId: original.productId, itemName: original.itemName,
        productSkuSnapshot: original.productSkuSnapshot, quantity: line.quantity,
        baseUnitPrice: original.baseUnitPrice, markupPercent: original.markupPercent,
        discountPercent: original.discountPercent, finalUnitPrice: original.finalUnitPrice,
        subtotal: line.quantity * original.finalUnitPrice, priceSource: "stored" };
    } else {
      const product = line.productId ? catalog.get(line.productId) : undefined;
      if (!product || product.status !== "Active") throw new OrderItemEditError("PRODUCT_UNAVAILABLE", "Added or replacement items must use an active Product.");
      // Match the existing form's selectProduct behavior: replace the base price
      // with Product.listPrice, keep row adjustments; a new row starts at 0/0.
      const markupPercent = original?.markupPercent ?? 0;
      const discountPercent = original?.discountPercent ?? 0;
      let finalUnitPrice: number;
      try {
        finalUnitPrice = calculateAdjustedUnitPriceBasisPoints(product.listPrice, markupPercent * 100, discountPercent * 100);
      } catch {
        throw new OrderItemEditError("INVALID_PRICING", "The product default or stored price adjustments are invalid.");
      }
      item = { itemId: original?.id ?? null, productId: product.id, itemName: product.productName,
        productSkuSnapshot: product.sku, quantity: line.quantity, baseUnitPrice: product.listPrice,
        markupPercent, discountPercent, finalUnitPrice, subtotal: line.quantity * finalUnitPrice, priceSource: "product-default" };
    }
    assertAmount(item.finalUnitPrice); assertAmount(item.subtotal);
    return item;
  });
  const selectedIds = new Set(items.flatMap(item => item.itemId ? [item.itemId] : []));
  const removedItemIds = before.items.filter(item => !selectedIds.has(item.id)).map(item => item.id);
  if (!removedItemIds.length && items.length === before.items.length && items.every(item => {
    const original = item.itemId ? originals.get(item.itemId) : undefined;
    return original && original.productId === item.productId && original.quantity === item.quantity;
  })) throw new OrderItemEditError("NO_CHANGE", "No transaction items changed.");
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  assertAmount(total);
  const tax = calculateTaxInclusiveAmounts({ totalAmount: total, ppnApplied: before.ppnApplied, ppnRateBasisPoints: before.ppnRateBasisPoints });
  const invoiceTax = before.invoice ? calculateTaxInclusiveAmounts({ totalAmount: total,
    ppnApplied: before.invoice.ppnApplied, ppnRateBasisPoints: before.invoice.ppnRateBasisPoints }) : null;
  const plan = { items, removedItemIds, subtotal: total, total, ppnAmount: tax.ppnAmount, netSalesAmount: tax.netSalesAmount,
    invoiceTax: invoiceTax ? { ppnAmount: invoiceTax.ppnAmount, netSalesAmount: invoiceTax.netSalesAmount } : null, approval };
  const quoteHash = createHash("sha256").update(JSON.stringify({
    orderId: before.id, version: before.version, invoiceVersion: before.invoice?.version ?? null,
    sheetVersion: before.pickingList?.updatedAt.toISOString() ?? null, ...plan,
  })).digest("hex");
  return { ...plan, quoteHash };
}

export type OrderItemEditPlan = ReturnType<typeof buildOrderItemEditPlan>;
