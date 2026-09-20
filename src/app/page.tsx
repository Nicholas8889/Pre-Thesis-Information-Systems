import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Eye,
  FileText,
  Handshake,
  ReceiptText,
  TrendingUp,
  Truck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import { TableActionGroup, TableActionLink } from "@/components/table-actions";
import { formatCurrency, formatDate } from "@/lib/format";
import type { CustomerRelationshipSummary } from "@/lib/dashboard-insights";
import { getDashboardLists, getDashboardMetrics } from "@/lib/dashboard-data";
import { getDashboardAnalysis } from "@/lib/dashboard-analysis";
import { DashboardAnalysisToolbar } from "@/components/dashboard-analysis-status";
import { requireCurrentUser } from "@/lib/session";

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

const chartColors = {
  neutral: "rgb(var(--color-ink) / 0.35)",
  line: "rgb(var(--color-ink) / 0.16)",
  brand: "rgb(var(--color-brand))",
  accent: "rgb(var(--color-accent))",
  info: "rgb(var(--color-info))",
  success: "rgb(var(--color-success))",
  warning: "rgb(var(--color-warning))",
  danger: "rgb(var(--color-danger))",
  canvas: "rgb(var(--color-canvas))"
} as const;

const salesOrderStatuses = [
  { label: "Draft", color: chartColors.neutral },
  { label: "Confirmed", color: chartColors.info },
  { label: "Invoiced", color: chartColors.brand },
  { label: "Shipped", color: chartColors.accent },
  { label: "Cancelled", color: chartColors.danger }
] as const;

const invoiceStatuses = [
  { label: "Paid", color: chartColors.success },
  { label: "Partial", color: chartColors.info },
  { label: "Unpaid", color: chartColors.warning },
  { label: "Overdue", color: chartColors.danger },
  { label: "Cancelled", color: chartColors.neutral }
] as const;

const deliveryNoteStatuses = [
  { label: "Draft", color: chartColors.neutral },
  { label: "Issued", color: chartColors.info },
  { label: "Delivered", color: chartColors.success },
  { label: "Cancelled", color: chartColors.danger }
] as const;

export default async function DashboardPage() {
  const currentUser = await requireCurrentUser();
  const dashboardRole = currentUser.role;
  const isSalesDashboard = dashboardRole === "SALES";
  const [metrics, analysis, lists] = await Promise.all([
    getDashboardMetrics(currentUser),
    getDashboardAnalysis(currentUser),
    getDashboardLists(currentUser)
  ]);
  const trendData = analysis.trend;
  const { recentSalesOrders } = lists;
  const {
    deliveryNoteCount, invoiceCount, salesOrderCount, totalSalesOrderValue,
    totalPaidAmount, outstandingAmount, overdueCount, customerRelationshipSummary
  } = metrics;
  const needCollectionTaskCount = overdueCount + metrics.plannedTaskCount;
  const revenueComposition = [
    { label: "Paid Amount", value: totalPaidAmount, color: chartColors.success },
    { label: "Outstanding", value: outstandingAmount, color: chartColors.warning }
  ];
  const salesOrderDistribution = salesOrderStatuses.map((status) => ({
    ...status,
    value: metrics.salesOrderDistribution[status.label] ?? 0
  }));
  const invoiceDistribution = invoiceStatuses.map((status) => ({
    ...status,
    value: metrics.invoiceDistribution[status.label] ?? 0
  }));
  const deliveryNoteDistribution = deliveryNoteStatuses.map((status) => ({
    ...status,
    value: metrics.deliveryNoteDistribution[status.label] ?? 0
  }));
  const reportingPeriod = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).format(new Date());

  if (dashboardRole === "ADMIN") {
    if (!lists.admin) throw new Error("Admin dashboard lists are unavailable");
    const {
      dueSoonReceivables, receivablesToShow,
      deliveryNotesToShow, collectionTasksToShow
    } = lists.admin;

    return (
      <>
        <PageHeader
          title="Admin Dashboard"
          description={`Welcome, ${currentUser?.displayName ?? "Admin"}. Manage invoices, delivery documents, receivables, and collection work from one operational view.`}
        />
        <DashboardAnalysisToolbar analysis={analysis} canRefresh />

        <DashboardSummary
          items={[
            {
              label: "Open Invoices",
              value: String(metrics.openInvoiceCount),
              description: formatCurrency(outstandingAmount),
              icon: FileText,
              tone: "warning"
            },
            {
              label: "Overdue Receivables",
              value: String(metrics.overdueReceivableCount),
              description: formatCurrency(metrics.overdueReceivableAmount),
              icon: ReceiptText,
              tone: "danger"
            },
            {
              label: "Surat Jalan Needed",
              value: String(metrics.eligibleDeliveryCount),
              description: `${formatCurrency(metrics.eligibleDeliveryValue)} eligible`,
              icon: Truck
            },
            {
              label: "Planned Collection Tasks",
              value: String(metrics.plannedTaskCount),
              description: `${metrics.dueTaskCount} due today or earlier`,
              icon: Handshake,
              tone: "good"
            }
          ]}
        />

        <section className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="grid content-start gap-4">
            <AdminListPanel
              title="Invoice Insight"
              description="Current invoice status and remaining exposure."
              href="/invoices"
            >
              <AdminStatusOverview
                items={invoiceDistribution.filter((item) => item.label !== "Cancelled")}
                footerLabel="Total invoice value"
                footerValue={formatCurrency(metrics.invoiceTotalValue)}
              />
            </AdminListPanel>

            <AdminListPanel
              title="Surat Jalan Insight"
              description="Current delivery document status."
              href="/surat-jalan"
            >
              <AdminStatusOverview
                items={deliveryNoteDistribution}
                footerLabel="Total Surat Jalan"
                footerValue={`${deliveryNoteCount} documents`}
              />
            </AdminListPanel>
          </div>

          <AdminListPanel
            title="Orders Awaiting Warehouse Processing"
            description="Orders ready for picking, packing, and delivery documentation."
            href="/surat-jalan"
          >
            <CompactActionList
              empty="No orders awaiting warehouse processing."
              rows={deliveryNotesToShow.map((invoice) => ({
                id: invoice.id,
                primary: invoice.invoiceNumber,
                secondary: `${invoice.customer.companyName} · ${invoice.paymentTermType}`,
                value: formatCurrency(invoice.totalAmount),
                href: `/pick-pack?invoiceId=${invoice.id}`,
                action: "Create"
              }))}
            />
          </AdminListPanel>

          <AdminListPanel
            title={dueSoonReceivables.length > 0 ? "Receivables Due Soon" : "Open Receivables"}
            description={dueSoonReceivables.length > 0 ? "Balances due within the next 30 days." : "No balances are due in the next 30 days, so all open receivables are shown."}
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
            title="Collection Tasks to Do"
            description="Planned payment collection tasks ordered by date."
            href="/collections"
          >
            <CompactActionList
              empty="No planned collection tasks."
              rows={collectionTasksToShow.map((collectionTask) => ({
                id: collectionTask.id,
                primary: collectionTask.customer.companyName,
                secondary: `${collectionTask.invoice?.invoiceNumber ?? "Customer collection"} · ${formatDate(collectionTask.scheduledDate)}`,
                value: collectionTask.invoice
                  ? formatCurrency(collectionTask.invoice.remainingAmount)
                  : "Customer follow-up",
                href: "/collections",
                action: "Open"
              }))}
            />
          </AdminListPanel>
        </section>

        <section className="mt-5 rounded-md border border-line bg-white shadow-card">
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Recent Sales Orders &amp; Customer Purchase Orders</h2>
              <p className="mt-1 text-xs text-ink/70">The latest commercial documents across both order sources.</p>
            </div>
            <nav aria-label="Recent order lists" className="flex shrink-0 gap-3 text-sm font-semibold text-brand">
              <Link href="/sales-orders">Sales Orders</Link>
              <Link href="/customer-purchase-orders">Purchase Orders</Link>
            </nav>
          </div>
          <CompactActionList
            empty="No recent sales orders or customer purchase orders."
            rows={recentSalesOrders.slice(0, 5).map((order) => ({
              id: order.id,
              primary: order.source === "CUSTOMER_PO"
                ? order.customerPoNumber ?? order.orderNumber
                : order.orderNumber,
              secondary: `${order.source === "CUSTOMER_PO" ? "Customer PO" : "Sales Order"} · ${order.customer.companyName} · ${formatDate(order.orderDate)}`,
              value: formatCurrency(order.total),
              href: order.source === "CUSTOMER_PO"
                ? `/customer-purchase-orders/${order.id}`
                : `/sales-orders/${order.id}`,
              action: "View"
            }))}
          />
        </section>
      </>
    );
  }

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
      <DashboardAnalysisToolbar analysis={analysis} canRefresh={dashboardRole !== "SALES"} />

      <DashboardSummary
        items={[
          {
            label: isSalesDashboard ? "My Sales Value" : "Total Sales Value",
            value: formatCurrency(totalSalesOrderValue),
            description: isSalesDashboard ? "Sales Orders created by you" : "Company Sales Order value",
            icon: TrendingUp
          },
          {
            label: isSalesDashboard ? "Collected from My Orders" : "Paid Amount",
            value: formatCurrency(totalPaidAmount),
            description: isSalesDashboard ? "Payments linked to your orders" : "Recorded company payments",
            icon: Banknote,
            tone: "good"
          },
          {
            label: isSalesDashboard ? "My Order Receivables" : "Outstanding Receivables",
            value: formatCurrency(outstandingAmount),
            description: isSalesDashboard ? "Open balance from your orders" : "Open company invoice balance",
            icon: ReceiptText,
            tone: "warning"
          },
          {
            label: "Need Attention",
            value: String(needCollectionTaskCount),
            description: `${overdueCount} overdue + ${metrics.plannedTaskCount} planned collection`,
            icon: AlertTriangle,
            tone: "danger"
          }
        ]}
      />

      <section className="mt-5 rounded-md border border-line bg-white p-4 shadow-card">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Revenue Cycle Highlights</h2>
            <p className="text-sm text-ink/80">
              {isSalesDashboard
                ? "Your sales movement and current customer portfolio status in one compact view."
                : "Historical movement and current business status in one compact view."}
            </p>
          </div>
          <p className="text-xs font-medium text-ink/70">
            {isSalesDashboard ? "Your portfolio" : "Company-wide"} · {reportingPeriod}
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_2fr]">
          <InsightPanel
            title={isSalesDashboard ? "My Revenue Trend" : "Revenue Trend"}
            footer="Sales Orders and payments by month"
          >
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

          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-3">
              <InsightPanel title="Sales Order Status" footer={`Total ${salesOrderCount} order(s)`}>
                <StatusDonutChart total={salesOrderCount} segments={salesOrderDistribution} />
              </InsightPanel>

              <InsightPanel title="Invoice Status" footer={`Total ${invoiceCount} invoice(s)`}>
                <StatusDonutChart total={invoiceCount} segments={invoiceDistribution} />
              </InsightPanel>

              <InsightPanel title="Surat Jalan Status" footer={`Total ${deliveryNoteCount} document(s)`}>
                <StatusDonutChart total={deliveryNoteCount} segments={deliveryNoteDistribution} />
              </InsightPanel>
            </div>

            <CustomerRelationshipPanel
              summary={customerRelationshipSummary}
              portfolioLabel={isSalesDashboard ? "your customer portfolio" : "all customers"}
            />
          </div>
        </div>

      </section>

      <section className="mt-5 rounded-md border border-line bg-white shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">
                {isSalesDashboard ? "My Recent Sales Orders" : "Recent Sales Orders"}
              </h2>
              <p className="mt-1 text-sm text-ink/70">
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
                <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                  <tr>
                    <th className="px-5 py-3">Order</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-sm">
                  {recentSalesOrders.map((order) => (
                    <tr key={order.id} className="group cursor-pointer transition hover:bg-soft">
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
                            className="block px-5 py-3.5 text-ink/80"
                          >
                          {order.customer.companyName}
                        </Link>
                      </td>
                      <td className="p-0">
                          <Link
                            href={`/sales-orders/${order.id}`}
                            className="block px-5 py-3.5 text-ink/80"
                          >
                          {formatDate(order.orderDate)}
                        </Link>
                      </td>
                      <td className="p-0">
                          <Link href={`/sales-orders/${order.id}`} className="block px-5 py-3.5">
                          <StatusStack>
                            <StatusBadge status={order.status} />
                          </StatusStack>
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
                      <td className="px-5 py-2">
                        <TableActionGroup>
                          <TableActionLink
                            href={`/sales-orders/${order.id}`}
                            label="View Sales Order detail"
                          >
                            <Eye aria-hidden="true" />
                          </TableActionLink>
                        </TableActionGroup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
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
    <section className="rounded-md border border-line bg-white shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-ink/70">{description}</p>
        </div>
        <Link href={href} className="shrink-0 text-sm font-semibold text-brand">View all</Link>
      </div>
      {children}
    </section>
  );
}

function AdminStatusOverview({
  items,
  footerLabel,
  footerValue
}: {
  items: Array<{ label: string; value: number }>;
  footerLabel: string;
  footerValue: string;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {items.map((item) => (
          <article key={item.label} className="border-l-4 border-brand bg-soft px-3 py-2.5">
            <p className="text-[11px] font-medium text-ink/70">{item.label}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{item.value}</p>
          </article>
        ))}
      </div>
      <div className="border-t border-line px-4 py-3 text-sm text-ink/80">
        {footerLabel}: <strong className="text-ink">{footerValue}</strong>
      </div>
    </>
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
            <p className="mt-1 truncate text-xs text-ink/70">{row.secondary}</p>
          </div>
          <p className="max-w-48 truncate text-right text-xs font-semibold text-ink">{row.value}</p>
          <Link href={row.href} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-semibold text-brand">
            {row.action}
          </Link>
        </article>
      ))}
    </div>
  );
}

type DashboardMetric = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone?: "neutral" | "good" | "warning" | "danger";
};

function DashboardSummary({ items }: { items: DashboardMetric[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-line bg-white shadow-card">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold text-ink">Dashboard Summary</h2>
      </div>
      <div className="dashboard-summary-grid">
        {items.map((item) => (
          <KpiMetric key={item.label} {...item} />
        ))}
      </div>
    </section>
  );
}

function KpiMetric({
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
    neutral: "bg-info text-white",
    good: "bg-success text-white",
    warning: "bg-warning text-strong",
    danger: "bg-danger text-white"
  }[tone];

  return (
    <article className="dashboard-summary-metric">
      <div className="flex items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">{label}</p>
          <p className="mt-1 text-xl font-semibold tracking-normal text-ink">{value}</p>
          <p className="mt-1 text-xs leading-5 text-ink/70">{description}</p>
        </div>
      </div>
    </article>
  );
}

function CustomerRelationshipPanel({
  summary,
  portfolioLabel
}: {
  summary: CustomerRelationshipSummary;
  portfolioLabel: string;
}) {
  const metrics = [
    {
      label: "Total Outreach",
      value: summary.totalOutreach,
      helper: "recorded contacts"
    },
    {
      label: "Outreach Converted",
      value: summary.outreachConverted,
      helper: "customers with orders"
    },
    {
      label: "Total Inquiry",
      value: summary.totalInquiries,
      helper: "recorded inquiries"
    },
    {
      label: "Inquiry Open",
      value: summary.openInquiries,
      helper: "awaiting resolution"
    },
    {
      label: "Inquiry Closed",
      value: summary.closedInquiries,
      helper: "closed or completed"
    }
  ];

  return (
    <section className="rounded-md border border-line p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="text-sm font-semibold text-ink">Customer Relationship</h3>
        <p className="text-[11px] font-medium text-ink/60">Based on {portfolioLabel}</p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="border-l-4 border-brand bg-soft px-3 py-2.5"
          >
            <p className="text-[11px] font-medium text-ink/70">{metric.label}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{metric.value}</p>
            <p className="mt-0.5 text-[10px] text-ink/60">{metric.helper}</p>
          </article>
        ))}
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
    <section className="rounded-md border border-line p-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-3 min-h-44">{children}</div>
      <p className="mt-3 text-xs text-ink/70">{footer}</p>
    </section>
  );
}

function RevenueTrendChart({ data }: { data: TrendPoint[] }) {
  const maxValue = Math.max(...data.flatMap((point) => [point.sales, point.payments]), 0);

  if (maxValue === 0) {
    return <EmptyState message="No business data available yet." />;
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
      <div className="mb-2 flex items-center gap-4 text-xs text-ink/80">
        <ChartLegend colorClass="bg-info" label="Sales Order" />
        <ChartLegend colorClass="bg-success" label="Payment" />
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
              stroke={chartColors.line}
              strokeDasharray="4 4"
            />
          );
        })}
        <polyline
          fill="none"
          stroke={chartColors.info}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={salesPoints.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        <polyline
          fill="none"
          stroke={chartColors.success}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={paymentPoints.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        {salesPoints.map((point) => (
          <circle key={`sales-${point.x}`} cx={point.x} cy={point.y} r="3" fill={chartColors.info} />
        ))}
        {paymentPoints.map((point) => (
          <circle key={`payment-${point.x}`} cx={point.x} cy={point.y} r="3" fill={chartColors.success} />
        ))}
        {data.map((point, index) => {
          const x = paddingX + (index / Math.max(data.length - 1, 1)) * chartWidth;
          return (
            <text key={point.label} x={x} y={height - 6} textAnchor="middle" className="fill-ink/70 text-[10px]">
              {point.label}
            </text>
          );
        })}
      </svg>
    </div>
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
    return <EmptyState message="No business data available yet." />;
  }

  return (
    <div className="flex items-center gap-3">
      <DonutGraphic segments={segments} total={visibleTotal} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="rounded-md bg-soft px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/70">
            Total Sales
          </p>
            <p className="mt-1 whitespace-nowrap text-xs font-semibold tabular-nums text-ink">
              {formatCurrency(total)}
            </p>
        </div>
        <CompositionRow color={chartColors.success} label="Paid" value={formatCurrency(paid)} />
        <CompositionRow color={chartColors.warning} label="Outstanding" value={formatCurrency(outstanding)} />
      </div>
    </div>
  );
}

function StatusDonutChart({ total, segments }: { total: number; segments: DonutSegment[] }) {
  if (total === 0) {
    return <EmptyState message="No business data available yet." />;
  }

  return (
    <div className="flex items-center gap-2">
      <DonutGraphic
        segments={segments}
        total={total}
        center={String(total)}
        label="Total"
        compact
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-1 text-[10px]">
            <span className="flex min-w-0 items-center gap-1 text-ink/80">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
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
  label,
  compact = false
}: {
  segments: DonutSegment[];
  total: number;
  center?: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full ${
        compact ? "h-20 w-20" : "h-24 w-24"
      }`}
      style={{ background: buildConicGradient(segments, total) }}
    >
      <div
        className={`flex flex-col items-center justify-center rounded-full bg-white text-center shadow-sm ${
          compact ? "h-12 w-12" : "h-14 w-14"
        }`}
      >
        {center && <span className="max-w-14 truncate text-sm font-semibold text-ink">{center}</span>}
        {label && <span className="text-[10px] uppercase text-ink/70">{label}</span>}
      </div>
    </div>
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
    <div className="rounded-md bg-soft px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-medium text-ink/80">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </div>
      <p className="mt-1 whitespace-nowrap text-xs font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
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
    return chartColors.canvas;
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
