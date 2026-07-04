import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { getPaymentTermLabel } from "@/lib/calculations";
import { amountToWords, formatDate, formatInvoiceCurrency } from "@/lib/format";
import { syncOverdueInvoices } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({
  params
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;

  await syncOverdueInvoices();

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      payments: { orderBy: { paymentDate: "desc" } },
      salesOrder: {
        include: {
          items: true
        }
      }
    }
  });

  if (!invoice) {
    notFound();
  }

  const paymentTerm = getPaymentTermLabel({
    paymentTermType: invoice.paymentTermType,
    creditTermMonths: invoice.creditTermMonths
  });
  const isPreOrder = invoice.salesOrder.transactionType === "PRE_ORDER";
  const transactionLabel = isPreOrder ? "Pre Order" : "Sales Order";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/invoices?view=${invoice.id}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-brand"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Invoice
        </Link>
        <PrintButton />
      </div>

      <article className="print-page rounded-md border border-slate-300 bg-white p-6 text-slate-900 shadow-soft sm:p-8">
        <header className="border-b-2 border-slate-900 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-lg font-bold tracking-normal">CV TAJUK</p>
              <p className="mt-1 text-sm text-slate-600">
                Revenue Cycle Information System MVP
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Local thesis demonstration invoice
              </p>
            </div>
            <div className="text-left sm:text-right">
              <h1 className="text-3xl font-bold tracking-normal">INVOICE</h1>
              <p className="mt-2 text-sm font-semibold">{invoice.invoiceNumber}</p>
              <div className="mt-2 flex sm:justify-end">
                <StatusBadge status={invoice.status} />
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 border-b border-slate-300 py-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Bill To</p>
            <p className="mt-2 text-base font-semibold">{invoice.customer.name}</p>
            <p className="text-sm text-slate-700">{invoice.customer.companyName}</p>
            <p className="mt-2 text-sm text-slate-700">{invoice.customer.phone}</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-slate-700">
              {invoice.customer.address}
            </p>
          </div>

          <div className="grid gap-3 text-sm">
            <InfoRow label="Invoice No." value={invoice.invoiceNumber} />
            <InfoRow label="Invoice Date" value={formatDate(invoice.issueDate)} />
            <InfoRow label="Due Date" value={formatDate(invoice.dueDate)} />
            <InfoRow label="Payment Term" value={paymentTerm} />
            <InfoRow label="Transaction Type" value={transactionLabel} />
            <InfoRow label={isPreOrder ? "Pre Order ID" : "Sales Order"} value={invoice.salesOrder.orderNumber} />
            {isPreOrder && invoice.salesOrder.requiredDate && (
              <InfoRow label="Required Date" value={formatDate(invoice.salesOrder.requiredDate)} />
            )}
            {isPreOrder && (
              <InfoRow label="PO Document" value={invoice.salesOrder.poDocumentName ?? "-"} />
            )}
          </div>
        </section>

        <section className="py-5">
          <div className="overflow-x-auto">
            <table className="border border-slate-400 text-sm">
              <thead className="bg-slate-100 text-left uppercase text-slate-700">
                <tr>
                  <th className="border border-slate-400 px-3 py-2">No.</th>
                  <th className="border border-slate-400 px-3 py-2">Product / Item</th>
                  <th className="border border-slate-400 px-3 py-2 text-right">Qty</th>
                  <th className="border border-slate-400 px-3 py-2">Unit</th>
                  <th className="border border-slate-400 px-3 py-2 text-right">Unit Price</th>
                  <th className="border border-slate-400 px-3 py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.salesOrder.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="border border-slate-400 px-3 py-2">{index + 1}</td>
                    <td className="border border-slate-400 px-3 py-2">{item.itemName}</td>
                    <td className="border border-slate-400 px-3 py-2 text-right">
                      {item.quantity}
                    </td>
                    <td className="border border-slate-400 px-3 py-2">PCS</td>
                    <td className="border border-slate-400 px-3 py-2 text-right">
                      {formatInvoiceCurrency(item.unitPrice)}
                    </td>
                    <td className="border border-slate-400 px-3 py-2 text-right font-semibold">
                      {formatInvoiceCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 border-t border-slate-300 pt-5 md:grid-cols-[1fr_340px]">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Amount in Words</p>
            <p className="mt-2 rounded-md border border-slate-300 bg-slate-50 p-3 text-sm font-semibold leading-6">
              {amountToWords(invoice.totalAmount)}
            </p>

            {invoice.notes && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase text-slate-500">Notes</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{invoice.notes}</p>
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-bold uppercase text-slate-500">Payment Information</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Bank Transfer: Bank Demo CV Tajuk
                <br />
                Account No.: 123-456-7890
                <br />
                Account Name: CV TAJUK
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <AmountRow label="Invoice Subtotal" value={invoice.totalAmount} />
            <AmountRow label="Invoice Total" value={invoice.totalAmount} strong />
            <AmountRow label="Paid Amount" value={invoice.paidAmount} />
            <AmountRow label="Remaining Amount" value={invoice.remainingAmount} strong />
            <div className="flex items-center justify-between border-t border-slate-300 pt-3">
              <span className="font-semibold">Payment Status</span>
              <StatusBadge status={invoice.status} />
            </div>
          </div>
        </section>

        <footer className="mt-12 grid gap-8 sm:grid-cols-[1fr_260px]">
          <div className="text-xs leading-6 text-slate-500">
            This invoice is generated from the local CV Tajuk Revenue Cycle MVP for
            thesis demonstration purposes.
          </div>
          <div className="text-center text-sm">
            <p className="font-semibold">Authorized Signature</p>
            <div className="mt-16 border-t border-slate-500 pt-2">CV TAJUK</div>
          </div>
        </footer>
      </article>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function AmountRow({
  label,
  value,
  strong = false
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-slate-200 py-2 ${
        strong ? "text-base font-bold" : ""
      }`}
    >
      <span>{label}</span>
      <span>{formatInvoiceCurrency(value)}</span>
    </div>
  );
}
