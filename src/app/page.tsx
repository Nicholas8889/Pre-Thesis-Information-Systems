import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  FileText,
  Handshake,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  SalesCustomerInsights,
  type OverdueCustomerRow
} from "@/components/sales-customer-insights";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { buildCustomerInsights } from "@/lib/customer-intelligence";
import { buildPopularProducts, type PopularProduct } from "@/lib/product-insights";
import { getCurrentUser } from "@/lib/session";
import { syncOverdueInvoices } from "@/lib/workflow";

export const dynamic = "force-dynamic";

type TrendPoint = {
  label: string;
  sales: number;
  payments: number;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

const salesOrderStatuses = [
  { label: "Draft", color: "#94a3b8" },
  { label: "Confirmed", color: "#2563eb" },
  { label: "Invoiced", color: "#0f766e" },
  { label: "Shipped", color: "#d97706" },
  { label: "Cancelled", color: "#ef4444" }
] as const;

const invoiceStatuses = [
  { label: "Paid", color: "#16a34a" },
  { label: "Partial", color: "#2563eb" },
  { label: "Unpaid", color: "#d97706" },
  { label: "Overdue", color: "#ef4444" },
  { label: "Cancelled", color: "#94a3b8" }
] as const;

export default async function DashboardPage() {
  await syncOverdueInvoices();
  const currentUser = await getCurrentUser();
  const dashboardRole = currentUser?.role ?? "SALES";

  const [
    invoices,
    salesOrders,
    customers,
    deliveryNoteCount,
    followUpCount,
    payments,
    plannedFollowUps,
    recentSalesOrders,
    soldOrderItems
  ] = await Promise.all([
    prisma.invoice.findMany({
      include: {
        customer: true,
        salesOrder: { select: { id: true, orderNumber: true } },
        deliveryNotes: { select: { id: true } }
      }
    }),
    prisma.salesOrder.findMany({
      select: {
        id: true,
        orderNumber: true,
        orderDate: true,
        status: true,
        total: true,
        customer: {
          select: {
            companyName: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.customer.findMany({
      orderBy: { companyName: "asc" },
      include: {
        salesOrders: {
          select: { id: true, orderDate: true }
        }
      }
    }),
    prisma.deliveryNote.count(),
    prisma.followUp.count(),
    prisma.payment.findMany({
      select: {
        id: true,
        amount: true,
        paymentDate: true
      },
      orderBy: { paymentDate: "desc" }
    }),
    prisma.followUp.findMany({
      where: { status: "Planned" },
      orderBy: { followUpDate: "asc" },
      include: { customer: true, invoice: true }
    }),
    prisma.salesOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 7,
      include: { customer: true }
    }),
    prisma.salesOrderItem.findMany({
      where: {
        salesOrder: {
          status: { in: ["Confirmed", "Shipped", "Invoiced"] }
        }
      },
      select: { itemName: true, quantity: true }
    })
  ]);

  const customerCount = customers.length;
  const invoiceCount = invoices.length;
  const salesOrderCount = salesOrders.length;
  const paymentCount = payments.length;
  const totalSalesOrderValue = salesOrders.reduce((sum, order) => sum + order.total, 0);
  const totalPaidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const outstandingAmount = invoices
    .filter((invoice) => invoice.status !== "Cancelled")
    .reduce((sum, invoice) => sum + invoice.remainingAmount, 0);
  const activeReceivableCount = invoices.filter(
    (invoice) =>
      invoice.remainingAmount > 0 &&
      ["Unpaid", "Partial", "Overdue"].includes(invoice.status)
  ).length;
  const overdueCount = invoices.filter((invoice) => invoice.status === "Overdue").length;
  const needFollowUpCount = overdueCount + plannedFollowUps.length;
  const trendData = getRevenueTrendData(
    salesOrders.map((order) => ({ date: order.orderDate, amount: order.total })),
    payments.map((payment) => ({ date: payment.paymentDate, amount: payment.amount }))
  );
  const revenueComposition = [
    { label: "Paid Amount", value: totalPaidAmount, color: "#2563eb" },
    { label: "Outstanding", value: outstandingAmount, color: "#f59e0b" }
  ];
  const salesOrderDistribution = salesOrderStatuses.map((status) => ({
    ...status,
    value: salesOrders.filter((order) => order.status === status.label).length
  }));
  const invoiceDistribution = invoiceStatuses.map((status) => ({
    ...status,
    value: invoices.filter((invoice) => invoice.status === status.label).length
  }));
  const customerInsights = buildCustomerInsights(customers);
  const overdueCustomerInsights = buildOverdueCustomerInsights(invoices);
  const popularProducts = buildPopularProducts(soldOrderItems);

  if (dashboardRole === "ADMIN") {
    const openInvoices = invoices
      .filter(
        (invoice) =>
          invoice.remainingAmount > 0 && ["Unpaid", "Partial", "Overdue"].includes(invoice.status)
      )
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const today = startOfDay(new Date());
    const upcomingLimit = new Date(today);
    upcomingLimit.setDate(upcomingLimit.getDate() + 30);
    const incomingOverdue = openInvoices.filter(
      (invoice) => invoice.dueDate >= today && invoice.dueDate <= upcomingLimit
    );
    const receivablesToShow = (incomingOverdue.length > 0 ? incomingOverdue : openInvoices).slice(0, 5);
    const deliveryNotesNeeded = invoices
      .filter(
        (invoice) =>
          invoice.status !== "Cancelled" &&
          invoice.deliveryNotes.length === 0 &&
          (invoice.paymentTermType === "CREDIT" || invoice.status === "Paid")
      )
      .slice(0, 5);

    return (
      <>
        <PageHeader
          title="Admin Dashboard"
          description={`Welcome, ${currentUser?.displayName ?? "Admin"}. Focus on invoices, delivery documents, receivables, and collection work.`}
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Open Invoices" value={String(openInvoices.length)} description={formatCurrency(outstandingAmount)} icon={FileText} tone="warning" />
          <KpiCard label="Overdue Receivables" value={String(overdueCount)} description="Requires collection attention" icon={ReceiptText} tone="danger" />
          <KpiCard label="Surat Jalan Needed" value={String(deliveryNotesNeeded.length)} description="Eligible invoices without delivery note" icon={Truck} />
          <KpiCard label="Planned Billing" value={String(plannedFollowUps.length)} description="Admin collection queue" icon={Handshake} tone="good" />
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-2">
          <AdminListPanel
            title="Invoice Insight"
            description="Current billing status and remaining exposure."
            href="/invoices"
          >
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {invoiceDistribution.filter((item) => item.label !== "Cancelled").map((item) => (
                <div key={item.label} className="rounded-md border border-line p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-line px-4 py-3 text-sm text-slate-600">
              Total invoice value: <strong className="text-ink">{formatCurrency(invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0))}</strong>
            </div>
          </AdminListPanel>

          <AdminListPanel
            title="Surat Jalan to Create"
            description="Invoices currently eligible for delivery documentation."
            href="/surat-jalan"
          >
            <CompactActionList
              empty="No Surat Jalan needs to be created."
              rows={deliveryNotesNeeded.map((invoice) => ({
                id: invoice.id,
                primary: invoice.invoiceNumber,
                secondary: `${invoice.customer.companyName} · ${invoice.paymentTermType}`,
                value: formatCurrency(invoice.totalAmount),
                href: `/surat-jalan?mode=create&invoiceId=${invoice.id}`,
                action: "Create"
              }))}
            />
          </AdminListPanel>

          <AdminListPanel
            title={incomingOverdue.length > 0 ? "Incoming Overdue Receivables" : "Unpaid Receivables"}
            description={incomingOverdue.length > 0 ? "Balances due within the next 30 days." : "No balances are due in the next 30 days, so open unpaid balances are shown."}
            href="/receivables"
          >
            <CompactActionList
              empty="No open receivables."
              rows={receivablesToShow.map((invoice) => ({
                id: invoice.id,
                primary: invoice.invoiceNumber,
                secondary: `${invoice.customer.companyName} · Due ${formatDate(invoice.dueDate)}`,
                value: formatCurrency(invoice.remainingAmount),
                href: `/receivables?tab=ongoing&status=${invoice.status}`,
                action: "Review"
              }))}
            />
          </AdminListPanel>

          <AdminListPanel
            title="Billing Tasks to Do"
            description="Planned billing and collection tasks ordered by date."
            href="/billing"
          >
            <CompactActionList
              empty="No planned billing tasks."
              rows={plannedFollowUps.slice(0, 5).map((followUp) => ({
                id: followUp.id,
                primary: followUp.customer.companyName,
                secondary: `${followUp.invoice?.invoiceNumber ?? "Customer billing"} · ${formatDate(followUp.followUpDate)}`,
                value: followUp.notes,
                href: "/billing",
                action: "Open"
              }))}
            />
          </AdminListPanel>
        </section>

        <section className="mt-5 rounded-md border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">Recent Sales Orders</h2>
              <p className="mt-1 text-xs text-slate-500">A smaller operational snapshot for Admin.</p>
            </div>
            <Link href="/sales-orders" className="text-sm font-semibold text-brand">View all</Link>
          </div>
          <CompactActionList
            empty="No recent sales orders."
            rows={recentSalesOrders.slice(0, 3).map((order) => ({
              id: order.id,
              primary: order.orderNumber,
              secondary: `${order.customer.companyName} · ${formatDate(order.orderDate)}`,
              value: formatCurrency(order.total),
              href: `/sales-orders/${order.id}`,
              action: "View"
            }))}
          />
        </section>
      </>
    );
  }

  const moduleOverview = [
    { href: "/customers", label: "Customers", value: customerCount, helper: "records", icon: Users },
    { href: "/sales-orders", label: "Sales Orders", value: salesOrderCount, helper: "orders", icon: ShoppingCart },
    { href: "/invoices", label: "Invoices", value: invoiceCount, helper: "invoices", icon: FileText },
    { href: "/payments", label: "Payments", value: paymentCount, helper: "records", icon: Banknote },
    { href: "/surat-jalan", label: "Surat Jalan", value: deliveryNoteCount, helper: "documents", icon: Truck },
    { href: "/receivables", label: "Receivables", value: activeReceivableCount, helper: "active", icon: ReceiptText },
    {
      href: "/billing",
      label: "Billing",
      value: followUpCount,
      helper: `${plannedFollowUps.length} pending`,
      icon: Handshake
    }
  ];

  return (
    <>
      <PageHeader
        title={dashboardRole === "MANAGER" ? "Manager Dashboard" : "Sales Dashboard"}
        description={
          dashboardRole === "MANAGER"
            ? "Monitor the complete revenue cycle with added customer sales intelligence."
            : "Track sales performance, overdue customers, customer categories, and recommended pricing."
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Sales Value"
          value={formatCurrency(totalSalesOrderValue)}
          description="Sales Order value"
          icon={TrendingUp}
        />
        <KpiCard
          label="Paid Amount"
          value={formatCurrency(totalPaidAmount)}
          description="Recorded payment"
          icon={Banknote}
          tone="good"
        />
        <KpiCard
          label="Outstanding Receivables"
          value={formatCurrency(outstandingAmount)}
          description="Open invoice balance"
          icon={ReceiptText}
          tone="warning"
        />
        <KpiCard
          label="Need Attention"
          value={String(needFollowUpCount)}
          description={`${overdueCount} overdue + ${plannedFollowUps.length} billing tasks`}
          icon={AlertTriangle}
          tone="danger"
        />
      </section>

      <section className="mt-5 rounded-md border border-line bg-white p-4 shadow-soft">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Revenue Cycle Insights</h2>
            <p className="text-sm text-slate-600">
              Historical movement and current transaction status in one compact view.
            </p>
          </div>
          <p className="text-xs font-medium text-slate-500">
            Based on Sales Order, Invoice, and Payment data
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.9fr_0.9fr_0.9fr]">
          <InsightPanel title="Revenue Trend" footer="Sales Orders and payments by month">
            <RevenueTrendChart data={trendData} />
          </InsightPanel>

          <InsightPanel title="Revenue Composition" footer="Current financial position">
            <RevenueCompositionChart
              total={totalSalesOrderValue}
              paid={totalPaidAmount}
              outstanding={outstandingAmount}
              segments={revenueComposition}
            />
          </InsightPanel>

          <InsightPanel title="Sales Order Status" footer={`Total ${salesOrderCount} order(s)`}>
            <StatusDonutChart total={salesOrderCount} segments={salesOrderDistribution} />
          </InsightPanel>

          <InsightPanel title="Invoice Status" footer={`Total ${invoiceCount} invoice(s)`}>
            <StatusDonutChart total={invoiceCount} segments={invoiceDistribution} />
          </InsightPanel>
        </div>

        {dashboardRole === "MANAGER" && (
          <PopularProductsChart products={popularProducts} />
        )}
      </section>

      <section className="mt-5 space-y-4">
        <section className="rounded-md border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Recent Sales Orders</h2>
              <p className="mt-1 text-sm text-slate-500">
                Click a row to open the full Sales Order detail page.
              </p>
            </div>
            <Link
              href="/sales-orders"
              className="inline-flex h-9 items-center justify-center rounded-md border border-line px-3 text-sm font-semibold text-brand"
            >
              View all
            </Link>
          </div>
          {recentSalesOrders.length === 0 ? (
            <div className="p-4">
              <EmptyState message="No recent sales orders yet." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Order</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-sm">
                  {recentSalesOrders.map((order) => (
                    <tr key={order.id} className="group cursor-pointer transition hover:bg-slate-50">
                      <td className="p-0">
                          <Link
                            href={`/sales-orders/${order.id}`}
                            className="block px-5 py-3.5 font-medium text-ink"
                          >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="p-0">
                          <Link
                            href={`/sales-orders/${order.id}`}
                            className="block px-5 py-3.5 text-slate-600"
                          >
                          {order.customer.companyName}
                        </Link>
                      </td>
                      <td className="p-0">
                          <Link
                            href={`/sales-orders/${order.id}`}
                            className="block px-5 py-3.5 text-slate-600"
                          >
                          {formatDate(order.orderDate)}
                        </Link>
                      </td>
                      <td className="p-0">
                          <Link href={`/sales-orders/${order.id}`} className="block px-5 py-3.5">
                          <StatusBadge status={order.status} />
                        </Link>
                      </td>
                      <td className="p-0 text-right">
                          <Link
                            href={`/sales-orders/${order.id}`}
                            className="block px-5 py-3.5 font-medium text-ink"
                          >
                          {formatCurrency(order.total)}
                        </Link>
                      </td>
                      <td className="p-0 text-right">
                        <Link
                          href={`/sales-orders/${order.id}`}
                          title="View Sales Order detail"
                          className="inline-flex px-5 py-3.5 text-brand"
                        >
                          <ArrowRight
                            aria-hidden="true"
                            className="h-4 w-4 transition group-hover:translate-x-1"
                          />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {dashboardRole === "MANAGER" && <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-md border border-line bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Billing Reminders</h2>
              <Link
                href="/billing"
                className="inline-flex h-8 items-center justify-center rounded-md border border-line px-3 text-xs font-semibold text-brand"
              >
                View all
              </Link>
            </div>
            {plannedFollowUps.length === 0 ? (
              <EmptyState message="No billing reminders at the moment." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {plannedFollowUps.slice(0, 2).map((followUp) => (
                  <article key={followUp.id} className="rounded-md border border-line p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">
                          {followUp.customer.companyName}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                          {followUp.notes}
                        </p>
                      </div>
                      <StatusBadge status={followUp.status} />
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      {followUp.invoice?.invoiceNumber ?? "Customer billing"} -{" "}
                      {formatDate(followUp.followUpDate)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-md border border-line bg-white p-4 shadow-soft">
            <h2 className="text-base font-semibold">Module Summary</h2>
            <p className="mt-1 text-xs text-slate-500">Compact count of main modules.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {moduleOverview.map((item) => (
                <ModuleSummaryTile key={item.href} {...item} />
              ))}
            </div>
          </section>
        </div>}
      </section>

      <SalesCustomerInsights
        customers={customerInsights}
        overdueCustomers={overdueCustomerInsights}
        compact={dashboardRole === "MANAGER"}
      />
    </>
  );
}

function AdminListPanel({
  title,
  description,
  href,
  children
}: {
  title: string;
  description: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-white shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <Link href={href} className="shrink-0 text-sm font-semibold text-brand">View all</Link>
      </div>
      {children}
    </section>
  );
}

function CompactActionList({
  rows,
  empty
}: {
  rows: Array<{
    id: string;
    primary: string;
    secondary: string;
    value: string;
    href: string;
    action: string;
  }>;
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="p-4"><EmptyState message={empty} /></div>;
  }

  return (
    <div className="divide-y divide-line">
      {rows.map((row) => (
        <article key={row.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{row.primary}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{row.secondary}</p>
          </div>
          <p className="max-w-48 truncate text-right text-xs font-semibold text-slate-700">{row.value}</p>
          <Link href={row.href} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-semibold text-brand">
            {row.action}
          </Link>
        </article>
      ))}
    </div>
  );
}

function buildOverdueCustomerInsights(
  invoices: Array<{
    status: string;
    remainingAmount: number;
    dueDate: Date;
    customer: { id: string; companyName: string; name: string };
  }>
): OverdueCustomerRow[] {
  const customerMap = new Map<string, OverdueCustomerRow>();

  for (const invoice of invoices) {
    if (invoice.status !== "Overdue" || invoice.remainingAmount <= 0) continue;
    const existing = customerMap.get(invoice.customer.id);
    if (existing) {
      existing.overdueInvoiceCount += 1;
      existing.overdueAmount += invoice.remainingAmount;
      if (invoice.dueDate < new Date(existing.oldestDueDate)) {
        existing.oldestDueDate = invoice.dueDate.toISOString();
      }
      continue;
    }
    customerMap.set(invoice.customer.id, {
      id: invoice.customer.id,
      companyName: invoice.customer.companyName,
      contactName: invoice.customer.name,
      overdueInvoiceCount: 1,
      overdueAmount: invoice.remainingAmount,
      oldestDueDate: invoice.dueDate.toISOString()
    });
  }

  return [...customerMap.values()].sort((a, b) => b.overdueAmount - a.overdueAmount);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function KpiCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "bg-blue-50 text-blue-700 ring-blue-200",
    good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200"
  }[tone];

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${toneClass}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold tracking-normal text-ink">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
      </div>
    </section>
  );
}

function InsightPanel({
  title,
  footer,
  children
}: {
  title: string;
  footer: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 p-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-3 min-h-44">{children}</div>
      <p className="mt-3 text-xs text-slate-500">{footer}</p>
    </section>
  );
}

function RevenueTrendChart({ data }: { data: TrendPoint[] }) {
  const maxValue = Math.max(...data.flatMap((point) => [point.sales, point.payments]), 0);

  if (maxValue === 0) {
    return <EmptyState message="No transaction data available yet." />;
  }

  const width = 320;
  const height = 152;
  const paddingX = 26;
  const paddingTop = 10;
  const paddingBottom = 26;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;
  const salesPoints = data.map((point, index) =>
    getLinePoint(index, data.length, point.sales, maxValue, chartWidth, chartHeight, paddingX, paddingTop)
  );
  const paymentPoints = data.map((point, index) =>
    getLinePoint(index, data.length, point.payments, maxValue, chartWidth, chartHeight, paddingX, paddingTop)
  );

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
        <ChartLegend colorClass="bg-blue-600" label="Sales Order" />
        <ChartLegend colorClass="bg-emerald-600" label="Payment" />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label="Revenue trend chart">
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = paddingTop + chartHeight - chartHeight * ratio;
          return (
            <line
              key={ratio}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
          );
        })}
        <polyline
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={salesPoints.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        <polyline
          fill="none"
          stroke="#16a34a"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={paymentPoints.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        {salesPoints.map((point) => (
          <circle key={`sales-${point.x}`} cx={point.x} cy={point.y} r="3" fill="#2563eb" />
        ))}
        {paymentPoints.map((point) => (
          <circle key={`payment-${point.x}`} cx={point.x} cy={point.y} r="3" fill="#16a34a" />
        ))}
        {data.map((point, index) => {
          const x = paddingX + (index / Math.max(data.length - 1, 1)) * chartWidth;
          return (
            <text key={point.label} x={x} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[10px]">
              {point.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function PopularProductsChart({ products }: { products: PopularProduct[] }) {
  const maxQuantity = Math.max(...products.map((product) => product.quantity), 0);

  return (
    <section className="mt-4 rounded-md border border-slate-200 px-4 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Top 5 Popular Products</h3>
          <p className="text-xs text-slate-500">Highest quantity sold across confirmed sales activity.</p>
        </div>
        <span className="text-xs font-medium text-slate-500">Quantity sold</span>
      </div>

      {products.length === 0 ? (
        <div className="mt-3">
          <EmptyState message="No sold product data available yet." />
        </div>
      ) : (
        <div className="mt-3 grid gap-y-2">
          {products.map((product, index) => (
            <div key={product.name} className="grid grid-cols-[minmax(7rem,14rem)_1fr_auto] items-center gap-3">
              <p className="truncate text-xs font-medium text-slate-700" title={product.name}>
                <span className="mr-2 text-slate-400">{index + 1}.</span>
                {product.name}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.max((product.quantity / maxQuantity) * 100, 4)}%` }}
                />
              </div>
              <p className="min-w-12 text-right text-xs font-semibold text-ink">
                {product.quantity}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RevenueCompositionChart({
  total,
  paid,
  outstanding,
  segments
}: {
  total: number;
  paid: number;
  outstanding: number;
  segments: DonutSegment[];
}) {
  const visibleTotal = paid + outstanding;

  if (total === 0 && visibleTotal === 0) {
    return <EmptyState message="No transaction data available yet." />;
  }

  return (
    <div className="flex items-center gap-4">
      <DonutGraphic segments={segments} total={visibleTotal} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Sales
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">{formatCurrency(total)}</p>
        </div>
        <CompositionRow color="#2563eb" label="Paid" value={formatCurrency(paid)} />
        <CompositionRow color="#f59e0b" label="Outstanding" value={formatCurrency(outstanding)} />
      </div>
    </div>
  );
}

function StatusDonutChart({ total, segments }: { total: number; segments: DonutSegment[] }) {
  if (total === 0) {
    return <EmptyState message="No transaction data available yet." />;
  }

  return (
    <div className="flex items-center gap-4">
      <DonutGraphic segments={segments} total={total} center={String(total)} label="Total" />
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="truncate">{segment.label}</span>
            </span>
            <span className="font-semibold text-ink">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutGraphic({
  segments,
  total,
  center,
  label
}: {
  segments: DonutSegment[];
  total: number;
  center?: string;
  label?: string;
}) {
  return (
    <div
      className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
      style={{ background: buildConicGradient(segments, total) }}
    >
      <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
        {center && <span className="max-w-14 truncate text-sm font-semibold text-ink">{center}</span>}
        {label && <span className="text-[10px] uppercase text-slate-500">{label}</span>}
      </div>
    </div>
  );
}

function ModuleSummaryTile({
  href,
  label,
  value,
  helper,
  icon: Icon
}: {
  href: string;
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-16 items-center gap-3 rounded-md border border-slate-200 p-3 transition hover:border-brand hover:bg-slate-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-brand ring-1 ring-inset ring-slate-200">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-ink">{label}</span>
        <span className="mt-1 block text-xs text-slate-500">{helper}</span>
      </span>
      <span className="text-base font-semibold text-ink">{value}</span>
    </Link>
  );
}

function ChartLegend({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-4 rounded-full ${colorClass}`} />
      {label}
    </span>
  );
}

function CompositionRow({
  color,
  label,
  value
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </div>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function getRevenueTrendData(
  sales: Array<{ date: Date; amount: number }>,
  payments: Array<{ date: Date; amount: number }>
) {
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
      sales: 0,
      payments: 0
    };
  });

  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const item of sales) {
    const date = new Date(item.date);
    const bucket = bucketByKey.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (bucket) {
      bucket.sales += item.amount;
    }
  }

  for (const item of payments) {
    const date = new Date(item.date);
    const bucket = bucketByKey.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (bucket) {
      bucket.payments += item.amount;
    }
  }

  return buckets;
}

function getLinePoint(
  index: number,
  count: number,
  value: number,
  maxValue: number,
  chartWidth: number,
  chartHeight: number,
  paddingX: number,
  paddingTop: number
) {
  const x = paddingX + (index / Math.max(count - 1, 1)) * chartWidth;
  const y = paddingTop + chartHeight - (value / maxValue) * chartHeight;

  return { x, y };
}

function buildConicGradient(segments: DonutSegment[], total: number) {
  if (total === 0) {
    return "#e2e8f0";
  }

  let start = 0;
  const stops = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const end = start + (segment.value / total) * 360;
      const stop = `${segment.color} ${start}deg ${end}deg`;
      start = end;
      return stop;
    });

  return `conic-gradient(${stops.join(", ")})`;
}
