import { describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";
import { getDashboardListFilters, getDashboardMetrics } from "@/lib/dashboard-data";

function aggregateRow(paymentTotal: bigint) {
  return {
    salesOrderCount: BigInt(1),
    totalSalesOrderValue: BigInt(100),
    paymentTotal,
    outstandingAmount: BigInt(100) - paymentTotal,
    overdueCount: BigInt(0),
    openInvoiceCount: BigInt(1),
    overdueReceivableCount: BigInt(0),
    overdueReceivableAmount: BigInt(0),
    eligibleDeliveryCount: BigInt(1),
    eligibleDeliveryValue: BigInt(100),
    plannedTaskCount: BigInt(0),
    dueTaskCount: BigInt(0),
    invoiceCount: BigInt(1),
    invoiceTotalValue: BigInt(100),
    deliveryNoteCount: BigInt(0),
    salesOrderDistribution: { Confirmed: 1 },
    invoiceDistribution: { Partial: 1 },
    deliveryNoteDistribution: {},
    totalOutreach: BigInt(0),
    outreachConverted: BigInt(0),
    totalInquiries: BigInt(0),
    openInquiries: BigInt(0),
    closedInquiries: BigInt(0)
  };
}

describe("dashboard operational data", () => {
  it("reads payment totals again after a transaction rather than serving a stale metric", async () => {
    let paid = BigInt(25);
    const query = vi.fn(async (sql: unknown) => { void sql; return [aggregateRow(paid)]; });
    const reader = { $queryRaw: query } as never;
    const user = { id: "sales-a", role: "SALES" as UserRole };

    const before = await getDashboardMetrics(user, new Date("2026-09-14T00:00:00Z"), reader);
    paid = BigInt(40);
    const after = await getDashboardMetrics(user, new Date("2026-09-14T00:00:00Z"), reader);

    expect(before.totalPaidAmount).toBe(25);
    expect(after.totalPaidAmount).toBe(40);
    expect(after.outstandingAmount).toBe(60);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("scopes every Sales aggregate and list by the order creator", async () => {
    const query = vi.fn(async (sql: unknown) => { void sql; return [aggregateRow(BigInt(25))]; });
    const reader = { $queryRaw: query } as never;
    await getDashboardMetrics({ id: "sales-a", role: "SALES" }, new Date(), reader);
    const salesSql = query.mock.calls[0][0] as { values: unknown[] };
    expect(salesSql.values).toContain("sales-a");

    const salesFilters = getDashboardListFilters({ id: "sales-a", role: "SALES" });
    expect(salesFilters.orderWhere).toEqual({ createdByUserId: "sales-a" });
    expect(salesFilters.openInvoiceWhere).toMatchObject({
      salesOrder: { createdByUserId: "sales-a" }
    });
    expect(salesFilters.plannedTaskWhere).toMatchObject({
      invoice: { salesOrder: { createdByUserId: "sales-a" } }
    });

    await getDashboardMetrics({ id: "manager-a", role: "MANAGER" }, new Date(), reader);
    const managerSql = query.mock.calls[1][0] as { values: unknown[] };
    expect(managerSql.values).not.toContain("sales-a");
    expect(getDashboardListFilters({ id: "manager-a", role: "MANAGER" }).orderWhere).toEqual({});
  });
});
