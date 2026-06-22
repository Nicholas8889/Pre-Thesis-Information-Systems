import Link from "next/link";
import { Eye, Filter, Handshake } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ProcessTabs, normalizeProcessTab } from "@/components/process-tabs";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPaymentTermLabel } from "@/lib/calculations";
import { isDoneReceivable, isOngoingReceivable } from "@/lib/process-status";
import { syncOverdueInvoices } from "@/lib/workflow";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReceivablesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const status = getFirst(params.status);
  const activeTab = normalizeProcessTab(params.tab);

  await syncOverdueInvoices();

  const invoices = await prisma.invoice.findMany({
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: {
      customer: true,
      salesOrder: {
        select: {
          id: true,
          orderNumber: true
        }
      }
    }
  });

  const ongoingReceivables = invoices.filter((invoice) =>
    isOngoingReceivable({
      status: invoice.status,
      remainingAmount: invoice.remainingAmount
    })
  );
  const doneReceivables = invoices.filter((invoice) =>
    isDoneReceivable({
      status: invoice.status,
      remainingAmount: invoice.remainingAmount
    })
  );
  const tabReceivables = activeTab === "done" ? doneReceivables : ongoingReceivables;
  const statusOptions =
    activeTab === "done" ? ["All", "Paid", "Cancelled"] : ["All", "Unpaid", "Partial", "Overdue"];
  const activeStatus = statusOptions.includes(status ?? "") ? status : undefined;
  const receivables =
    activeStatus && activeStatus !== "All"
      ? tabReceivables.filter((invoice) => invoice.status === activeStatus)
      : tabReceivables;

  const totalRemaining = receivables.reduce(
    (sum, invoice) => sum + invoice.remainingAmount,
    0
  );

  return (
    <>
      <PageHeader
        title="Receivables"
        description="Monitor outstanding customer balances from unpaid and partial invoices."
      />

      <ProcessTabs
        basePath="/receivables"
        activeTab={activeTab}
        ongoingCount={ongoingReceivables.length}
        doneCount={doneReceivables.length}
      />

      {activeTab === "ongoing" && (
        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-line bg-white p-4 shadow-soft">
            <p className="text-sm font-medium text-slate-500">Active Receivables</p>
            <p className="mt-2 text-2xl font-semibold">{receivables.length}</p>
          </div>
          <div className="rounded-md border border-line bg-white p-4 shadow-soft md:col-span-2">
            <p className="text-sm font-medium text-slate-500">Remaining Amount</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(totalRemaining)}</p>
          </div>
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
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
                  : "border-line text-slate-600"
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
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Sales Order</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Payment Term</th>
                  <th className="py-3 pr-4">Due Date</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4 text-right">Remaining</th>
                  <th className="py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {receivables.map((invoice) => (
                  <tr key={invoice.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{invoice.invoiceNumber}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {invoice.salesOrder.orderNumber}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {invoice.customer.companyName}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {getPaymentTermLabel({
                        paymentTermType: invoice.paymentTermType,
                        creditTermMonths: invoice.creditTermMonths
                      })}
                      {activeTab === "ongoing" && invoice.paymentTermType === "CREDIT" && (
                        <span className="mt-1 block text-xs font-medium text-sky-700">
                          Billing reminder suggested near due date
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{formatDate(invoice.dueDate)}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={invoice.status} />
                      {invoice.status === "Overdue" && (
                        <span className="ml-2 inline-flex rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                          Needs Billing
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.remainingAmount)}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/sales-orders/${invoice.salesOrderId}`}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
                        >
                          <Eye aria-hidden="true" className="h-4 w-4" />
                          View Sales Order
                        </Link>
                        {activeTab === "ongoing" && (
                          <Link
                            href={`/billing?customerId=${invoice.customerId}&invoiceId=${invoice.id}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
                          >
                            <Handshake aria-hidden="true" className="h-4 w-4" />
                            Create Billing
                          </Link>
                        )}
                      </div>
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

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
