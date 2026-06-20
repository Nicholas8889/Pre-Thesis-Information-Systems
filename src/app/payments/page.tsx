import Link from "next/link";
import { Banknote, Truck } from "lucide-react";
import { recordPayment } from "@/lib/actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { PaymentForm } from "@/components/payment-form";
import { StatusBadge } from "@/components/status-badge";
import { RestrictedAction } from "@/components/restricted-action";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { canCreateDeliveryNoteForInvoice, getPaymentTermLabel } from "@/lib/calculations";
import { getSearchMessage, syncOverdueInvoices, toDateInputValue } from "@/lib/workflow";
import { getCurrentUser } from "@/lib/session";
import { canRole, getRestrictionMessage } from "@/lib/role-access";

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

  await syncOverdueInvoices();

  const [openInvoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        remainingAmount: { gt: 0 },
        status: { in: ["Unpaid", "Partial", "Overdue"] }
      },
      orderBy: { dueDate: "asc" },
      include: { customer: true }
    }),
    prisma.payment.findMany({
      orderBy: { paymentDate: "desc" },
      include: {
        invoice: {
          include: { customer: true }
        }
      }
    })
  ]);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Record and monitor customer payments against open invoices."
      />

      <FlashMessage success={success} error={error} />

      <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-2 text-lg font-semibold">Payment Queue</h2>
        <p className="mb-4 text-sm leading-6 text-slate-600">
          Open invoices appear here automatically from Sales Order and Invoice data.
          Select Record Payment from a row to reduce repeated input.
        </p>
        {openInvoices.length === 0 ? (
          <EmptyState message="No unpaid or partial invoices are available for payment." />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Payment Term</th>
                  <th className="py-3 pr-4 text-right">Total</th>
                  <th className="py-3 pr-4 text-right">Paid</th>
                  <th className="py-3 pr-4 text-right">Remaining</th>
                  <th className="py-3 pr-4">Due Date</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {openInvoices.map((invoice) => (
                  <tr key={invoice.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{invoice.invoiceNumber}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {invoice.customer.companyName}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                          invoice.paymentTermType === "DEBIT"
                            ? "bg-amber-50 text-amber-800 ring-amber-200"
                            : "bg-sky-50 text-sky-700 ring-sky-200"
                        }`}
                      >
                        {invoice.paymentTermType === "DEBIT"
                          ? "Payment Required"
                          : getPaymentTermLabel({
                              paymentTermType: invoice.paymentTermType,
                              creditTermMonths: invoice.creditTermMonths
                            })}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-600">
                      {formatCurrency(invoice.paidAmount)}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(invoice.remainingAmount)}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatDate(invoice.dueDate)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {canRecordPayment ? (
                          <Link
                            href={`/payments?invoiceId=${invoice.id}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
                          >
                            <Banknote aria-hidden="true" className="h-4 w-4" />
                            Record Payment
                          </Link>
                        ) : (
                          <RestrictedAction message={getRestrictionMessage("RECORD_PAYMENT")}>
                            <button disabled className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-slate-50 px-3 text-sm font-semibold text-slate-400">
                              <Banknote aria-hidden="true" className="h-4 w-4" />
                              Record Payment
                            </button>
                          </RestrictedAction>
                        )}
                        {canCreateDeliveryNoteForInvoice({
                          paymentTermType: invoice.paymentTermType,
                          status: invoice.status
                        }) && (canCreateSuratJalan ? (
                          <Link
                            href={`/surat-jalan?mode=create&invoiceId=${invoice.id}`}
                            title="Create Surat Jalan"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                          >
                            <Truck aria-hidden="true" className="h-4 w-4" />
                          </Link>
                        ) : (
                          <RestrictedAction message={getRestrictionMessage("CREATE_SURAT_JALAN")}>
                            <button disabled className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-slate-50 text-slate-400">
                              <Truck aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </RestrictedAction>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openInvoices.length > 0 && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold">Record Payment</h2>
          <PaymentForm
            invoices={openInvoices.map((invoice) => ({
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              customerName: invoice.customer.companyName,
              paymentTermLabel: getPaymentTermLabel({
                paymentTermType: invoice.paymentTermType,
                creditTermMonths: invoice.creditTermMonths
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

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold">Recorded Payments</h2>
        {payments.length === 0 ? (
          <EmptyState message="No payments recorded yet." />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Method</th>
                  <th className="py-3 text-right">Amount</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {payments.map((payment) => (
                  <tr key={payment.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">
                      {payment.invoice.invoiceNumber}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {payment.invoice.customer.companyName}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatDate(payment.paymentDate)}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {payment.paymentMethod === "BankTransfer"
                        ? "Bank Transfer"
                        : payment.paymentMethod}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {canCreateDeliveryNoteForInvoice({
                          paymentTermType: payment.invoice.paymentTermType,
                          status: payment.invoice.status
                        }) && (canCreateSuratJalan ? (
                          <Link
                            href={`/surat-jalan?mode=create&invoiceId=${payment.invoice.id}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
                          >
                            <Truck aria-hidden="true" className="h-4 w-4" />
                            Create Surat Jalan
                          </Link>
                        ) : (
                          <RestrictedAction message={getRestrictionMessage("CREATE_SURAT_JALAN")}>
                            <button disabled className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-slate-50 px-3 text-sm font-semibold text-slate-400">
                              <Truck aria-hidden="true" className="h-4 w-4" />
                              Create Surat Jalan
                            </button>
                          </RestrictedAction>
                        ))}
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
