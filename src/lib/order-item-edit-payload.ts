import { MAX_ORDER_QUANTITY } from "@/lib/workflow";

export type OrderItemEditLine = { itemId: string | null; productId: string | null; quantity: number };
export const ORDER_ITEM_EDIT_FIELDS = ["itemId", "productId", "quantity"] as const;

// Existing row IDs survive quantity edits; omitted rows mean removal. Prices,
// header fields, actor, approval, revision and lock timestamps are never inputs.
export function parseOrderItemEditLines(value: unknown): OrderItemEditLine[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1000) return null;
  const ids = new Set<string>();
  const result: OrderItemEditLine[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some(key => !ORDER_ITEM_EDIT_FIELDS.includes(key as typeof ORDER_ITEM_EDIT_FIELDS[number]))) return null;
    const { itemId = null, productId, quantity } = row;
    if ((itemId !== null && (typeof itemId !== "string" || !itemId.trim() || itemId.length > 128)) ||
        (productId !== null && (typeof productId !== "string" || !productId.trim() || productId.length > 128)) ||
        (productId === null && itemId === null) ||
        !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY) return null;
    const normalizedId = itemId === null ? null : itemId.trim();
    if (normalizedId && ids.has(normalizedId)) return null;
    if (normalizedId) ids.add(normalizedId);
    result.push({ itemId: normalizedId, productId: productId === null ? null : productId.trim(), quantity });
  }
  return result;
}
