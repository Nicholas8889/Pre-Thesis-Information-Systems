import type { Prisma, SalesOrderSource } from "@prisma/client";
import type { ProcessTabWithApproval } from "@/components/process-tabs";
import {
  DONE_SALES_ORDER_STATUSES,
  ONGOING_SALES_ORDER_STATUSES
} from "@/lib/process-status";

export type SalesOrderQueryInput = {
  source: SalesOrderSource;
  tab: ProcessTabWithApproval;
  search?: string | null;
  paymentTermType?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  portfolioWhere?: Prisma.SalesOrderWhereInput;
};

export function getSalesOrderBucketFilter(
  tab: ProcessTabWithApproval
): Prisma.SalesOrderWhereInput {
  if (tab === "approval") return { approvalStatus: "Pending" };

  if (tab === "done") {
    return {
      approvalStatus: { not: "Pending" },
      OR: [
        { status: { in: [...DONE_SALES_ORDER_STATUSES] } },
        { deliveryNotes: { some: {} } },
        { deliverySources: { some: {} } }
      ]
    };
  }

  return {
    approvalStatus: { not: "Pending" },
    status: { in: [...ONGOING_SALES_ORDER_STATUSES] },
    deliveryNotes: { none: {} },
    deliverySources: { none: {} }
  };
}

export function buildSalesOrderWhere({
  source,
  tab,
  search,
  paymentTermType,
  startDate,
  endDate,
  portfolioWhere = {}
}: SalesOrderQueryInput): Prisma.SalesOrderWhereInput {
  const query = search?.trim();
  const term = paymentTermType === "IMMEDIATE" || paymentTermType === "CREDIT"
    ? paymentTermType
    : null;

  return {
    ...portfolioWhere,
    source,
    ...getSalesOrderBucketFilter(tab),
    ...(term ? { paymentTermType: term } : {}),
    ...(startDate || endDate
      ? { orderDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
      : {}),
    ...(query
      ? {
          AND: [
            {
              OR: [
                { orderNumber: { contains: query, mode: "insensitive" } },
                { customerPoNumber: { contains: query, mode: "insensitive" } },
                { customer: { companyName: { contains: query, mode: "insensitive" } } }
              ]
            }
          ]
        }
      : {})
  };
}

export const SALES_ORDER_STABLE_ORDER = [
  { createdAt: "desc" as const },
  { id: "desc" as const }
] satisfies Prisma.SalesOrderOrderByWithRelationInput[];
