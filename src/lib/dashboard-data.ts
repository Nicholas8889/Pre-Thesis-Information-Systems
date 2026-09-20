import "server-only";

import { Prisma, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CustomerRelationshipSummary } from "@/lib/dashboard-insights";
import {
  getOpenInvoiceWhere,
  withEffectiveInvoiceStatus
} from "@/lib/invoice-status";

type DashboardUser = { id: string; role: UserRole };
type DashboardReader = Pick<typeof prisma, "$queryRaw">;

type MetricsRow = {
  salesOrderCount: bigint;
  totalSalesOrderValue: bigint;
  paymentTotal: bigint;
  outstandingAmount: bigint;
  overdueCount: bigint;
  openInvoiceCount: bigint;
  overdueReceivableCount: bigint;
  overdueReceivableAmount: bigint;
  eligibleDeliveryCount: bigint;
  eligibleDeliveryValue: bigint;
  plannedTaskCount: bigint;
  dueTaskCount: bigint;
  invoiceCount: bigint;
  invoiceTotalValue: bigint;
  deliveryNoteCount: bigint;
  salesOrderDistribution: Record<string, number>;
  invoiceDistribution: Record<string, number>;
  deliveryNoteDistribution: Record<string, number>;
  totalOutreach: bigint;
  outreachConverted: bigint;
  totalInquiries: bigint;
  openInquiries: bigint;
  closedInquiries: bigint;
};

export type DashboardMetrics = {
  salesOrderCount: number;
  totalSalesOrderValue: number;
  totalPaidAmount: number;
  outstandingAmount: number;
  overdueCount: number;
  openInvoiceCount: number;
  overdueReceivableCount: number;
  overdueReceivableAmount: number;
  eligibleDeliveryCount: number;
  eligibleDeliveryValue: number;
  plannedTaskCount: number;
  dueTaskCount: number;
  invoiceCount: number;
  invoiceTotalValue: number;
  deliveryNoteCount: number;
  salesOrderDistribution: Record<string, number>;
  invoiceDistribution: Record<string, number>;
  deliveryNoteDistribution: Record<string, number>;
  customerRelationshipSummary: CustomerRelationshipSummary;
};

export function getDashboardOwnerId(user: DashboardUser) {
  return user.role === "SALES" ? user.id : null;
}

export async function getDashboardMetrics(
  user: DashboardUser,
  now = new Date(),
  db: DashboardReader = prisma
): Promise<DashboardMetrics> {
  const ownerId = getDashboardOwnerId(user);
  const orderFilter = ownerId
    ? Prisma.sql`WHERE so.created_by_user_id = ${ownerId}`
    : Prisma.empty;
  const deliveryJoin = ownerId
    ? Prisma.sql`JOIN visible_orders vo ON vo.id = dn.sales_order_id`
    : Prisma.empty;
  const taskJoin = ownerId
    ? Prisma.sql`JOIN visible_invoices vi ON vi.id = ct.invoice_id`
    : Prisma.empty;
  const customerFilter = ownerId
    ? Prisma.sql`WHERE EXISTS (SELECT 1 FROM visible_orders vo WHERE vo.customer_id = c.id)`
    : Prisma.empty;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Every CTE is scoped before any sum or count. No transaction rows leave Postgres.
  const [row] = await db.$queryRaw<MetricsRow[]>(Prisma.sql`
    WITH visible_orders AS (
      SELECT so.id, so.customer_id, so.status, so.total
      FROM sales_orders so ${orderFilter}
    ), visible_invoices AS (
      SELECT
        i.id,
        CASE
          WHEN i.status = 'Cancelled' THEN 'Cancelled'
          WHEN i.remaining_amount <= 0 THEN 'Paid'
          WHEN i.due_date < ${today} THEN 'Overdue'
          WHEN i.paid_amount > 0 THEN 'Partial'
          ELSE 'Unpaid'
        END AS status,
        i.total_amount,
        i.remaining_amount
      FROM invoices i JOIN visible_orders vo ON vo.id = i.sales_order_id
    ), visible_payments AS (
      SELECT p.amount FROM payments p
      JOIN visible_invoices vi ON vi.id = p.invoice_id
    ), visible_deliveries AS (
      SELECT dn.status FROM delivery_notes dn ${deliveryJoin}
    ), visible_tasks AS (
      SELECT ct.id, ct.scheduled_date FROM collection_tasks ct ${taskJoin}
      WHERE ct.status = 'Planned'
    ), visible_customers AS (
      SELECT c.id FROM customers c ${customerFilter}
    ), eligible_invoices AS (
      SELECT i.id, i.total_amount FROM invoices i
      JOIN visible_orders vo ON vo.id = i.sales_order_id
      WHERE i.status <> 'Cancelled'
        AND NOT EXISTS (SELECT 1 FROM delivery_notes dn WHERE dn.invoice_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM delivery_note_sources dns WHERE dns.invoice_id = i.id)
    )
    SELECT
      (SELECT COUNT(*) FROM visible_orders) AS "salesOrderCount",
      (SELECT COALESCE(SUM(total), 0) FROM visible_orders) AS "totalSalesOrderValue",
      (SELECT COALESCE(SUM(amount), 0) FROM visible_payments) AS "paymentTotal",
      (SELECT COALESCE(SUM(remaining_amount), 0) FROM visible_invoices WHERE status <> 'Cancelled') AS "outstandingAmount",
      (SELECT COUNT(*) FROM visible_invoices WHERE status = 'Overdue') AS "overdueCount",
      (SELECT COUNT(*) FROM visible_invoices WHERE remaining_amount > 0 AND status IN ('Unpaid', 'Partial', 'Overdue')) AS "openInvoiceCount",
      (SELECT COUNT(*) FROM visible_invoices WHERE remaining_amount > 0 AND status = 'Overdue') AS "overdueReceivableCount",
      (SELECT COALESCE(SUM(remaining_amount), 0) FROM visible_invoices WHERE remaining_amount > 0 AND status = 'Overdue') AS "overdueReceivableAmount",
      (SELECT COUNT(*) FROM eligible_invoices) AS "eligibleDeliveryCount",
      (SELECT COALESCE(SUM(total_amount), 0) FROM eligible_invoices) AS "eligibleDeliveryValue",
      (SELECT COUNT(*) FROM visible_tasks) AS "plannedTaskCount",
      (SELECT COUNT(*) FROM visible_tasks WHERE scheduled_date < ${tomorrow}) AS "dueTaskCount",
      (SELECT COUNT(*) FROM visible_invoices) AS "invoiceCount",
      (SELECT COALESCE(SUM(total_amount), 0) FROM visible_invoices) AS "invoiceTotalValue",
      (SELECT COUNT(*) FROM visible_deliveries) AS "deliveryNoteCount",
      (SELECT COALESCE(jsonb_object_agg(status, count), '{}'::jsonb) FROM
        (SELECT status::text, COUNT(*)::int AS count FROM visible_orders GROUP BY status) grouped
      ) AS "salesOrderDistribution",
      (SELECT COALESCE(jsonb_object_agg(status, count), '{}'::jsonb) FROM
        (SELECT status::text, COUNT(*)::int AS count FROM visible_invoices GROUP BY status) grouped
      ) AS "invoiceDistribution",
      (SELECT COALESCE(jsonb_object_agg(status, count), '{}'::jsonb) FROM
        (SELECT status::text, COUNT(*)::int AS count FROM visible_deliveries GROUP BY status) grouped
      ) AS "deliveryNoteDistribution",
      (SELECT COUNT(*) FROM customer_outreach co JOIN visible_customers vc ON vc.id = co.customer_id) AS "totalOutreach",
      (SELECT COUNT(*) FROM visible_customers vc
        WHERE EXISTS (SELECT 1 FROM customer_outreach co WHERE co.customer_id = vc.id)
          AND EXISTS (SELECT 1 FROM visible_orders vo WHERE vo.customer_id = vc.id AND vo.status <> 'Cancelled')
      ) AS "outreachConverted",
      (SELECT COUNT(*) FROM customer_inquiries ci JOIN visible_customers vc ON vc.id = ci.customer_id) AS "totalInquiries",
      (SELECT COUNT(*) FROM customer_inquiries ci JOIN visible_customers vc ON vc.id = ci.customer_id WHERE ci.status = 'Open') AS "openInquiries",
      (SELECT COUNT(*) FROM customer_inquiries ci JOIN visible_customers vc ON vc.id = ci.customer_id WHERE ci.status IN ('Closed', 'Done')) AS "closedInquiries"
  `);

  if (!row) throw new Error("Dashboard aggregate query returned no row");

  return {
    salesOrderCount: Number(row.salesOrderCount),
    totalSalesOrderValue: Number(row.totalSalesOrderValue),
    totalPaidAmount: Number(row.paymentTotal),
    outstandingAmount: Number(row.outstandingAmount),
    overdueCount: Number(row.overdueCount),
    openInvoiceCount: Number(row.openInvoiceCount),
    overdueReceivableCount: Number(row.overdueReceivableCount),
    overdueReceivableAmount: Number(row.overdueReceivableAmount),
    eligibleDeliveryCount: Number(row.eligibleDeliveryCount),
    eligibleDeliveryValue: Number(row.eligibleDeliveryValue),
    plannedTaskCount: Number(row.plannedTaskCount),
    dueTaskCount: Number(row.dueTaskCount),
    invoiceCount: Number(row.invoiceCount),
    invoiceTotalValue: Number(row.invoiceTotalValue),
    deliveryNoteCount: Number(row.deliveryNoteCount),
    salesOrderDistribution: row.salesOrderDistribution,
    invoiceDistribution: row.invoiceDistribution,
    deliveryNoteDistribution: row.deliveryNoteDistribution,
    customerRelationshipSummary: {
      totalOutreach: Number(row.totalOutreach),
      outreachConverted: Number(row.outreachConverted),
      totalInquiries: Number(row.totalInquiries),
      openInquiries: Number(row.openInquiries),
      closedInquiries: Number(row.closedInquiries)
    }
  };
}

export function getDashboardListFilters(user: DashboardUser, now = new Date()) {
  const ownerId = getDashboardOwnerId(user);
  const orderWhere: Prisma.SalesOrderWhereInput = ownerId ? { createdByUserId: ownerId } : {};
  const invoiceWhere: Prisma.InvoiceWhereInput = ownerId
    ? { salesOrder: { createdByUserId: ownerId } }
    : {};
  const plannedTaskWhere: Prisma.CollectionTaskWhereInput = {
    status: "Planned",
    ...(ownerId ? { invoice: { salesOrder: { createdByUserId: ownerId } } } : {})
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcomingLimit = new Date(today);
  upcomingLimit.setDate(upcomingLimit.getDate() + 30);
  const openInvoiceWhere: Prisma.InvoiceWhereInput = {
    ...invoiceWhere,
    ...getOpenInvoiceWhere()
  };
  const eligibleDeliveryWhere: Prisma.InvoiceWhereInput = {
    ...invoiceWhere,
    status: { not: "Cancelled" },
    deliveryNotes: { none: {} },
    deliverySources: { none: {} }
  };
  return { orderWhere, plannedTaskWhere, openInvoiceWhere, eligibleDeliveryWhere, today, upcomingLimit };
}

export async function getDashboardLists(user: DashboardUser, now = new Date()) {
  const filters = getDashboardListFilters(user, now);
  const recentSalesOrders = prisma.salesOrder.findMany({
    where: filters.orderWhere,
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true, orderNumber: true, source: true, customerPoNumber: true,
      orderDate: true, status: true, total: true,
      customer: { select: { companyName: true } }
    }
  });
  if (user.role !== "ADMIN") {
    return { recentSalesOrders: await recentSalesOrders, admin: null };
  }

  const invoiceSelect = {
    id: true, invoiceNumber: true, dueDate: true, issueDate: true,
    status: true, paidAmount: true, remainingAmount: true, totalAmount: true,
    paymentTermType: true,
    customer: { select: { companyName: true } }
  } as const;
  const [orders, dueSoon, open, delivery, tasks] = await Promise.all([
    recentSalesOrders,
    prisma.invoice.findMany({
      where: {
        ...filters.openInvoiceWhere,
        dueDate: { gte: filters.today, lte: filters.upcomingLimit }
      },
      orderBy: { dueDate: "asc" }, take: 5, select: invoiceSelect
    }),
    prisma.invoice.findMany({
      where: filters.openInvoiceWhere,
      orderBy: { dueDate: "asc" }, take: 5, select: invoiceSelect
    }),
    prisma.invoice.findMany({
      where: filters.eligibleDeliveryWhere,
      orderBy: { issueDate: "asc" }, take: 5, select: invoiceSelect
    }),
    prisma.collectionTask.findMany({
      where: filters.plannedTaskWhere,
      orderBy: { scheduledDate: "asc" }, take: 5,
      select: {
        id: true, scheduledDate: true,
        customer: { select: { companyName: true } },
        invoice: { select: { invoiceNumber: true, remainingAmount: true } }
      }
    })
  ]);
  return {
    recentSalesOrders: orders,
    admin: {
      dueSoonReceivables: dueSoon.map((invoice) =>
        withEffectiveInvoiceStatus(invoice, now)
      ),
      receivablesToShow: (dueSoon.length > 0 ? dueSoon : open).map((invoice) =>
        withEffectiveInvoiceStatus(invoice, now)
      ),
      deliveryNotesToShow: delivery.map((invoice) =>
        withEffectiveInvoiceStatus(invoice, now)
      ),
      collectionTasksToShow: tasks
    }
  };
}
