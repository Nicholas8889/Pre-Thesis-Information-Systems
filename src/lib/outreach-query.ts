import type { Prisma } from "@prisma/client";

export const OUTREACH_LATEST_ORDER = [
  { contactDate: "desc" as const },
  { createdAt: "desc" as const },
  { id: "desc" as const },
] satisfies Prisma.CustomerOutreachOrderByWithRelationInput[];

export const OUTREACH_CUSTOMER_ORDER = [
  { companyName: "asc" as const },
  { id: "asc" as const },
] satisfies Prisma.CustomerOrderByWithRelationInput[];

export function buildOutreachCustomerWhere(
  query: string,
  portfolioWhere: Prisma.CustomerWhereInput = {},
): Prisma.CustomerWhereInput {
  const normalizedQuery = query.trim();
  return {
    AND: [
      portfolioWhere,
      ...(normalizedQuery
        ? [{
            OR: [
              { companyName: { contains: normalizedQuery, mode: "insensitive" as const } },
              { name: { contains: normalizedQuery, mode: "insensitive" as const } },
              { phone: { contains: normalizedQuery, mode: "insensitive" as const } },
              { outreachActivities: { some: { notes: { contains: normalizedQuery, mode: "insensitive" as const } } } },
            ],
          }]
        : []),
    ],
  };
}
