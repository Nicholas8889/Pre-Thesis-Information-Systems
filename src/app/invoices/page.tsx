import Link from "next/link";
import { Eye, FilePlus2, Printer } from "lucide-react";
import { updateInvoiceNotes } from "@/lib/actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { ProcessTabs, normalizeProcessTab } from "@/components/process-tabs";
import { StatusBadge } from "@/components/status-badge";
import { RestrictedAction } from "@/components/restricted-action";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { canCreateDeliveryNoteForInvoice, getPaymentTermLabel } from "@/lib/calculations";
import { isDoneInvoice, isOngoingInvoice } from "@/lib/process-status";
import { getSearchMessage, syncOverdueInvoices } from "@/lib/workflow";
import { getCurrentUser } from "@/lib/session";
import { canRole, getRestrictionMessage } from "@/lib/role-access";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function InvoicesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const viewId = getFirst(params.view);
  const activeTab = normalizeProcessTab(params.tab);
  const { success, error } = getSearchMessage(params);
  const currentUser = await getCurrentUser();
  const canCreateSuratJalan = canRole(currentUser?.role, "CREATE_SURAT_JALAN");

  await syncOverdueInvoices();

  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      salesOrder: true
    }
  });

  const ongoingInvoices = invoices.filter((invoice) => isOngoingInvoice(invoice.status));
  const doneInvoices = invoices.filter((invoice) => isDoneInvoice(invoice.status));
  const visibleInvoices = activeTab === "done" ? doneInvoices : ongoingInvoices;

  const selectedInvoice =
    activeTab === "ongoing"
      ? viewId
        ? await prisma.invoice.findUnique({
            where: { id: viewId },
            include: {
              customer: true,
              salesOrder: { include: { items: true } },
              payments: { orderBy: { paymentDate: "desc" } }
            }
          })
        : visibleInvoices[0]
          ? await prisma.invoice.findUnique({
              where: { id: visibleInvoices[0].id },
              include: {
                customer: true,
                salesOrder: { include: { items: true } },
                payments: { orderBy: { paymentDate: "desc" } }
              }
            })
          : null
      : null;

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Review generated invoices, due dates, payment status, and remaining balances."
      />

      <FlashMessage success={success} error={error} />

      <ProcessTabs
        basePath="/invoices"
        activeTab={activeTab}
        ongoingCount={ongoingInvoices.length}
        doneCount={doneInvoices.length}
      />

      {selectedInvoice && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-slate-400">Invoice</p>
              <h2 className="mt-1 text-2xl font-semibold">{selectedInvoice.invoiceNumber}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Sales Order {selectedInvoice.salesOrder.orderNumber}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={selectedInvoice.status} />
              {canCreateDeliveryNoteForInvoice({
                paymentTermType: selectedInvoice.paymentTermType,
                status: selectedInvoice.status
              }) && canCreateSuratJalan ? (
                <Link
                  href={`/surat-jalan?mode=create&invoiceId=${selectedInvoice.id}`}
                  title="Create Surat Jalan"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand"
                >
                  <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                  Create Surat Jalan
                </Link>
              ) : canCreateDeliveryNoteForInvoice({
                  paymentTermType: selectedInvoice.paymentTermType,
                  status: selectedInvoice.status
                }) ? (
                <RestrictedAction message={getRestrictionMessage("CREATE_SURAT_JALAN")}>
                  <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                    <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                    Create Surat Jalan
                  </button>
                </RestrictedAction>
              ) : (
                <span
                  title="Debit transaction must be paid before Surat Jalan can be created."
                  className="inline-flex h-10 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800"
                >
                  Payment Required First
                </span>
              )}
              <Link
                href={`/invoices/${selectedInvoice.id}/print`}
                title="View / Print Invoice"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                View / Print Invoice
              </Link>
            </div>
          </div>

          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Detail label="Customer" value={selectedInvoice.customer.companyName} />
            <Detail label="Contact" value={selectedInvoice.customer.name} />
            <Detail label="Issue Date" value={formatDate(selectedInvoice.issueDate)} />
            <Detail label="Due Date" value={formatDate(selectedInvoice.dueDate)} />
            <Detail
              label="Payment Term"
              value={getPaymentTermLabel({
                paymentTermType: selectedInvoice.paymentTermType,
                creditTermMonths: selectedInvoice.creditTermMonths
              })}
            />
            <Detail label="Total Amount" value={formatCurrency(selectedInvoice.totalAmount)} />
            <Detail label="Paid Amount" value={formatCurrency(selectedInvoice.paidAmount)} />
            <Detail
              label="Remaining Amount"
              value={formatCurrency(selectedInvoice.remainingAmount)}
            />
            <Detail label="Phone" value={selectedInvoice.customer.phone} />
          </div>

          <div className="mt-6 overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Item</th>
                  <th className="py-3 pr-4 text-right">Qty</th>
                  <th className="py-3 pr-4 text-right">Unit Price</th>
                  <th className="py-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {selectedInvoice.salesOrder.items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{item.itemName}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{item.quantity}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={updateInvoiceNotes} className="mt-6 border-t border-line pt-4">
            <input type="hidden" name="id" value={selectedInvoice.id} />
            <label className="block text-sm font-medium text-slate-700">
              Invoice Notes
              <textarea
                name="notes"
                defaultValue={selectedInvoice.notes ?? ""}
                className="mt-1 min-h-24 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                placeholder="Optional internal or demo note"
              />
            </label>
            <button className="mt-3 inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-brand">
              Save Notes
            </button>
          </form>
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        {visibleInvoices.length === 0 ? (
          <EmptyState
            message={activeTab === "done" ? "No completed invoices." : "No ongoing invoices."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Issue Date</th>
                  <th className="py-3 pr-4">Due Date</th>
                  <th className="py-3 pr-4">Payment Term</th>
                  <th className="py-3 pr-4 text-right">Total</th>
                  {activeTab === "done" && <th className="py-3 pr-4 text-right">Paid</th>}
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4 text-right">Remaining</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleInvoices.map((invoice) => (
                  <tr key={invoice.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{invoice.invoiceNumber}</td>
                    <td className="py-3 pr-4 text-slate-600">{invoice.customer.companyName}</td>
                    <td className="py-3 pr-4 text-slate-600">{formatDate(invoice.issueDate)}</td>
                    <td className="py-3 pr-4 text-slate-600">{formatDate(invoice.dueDate)}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {getPaymentTermLabel({
                        paymentTermType: invoice.paymentTermType,
                        creditTermMonths: invoice.creditTermMonths
                      })}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    {activeTab === "done" && (
                      <td className="py-3 pr-4 text-right text-slate-600">
                        {formatCurrency(invoice.paidAmount)}
                      </td>
                    )}
                    <td className="py-3 pr-4">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.remainingAmount)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {activeTab === "ongoing" && (
                          <Link
                            href={`/invoices?tab=${activeTab}&view=${invoice.id}`}
                            title="View invoice detail"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                          >
                            <Eye aria-hidden="true" className="h-4 w-4" />
                          </Link>
                        )}
                        <Link
                          href={`/invoices/${invoice.id}/print`}
                          title="View / Print Invoice"
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-brand"
                        >
                          <Printer aria-hidden="true" className="h-4 w-4" />
                          View / Print
                        </Link>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "-"}</p>
    </div>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
