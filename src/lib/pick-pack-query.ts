import type { DeliveryNoteStatus, Prisma } from "@prisma/client";

import type { SearchParams } from "@/lib/pagination";

export type DeliveryFilter =
  | "all"
  | "not-issued"
  | "open"
  | "delivered"
  | "cancelled";

export type CompletedPickingFilters = {
  query: string;
  pic: string;
  from: string;
  to: string;
  deliveryStatus: DeliveryFilter;
};

export const COMPLETED_PICKING_QUERY_PARAMS = [
  "tab",
  "q",
  "pic",
  "from",
  "to",
  "deliveryStatus",
] as const;

export function parseCompletedPickingFilters(
  params: SearchParams,
): CompletedPickingFilters {
  return {
    query: getFirst(params.q)?.trim() ?? "",
    pic: (getFirst(params.pic) ?? getFirst(params.picker) ?? getFirst(params.packer))?.trim() ?? "",
    from: normalizeDateFilter(getFirst(params.from)),
    to: normalizeDateFilter(getFirst(params.to)),
    deliveryStatus: normalizeDeliveryFilter(getFirst(params.deliveryStatus)),
  };
}

export function buildCompletedPickingWhere(
  portfolioWhere: Prisma.PickingListWhereInput,
  filters: CompletedPickingFilters,
): Prisma.PickingListWhereInput {
  const conditions: Prisma.PickingListWhereInput[] = [{ status: "Packed" }];
  const fromDate = parseJakartaDate(filters.from, false);
  const toDate = parseJakartaDate(filters.to, true);

  if (filters.query) {
    conditions.push({
      OR: [
        { pickingListNumber: { contains: filters.query } },
        { salesOrder: { is: { orderNumber: { contains: filters.query } } } },
        {
          salesOrder: {
            is: { customerPoNumber: { contains: filters.query } },
          },
        },
        {
          salesOrder: {
            is: {
              customer: { is: { companyName: { contains: filters.query } } },
            },
          },
        },
      ],
    });
  }
  if (filters.pic) {
    conditions.push({
      OR: [
        { pickerName: { contains: filters.pic } },
        { usesChecklist: false, packerName: { contains: filters.pic } },
      ],
    });
  }
  if (fromDate || toDate) {
    conditions.push({
      packedAt: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      },
    });
  }
  if (filters.deliveryStatus === "not-issued") {
    conditions.push({
      deliveryNote: { is: null },
      deliverySource: { is: null },
    });
  } else if (filters.deliveryStatus !== "all") {
    const statuses: DeliveryNoteStatus[] =
      filters.deliveryStatus === "open"
        ? ["Draft", "Issued"]
        : filters.deliveryStatus === "delivered"
          ? ["Delivered"]
          : ["Cancelled"];
    conditions.push({
      OR: [
        { deliveryNote: { is: { status: { in: statuses } } } },
        {
          deliverySource: {
            is: { deliveryNote: { is: { status: { in: statuses } } } },
          },
        },
      ],
    });
  }

  return { AND: [portfolioWhere, ...conditions] };
}

export function completedPickingHref(
  filters: CompletedPickingFilters,
  view?: string,
) {
  const query = new URLSearchParams({ tab: "completed" });
  if (filters.query) query.set("q", filters.query);
  if (filters.pic) query.set("pic", filters.pic);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.deliveryStatus !== "all") {
    query.set("deliveryStatus", filters.deliveryStatus);
  }
  if (view) query.set("view", view);
  return `/pick-pack?${query.toString()}`;
}

function normalizeDeliveryFilter(value: string | undefined): DeliveryFilter {
  return value === "not-issued" ||
    value === "open" ||
    value === "delivered" ||
    value === "cancelled"
    ? value
    : "all";
}

function normalizeDateFilter(value: string | undefined) {
  if (!value || !parseJakartaDate(value, false)) return "";
  return value;
}

function parseJakartaDate(value: string, endOfDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`,
  );
  if (Number.isNaN(date.getTime())) return null;
  const jakarta = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const roundTrip = [
    jakarta.getUTCFullYear(),
    String(jakarta.getUTCMonth() + 1).padStart(2, "0"),
    String(jakarta.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return roundTrip === value ? date : null;
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
