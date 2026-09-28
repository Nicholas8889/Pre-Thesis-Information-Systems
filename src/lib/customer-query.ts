import type { Prisma } from "@prisma/client";
import { normalizeNpwp } from "@/lib/npwp";

export const CUSTOMER_STATUS_FILTERS = ["ALL", "Active", "Inactive"] as const;
export const CUSTOMER_SORTS = ["company", "createdAt"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

export type CustomerStatusFilter = (typeof CUSTOMER_STATUS_FILTERS)[number];
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type CustomerListFilters = {
  query: string;
  status: CustomerStatusFilter;
  sort: CustomerSort;
  direction: SortDirection;
};

export function parseCustomerListFilters(input: {
  query?: string | null;
  status?: string | null;
  sort?: string | null;
  direction?: string | null;
}): CustomerListFilters {
  return {
    query: input.query?.trim() ?? "",
    status: CUSTOMER_STATUS_FILTERS.includes(input.status as CustomerStatusFilter)
      ? input.status as CustomerStatusFilter
      : "ALL",
    sort: CUSTOMER_SORTS.includes(input.sort as CustomerSort)
      ? input.sort as CustomerSort
      : "company",
    direction: SORT_DIRECTIONS.includes(input.direction as SortDirection)
      ? input.direction as SortDirection
      : "asc",
  };
}

export function getNpwpSearchCandidate(query: string) {
  if (!/^[\d.\-\s]+$/.test(query)) return null;
  const normalized = normalizeNpwp(query);
  return normalized && /^\d{15,16}$/.test(normalized) ? normalized : null;
}

export function buildCustomerWhere(
  filters: Pick<CustomerListFilters, "query" | "status">,
  portfolioWhere: Prisma.CustomerWhereInput = {},
): Prisma.CustomerWhereInput {
  const npwp = getNpwpSearchCandidate(filters.query);
  const searchWhere: Prisma.CustomerWhereInput | undefined = filters.query
    ? {
        OR: [
          { name: { contains: filters.query, mode: "insensitive" } },
          { companyName: { contains: filters.query, mode: "insensitive" } },
          { phone: { contains: filters.query, mode: "insensitive" } },
          { email: { contains: filters.query, mode: "insensitive" } },
          ...(npwp ? [{ npwp: { equals: npwp } } as Prisma.CustomerWhereInput] : []),
        ],
      }
    : undefined;

  return {
    AND: [
      portfolioWhere,
      ...(filters.status === "ALL" ? [] : [{ status: filters.status }]),
      ...(searchWhere ? [searchWhere] : []),
    ],
  };
}

export function buildCustomerOrderBy(
  filters: Pick<CustomerListFilters, "sort" | "direction">,
): Prisma.CustomerOrderByWithRelationInput[] {
  if (filters.sort === "createdAt") {
    return [{ createdAt: filters.direction }, { id: filters.direction }];
  }

  return [
    { companyName: filters.direction },
    { name: filters.direction },
    { id: filters.direction },
  ];
}
