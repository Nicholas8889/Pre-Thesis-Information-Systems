import Link from "next/link";
import { DocumentRevisionBadge } from "@/components/document-revision-badge";
import { Eye, FilePlus2, Printer } from "lucide-react";
import { cancelInvoice, updateInvoiceNotes } from "@/lib/actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { ProcessTabs, normalizeProcessTab } from "@/components/process-tabs";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import {
  TableActionGroup,
  TableActionLink,
  TableMenuLink,
  TableOverflowMenu
} from "@/components/table-actions";
import { RestrictedAction } from "@/components/restricted-action";
import { ServerPagination } from "@/components/server-pagination";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { canCreateDeliveryNoteForInvoice, getPaymentTermLabel } from "@/lib/calculations";
import { getSearchMessage } from "@/lib/workflow";
import {
  getClosedInvoiceWhere,
  getOpenInvoiceWhere,
  withEffectiveInvoiceStatus
} from "@/lib/invoice-status";
import { requireCurrentUser } from "@/lib/session";
import { buildPortfolioScope } from "@/lib/portfolio-scope";
import { canRole, getRestrictionMessage } from "@/lib/role-access";
import { formatNpwp } from "@/lib/npwp";
import { formatPpnRate } from "@/lib/tax";
import { canCancelInvoice } from "@/lib/invoice-policy";
import { parseInvoiceItemSnapshots } from "@/lib/invoice-snapshot";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination
} from "@/lib/pagination";

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
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const canCreateSuratJalan = canRole(currentUser.role, "CREATE_SURAT_JALAN");
  const canCancel = canRole(currentUser.role, "CANCEL_INVOICE");
  const pagination = getCursorPagination(params);
  const now = new Date();
  const ongoingWhere = { ...getOpenInvoiceWhere(), ...portfolio.invoiceWhere };
  const doneWhere = { ...getClosedInvoiceWhere(), ...portfolio.invoiceWhere };
  const visibleWhere = activeTab === "done" ? doneWhere : ongoingWhere;

  const [invoiceRecords, ongoingCount, doneCount] = await Promise.all([
    prisma.invoice.findMany({
      where: visibleWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...getCursorArgs(pagination),
      include: {
        customer: true,
        salesOrder: true
      }
    }),
    prisma.invoice.count({ where: ongoingWhere }),
    prisma.invoice.count({ where: doneWhere })
  ]);
  const invoicePage = getCursorPage(invoiceRecords, pagination);
  const visibleInvoices = invoicePage.items.map((invoice) =>
    withEffectiveInvoiceStatus(invoice, now)
  );

  const selectedInvoiceRecord =
    activeTab === "ongoing"
      ? viewId
        ? await prisma.invoice.findFirst({
            where: { id: viewId, ...portfolio.invoiceWhere },
            include: {
              customer: true,
              salesOrder: { include: { items: true } },
              payments: { orderBy: { paymentDate: "desc" } }
            }
          })
        : visibleInvoices[0]
          ? await prisma.invoice.findFirst({
              where: { id: visibleInvoices[0].id, ...portfolio.invoiceWhere },
              include: {
                customer: true,
                salesOrder: { include: { items: true } },
                payments: { orderBy: { paymentDate: "desc" } }
              }
            })
          : null
      : null;
  const selectedInvoice = selectedInvoiceRecord
    ? withEffectiveInvoiceStatus(selectedInvoiceRecord, now)
    : null;
  const selectedItems = selectedInvoice
    ? parseInvoiceItemSnapshots(selectedInvoice.itemsSnapshot)
    : [];
  const selectedInvoiceCanBeCancelled = selectedInvoice
    ? canCancelInvoice({
        status: selectedInvoice.status,
        paidAmount: selectedInvoice.paidAmount,
        paymentCount: selectedInvoice.payments.length
      })
    : false;

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
        ongoingCount={ongoingCount}
        doneCount={doneCount}
      />

      {selectedInvoice && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <div className="mb-5 flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-ink/50">Invoice</p>
              <h2 className="mt-1 text-2xl font-semibold">{selectedInvoice.invoiceNumber}</h2>
              <DocumentRevisionBadge revisionNumber={selectedInvoice.revisionNumber} />
              <p className="mt-1 text-sm text-ink/80">
                Sales Order {selectedInvoice.orderNumberSnapshot}
                {selectedInvoice.orderSourceSnapshot === "CUSTOMER_PO" &&
                selectedInvoice.customerPoNumberSnapshot
                  ? ` - PO ${selectedInvoice.customerPoNumberSnapshot}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={selectedInvoice.status} />
              {canCreateDeliveryNoteForInvoice({
                paymentTermType: selectedInvoice.paymentTermType,
                status: selectedInvoice.status
              }) && canCreateSuratJalan ? (
                <Link
                  href={`/pick-pack?invoiceId=${selectedInvoice.id}`}
                  title="Open Warehouse"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand"
                >
                  <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                  Open Warehouse
                </Link>
              ) : canCreateDeliveryNoteForInvoice({
                  paymentTermType: selectedInvoice.paymentTermType,
                  status: selectedInvoice.status
                }) ? (
                <RestrictedAction message={getRestrictionMessage("CREATE_SURAT_JALAN")}>
                  <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-soft px-4 text-sm font-semibold text-ink/50">
                    <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                    Open Warehouse
                  </button>
                </RestrictedAction>
              ) : (
                <span
                  title="An active invoice is required before starting the warehouse process."
                  className="inline-flex h-10 items-center justify-center rounded-md bg-warning px-4 text-sm font-semibold text-strong"
                >
                  Invoice Not Active
                </span>
              )}
              <Link
                href={`/invoices/${selectedInvoice.id}/print`}
                title="Cetak Invoice"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                Cetak Invoice
              </Link>
            </div>
          </div>

          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Detail label="Customer" value={selectedInvoice.customerCompanySnapshot} />
            {selectedInvoice.orderSourceSnapshot === "CUSTOMER_PO" && (
              <Detail label="Customer PO Number" value={selectedInvoice.customerPoNumberSnapshot ?? "-"} />
            )}
            <Detail label="Contact" value={selectedInvoice.customerNameSnapshot} />
            <Detail label="Issue Date" value={formatDate(selectedInvoice.issueDate)} />
            <Detail label="Due Date" value={formatDate(selectedInvoice.dueDate)} />
            <Detail
              label="Payment Terms"
              value={getPaymentTermLabel({
                paymentTermType: selectedInvoice.paymentTermType,
                creditTermMonths: selectedInvoice.creditTermMonths,
                creditTermWeeks: selectedInvoice.creditTermWeeks
              })}
            />
            {selectedInvoice.customerNpwpSnapshot && (
              <Detail
                label="NPWP"
                value={formatNpwp(selectedInvoice.customerNpwpSnapshot) ?? ""}
              />
            )}
            <Detail
              label={selectedInvoice.ppnApplied ? "Net Sales (DPP)" : "Invoice Subtotal / Net Sales"}
              value={formatCurrency(selectedInvoice.netSalesAmount)}
            />
            {selectedInvoice.ppnApplied && (
              <Detail
                label={`PPN (${formatPpnRate(selectedInvoice.ppnRateBasisPoints)})`}
                value={formatCurrency(selectedInvoice.ppnAmount)}
              />
            )}
            <Detail label="Total Amount" value={formatCurrency(selectedInvoice.totalAmount)} />
            <Detail label="Paid Amount" value={formatCurrency(selectedInvoice.paidAmount)} />
            <Detail
              label="Remaining Amount"
              value={formatCurrency(selectedInvoice.remainingAmount)}
            />
            <Detail label="Phone" value={selectedInvoice.customerPhoneSnapshot} />
          </div>

          <div className="mt-6 overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Item</th>
                  <th className="py-3 pr-4 text-right">Qty</th>
                  <th className="py-3 pr-4 text-right">Final Unit Price</th>
                  <th className="py-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {selectedItems.map((item, index) => (
                  <tr key={`${item.productSku ?? item.itemName}-${index}`} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">{item.itemName}</td>
                    <td className="py-3 pr-4 text-right text-ink/80">{item.quantity}</td>
                    <td className="py-3 pr-4 text-right text-ink/80">
                      {formatCurrency(item.finalUnitPrice)}
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
            <label className="block text-sm font-medium text-ink">
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

          {selectedInvoiceCanBeCancelled && (
            <form action={cancelInvoice} className="mt-6 border-t border-line pt-4">
              <input type="hidden" name="invoiceId" value={selectedInvoice.id} />
              <input type="hidden" name="expectedVersion" value={selectedInvoice.version} />
              <label className="block text-sm font-medium text-ink">
                Cancellation Reason
                <textarea
                  name="cancellationReason"
                  required
                  maxLength={150}
                  className="mt-1 min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                  placeholder="Required reason (maximum 150 characters)"
                />
              </label>
              {canCancel ? (
                <button className="mt-3 inline-flex h-10 items-center justify-center rounded-md border border-danger px-4 text-sm font-semibold text-danger">
                  Cancel Invoice
                </button>
              ) : (
                <RestrictedAction message={getRestrictionMessage("CANCEL_INVOICE")}>
                  <button disabled className="mt-3 inline-flex h-10 items-center justify-center rounded-md border border-line bg-soft px-4 text-sm font-semibold text-ink/50">
                    Cancel Invoice
                  </button>
                </RestrictedAction>
              )}
            </form>
          )}
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        {visibleInvoices.length === 0 ? (
          <EmptyState
            message={activeTab === "done" ? "No completed invoices." : "No ongoing invoices."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table data-server-paginated="true">
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Issue Date</th>
                  <th className="py-3 pr-4">Due Date</th>
                  <th className="py-3 pr-4">Payment Terms</th>
                  <th className="py-3 pr-4 text-right">Total</th>
                  {activeTab === "done" && <th className="py-3 pr-4 text-right">Paid</th>}
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4 text-right">Remaining</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleInvoices.map((invoice) => (
                  <tr key={invoice.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">{invoice.invoiceNumber} <DocumentRevisionBadge revisionNumber={invoice.revisionNumber} /></td>
                    <td className="py-3 pr-4 text-ink/80">{invoice.customerCompanySnapshot}</td>
                    <td className="py-3 pr-4 text-ink/80">{formatDate(invoice.issueDate)}</td>
                    <td className="py-3 pr-4 text-ink/80">{formatDate(invoice.dueDate)}</td>
                    <td className="py-3 pr-4 text-ink/80">
                      {getPaymentTermLabel({
                        paymentTermType: invoice.paymentTermType,
                        creditTermMonths: invoice.creditTermMonths,
                        creditTermWeeks: invoice.creditTermWeeks
                      })}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    {activeTab === "done" && (
                      <td className="py-3 pr-4 text-right text-ink/80">
                        {formatCurrency(invoice.paidAmount)}
                      </td>
                    )}
                    <td className="py-3 pr-4">
                      <StatusStack>
                        <StatusBadge status={invoice.status} />
                      </StatusStack>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.remainingAmount)}
                    </td>
                    <td className="max-w-64 whitespace-pre-wrap py-3 pr-4 text-ink/80">
                      {invoice.notes ?? "-"}
                    </td>
                    <td className="py-3">
                      <TableActionGroup>
                        {activeTab === "ongoing" && (
                          <TableActionLink
                            href={`/invoices?tab=${activeTab}&view=${invoice.id}`}
                            label="View invoice detail"
                          >
                            <Eye aria-hidden="true" />
                          </TableActionLink>
                        )}
                        <TableOverflowMenu label="More invoice actions">
                          <TableMenuLink
                            href={`/invoices/${invoice.id}/print`}
                            label="Print invoice"
                          >
                            <Printer aria-hidden="true" />
                          </TableMenuLink>
                        </TableOverflowMenu>
                      </TableActionGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ServerPagination
          hasNext={invoicePage.hasNext}
          label="invoices"
          nextCursor={invoicePage.nextCursor}
          pathname="/invoices"
          searchParams={params}
          state={pagination}
        />
      </section>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-ink/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "-"}</p>
    </div>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
