import type { InvoiceStatus, Prisma } from "@prisma/client";
import {
  getClosedInvoiceWhere,
  getEffectiveInvoiceStatusWhere,
  getOpenInvoiceWhere,
} from "@/lib/invoice-status";

export const RECEIVABLE_SORTS = ["dueDate", "amount"] as const;
export const RECEIVABLE_DIRECTIONS = ["asc", "desc"] as const;

export type ReceivableTab = "ongoing" | "done";
export type ReceivableSort = (typeof RECEIVABLE_SORTS)[number];
export type ReceivableDirection = (typeof RECEIVABLE_DIRECTIONS)[number];

export type ReceivableFilters = {
  tab: ReceivableTab;
  status: string | null;
  query: string;
  sort: ReceivableSort;
  direction: ReceivableDirection;
};

export function getReceivableStatusOptions(tab: ReceivableTab) {
  return tab === "done"
    ? ["All", "Paid", "Cancelled"] as const
    : ["All", "Unpaid", "Partial", "Overdue"] as const;
}

export function parseReceivableFilters(input: {
  tab?: string | null;
  status?: string | null;
  query?: string | null;
  sort?: string | null;
  direction?: string | null;
}): ReceivableFilters {
  const tab: ReceivableTab = input.tab === "done" ? "done" : "ongoing";
  const options = getReceivableStatusOptions(tab);
  return {
    tab,
    status: input.status && (options as readonly string[]).includes(input.status) && input.status !== "All"
      ? input.status
      : null,
    query: input.query?.trim() ?? "",
    sort: RECEIVABLE_SORTS.includes(input.sort as ReceivableSort)
      ? input.sort as ReceivableSort
      : "dueDate",
    direction: RECEIVABLE_DIRECTIONS.includes(input.direction as ReceivableDirection)
      ? input.direction as ReceivableDirection
      : "asc",
  };
}

export function buildReceivableWhere(
  filters: ReceivableFilters,
  now: Date,
  portfolioWhere: Prisma.InvoiceWhereInput = {},
): Prisma.InvoiceWhereInput {
  const tabWhere = filters.tab === "done"
    ? getClosedInvoiceWhere()
    : getOpenInvoiceWhere();
  const statusWhere = filters.status
    ? getEffectiveInvoiceStatusWhere(filters.status as InvoiceStatus, now)
    : undefined;
  const searchWhere: Prisma.InvoiceWhereInput | undefined = filters.query
    ? {
        OR: [
          { invoiceNumber: { contains: filters.query, mode: "insensitive" } },
          { customer: { companyName: { contains: filters.query, mode: "insensitive" } } },
          { customer: { name: { contains: filters.query, mode: "insensitive" } } },
          { salesOrder: { orderNumber: { contains: filters.query, mode: "insensitive" } } },
        ],
      }
    : undefined;

  return {
    AND: [
      portfolioWhere,
      tabWhere,
      ...(statusWhere ? [statusWhere] : []),
      ...(searchWhere ? [searchWhere] : []),
    ],
  };
}

export function buildReceivableOrderBy(
  filters: Pick<ReceivableFilters, "sort" | "direction">,
): Prisma.InvoiceOrderByWithRelationInput[] {
  return filters.sort === "amount"
    ? [{ remainingAmount: filters.direction }, { id: filters.direction }]
    : [{ dueDate: filters.direction }, { id: filters.direction }];
}
