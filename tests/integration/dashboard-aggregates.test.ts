import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { buildCustomerRelationshipSummary } from "@/lib/dashboard-insights";

config({ path: ".env.local" });
config();

const runAgainstDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const db = runAgainstDatabase ? new PrismaClient() : null;

afterAll(async () => {
  await db?.$disconnect();
});

describe.skipIf(!runAgainstDatabase)("dashboard aggregates against the configured database", () => {
  it("matches the previous transaction calculations for every role and Sales portfolio", async () => {
    if (!db) throw new Error("Database is not configured");
    const { getDashboardMetrics } = await import("@/lib/dashboard-data");
    const users = await db.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER", "SALES"] }, status: "Active" },
      select: { id: true, role: true }
    });
    expect(new Set(users.map((user) => user.role))).toEqual(new Set<UserRole>(["ADMIN", "MANAGER", "SALES"]));

    for (const user of users) {
      const sales = user.role === "SALES";
      const orderWhere = sales ? { createdByUserId: user.id } : undefined;
      const invoiceWhere = sales ? { salesOrder: { createdByUserId: user.id } } : undefined;
      const now = new Date();
      const actual = await getDashboardMetrics(user, now, db);
      const [orders, invoices, payments, deliveryNotes, tasks, customers] = await db.$transaction([
        db.salesOrder.findMany({ where: orderWhere, select: { id: true, status: true, total: true } }),
        db.invoice.findMany({
          where: invoiceWhere,
          select: {
            id: true, status: true, totalAmount: true, remainingAmount: true,
            deliveryNotes: { select: { id: true } },
            deliverySources: { select: { id: true } }
          }
        }),
        db.payment.findMany({
          where: sales ? { invoice: { salesOrder: { createdByUserId: user.id } } } : undefined,
          select: { amount: true }
        }),
        db.deliveryNote.findMany({
          where: sales ? { salesOrder: { createdByUserId: user.id } } : undefined,
          select: { status: true }
        }),
        db.collectionTask.findMany({
          where: { status: "Planned", ...(sales ? { invoice: { salesOrder: { createdByUserId: user.id } } } : {}) },
          select: { scheduledDate: true }
        }),
        db.customer.findMany({
          where: sales ? { salesOrders: { some: { createdByUserId: user.id } } } : undefined,
          select: {
            salesOrders: { where: orderWhere, select: { status: true } },
            outreachActivities: { select: { id: true } },
            inquiries: { select: { status: true } }
          }
        })
      ]);

      const overdueInvoices = invoices.filter((invoice) => invoice.status === "Overdue");
      const openInvoices = invoices.filter((invoice) =>
        invoice.remainingAmount > 0 && ["Unpaid", "Partial", "Overdue"].includes(invoice.status)
      );
      const eligible = invoices.filter((invoice) =>
        ["Unpaid", "Partial", "Overdue", "Paid"].includes(invoice.status) &&
        invoice.deliveryNotes.length === 0 && invoice.deliverySources.length === 0
      );
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const countStatuses = (values: Array<{ status: string }>) =>
        values.reduce<Record<string, number>>((counts, value) => {
          counts[value.status] = (counts[value.status] ?? 0) + 1;
          return counts;
        }, {});

      expect(actual).toMatchObject({
        salesOrderCount: orders.length,
        totalSalesOrderValue: orders.reduce((sum, order) => sum + order.total, 0),
        totalPaidAmount: payments.reduce((sum, payment) => sum + payment.amount, 0),
        outstandingAmount: invoices.filter((invoice) => invoice.status !== "Cancelled")
          .reduce((sum, invoice) => sum + invoice.remainingAmount, 0),
        overdueCount: overdueInvoices.length,
        openInvoiceCount: openInvoices.length,
        overdueReceivableCount: overdueInvoices.filter((invoice) => invoice.remainingAmount > 0).length,
        overdueReceivableAmount: overdueInvoices.filter((invoice) => invoice.remainingAmount > 0)
          .reduce((sum, invoice) => sum + invoice.remainingAmount, 0),
        eligibleDeliveryCount: eligible.length,
        eligibleDeliveryValue: eligible.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
        plannedTaskCount: tasks.length,
        dueTaskCount: tasks.filter((task) => task.scheduledDate < tomorrow).length,
        invoiceCount: invoices.length,
        invoiceTotalValue: invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
        deliveryNoteCount: deliveryNotes.length,
        salesOrderDistribution: countStatuses(orders),
        invoiceDistribution: countStatuses(invoices),
        deliveryNoteDistribution: countStatuses(deliveryNotes),
        customerRelationshipSummary: buildCustomerRelationshipSummary(customers)
      });
    }
  }, 120000);

  it("reflects payment and delivery changes inside a transaction and keeps other Sales isolated", async () => {
    if (!db) throw new Error("Database is not configured");
    const { getDashboardMetrics } = await import("@/lib/dashboard-data");
    const { getDashboardAnalysis } = await import("@/lib/dashboard-analysis");
    const payment = await db.payment.findFirst({
      where: { invoice: { remainingAmount: { gt: 1 }, salesOrder: { createdByUserId: { not: null } } } },
      select: {
        id: true, amount: true,
        invoice: {
          select: {
            id: true, paidAmount: true, remainingAmount: true,
            salesOrder: { select: { createdByUserId: true } }
          }
        }
      }
    });
    const delivery = await db.deliveryNote.findFirst({
      where: { salesOrder: { createdByUserId: { not: null } } },
      select: { id: true, status: true, salesOrder: { select: { createdByUserId: true } } }
    });
    expect(payment).not.toBeNull();
    expect(delivery).not.toBeNull();
    if (!payment || !delivery) return;
    const paymentOwnerId = payment.invoice.salesOrder.createdByUserId;
    const deliveryOwnerId = delivery.salesOrder?.createdByUserId;
    if (!paymentOwnerId || !deliveryOwnerId) throw new Error("Test records lack Sales ownership");
    const otherSales = await db.user.findFirst({
      where: { role: "SALES", id: { not: paymentOwnerId }, status: "Active" },
      select: { id: true, role: true }
    });
    expect(otherSales).not.toBeNull();
    if (!otherSales) return;

    const now = new Date();
    const paymentOwner = { id: paymentOwnerId, role: "SALES" as const };
    const deliveryOwner = { id: deliveryOwnerId, role: "SALES" as const };
    const manager = { id: "manager", role: "MANAGER" as const };
    const paymentBefore = await getDashboardMetrics(paymentOwner, now, db);
    const managerBefore = await getDashboardMetrics(manager, now, db);
    const otherSalesBefore = await getDashboardMetrics(otherSales, now, db);
    const analysisBefore = await getDashboardAnalysis(paymentOwner, now, db);
    const rollback = new Error("rollback dashboard test");

    await expect(db.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { amount: payment.amount + 1 } });
      await tx.invoice.update({
        where: { id: payment.invoice.id },
        data: {
          paidAmount: payment.invoice.paidAmount + 1,
          remainingAmount: payment.invoice.remainingAmount - 1
        }
      });
      const paymentAfter = await getDashboardMetrics(paymentOwner, now, tx);
      const managerAfter = await getDashboardMetrics(manager, now, tx);
      const otherSalesAfter = await getDashboardMetrics(otherSales, now, tx);
      expect(paymentAfter.totalPaidAmount).toBe(paymentBefore.totalPaidAmount + 1);
      expect(paymentAfter.outstandingAmount).toBe(paymentBefore.outstandingAmount - 1);
      expect(managerAfter.totalPaidAmount).toBe(managerBefore.totalPaidAmount + 1);
      expect(otherSalesAfter.totalPaidAmount).toBe(otherSalesBefore.totalPaidAmount);
      expect(otherSalesAfter.outstandingAmount).toBe(otherSalesBefore.outstandingAmount);

      const deliveryBefore = await getDashboardMetrics(deliveryOwner, now, tx);
      const nextStatus = delivery.status === "Draft" ? "Issued" : "Draft";
      await tx.deliveryNote.update({ where: { id: delivery.id }, data: { status: nextStatus } });
      const deliveryAfter = await getDashboardMetrics(deliveryOwner, now, tx);
      expect(deliveryAfter.deliveryNoteDistribution[delivery.status]).toBe(
        (deliveryBefore.deliveryNoteDistribution[delivery.status] ?? 0) - 1
      );
      expect(deliveryAfter.deliveryNoteDistribution[nextStatus]).toBe(
        (deliveryBefore.deliveryNoteDistribution[nextStatus] ?? 0) + 1
      );
      const analysisAfter = await getDashboardAnalysis(paymentOwner, now, tx);
      expect(analysisAfter.trend).toEqual(analysisBefore.trend);
      expect(analysisAfter.lastSucceededAt).toEqual(analysisBefore.lastSucceededAt);
      throw rollback;
    }, { timeout: 60000 })).rejects.toBe(rollback);

    expect((await getDashboardMetrics(paymentOwner, now, db)).totalPaidAmount).toBe(paymentBefore.totalPaidAmount);
    expect((await getDashboardMetrics(deliveryOwner, now, db)).deliveryNoteDistribution[delivery.status])
      .toBeGreaterThan(0);
  }, 120000);

});
