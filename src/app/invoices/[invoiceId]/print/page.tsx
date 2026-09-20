import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { getPaymentTermLabel } from "@/lib/calculations";
import { amountToWords, formatDate, formatInvoiceCurrency } from "@/lib/format";
import { withEffectiveInvoiceStatus } from "@/lib/invoice-status";
import { formatNpwp } from "@/lib/npwp";
import { formatPpnRate } from "@/lib/tax";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({
  params
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;

  const invoiceRecord = await prisma.invoice.findUnique({
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

  if (!invoiceRecord) {
    notFound();
  }
  const invoice = withEffectiveInvoiceStatus(invoiceRecord);

  const paymentTerm = getPaymentTermLabel({
    paymentTermType: invoice.paymentTermType,
    creditTermMonths: invoice.creditTermMonths,
    creditTermWeeks: invoice.creditTermWeeks
  });
  const isCustomerPo = invoice.salesOrder.source === "CUSTOMER_PO";
  const orderLabel = isCustomerPo ? "Customer PO" : "Sales Order";

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

      <article className="print-page rounded-md border border-line bg-white p-6 text-strong shadow-card sm:p-8">
        <header className="border-b-2 border-strong pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-lg font-bold tracking-normal">CV TAJUK</p>
              <p className="mt-1 text-sm text-ink/80">
                Revenue Cycle Information System
              </p>
              <p className="mt-3 text-sm leading-6 text-ink">
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

        <section className="grid gap-6 border-b border-line py-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-ink/70">Bill To</p>
            <p className="mt-2 text-base font-semibold">{invoice.customer.name}</p>
            <p className="text-sm text-ink">{invoice.customer.companyName}</p>
            <p className="mt-2 text-sm text-ink">{invoice.customer.phone}</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-ink">
              {invoice.customer.address}
            </p>
            {invoice.customerNpwpSnapshot && (
              <p className="mt-2 text-sm font-semibold text-strong">
                NPWP: {formatNpwp(invoice.customerNpwpSnapshot)}
              </p>
            )}
          </div>

          <div className="grid gap-3 text-sm">
            <InfoRow label="Invoice No." value={invoice.invoiceNumber} />
            <InfoRow label="Invoice Date" value={formatDate(invoice.issueDate)} />
            <InfoRow label="Due Date" value={formatDate(invoice.dueDate)} />
            <InfoRow label="Payment Terms" value={paymentTerm} />
            <InfoRow label="Order Source" value={orderLabel} />
            <InfoRow label="Sales Order" value={invoice.salesOrder.orderNumber} />
            {isCustomerPo && (
              <InfoRow label="Customer PO Number" value={invoice.salesOrder.customerPoNumber ?? "-"} />
            )}
            {isCustomerPo && invoice.salesOrder.requiredDate && (
              <InfoRow label="Required Date" value={formatDate(invoice.salesOrder.requiredDate)} />
            )}
            {isCustomerPo && (
              <InfoRow label="Customer PO Document" value={invoice.salesOrder.customerPoDocumentName ?? "-"} />
            )}
          </div>
        </section>

        <section className="py-5">
          <div className="overflow-x-auto">
            <table className="border border-ink/50 text-sm">
              <thead className="bg-canvas text-left uppercase text-ink">
                <tr>
                  <th className="border border-ink/50 px-3 py-2">No.</th>
                  <th className="border border-ink/50 px-3 py-2">Product / Item</th>
                  <th className="border border-ink/50 px-3 py-2 text-right">Qty</th>
                  <th className="border border-ink/50 px-3 py-2">Unit</th>
                  <th className="border border-ink/50 px-3 py-2 text-right">Final Unit Price</th>
                  <th className="border border-ink/50 px-3 py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.salesOrder.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="border border-ink/50 px-3 py-2">{index + 1}</td>
                    <td className="border border-ink/50 px-3 py-2">{item.itemName}</td>
                    <td className="border border-ink/50 px-3 py-2 text-right">
                      {item.quantity}
                    </td>
                    <td className="border border-ink/50 px-3 py-2">PCS</td>
                    <td className="border border-ink/50 px-3 py-2 text-right">
                      {formatInvoiceCurrency(item.finalUnitPrice)}
                    </td>
                    <td className="border border-ink/50 px-3 py-2 text-right font-semibold">
                      {formatInvoiceCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 border-t border-line pt-5 md:grid-cols-[1fr_340px]">
          <div>
            <p className="text-xs font-bold uppercase text-ink/70">Amount in Words</p>
            <p className="mt-2 rounded-md border border-line bg-soft p-3 text-sm font-semibold leading-6">
              {amountToWords(invoice.totalAmount)}
            </p>

            {invoice.notes && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase text-ink/70">Notes</p>
                <p className="mt-2 text-sm leading-6 text-ink">{invoice.notes}</p>
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-bold uppercase text-ink/70">Payment Information</p>
              <p className="mt-2 text-sm leading-6 text-ink">
                Bank Transfer: Bank Demo CV Tajuk
                <br />
                Account No.: 123-456-7890
                <br />
                Account Name: CV TAJUK
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <AmountRow
              label={invoice.ppnApplied ? "Net Sales (DPP)" : "Invoice Subtotal / Net Sales"}
              value={invoice.netSalesAmount}
            />
            {invoice.ppnApplied && (
              <AmountRow
                label={`PPN (${formatPpnRate(invoice.ppnRateBasisPoints)})`}
                value={invoice.ppnAmount}
              />
            )}
            <AmountRow label="Invoice Total" value={invoice.totalAmount} strong />
            <AmountRow label="Paid Amount" value={invoice.paidAmount} />
            <AmountRow label="Remaining Amount" value={invoice.remainingAmount} strong />
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="font-semibold">Payment Status</span>
              <StatusBadge status={invoice.status} />
            </div>
          </div>
        </section>

        <footer className="mt-12 grid gap-8 sm:grid-cols-[1fr_260px]">
          <div className="text-xs leading-6 text-ink/70">
            This invoice is generated by the CV Tajuk Revenue Cycle Information System.
          </div>
          <div className="text-center text-sm">
            <p className="font-semibold">Authorized Signature</p>
            <div className="mt-16 border-t border-ink/50 pt-2">CV TAJUK</div>
          </div>
        </footer>
      </article>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3">
      <span className="font-semibold text-ink/70">{label}</span>
      <span className="font-medium text-strong">{value}</span>
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
      className={`flex items-center justify-between border-b border-line py-2 ${
        strong ? "text-base font-bold" : ""
      }`}
    >
      <span>{label}</span>
      <span>{formatInvoiceCurrency(value)}</span>
    </div>
  );
}
