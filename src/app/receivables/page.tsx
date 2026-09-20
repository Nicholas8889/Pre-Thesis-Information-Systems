import Link from "next/link";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { Eye, Filter, Handshake } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ProcessTabs, normalizeProcessTab } from "@/components/process-tabs";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import { TableActionGroup, TableActionLink } from "@/components/table-actions";
import { ServerPagination } from "@/components/server-pagination";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPaymentTermLabel } from "@/lib/calculations";
import {
  getClosedInvoiceWhere,
  getEffectiveInvoiceStatusWhere,
  getOpenInvoiceWhere,
  withEffectiveInvoiceStatus
} from "@/lib/invoice-status";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination
} from "@/lib/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReceivablesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const status = getFirst(params.status);
  const activeTab = normalizeProcessTab(params.tab);
  const pagination = getCursorPagination(params);
  const now = new Date();
  const statusOptions =
    activeTab === "done" ? ["All", "Paid", "Cancelled"] : ["All", "Unpaid", "Partial", "Overdue"];
  const activeStatus = statusOptions.includes(status ?? "") ? status : undefined;
  const ongoingWhere = getOpenInvoiceWhere();
  const doneWhere = getClosedInvoiceWhere();
  const tabWhere = activeTab === "done" ? doneWhere : ongoingWhere;
  const visibleWhere: Prisma.InvoiceWhereInput =
    activeStatus && activeStatus !== "All"
      ? {
          AND: [
            tabWhere,
            getEffectiveInvoiceStatusWhere(activeStatus as InvoiceStatus, now)
          ]
        }
      : tabWhere;

  const [invoiceRecords, ongoingCount, doneCount, filteredCount, remainingAggregate] =
    await Promise.all([
      prisma.invoice.findMany({
        where: visibleWhere,
        orderBy: [{ status: "asc" }, { dueDate: "asc" }, { id: "asc" }],
        ...getCursorArgs(pagination),
        include: {
          customer: true,
          salesOrder: {
            select: {
              id: true,
              orderNumber: true
            }
          }
        }
      }),
      prisma.invoice.count({ where: ongoingWhere }),
      prisma.invoice.count({ where: doneWhere }),
      prisma.invoice.count({ where: visibleWhere }),
      prisma.invoice.aggregate({
        where: visibleWhere,
        _sum: { remainingAmount: true }
      })
    ]);
  const receivablePage = getCursorPage(invoiceRecords, pagination);
  const receivables = receivablePage.items.map((invoice) =>
    withEffectiveInvoiceStatus(invoice, now)
  );
  const totalRemaining = remainingAggregate._sum.remainingAmount ?? 0;

  return (
    <>
      <PageHeader
        title="Receivables"
        description="Monitor outstanding customer balances from unpaid and partial invoices."
      />

      <ProcessTabs
        basePath="/receivables"
        activeTab={activeTab}
        ongoingCount={ongoingCount}
        doneCount={doneCount}
      />

      {activeTab === "ongoing" && (
        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-line bg-white p-4 shadow-card">
            <p className="text-sm font-medium text-ink/70">Active Receivables</p>
            <p className="mt-2 text-2xl font-semibold">{filteredCount}</p>
          </div>
          <div className="rounded-md border border-line bg-white p-4 shadow-card md:col-span-2">
            <p className="text-sm font-medium text-ink/70">Remaining Amount</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(totalRemaining)}</p>
          </div>
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Filter aria-hidden="true" className="h-4 w-4 text-brand" />
          {statusOptions.map((item) => (
            <Link
              key={item}
              href={
                item === "All"
                  ? `/receivables?tab=${activeTab}`
                  : `/receivables?tab=${activeTab}&status=${item}`
              }
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                (activeStatus ?? "All") === item
                  ? "border-brand bg-brand text-white"
                  : "border-line text-ink/80"
              }`}
            >
              {item}
            </Link>
          ))}
        </div>

        {receivables.length === 0 ? (
          <EmptyState
            message={
              activeTab === "done" ? "No closed receivables." : "No active receivables."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table data-server-paginated="true">
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Sales Order</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Payment Terms</th>
                  <th className="py-3 pr-4">Due Date</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4 text-right">Remaining</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {receivables.map((invoice) => (
                  <tr key={invoice.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">{invoice.invoiceNumber}</td>
                    <td className="py-3 pr-4 text-ink/80">
                      {invoice.salesOrder.orderNumber}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {invoice.customer.companyName}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {getPaymentTermLabel({
                        paymentTermType: invoice.paymentTermType,
                        creditTermMonths: invoice.creditTermMonths,
                        creditTermWeeks: invoice.creditTermWeeks
                      })}
                      {activeTab === "ongoing" && invoice.paymentTermType === "CREDIT" && (
                        <span className="mt-1 block text-xs font-medium text-info">
                          Collection reminder suggested near due date
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">{formatDate(invoice.dueDate)}</td>
                    <td className="py-3 pr-4">
                      <StatusStack>
                        <StatusBadge status={invoice.status} />
                        {invoice.status === "Overdue" && (
                          <span className="inline-flex whitespace-nowrap rounded-md bg-danger px-2.5 py-1 text-left text-xs font-semibold text-white">
                            Needs Collection
                          </span>
                        )}
                      </StatusStack>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.remainingAmount)}
                    </td>
                    <td className="py-3">
                      <TableActionGroup>
                        <TableActionLink
                          href={`/sales-orders/${invoice.salesOrderId}`}
                          label="View Sales Order"
                        >
                          <Eye aria-hidden="true" />
                        </TableActionLink>
                        {activeTab === "ongoing" && (
                          <TableActionLink
                            href={`/collections?customerId=${invoice.customerId}&invoiceId=${invoice.id}`}
                            label="Create Collection Task"
                          >
                            <Handshake aria-hidden="true" />
                          </TableActionLink>
                        )}
                      </TableActionGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ServerPagination
          hasNext={receivablePage.hasNext}
          label="receivables"
          nextCursor={receivablePage.nextCursor}
          pathname="/receivables"
          searchParams={params}
          state={pagination}
        />
      </section>
    </>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
