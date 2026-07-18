import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SuratJalanPrintPage({
  params
}: {
  params: Promise<{ deliveryNoteId: string }>;
}) {
  const { deliveryNoteId } = await params;

  const deliveryNote = await prisma.deliveryNote.findUnique({
    where: { id: deliveryNoteId },
    include: {
      customer: true,
      invoice: true,
      salesOrder: true,
      items: true
    }
  });

  if (!deliveryNote) {
    notFound();
  }
  const isPreOrder = deliveryNote.salesOrder?.transactionType === "PRE_ORDER";
  const transactionLabel = isPreOrder ? "Pre Order" : "Sales Order";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/surat-jalan?view=${deliveryNote.id}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-brand"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Surat Jalan
        </Link>
        <PrintButton label="Print Surat Jalan" />
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
                Local thesis demonstration delivery document
              </p>
            </div>
            <div className="text-left sm:text-right">
              <h1 className="text-3xl font-bold tracking-normal">SURAT JALAN</h1>
              <p className="mt-2 text-sm font-semibold">
                No. {deliveryNote.deliveryNoteNumber}
              </p>
              <div className="mt-2 flex sm:justify-end">
                <StatusBadge status={deliveryNote.status} />
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 border-b border-slate-300 py-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Kepada</p>
            <p className="mt-2 text-base font-semibold">{deliveryNote.recipientName}</p>
            <p className="text-sm text-slate-700">{deliveryNote.customer.companyName}</p>
            <p className="mt-2 text-sm text-slate-700">{deliveryNote.recipientPhone}</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-slate-700">
              {deliveryNote.recipientAddress}
            </p>
          </div>

          <div className="grid gap-3 text-sm">
            <InfoRow label="No." value={deliveryNote.deliveryNoteNumber} />
            <InfoRow label="Date" value={formatDate(deliveryNote.deliveryDate)} />
            <InfoRow
              label="Invoice"
              value={deliveryNote.invoice?.invoiceNumber ?? "-"}
            />
            <InfoRow
              label="Sales Order"
              value={deliveryNote.salesOrder?.orderNumber ?? "-"}
            />
            {isPreOrder && (
              <InfoRow
                label="PO ID"
                value={deliveryNote.salesOrder?.poNumber ?? "-"}
              />
            )}
            <InfoRow label="Transaction Type" value={transactionLabel} />
            {isPreOrder && deliveryNote.salesOrder?.requiredDate && (
              <InfoRow
                label="Required Date"
                value={formatDate(deliveryNote.salesOrder.requiredDate)}
              />
            )}
            {isPreOrder && (
              <InfoRow
                label="PO Document"
                value={deliveryNote.salesOrder?.poDocumentName ?? "-"}
              />
            )}
          </div>
        </section>

        <section className="py-5">
          <div className="overflow-x-auto">
            <table className="border border-slate-400 text-sm">
              <thead className="bg-slate-100 text-left uppercase text-slate-700">
                <tr>
                  <th className="border border-slate-400 px-3 py-2">No.</th>
                  <th className="border border-slate-400 px-3 py-2">Product Code</th>
                  <th className="border border-slate-400 px-3 py-2">Product Name</th>
                  <th className="border border-slate-400 px-3 py-2 text-right">Qty</th>
                  <th className="border border-slate-400 px-3 py-2">Unit</th>
                  <th className="border border-slate-400 px-3 py-2">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {deliveryNote.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="border border-slate-400 px-3 py-2">{index + 1}</td>
                    <td className="border border-slate-400 px-3 py-2">
                      {item.productCode ?? "-"}
                    </td>
                    <td className="border border-slate-400 px-3 py-2 font-semibold">
                      {item.itemName}
                    </td>
                    <td className="border border-slate-400 px-3 py-2 text-right">
                      {item.quantity}
                    </td>
                    <td className="border border-slate-400 px-3 py-2">{item.unit}</td>
                    <td className="border border-slate-400 px-3 py-2">
                      {item.description ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 border-t border-slate-300 pt-5 md:grid-cols-[1fr_320px]">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Attention</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
              <li>Barang yang sudah dibeli tidak dapat dikembalikan.</li>
              <li>
                Barang hanya dapat ditukar apabila terjadi kerusakan karena kesalahan
                produksi.
              </li>
              <li>Copy ini dapat digunakan sebagai bukti pengiriman barang.</li>
            </ul>

            {deliveryNote.notes && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase text-slate-500">Notes</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {deliveryNote.notes}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <InfoRow label="Receiver" value={deliveryNote.receiverName ?? "-"} />
            <InfoRow label="Delivered by" value={deliveryNote.senderName ?? "-"} />
            <InfoRow label="Authorized by" value={deliveryNote.authorizedBy ?? "-"} />
          </div>
        </section>

        <footer className="mt-12 grid gap-8 text-center text-sm md:grid-cols-3">
          <Signature label="Received by" name={deliveryNote.receiverName ?? ""} />
          <Signature label="Delivered by" name={deliveryNote.senderName ?? ""} />
          <Signature label="Authorized by" name={deliveryNote.authorizedBy ?? ""} />
        </footer>
      </article>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function Signature({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <div className="mt-16 border-t border-dotted border-slate-500 pt-2">
        {name || "........................"}
      </div>
    </div>
  );
}
