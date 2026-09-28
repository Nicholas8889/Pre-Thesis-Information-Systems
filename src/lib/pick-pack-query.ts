import type { DeliveryNoteStatus, Prisma } from "@prisma/client";

import type { SearchParams } from "@/lib/pagination";

export type FulfillmentFilter = "all" | "full" | "shortage";
export type DeliveryFilter =
  | "all"
  | "not-issued"
  | "open"
  | "delivered"
  | "cancelled";

export type CompletedPickingFilters = {
  query: string;
  picker: string;
  packer: string;
  fulfillment: FulfillmentFilter;
  from: string;
  to: string;
  deliveryStatus: DeliveryFilter;
};

export const COMPLETED_PICKING_QUERY_PARAMS = [
  "tab",
  "q",
  "picker",
  "packer",
  "fulfillment",
  "from",
  "to",
  "deliveryStatus",
] as const;

export function parseCompletedPickingFilters(
  params: SearchParams,
): CompletedPickingFilters {
  return {
    query: getFirst(params.q)?.trim() ?? "",
    picker: getFirst(params.picker)?.trim() ?? "",
    packer: getFirst(params.packer)?.trim() ?? "",
    fulfillment: normalizeFulfillmentFilter(getFirst(params.fulfillment)),
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
  if (filters.picker) {
    conditions.push({ pickerName: { contains: filters.picker } });
  }
  if (filters.packer) {
    conditions.push({ packerName: { contains: filters.packer } });
  }
  if (filters.fulfillment === "full") {
    conditions.push({
      items: {
        none: { availabilityStatus: { in: ["Partial", "Unavailable"] } },
      },
    });
  } else if (filters.fulfillment === "shortage") {
    conditions.push({
      items: {
        some: { availabilityStatus: { in: ["Partial", "Unavailable"] } },
      },
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
  if (filters.picker) query.set("picker", filters.picker);
  if (filters.packer) query.set("packer", filters.packer);
  if (filters.fulfillment !== "all") {
    query.set("fulfillment", filters.fulfillment);
  }
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.deliveryStatus !== "all") {
    query.set("deliveryStatus", filters.deliveryStatus);
  }
  if (view) query.set("view", view);
  return `/pick-pack?${query.toString()}`;
}

function normalizeFulfillmentFilter(
  value: string | undefined,
): FulfillmentFilter {
  return value === "full" || value === "shortage" ? value : "all";
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
