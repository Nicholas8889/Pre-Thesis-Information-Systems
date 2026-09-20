import { Banknote, Truck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { recordPayment } from "@/lib/actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { PaymentForm } from "@/components/payment-form";
import { RecordPaymentButton } from "@/components/record-payment-button";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import {
  TableActionButton,
  TableActionGroup,
  TableActionLink
} from "@/components/table-actions";
import { RestrictedAction } from "@/components/restricted-action";
import { ServerPagination } from "@/components/server-pagination";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { canCreateDeliveryNoteForInvoice, getPaymentTermLabel } from "@/lib/calculations";
import { getSearchMessage, toDateInputValue } from "@/lib/workflow";
import {
  getOpenInvoiceWhere,
  withEffectiveInvoiceStatus
} from "@/lib/invoice-status";
import { getCurrentUser } from "@/lib/session";
import { canRole, getRestrictionMessage } from "@/lib/role-access";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination
} from "@/lib/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PaymentsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const selectedInvoiceId = getFirst(params.invoiceId);
  const { success, error } = getSearchMessage(params);
  const currentUser = await getCurrentUser();
  const canRecordPayment = canRole(currentUser?.role, "RECORD_PAYMENT");
  const canCreateSuratJalan = canRole(currentUser?.role, "CREATE_SURAT_JALAN");
  const queuePagination = getCursorPagination(params);
  const paymentPagination = getCursorPagination(params, "payment");
  const now = new Date();
  const openInvoiceWhere: Prisma.InvoiceWhereInput = getOpenInvoiceWhere();

  const [openInvoiceRecords, paymentRecords, selectedInvoiceRecord] = await Promise.all([
    prisma.invoice.findMany({
      where: openInvoiceWhere,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      ...getCursorArgs(queuePagination),
      include: { customer: true }
    }),
    prisma.payment.findMany({
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      ...getCursorArgs(paymentPagination),
      include: {
        invoice: {
          include: { customer: true }
        }
      }
    }),
    selectedInvoiceId
      ? prisma.invoice.findFirst({
          where: { id: selectedInvoiceId, ...openInvoiceWhere },
          include: { customer: true }
        })
      : Promise.resolve(null)
  ]);
  const queuePage = getCursorPage(openInvoiceRecords, queuePagination);
  const paymentPage = getCursorPage(paymentRecords, paymentPagination);
  const openInvoices = queuePage.items.map((invoice) =>
    withEffectiveInvoiceStatus(invoice, now)
  );
  const payments = paymentPage.items.map((payment) => ({
    ...payment,
    invoice: withEffectiveInvoiceStatus(payment.invoice, now)
  }));
  const selectedInvoice = selectedInvoiceRecord
    ? withEffectiveInvoiceStatus(selectedInvoiceRecord, now)
    : null;
  const paymentOptions =
    selectedInvoice && !openInvoices.some((invoice) => invoice.id === selectedInvoice.id)
      ? [selectedInvoice, ...openInvoices]
      : openInvoices;

  return (
    <>
      <PageHeader
        title="Payments"
        description="Record and monitor customer payments against open invoices."
      />

      <FlashMessage success={success} error={error} />

      <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
        <h2 className="mb-2 text-lg font-semibold">Payment Queue</h2>
        <p className="mb-4 text-sm leading-6 text-ink/80">
          Open invoices appear here automatically from Sales Order and Invoice data.
          Select Record Payment from a row to reduce repeated input.
        </p>
        {openInvoices.length === 0 ? (
          <EmptyState message="No unpaid or partial invoices are available for payment." />
        ) : (
          <div className="overflow-x-auto">
            <table data-server-paginated="true">
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Payment Terms</th>
                  <th className="py-3 pr-4 text-right">Total</th>
                  <th className="py-3 pr-4 text-right">Paid</th>
                  <th className="py-3 pr-4 text-right">Remaining</th>
                  <th className="py-3 pr-4">Due Date</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {openInvoices.map((invoice) => (
                  <tr key={invoice.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">{invoice.invoiceNumber}</td>
                    <td className="py-3 pr-4 text-ink/80">
                      {invoice.customer.companyName}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
                          invoice.paymentTermType === "IMMEDIATE"
                            ? "bg-warning text-strong"
                            : "bg-info text-white"
                        }`}
                      >
                        {getPaymentTermLabel({
                          paymentTermType: invoice.paymentTermType,
                          creditTermMonths: invoice.creditTermMonths,
                          creditTermWeeks: invoice.creditTermWeeks
                        })}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    <td className="py-3 pr-4 text-right text-ink/80">
                      {formatCurrency(invoice.paidAmount)}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.remainingAmount)}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {formatDate(invoice.dueDate)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusStack>
                        <StatusBadge status={invoice.status} />
                      </StatusStack>
                    </td>
                    <td className="py-3">
                      <TableActionGroup>
                        {canRecordPayment ? (
                          <RecordPaymentButton invoiceId={invoice.id} />
                        ) : (
                          <RestrictedAction message={getRestrictionMessage("RECORD_PAYMENT")}>
                            <TableActionButton disabled label="Record payment">
                              <Banknote aria-hidden="true" />
                            </TableActionButton>
                          </RestrictedAction>
                        )}
                        {canCreateDeliveryNoteForInvoice({
                          paymentTermType: invoice.paymentTermType,
                          status: invoice.status
                        }) && (canCreateSuratJalan ? (
                          <TableActionLink
                            href={`/pick-pack?invoiceId=${invoice.id}`}
                            label="Open Warehouse"
                          >
                            <Truck aria-hidden="true" />
                          </TableActionLink>
                        ) : (
                          <RestrictedAction message={getRestrictionMessage("CREATE_SURAT_JALAN")}>
                            <TableActionButton disabled label="Open Warehouse">
                              <Truck aria-hidden="true" />
                            </TableActionButton>
                          </RestrictedAction>
                        ))}
                      </TableActionGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ServerPagination
          hasNext={queuePage.hasNext}
          label="open invoices"
          nextCursor={queuePage.nextCursor}
          pathname="/payments"
          searchParams={params}
          state={queuePagination}
        />
      </section>

      {paymentOptions.length > 0 && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <h2 className="mb-4 text-lg font-semibold">Record Payment</h2>
          <PaymentForm
            invoices={paymentOptions.map((invoice) => ({
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              customerName: invoice.customer.companyName,
              paymentTermLabel: getPaymentTermLabel({
                paymentTermType: invoice.paymentTermType,
                creditTermMonths: invoice.creditTermMonths,
                creditTermWeeks: invoice.creditTermWeeks
              }),
              totalAmount: invoice.totalAmount,
              paidAmount: invoice.paidAmount,
              remainingAmount: invoice.remainingAmount,
              status: invoice.status
            }))}
            action={recordPayment}
            today={toDateInputValue()}
            initialInvoiceId={selectedInvoiceId}
            disabled={!canRecordPayment}
            restrictionMessage={getRestrictionMessage("RECORD_PAYMENT")}
          />
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <h2 className="mb-4 text-lg font-semibold">Recorded Payments</h2>
        {payments.length === 0 ? (
          <EmptyState message="No payments recorded yet." />
        ) : (
          <div className="overflow-x-auto">
            <table data-server-paginated="true">
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Payment Method</th>
                  <th className="py-3 text-right">Amount</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {payments.map((payment) => (
                  <tr key={payment.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">
                      {payment.invoice.invoiceNumber}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {payment.invoice.customer.companyName}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {formatDate(payment.paymentDate)}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {payment.paymentMethod === "BankTransfer"
                        ? "Bank Transfer"
                        : payment.paymentMethod}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="max-w-64 whitespace-pre-wrap py-3 pr-4 text-ink/80">
                      {payment.notes ?? "-"}
                    </td>
                    <td className="py-3">
                      <TableActionGroup>
                        {canCreateDeliveryNoteForInvoice({
                          paymentTermType: payment.invoice.paymentTermType,
                          status: payment.invoice.status
                        }) && (canCreateSuratJalan ? (
                          <TableActionLink
                            href={`/pick-pack?invoiceId=${payment.invoice.id}`}
                            label="Open Warehouse"
                          >
                            <Truck aria-hidden="true" />
                          </TableActionLink>
                        ) : (
                          <RestrictedAction message={getRestrictionMessage("CREATE_SURAT_JALAN")}>
                            <TableActionButton disabled label="Open Warehouse">
                              <Truck aria-hidden="true" />
                            </TableActionButton>
                          </RestrictedAction>
                        ))}
                      </TableActionGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ServerPagination
          hasNext={paymentPage.hasNext}
          label="recorded payments"
          nextCursor={paymentPage.nextCursor}
          pathname="/payments"
          searchParams={params}
          state={paymentPagination}
        />
      </section>
    </>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
