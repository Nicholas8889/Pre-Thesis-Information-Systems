import { canCreateDeliveryNoteForInvoice } from "@/lib/calculations";

type FulfillmentOrder = {
  status: string;
  approvalStatus: string;
  invoice: { status: string; paymentTermType: "IMMEDIATE" | "CREDIT" } | null;
};

export function canFulfillOrder(order: FulfillmentOrder) {
  return (
    ["Confirmed", "Invoiced"].includes(order.status) &&
    ["NotRequired", "Approved"].includes(order.approvalStatus) &&
    order.invoice !== null &&
    order.invoice.status !== "Cancelled" &&
    canCreateDeliveryNoteForInvoice(order.invoice)
  );
}

export function canCreatePickingList(
  order: FulfillmentOrder & {
    hasPickingList: boolean;
    deliveryNoteCount: number;
  },
) {
  return (
    canFulfillOrder(order) &&
    !order.hasPickingList &&
    order.deliveryNoteCount === 0
  );
}

export function validatePickingQuantities(
  items: Array<{
    orderedQuantity: number;
    pickedQuantity: number;
    packedQuantity: number;
  }>,
) {
  return (
    items.length > 0 &&
    items.every(
      (item) =>
        Number.isSafeInteger(item.orderedQuantity) &&
        item.orderedQuantity > 0 &&
        Number.isSafeInteger(item.pickedQuantity) &&
        item.pickedQuantity >= 0 &&
        Number.isSafeInteger(item.packedQuantity) &&
        item.packedQuantity >= 0 &&
        item.packedQuantity <= item.pickedQuantity &&
        item.pickedQuantity <= item.orderedQuantity,
    )
  );
}

export function isPickingComplete(
  items: Array<{
    orderedQuantity: number;
    pickedQuantity: number;
    packedQuantity: number;
  }>,
) {
  return (
    validatePickingQuantities(items) &&
    items.every(
      (item) =>
        item.pickedQuantity === item.orderedQuantity &&
        item.packedQuantity === item.orderedQuantity,
    )
  );
}
