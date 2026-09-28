import { describe, expect, it } from "vitest";
import {
  buildSalesOrderWhere,
  getSalesOrderBucketFilter,
  SALES_ORDER_STABLE_ORDER
} from "../../src/lib/sales-order-query";

describe("Sales Order list/export query", () => {
  it("builds mutually exclusive lifecycle buckets", () => {
    expect(getSalesOrderBucketFilter("approval")).toEqual({ approvalStatus: "Pending" });
    expect(getSalesOrderBucketFilter("ongoing")).toMatchObject({
      approvalStatus: { not: "Pending" },
      deliveryNotes: { none: {} },
      deliverySources: { none: {} }
    });
    expect(getSalesOrderBucketFilter("done")).toMatchObject({
      approvalStatus: { not: "Pending" }
    });
  });

  it("applies scope, search, term, and date before pagination/export", () => {
    const startDate = new Date("2026-09-01T00:00:00.000Z");
    const endDate = new Date("2026-09-30T23:59:59.999Z");
    expect(buildSalesOrderWhere({
      source: "DIRECT",
      tab: "ongoing",
      search: " Acme ",
      paymentTermType: "CREDIT",
      startDate,
      endDate,
      portfolioWhere: { customer: { portfolioOwnerUserId: "sales-a" } }
    })).toMatchObject({
      source: "DIRECT",
      paymentTermType: "CREDIT",
      orderDate: { gte: startDate, lte: endDate },
      customer: { portfolioOwnerUserId: "sales-a" }
    });
    expect(SALES_ORDER_STABLE_ORDER).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });
});
