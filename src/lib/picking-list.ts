import { canCreateDeliveryNoteForInvoice } from "@/lib/calculations";

type FulfillmentOrder = {
  status: string;
  approvalStatus: string;
  invoice: { status: string; paymentTermType: "IMMEDIATE" | "CREDIT" } | null;
};

export const PICKING_AVAILABILITY_STATUSES = [
  "Unchecked",
  "Available",
  "Partial",
  "Unavailable",
] as const;

export type PickingAvailabilityStatus =
  (typeof PICKING_AVAILABILITY_STATUSES)[number];

export type PickingQuantityItem = {
  orderedQuantity: number;
  availableQuantity: number;
  packedQuantity: number;
  availabilityStatus: string;
  notes?: string | null;
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

export function validatePickingQuantities(items: PickingQuantityItem[]) {
  return (
    items.length > 0 &&
    items.every((item) => {
      if (
        !Number.isSafeInteger(item.orderedQuantity) ||
        item.orderedQuantity <= 0 ||
        !Number.isSafeInteger(item.availableQuantity) ||
        item.availableQuantity < 0 ||
        !Number.isSafeInteger(item.packedQuantity) ||
        item.packedQuantity < 0 ||
        item.packedQuantity > item.availableQuantity ||
        item.availableQuantity > item.orderedQuantity ||
        !PICKING_AVAILABILITY_STATUSES.includes(
          item.availabilityStatus as PickingAvailabilityStatus,
        )
      ) {
        return false;
      }

      switch (item.availabilityStatus) {
        case "Unchecked":
          return item.availableQuantity === 0 && item.packedQuantity === 0;
        case "Unavailable":
          return item.availableQuantity === 0;
        case "Available":
          return item.availableQuantity === item.orderedQuantity;
        case "Partial":
          return (
            item.availableQuantity > 0 &&
            item.availableQuantity < item.orderedQuantity
          );
        default:
          return false;
      }
    })
  );
}

export function isPickingComplete(items: PickingQuantityItem[]) {
  return (
    validatePickingQuantities(items) &&
    items.every(
      (item) =>
        item.availabilityStatus !== "Unchecked" &&
        item.packedQuantity === item.availableQuantity &&
        (item.availableQuantity === item.orderedQuantity ||
          Boolean(item.notes?.trim())),
    )
  );
}

export function canCreateDeliveryFromPickingList(
  items: PickingQuantityItem[],
) {
  return (
    isPickingComplete(items) &&
    items.some((item) => item.packedQuantity > 0)
  );
}

export function getPickingTotals(items: PickingQuantityItem[]) {
  return items.reduce(
    (totals, item) => ({
      ordered: totals.ordered + item.orderedQuantity,
      available: totals.available + item.availableQuantity,
      packed: totals.packed + item.packedQuantity,
      shortage:
        totals.shortage + item.orderedQuantity - item.availableQuantity,
    }),
    { ordered: 0, available: 0, packed: 0, shortage: 0 },
  );
}
