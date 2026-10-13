import Link from "next/link";
import { Eye, Filter, Handshake } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ProcessTabs } from "@/components/process-tabs";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import { TableActionGroup, TableActionLink } from "@/components/table-actions";
import { ServerPagination } from "@/components/server-pagination";
import { TableSearchToolbar } from "@/components/table-search-toolbar";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPaymentTermLabel } from "@/lib/calculations";
import { withEffectiveInvoiceStatus } from "@/lib/invoice-status";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination
} from "@/lib/pagination";
import { requireCurrentUser } from "@/lib/session";
import { buildPortfolioScope } from "@/lib/portfolio-scope";
import {
  buildReceivableOrderBy,
  buildReceivableWhere,
  getReceivableStatusOptions,
  parseReceivableFilters,
} from "@/lib/receivable-query";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReceivablesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const filters = parseReceivableFilters({
    tab: getFirst(params.tab),
    status: getFirst(params.status),
    query: getFirst(params.q),
    sort: getFirst(params.sort),
    direction: getFirst(params.direction),
  });
  const activeTab = filters.tab;
  const pagination = getCursorPagination(params);
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const now = new Date();
  const statusOptions = getReceivableStatusOptions(activeTab);
  const visibleWhere = buildReceivableWhere(filters, now, portfolio.invoiceWhere);
  const ongoingWhere = buildReceivableWhere(
    { ...filters, tab: "ongoing", status: null },
    now,
    portfolio.invoiceWhere,
  );
  const doneWhere = buildReceivableWhere(
    { ...filters, tab: "done", status: null },
    now,
    portfolio.invoiceWhere,
  );

  const [invoiceRecords, ongoingCount, doneCount, filteredCount, remainingAggregate] =
    await Promise.all([
      prisma.invoice.findMany({
        where: visibleWhere,
        orderBy: buildReceivableOrderBy(filters),
        ...getCursorArgs(pagination),
        include: {
          customer: true,
          salesOrder: {
            select: {
              id: true,
              orderNumber: true,
              source: true,
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
        searchParams={params}
        preserveParams={["q", "sort", "direction"]}
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
        <h2 className="mb-3 text-lg font-semibold">Receivable Records</h2>
        <nav aria-label="Receivable status" className="mb-3 flex flex-wrap items-center gap-2 no-print">
          <Filter className="h-4 w-4 text-ink/50" aria-hidden="true" />
          {statusOptions.map(status => {
            const selected = status === (filters.status ?? "All");
            const query = new URLSearchParams({
              tab: activeTab,
              sort: filters.sort,
              direction: filters.direction,
            });
            if (filters.query) query.set("q", filters.query);
            if (status !== "All") query.set("status", status);

            return (
              <Link
                key={status}
                href={`/receivables?${query}`}
                scroll={false}
                aria-current={selected ? "page" : undefined}
                className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-semibold transition ${selected ? "border-brand bg-brand text-white" : "border-line bg-white text-brand hover:bg-soft"}`}
              >
                {status}
              </Link>
            );
          })}
        </nav>
        <TableSearchToolbar
          defaultValue={filters.query}
          placeholder="Invoice, customer, or sales order"
          resetHref={`/receivables?tab=${activeTab}`}
          loadedCount={receivables.length}
          totalCount={filteredCount}
          page={pagination.page}
        >
          <input type="hidden" name="tab" value={activeTab} />
          <input type="hidden" name="status" value={filters.status ?? ""} />
          <input type="hidden" name="sort" value={filters.sort} />
          <input type="hidden" name="direction" value={filters.direction} />
        </TableSearchToolbar>

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
                    <td className="py-3 pr-4 font-medium">
                      <Link className="text-brand hover:underline" href={`/invoices?view=${invoice.id}`}>{invoice.invoiceNumber}</Link>
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      <Link className="text-brand hover:underline" href={`${invoice.salesOrder.source === "CUSTOMER_PO" ? "/customer-purchase-orders" : "/sales-orders"}/${invoice.salesOrder.id}`}>{invoice.salesOrder.orderNumber}</Link>
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      <Link className="text-brand hover:underline" href={`/customers?view=${invoice.customerId}`}>{invoice.customer.companyName}</Link>
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
                          href={`/invoices?view=${invoice.id}`}
                          label="View Invoice"
                        >
                          <Eye aria-hidden="true" />
                        </TableActionLink>
                        <TableActionLink href={`/customers?view=${invoice.customerId}`} label="View Customer">
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
          preserveParams={["tab", "status", "q", "sort", "direction"]}
        />
      </section>
    </>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
