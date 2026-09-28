import type { DeliveryNoteStatus, Prisma } from "@prisma/client";
import { parseDateOnly } from "@/lib/date-only";

export const DELIVERY_NOTE_SORTS = ["date", "number", "createdAt"] as const;
export const DELIVERY_NOTE_DIRECTIONS = ["asc", "desc"] as const;

export type DeliveryNoteSort = (typeof DELIVERY_NOTE_SORTS)[number];
export type DeliveryNoteDirection = (typeof DELIVERY_NOTE_DIRECTIONS)[number];

export type DeliveryNoteListFilters = {
  query: string;
  customerId: string | null;
  status: DeliveryNoteStatus | null;
  startDate: Date | null;
  endDate: Date | null;
  sort: DeliveryNoteSort;
  direction: DeliveryNoteDirection;
};

const DELIVERY_STATUSES: DeliveryNoteStatus[] = ["Draft", "Issued", "Delivered", "Cancelled"];

export function parseDeliveryNoteListFilters(input: {
  query?: string | null;
  customerId?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  sort?: string | null;
  direction?: string | null;
}): DeliveryNoteListFilters {
  let startDate = input.startDate ? parseDateOnly(input.startDate) : null;
  let endDate = input.endDate ? parseDateOnly(input.endDate) : null;
  if (startDate && endDate && startDate > endDate) {
    startDate = null;
    endDate = null;
  }

  return {
    query: input.query?.trim() ?? "",
    customerId: input.customerId?.trim() || null,
    status: DELIVERY_STATUSES.includes(input.status as DeliveryNoteStatus)
      ? input.status as DeliveryNoteStatus
      : null,
    startDate,
    endDate,
    sort: DELIVERY_NOTE_SORTS.includes(input.sort as DeliveryNoteSort)
      ? input.sort as DeliveryNoteSort
      : "createdAt",
    direction: DELIVERY_NOTE_DIRECTIONS.includes(input.direction as DeliveryNoteDirection)
      ? input.direction as DeliveryNoteDirection
      : "desc",
  };
}

export function buildDeliveryNoteWhere(
  filters: DeliveryNoteListFilters,
  visibleStatuses: DeliveryNoteStatus[],
  portfolioWhere: Prisma.DeliveryNoteWhereInput = {},
): Prisma.DeliveryNoteWhereInput {
  const status = filters.status && visibleStatuses.includes(filters.status)
    ? filters.status
    : null;
  const searchWhere: Prisma.DeliveryNoteWhereInput | undefined = filters.query
    ? {
        OR: [
          { deliveryNoteNumber: { contains: filters.query, mode: "insensitive" } },
          { recipientName: { contains: filters.query, mode: "insensitive" } },
          { recipientAddress: { contains: filters.query, mode: "insensitive" } },
          { customer: { companyName: { contains: filters.query, mode: "insensitive" } } },
          { invoice: { invoiceNumber: { contains: filters.query, mode: "insensitive" } } },
          { salesOrder: { orderNumber: { contains: filters.query, mode: "insensitive" } } },
          { salesOrder: { customerPoNumber: { contains: filters.query, mode: "insensitive" } } },
          { sources: { some: { invoice: { invoiceNumber: { contains: filters.query, mode: "insensitive" } } } } },
          { sources: { some: { salesOrder: { orderNumber: { contains: filters.query, mode: "insensitive" } } } } },
          { sources: { some: { salesOrder: { customerPoNumber: { contains: filters.query, mode: "insensitive" } } } } },
        ],
      }
    : undefined;

  return {
    AND: [
      portfolioWhere,
      { status: status ?? { in: visibleStatuses } },
      ...(filters.customerId ? [{ customerId: filters.customerId }] : []),
      ...(filters.startDate || filters.endDate
        ? [{ deliveryDate: {
            ...(filters.startDate ? { gte: filters.startDate } : {}),
            ...(filters.endDate ? { lte: filters.endDate } : {}),
          } }]
        : []),
      ...(searchWhere ? [searchWhere] : []),
    ],
  };
}

export function buildDeliveryNoteOrderBy(
  filters: Pick<DeliveryNoteListFilters, "sort" | "direction">,
): Prisma.DeliveryNoteOrderByWithRelationInput[] {
  if (filters.sort === "date") {
    return [{ deliveryDate: filters.direction }, { id: filters.direction }];
  }
  if (filters.sort === "number") {
    return [{ deliveryNoteNumber: filters.direction }, { id: filters.direction }];
  }
  return [{ createdAt: filters.direction }, { id: filters.direction }];
}
