import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, FilePlus2, Printer, Truck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RestrictedAction } from "@/components/restricted-action";
import { DeleteSalesOrderButton } from "@/components/delete-sales-order-button";
import { generateInvoice } from "@/lib/actions";
import {
  calculateTotalPaidFromPayments,
  canCreateDeliveryNoteForInvoice,
  getPaymentTermLabel,
  getSalesOrderProgressStatus
} from "@/lib/calculations";
import { formatCurrency, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { canGenerateInvoiceForApproval } from "@/lib/sales-order-approval";
import { syncOverdueInvoices } from "@/lib/workflow";
import { getCurrentUser } from "@/lib/session";
import { canRole, getRestrictionMessage } from "@/lib/role-access";
import { canDeleteOngoingSalesOrder } from "@/lib/sales-order-deletion";

export const dynamic = "force-dynamic";

type DetailInvoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentTermType: "DEBIT" | "CREDIT";
  creditTermMonths: number | null;
  status: string;
};

export default async function SalesOrderDetailPage({
  params
}: {
  params: Promise<{ salesOrderId: string }>;
}) {
  const { salesOrderId } = await params;
  const currentUser = await getCurrentUser();
  const canCreateInvoice = canRole(currentUser?.role, "CREATE_INVOICE");
  const canRecordPayment = canRole(currentUser?.role, "RECORD_PAYMENT");
  const canCreateSuratJalan = canRole(currentUser?.role, "CREATE_SURAT_JALAN");
  const canDeleteSalesOrder = canRole(currentUser?.role, "DELETE_SALES_ORDER");

  await syncOverdueInvoices();

  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: {
      customer: true,
      items: true,
      invoice: {
        include: {
          payments: { orderBy: { paymentDate: "desc" } },
          followUps: { orderBy: { followUpDate: "asc" } },
          deliveryNotes: {
            orderBy: { deliveryDate: "desc" },
            include: { items: true }
          }
        }
      },
      deliveryNotes: {
        orderBy: { deliveryDate: "desc" },
        include: {
          invoice: true,
          items: true
        }
      }
    }
  });

  if (!salesOrder) {
    notFound();
  }

  const invoice = salesOrder.invoice;
  const payments = invoice?.payments ?? [];
  const deliveryNotes = Array.from(
    new Map(
      [...salesOrder.deliveryNotes, ...(invoice?.deliveryNotes ?? [])].map((note) => [note.id, note])
    ).values()
  );
  const followUps = invoice?.followUps ?? [];
  const paidAmount = invoice ? calculateTotalPaidFromPayments(payments) : 0;
  const remainingAmount = invoice?.remainingAmount ?? salesOrder.total;
  const latestPaymentMethod = payments[0]?.paymentMethod
    ? formatPaymentMethod(payments[0].paymentMethod)
    : "Not recorded";
  const hasActiveReceivable =
    Boolean(invoice) &&
    remainingAmount > 0 &&
    ["Unpaid", "Partial", "Overdue"].includes(invoice?.status ?? "");
  const progressStatus = getSalesOrderProgressStatus({
    hasInvoice: Boolean(invoice),
    paymentCount: payments.length,
    deliveryNoteCount: deliveryNotes.length,
    remainingAmount,
    followUpCount: followUps.length
  });
  const isOngoingAndDeletable = canDeleteOngoingSalesOrder({
    salesOrderStatus: salesOrder.status,
    invoiceStatus: invoice?.status,
    deliveryNoteStatuses: deliveryNotes.map((note) => note.status)
  });
  const relatedRecordCount =
    salesOrder.items.length +
    (invoice ? 1 : 0) +
    payments.length +
    deliveryNotes.length +
    followUps.length;

  return (
    <>
      <PageHeader
        title="Sales Order Detail"
        description="Full transaction progress from Sales Order to Invoice, Payment, Surat Jalan, Receivable, and Billing."
        action={
          <Link
            href={salesOrder.approvalStatus === "Pending" ? "/sales-orders?tab=approval" : "/sales-orders"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-brand"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to Sales Orders
          </Link>
        }
      />

      <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-slate-400">Sales Order</p>
            <h1 className="mt-1 text-2xl font-semibold">{salesOrder.orderNumber}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {salesOrder.customer.companyName} - {formatDate(salesOrder.orderDate)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={salesOrder.status} />
            {salesOrder.approvalStatus !== "NotRequired" && (
              <StatusBadge status={salesOrder.approvalStatus} />
            )}
            {invoice && <StatusBadge status={invoice.status} />}
            <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
              {progressStatus}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
          <Summary label="Payment Term" value={getPaymentTermLabel(salesOrder)} />
          <Summary
            label="Manager Approval"
            value={
              salesOrder.approvalStatus === "NotRequired"
                ? "Not required"
                : `${salesOrder.approvalStatus}${salesOrder.approvalRisk ? ` · ${salesOrder.approvalRisk}` : ""}`
            }
          />
          <Summary label="Latest Payment Method" value={latestPaymentMethod} />
          <Summary label="Sales Order Total" value={formatCurrency(salesOrder.total)} />
          <Summary label="Paid Amount" value={formatCurrency(invoice?.paidAmount ?? paidAmount)} />
          <Summary label="Remaining Amount" value={formatCurrency(remainingAmount)} />
          <Summary label="Invoice" value={invoice?.invoiceNumber ?? "Not generated"} />
          <Summary label="Surat Jalan" value={`${deliveryNotes.length} record(s)`} />
          <Summary label="Payments" value={`${payments.length} record(s)`} />
          <Summary label="Billing" value={`${followUps.length} record(s)`} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
          {invoice ? (
            <>
              <Link
                href={`/invoices/${invoice.id}/print`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                Printable Invoice
              </Link>
              {remainingAmount > 0 && (
                canRecordPayment ? (
                  <Link
                    href={`/payments?invoiceId=${invoice.id}`}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
                  >
                    <Banknote aria-hidden="true" className="h-4 w-4" />
                    Record Payment
                  </Link>
                ) : (
                  <RestrictedAction message={getRestrictionMessage("RECORD_PAYMENT")}>
                    <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-200 px-4 text-sm font-semibold text-slate-500">
                      <Banknote aria-hidden="true" className="h-4 w-4" />
                      Record Payment
                    </button>
                  </RestrictedAction>
                )
              )}
            </>
          ) : canGenerateInvoiceForApproval(salesOrder.approvalStatus) && canCreateInvoice ? (
            <form action={generateInvoice}>
              <input type="hidden" name="salesOrderId" value={salesOrder.id} />
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white">
                <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                Generate Invoice
              </button>
            </form>
          ) : canGenerateInvoiceForApproval(salesOrder.approvalStatus) ? (
            <RestrictedAction message={getRestrictionMessage("CREATE_INVOICE")}>
              <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-200 px-4 text-sm font-semibold text-slate-500">
                <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                Generate Invoice
              </button>
            </RestrictedAction>
          ) : salesOrder.approvalStatus === "Pending" ? (
            <Link
              href={`/sales-orders?tab=approval&view=${salesOrder.id}`}
              className="inline-flex h-10 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800"
            >
              Waiting for Manager Approval
            </Link>
          ) : (
            <p className="inline-flex h-10 items-center rounded-md border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700">
              Sales Order Rejected
            </p>
          )}
          {isOngoingAndDeletable &&
            (canDeleteSalesOrder ? (
              <DeleteSalesOrderButton
                salesOrderId={salesOrder.id}
                orderNumber={salesOrder.orderNumber}
                relatedRecordCount={relatedRecordCount}
              />
            ) : (
              <RestrictedAction message={getRestrictionMessage("DELETE_SALES_ORDER")}>
                <button disabled className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                  Delete Sales Order
                </button>
              </RestrictedAction>
            ))}
        </div>
      </section>

      <section className="mb-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="rounded-md border border-line bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold">Customer Information</h2>
          <div className="mt-4 space-y-3 text-sm">
            <Summary label="Company" value={salesOrder.customer.companyName} />
            <Summary label="Contact Person" value={salesOrder.customer.name} />
            <Summary label="Phone" value={salesOrder.customer.phone} />
            <Summary label="Email" value={salesOrder.customer.email || "-"} />
            <Summary label="Customer Type" value={salesOrder.customer.customerType} />
            <Summary label="Status" value={salesOrder.customer.status} />
            <Summary label="Address" value={salesOrder.customer.address} />
            <Summary label="Notes" value={salesOrder.customer.notes ?? "-"} />
          </div>
        </div>

        <div className="rounded-md border border-line bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold">Sales Order Item Details</h2>
          <div className="mt-4 overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Item</th>
                  <th className="py-3 pr-4 text-right">Qty</th>
                  <th className="py-3 pr-4">Unit</th>
                  <th className="py-3 pr-4 text-right">Unit Price</th>
                  <th className="py-3 pr-4 text-right">Line Total</th>
                  <th className="py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {salesOrder.items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{item.itemName}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{item.quantity}</td>
                    <td className="py-3 pr-4 text-slate-600">PCS</td>
                    <td className="py-3 pr-4 text-right text-slate-600">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(item.subtotal)}
                    </td>
                    <td className="py-3 text-slate-600">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {salesOrder.notes && (
            <p className="mt-4 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              {salesOrder.notes}
            </p>
          )}
        </div>
      </section>

      <RelatedSections
        salesOrderId={salesOrder.id}
        invoice={invoice}
        payments={payments}
        deliveryNotes={deliveryNotes}
        followUps={followUps}
        hasActiveReceivable={hasActiveReceivable}
        remainingAmount={remainingAmount}
        canCreateInvoice={canCreateInvoice}
        canRecordPayment={canRecordPayment}
        canCreateSuratJalan={canCreateSuratJalan}
      />
    </>
  );
}

function RelatedSections({
  salesOrderId,
  invoice,
  payments,
  deliveryNotes,
  followUps,
  hasActiveReceivable,
  remainingAmount,
  canCreateInvoice,
  canRecordPayment,
  canCreateSuratJalan
}: {
  salesOrderId: string;
  invoice: DetailInvoice | null;
  payments: Array<{
    id: string;
    paymentDate: Date;
    paymentMethod: string;
    amount: number;
    notes: string | null;
    createdAt: Date;
  }>;
  deliveryNotes: Array<{
    id: string;
    deliveryNoteNumber: string;
    deliveryDate: Date;
    status: string;
    recipientName: string;
    recipientAddress: string;
    recipientPhone: string;
    notes: string | null;
    items: Array<{
      id: string;
      productCode: string | null;
      itemName: string;
      quantity: number;
      unit: string;
      description: string | null;
    }>;
  }>;
  followUps: Array<{
    id: string;
    followUpDate: Date;
    status: string;
    notes: string;
    createdAt: Date;
  }>;
  hasActiveReceivable: boolean;
  remainingAmount: number;
  canCreateInvoice: boolean;
  canRecordPayment: boolean;
  canCreateSuratJalan: boolean;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Invoice</h2>
          {invoice && (
            <Link
              href={`/invoices?view=${invoice.id}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-line px-3 text-sm font-semibold text-brand"
            >
              View Invoice Page
            </Link>
          )}
        </div>
        {invoice ? (
          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Summary label="Invoice Number" value={invoice.invoiceNumber} />
            <Summary label="Invoice Date" value={formatDate(invoice.issueDate)} />
            <Summary label="Due Date" value={formatDate(invoice.dueDate)} />
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Payment Status</p>
              <div className="mt-1">
                <StatusBadge status={invoice.status} />
              </div>
            </div>
            <Summary label="Invoice Total" value={formatCurrency(invoice.totalAmount)} />
            <Summary label="Paid Amount" value={formatCurrency(invoice.paidAmount)} />
            <Summary label="Remaining Amount" value={formatCurrency(invoice.remainingAmount)} />
            <Summary
              label="Payment Term"
              value={getPaymentTermLabel({
                paymentTermType: invoice.paymentTermType,
                creditTermMonths: invoice.creditTermMonths
              })}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <EmptyState message="Invoice has not been generated yet." />
            {canCreateInvoice ? (
              <form action={generateInvoice}>
                <input type="hidden" name="salesOrderId" value={salesOrderId} />
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white">
                  <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                  Generate Invoice
                </button>
              </form>
            ) : (
              <RestrictedAction message={getRestrictionMessage("CREATE_INVOICE")}>
                <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-200 px-4 text-sm font-semibold text-slate-500">
                  <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                  Generate Invoice
                </button>
              </RestrictedAction>
            )}
          </div>
        )}
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Payments</h2>
          {invoice && remainingAmount > 0 && (
            canRecordPayment ? (
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
            )
          )}
        </div>
        {payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Payment Date</th>
                  <th className="py-3 pr-4">Method</th>
                  <th className="py-3 pr-4 text-right">Amount Paid</th>
                  <th className="py-3 pr-4">Note / Reference</th>
                  <th className="py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {payments.map((payment) => (
                  <tr key={payment.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 text-slate-600">
                      {formatDate(payment.paymentDate)}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatPaymentMethod(payment.paymentMethod)}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{payment.notes ?? "-"}</td>
                    <td className="py-3 text-slate-600">{formatDate(payment.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No payment has been recorded yet." />
        )}
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Surat Jalan / Delivery Note</h2>
          {deliveryNotes.length === 0 && invoice && (
            canCreateDeliveryNoteForInvoice({
              paymentTermType: invoice.paymentTermType,
              status: invoice.status
            }) && canCreateSuratJalan ? (
              <Link
                href={`/surat-jalan?mode=create&invoiceId=${invoice.id}`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
              >
                <Truck aria-hidden="true" className="h-4 w-4" />
                Create Surat Jalan
              </Link>
            ) : canCreateDeliveryNoteForInvoice({
                paymentTermType: invoice.paymentTermType,
                status: invoice.status
              }) ? (
              <RestrictedAction message={getRestrictionMessage("CREATE_SURAT_JALAN")}>
                <button disabled className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-slate-50 px-3 text-sm font-semibold text-slate-400">
                  <Truck aria-hidden="true" className="h-4 w-4" />
                  Create Surat Jalan
                </button>
              </RestrictedAction>
            ) : (
              <span className="inline-flex h-9 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800">
                Payment Required First
              </span>
            )
          )}
        </div>
        {deliveryNotes.length > 0 ? (
          <div className="space-y-4">
            {deliveryNotes.map((deliveryNote) => (
              <article key={deliveryNote.id} className="rounded-md border border-line p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">{deliveryNote.deliveryNoteNumber}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDate(deliveryNote.deliveryDate)} - {deliveryNote.recipientName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={deliveryNote.status} />
                    <Link
                      href={`/surat-jalan/${deliveryNote.id}/print`}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
                    >
                      <Printer aria-hidden="true" className="h-4 w-4" />
                      Print
                    </Link>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                  <Summary label="Recipient Phone" value={deliveryNote.recipientPhone} />
                  <Summary label="Recipient Address" value={deliveryNote.recipientAddress} />
                  <Summary label="Notes" value={deliveryNote.notes ?? "-"} />
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table>
                    <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-3 pr-4">Product Code</th>
                        <th className="py-3 pr-4">Item</th>
                        <th className="py-3 pr-4 text-right">Qty</th>
                        <th className="py-3 pr-4">Unit</th>
                        <th className="py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line text-sm">
                      {deliveryNote.items.map((item) => (
                        <tr key={item.id} className="transition hover:bg-slate-50">
                          <td className="py-3 pr-4 text-slate-600">
                            {item.productCode ?? "-"}
                          </td>
                          <td className="py-3 pr-4 font-medium">{item.itemName}</td>
                          <td className="py-3 pr-4 text-right text-slate-600">
                            {item.quantity}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">{item.unit}</td>
                          <td className="py-3 text-slate-600">
                            {item.description ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState message="Surat Jalan has not been created yet." />
        )}
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold">Receivable</h2>
        {invoice && hasActiveReceivable ? (
          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Summary label="Related Invoice" value={invoice.invoiceNumber} />
            <Summary label="Receivable Amount" value={formatCurrency(invoice.remainingAmount)} />
            <Summary label="Due Date" value={formatDate(invoice.dueDate)} />
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Receivable Status</p>
              <div className="mt-1">
                <StatusBadge status={invoice.status} />
              </div>
            </div>
          </div>
        ) : invoice && invoice.remainingAmount === 0 ? (
          <EmptyState message="This order has been fully paid." />
        ) : (
          <EmptyState message="No active receivable for this Sales Order." />
        )}
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Billing</h2>
          {invoice && hasActiveReceivable && (
            <Link
              href={`/billing?customerId=${invoice.customerId}&invoiceId=${invoice.id}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-line px-3 text-sm font-semibold text-brand"
            >
              Create Billing
            </Link>
          )}
        </div>
        {followUps.length > 0 ? (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Billing Date</th>
                  <th className="py-3 pr-4">Type / Method</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Notes / Result</th>
                  <th className="py-3">Next Billing Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {followUps.map((followUp) => (
                  <tr key={followUp.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 text-slate-600">
                      {formatDate(followUp.followUpDate)}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">General Billing</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={followUp.status} />
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{followUp.notes}</td>
                    <td className="py-3 text-slate-600">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No billing activity has been recorded yet." />
        )}
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "-"}</p>
    </div>
  );
}

function formatPaymentMethod(value: string) {
  return value === "BankTransfer" ? "Bank Transfer" : value;
}
