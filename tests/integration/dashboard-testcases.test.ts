import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
config();

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const db = enabled ? new PrismaClient() : null;

afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!enabled)("dashboard transaction and access test cases", () => {
  it("TC-01 records a partial payment immediately while the saved trend stays unchanged", async () => {
    if (!db) throw new Error("Database is not configured");
    const { getDashboardMetrics } = await import("@/lib/dashboard-data");
    const { getDashboardAnalysis } = await import("@/lib/dashboard-analysis");
    const invoice = await db.invoice.findFirst({
      where: { remainingAmount: { gt: 1 }, salesOrder: { createdByUserId: { not: null } } },
      select: { id: true, paidAmount: true, remainingAmount: true, salesOrder: { select: { createdByUserId: true } } }
    });
    expect(invoice).not.toBeNull();
    if (!invoice?.salesOrder.createdByUserId) return;
    const owner = { id: invoice.salesOrder.createdByUserId, role: "SALES" as const };
    const now = new Date();
    const before = await getDashboardMetrics(owner, now, db);
    const saved = await getDashboardAnalysis(owner, now, db);
    const rollback = new Error("rollback partial payment fixture");

    await expect(db.$transaction(async (tx) => {
      await tx.payment.create({ data: {
        invoiceId: invoice.id, paymentDate: now, amount: 1, paymentMethod: "Cash"
      } });
      await tx.invoice.update({ where: { id: invoice.id }, data: {
        paidAmount: invoice.paidAmount + 1, remainingAmount: invoice.remainingAmount - 1,
        status: "Partial"
      } });
      const live = await getDashboardMetrics(owner, now, tx);
      expect(live.totalPaidAmount).toBe(before.totalPaidAmount + 1);
      expect(live.outstandingAmount).toBe(before.outstandingAmount - 1);
      expect((await getDashboardAnalysis(owner, now, tx))).toMatchObject({
        trend: saved.trend, lastSucceededAt: saved.lastSucceededAt
      });
      throw rollback;
    }, { timeout: 60000 })).rejects.toBe(rollback);
    expect((await getDashboardMetrics(owner, now, db)).totalPaidAmount).toBe(before.totalPaidAmount);
  }, 120000);

  it("TC-03 creates and changes an order, invoice and collection task with correct role counts", async () => {
    if (!db) throw new Error("Database is not configured");
    const { getDashboardMetrics } = await import("@/lib/dashboard-data");
    const sales = await db.user.findMany({
      where: { role: "SALES", status: "Active" }, select: { id: true }, take: 2
    });
    const customer = await db.customer.findFirst({ select: { id: true } });
    expect(sales).toHaveLength(2);
    expect(customer).not.toBeNull();
    if (!customer || sales.length < 2) return;
    const owner = { id: sales[0].id, role: "SALES" as const };
    const outsider = { id: sales[1].id, role: "SALES" as const };
    const manager = { id: "manager", role: "MANAGER" as const };
    const now = new Date();
    const [before, otherBefore, companyBefore] = await Promise.all([
      getDashboardMetrics(owner, now, db),
      getDashboardMetrics(outsider, now, db),
      getDashboardMetrics(manager, now, db)
    ]);
    const rollback = new Error("rollback order invoice task fixture");

    await expect(db.$transaction(async (tx) => {
      const order = await tx.salesOrder.create({ data: {
        orderNumber: `TC03-${randomUUID()}`, customerId: customer.id,
        createdByUserId: owner.id, orderDate: now, subtotal: 100, total: 100
      } });
      const invoice = await tx.invoice.create({ data: {
        invoiceNumber: `TC03-${randomUUID()}`, salesOrderId: order.id,
        customerId: customer.id, issueDate: now,
        dueDate: new Date(now.getTime() + 86400000),
        totalAmount: 100, remainingAmount: 100
      } });
      const task = await tx.collectionTask.create({ data: {
        customerId: customer.id, invoiceId: invoice.id,
        scheduledDate: now, notes: "Rollback-only dashboard test"
      } });
      const created = await getDashboardMetrics(owner, now, tx);
      const company = await getDashboardMetrics(manager, now, tx);
      const other = await getDashboardMetrics(outsider, now, tx);
      expect(created).toMatchObject({
        salesOrderCount: before.salesOrderCount + 1,
        totalSalesOrderValue: before.totalSalesOrderValue + 100,
        invoiceCount: before.invoiceCount + 1,
        outstandingAmount: before.outstandingAmount + 100,
        plannedTaskCount: before.plannedTaskCount + 1
      });
      expect(company.salesOrderCount).toBe(companyBefore.salesOrderCount + 1);
      expect(company.invoiceCount).toBe(companyBefore.invoiceCount + 1);
      expect(company.plannedTaskCount).toBe(companyBefore.plannedTaskCount + 1);
      expect(other.salesOrderCount).toBe(otherBefore.salesOrderCount);
      expect(other.invoiceCount).toBe(otherBefore.invoiceCount);
      expect(other.plannedTaskCount).toBe(otherBefore.plannedTaskCount);

      await tx.salesOrder.update({ where: { id: order.id }, data: { total: 150, status: "Confirmed" } });
      await tx.invoice.update({ where: { id: invoice.id }, data: { remainingAmount: 80, status: "Partial" } });
      await tx.collectionTask.update({ where: { id: task.id }, data: { status: "Done" } });
      const changed = await getDashboardMetrics(owner, now, tx);
      expect(changed.totalSalesOrderValue).toBe(before.totalSalesOrderValue + 150);
      expect(changed.outstandingAmount).toBe(before.outstandingAmount + 80);
      expect(changed.plannedTaskCount).toBe(before.plannedTaskCount);
      expect(changed.salesOrderDistribution.Confirmed).toBe((before.salesOrderDistribution.Confirmed ?? 0) + 1);
      expect(changed.invoiceDistribution.Partial).toBe((before.invoiceDistribution.Partial ?? 0) + 1);
      throw rollback;
    }, { timeout: 60000 })).rejects.toBe(rollback);
    expect((await getDashboardMetrics(owner, now, db)).salesOrderCount).toBe(before.salesOrderCount);
  }, 120000);

  it("TC-11 shows a missing analysis state for a new Sales scope", async () => {
    if (!db) throw new Error("Database is not configured");
    const { getDashboardAnalysis } = await import("@/lib/dashboard-analysis");
    expect(await getDashboardAnalysis({ id: "never-snapshotted-" + randomUUID(), role: "SALES" }, new Date(), db))
      .toEqual({ trend: [], lastSucceededAt: null, lastRunStatus: "MISSING", stale: true });
  });

  it("TC-13 rejects direct SELECT under anon and authenticated Data API roles", async () => {
    if (!db) throw new Error("Database is not configured");
    for (const role of ["anon", "authenticated"] as const) {
      for (const table of ["dashboard_analysis_snapshots", "dashboard_analysis_runs"]) {
        await expect(db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL ROLE " + role);
          await tx.$queryRawUnsafe(`SELECT * FROM public.${table} LIMIT 1`);
        })).rejects.toThrow(/permission denied/i);
      }
    }
  }, 30000);
});
