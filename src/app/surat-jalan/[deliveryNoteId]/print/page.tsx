import { deliverySourcesInclude, orderReference } from "@/lib/delivery-note-links";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getDeliveryNoteStatusLabel } from "@/lib/delivery-note-status";

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
      sources: deliverySourcesInclude,
      items: { where: { quantity: { gt: 0 } }, include: { source: { include: { salesOrder: true } } }, orderBy: [{ sourceId: "asc" }, { id: "asc" }] }
    }
  });

  if (!deliveryNote || !deliveryNote.issuedAt) {
    notFound();
  }
  const printableItems = deliveryNote.items.filter(item => item.quantity > 0);
  const combined = (deliveryNote.sources?.length ?? 0) > 1;
  const isCustomerPo = deliveryNote.salesOrder?.source === "CUSTOMER_PO";
  const orderLabel = isCustomerPo ? "Customer PO" : "Sales Order";

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
                Local thesis demonstration delivery document
              </p>
            </div>
            <div className="text-left sm:text-right">
              <h1 className="text-3xl font-bold tracking-normal">SURAT JALAN / Delivery Note</h1>
              <p className="mt-2 text-sm font-semibold">
                No. {deliveryNote.deliveryNoteNumber}
              </p>
              <div className="mt-2 flex sm:justify-end">
                <StatusBadge
                  status={deliveryNote.status}
                  label={getDeliveryNoteStatusLabel(deliveryNote.status)}
                />
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 border-b border-line py-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-ink/70">Kepada</p>
            <p className="mt-2 text-base font-semibold">{deliveryNote.recipientName}</p>
            <p className="text-sm text-ink">{deliveryNote.customer.companyName}</p>
            <p className="mt-2 text-sm text-ink">{deliveryNote.recipientPhone}</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-ink">
              {deliveryNote.recipientAddress}
            </p>
          </div>

          <div className="grid gap-3 text-sm">
            <InfoRow label="No." value={deliveryNote.deliveryNoteNumber} />
            <InfoRow label="Date" value={formatDate(deliveryNote.deliveryDate)} />
            <InfoRow
              label="Invoice"
              value={deliveryNote.sources?.map(source => source.invoice.invoiceNumber).join(", ") || deliveryNote.invoice?.invoiceNumber || "-"}
            />
            <InfoRow
              label="Sales Order"
              value={deliveryNote.sources?.map(source => orderReference(source.salesOrder)).join(", ") || orderReference(deliveryNote.salesOrder)}
            />
            {isCustomerPo && (
              <InfoRow
                label="Customer PO Number"
                value={deliveryNote.salesOrder?.customerPoNumber ?? "-"}
              />
            )}
            <InfoRow label="Order Source" value={combined ? "Combined SO / Customer PO" : orderLabel} />
            {isCustomerPo && deliveryNote.salesOrder?.requiredDate && (
              <InfoRow
                label="Required Date"
                value={formatDate(deliveryNote.salesOrder.requiredDate)}
              />
            )}
            {isCustomerPo && (
              <InfoRow
                label="Customer PO Document"
                value={deliveryNote.salesOrder?.customerPoDocumentName ?? "-"}
              />
            )}
            <InfoRow
              label="Driver / Pengemudi"
              value={deliveryNote.driverName ?? "Not recorded"}
            />
            <InfoRow
              label="Vehicle Plate / Nomor Plat"
              value={deliveryNote.vehiclePlateNumber ?? "Not recorded"}
            />
          </div>
        </section>

        <section className="py-5">
          <div className="overflow-x-auto">
            <table className="border border-ink/50 text-sm">
              <thead className="bg-canvas text-left uppercase text-ink">
                <tr>
                  <th className="border border-ink/50 px-3 py-2">No.</th>
                  <th className="border border-ink/50 px-3 py-2">SO / Customer PO</th>
                  <th className="border border-ink/50 px-3 py-2">Product Code</th>
                  <th className="border border-ink/50 px-3 py-2">Product Name</th>
                  <th className="border border-ink/50 px-3 py-2 text-right">Qty</th>
                  <th className="border border-ink/50 px-3 py-2">Unit</th>
                  <th className="border border-ink/50 px-3 py-2">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {printableItems.map((item, index) => (
                  <tr key={item.id}>
                    <td className="border border-ink/50 px-3 py-2">{index + 1}</td>
                    <td className="border border-ink/50 px-3 py-2">{orderReference(item.source?.salesOrder ?? deliveryNote.salesOrder)}</td>
                    <td className="border border-ink/50 px-3 py-2">
                      {item.productCode ?? "-"}
                    </td>
                    <td className="border border-ink/50 px-3 py-2 font-semibold">
                      {item.itemName}
                    </td>
                    <td className="border border-ink/50 px-3 py-2 text-right">
                      {item.quantity}
                    </td>
                    <td className="border border-ink/50 px-3 py-2">{item.unit}</td>
                    <td className="border border-ink/50 px-3 py-2">
                      {item.description ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 border-t border-line pt-5 md:grid-cols-[1fr_320px]">
          <div>
            <p className="text-xs font-bold uppercase text-ink/70">Attention</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink">
              <li>Barang yang sudah dibeli tidak dapat dikembalikan.</li>
              <li>
                Barang hanya dapat ditukar apabila terjadi kerusakan karena kesalahan
                produksi.
              </li>
              <li>Copy ini dapat digunakan sebagai bukti pengiriman barang.</li>
            </ul>

            {deliveryNote.notes && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase text-ink/70">Notes</p>
                <p className="mt-2 text-sm leading-6 text-ink">
                  {deliveryNote.notes}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <InfoRow label="Receiver" value={deliveryNote.receiverName ?? "-"} />
            <InfoRow label="Sender" value={deliveryNote.senderName ?? "-"} />
            <InfoRow
              label="Delivered by"
              value={deliveryNote.driverName ?? "Not recorded"}
            />
            <InfoRow
              label="Vehicle Plate"
              value={deliveryNote.vehiclePlateNumber ?? "Not recorded"}
            />
            <InfoRow label="Authorized by" value={deliveryNote.authorizedBy ?? "-"} />
            {deliveryNote.receivedAt && (
              <InfoRow
                label="Received at"
                value={new Intl.DateTimeFormat("id-ID", {
                  timeZone: "Asia/Jakarta",
                  dateStyle: "medium",
                  timeStyle: "short"
                }).format(deliveryNote.receivedAt)}
              />
            )}
            {deliveryNote.receivedBy && (
              <InfoRow label="Receipt recorded by" value={deliveryNote.receivedBy} />
            )}
          </div>
        </section>

        {deliveryNote.receiptNotes && (
          <section className="mt-5 border-t border-line pt-5">
            <p className="text-xs font-bold uppercase text-ink/70">Receipt Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">
              {deliveryNote.receiptNotes}
            </p>
          </section>
        )}

        <footer className="mt-12 grid gap-8 text-center text-sm md:grid-cols-4">
          <Signature label="Received by" name={deliveryNote.receiverName ?? ""} />
          <Signature label="Prepared / Sent by" name={deliveryNote.senderName ?? ""} />
          <Signature
            label="Delivered by"
            name={deliveryNote.driverName ?? "Not recorded"}
          />
          <Signature label="Authorized by" name={deliveryNote.authorizedBy ?? ""} />
        </footer>
      </article>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <span className="font-semibold text-ink/70">{label}</span>
      <span className="font-medium text-strong">{value}</span>
    </div>
  );
}

function Signature({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <div className="mt-16 border-t border-dotted border-ink/50 pt-2">
        {name || "........................"}
      </div>
    </div>
  );
}
