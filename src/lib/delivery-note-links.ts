
import type { Prisma } from "@prisma/client";

export function linkedDeliveryNotes<T extends { id: string }>(record: {
  deliveryNotes: T[];
  deliverySources?: Array<{ deliveryNote: T }>;
}): T[] {
  return Array.from(new Map([
    ...record.deliveryNotes,
    ...(record.deliverySources ?? []).map(source => source.deliveryNote)
  ].map(note => [note.id, note])).values());
}

export const deliverySourcesInclude = {
  include: { salesOrder: true, invoice: true, pickingList: true },
  orderBy: { salesOrder: { orderNumber: "asc" } }
} satisfies Prisma.DeliveryNote$sourcesArgs;

export function orderReference(order: { orderNumber: string; customerPoNumber?: string | null } | null | undefined) {
  if (!order) return "-";
  return order.customerPoNumber ? order.customerPoNumber + " / " + order.orderNumber : order.orderNumber;
}
