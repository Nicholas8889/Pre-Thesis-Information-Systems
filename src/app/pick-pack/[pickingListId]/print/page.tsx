import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { formatDate } from "@/lib/format";
import { getPickingTotals } from "@/lib/picking-list";
import { prisma } from "@/lib/prisma";

function availabilityLabel(status: string) {
  switch (status) {
    case "Available":
      return "Available";
    case "Partial":
      return "Partial";
    case "Unavailable":
      return "Unavailable";
    default:
      return "Unchecked";
  }
}

export default async function PickingListPrintPage({
  params,
}: {
  params: Promise<{ pickingListId: string }>;
}) {
  const { pickingListId } = await params;
  const list = await prisma.pickingList.findUnique({
    where: { id: pickingListId },
    include: {
      items: true,
      salesOrder: { include: { customer: true, invoice: true } },
    },
  });
  if (!list) notFound();

  const order = list.salesOrder;
  const totals = getPickingTotals(list.items);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/pick-pack?view=${list.id}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-brand"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Picking List
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-md border border-line bg-white p-8 text-ink shadow-card print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap justify-between gap-4 border-b-2 border-strong pb-5">
          <div>
            <p className="text-lg font-bold">CV TAJUK</p>
            <p className="mt-1 text-sm">
              Internal picking, packing, and shortage record
            </p>
          </div>
          <div>
            <h1 className="text-2xl font-bold">PICKING LIST</h1>
            <p className="mt-2 font-semibold">{list.pickingListNumber}</p>
            <p className="mt-1 text-sm">
              {list.status === "Packed"
                ? totals.shortage > 0
                  ? "Completed with Shortage"
                  : "Completed / Fully Packed"
                : "Picking & Packing in progress"}
            </p>
          </div>
        </header>

        <section className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <p>
            <strong>Order:</strong> {order.orderNumber}
          </p>
          {order.customerPoNumber && (
            <p>
              <strong>Customer PO:</strong> {order.customerPoNumber}
            </p>
          )}
          <p>
            <strong>Invoice:</strong>{" "}
            {order.invoice?.invoiceNumber ?? "-"}
          </p>
          <p>
            <strong>Customer:</strong> {order.customer.companyName}
          </p>
          <p>
            <strong>Required date:</strong>{" "}
            {order.requiredDate ? formatDate(order.requiredDate) : "-"}
          </p>
          <p>
            <strong>Created:</strong> {formatDate(list.createdAt)}
          </p>
          <p>
            <strong>Picking PIC:</strong> {list.pickerName ?? "-"}
          </p>
          <p>
            <strong>Packing PIC:</strong> {list.packerName ?? "-"}
          </p>
        </section>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr>
              {[
                "No.",
                "Product",
                "Ordered",
                "Availability",
                "Available",
                "Packed",
                "Shortage",
                "Operational notes",
              ].map((label) => (
                <th key={label} className="border border-ink/50 px-2 py-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.items.map((item, index) => (
              <tr key={item.id}>
                <td className="border border-ink/50 px-2 py-4 text-center">
                  {index + 1}
                </td>
                <td className="border border-ink/50 px-2 py-4">
                  {item.itemName}
                </td>
                <td className="border border-ink/50 px-2 py-4 text-center">
                  {item.orderedQuantity}
                </td>
                <td className="border border-ink/50 px-2 py-4 text-center">
                  {availabilityLabel(item.availabilityStatus)}
                </td>
                <td className="border border-ink/50 px-2 py-4 text-center">
                  {item.availableQuantity}
                </td>
                <td className="border border-ink/50 px-2 py-4 text-center">
                  {item.packedQuantity}
                </td>
                <td className="border border-ink/50 px-2 py-4 text-center">
                  {item.orderedQuantity - item.availableQuantity}
                </td>
                <td className="min-w-28 border border-ink/50 px-2 py-4">
                  {item.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td
                colSpan={2}
                className="border border-ink/50 px-2 py-3 text-right"
              >
                Total
              </td>
              <td className="border border-ink/50 px-2 py-3 text-center">
                {totals.ordered}
              </td>
              <td className="border border-ink/50 px-2 py-3" />
              <td className="border border-ink/50 px-2 py-3 text-center">
                {totals.available}
              </td>
              <td className="border border-ink/50 px-2 py-3 text-center">
                {totals.packed}
              </td>
              <td className="border border-ink/50 px-2 py-3 text-center">
                {totals.shortage}
              </td>
              <td className="border border-ink/50 px-2 py-3" />
            </tr>
          </tfoot>
        </table>

        <section className="mt-6 space-y-3 text-sm">
          <p>
            <strong>Internal notes:</strong>{" "}
            {list.notes ||
              "................................................................................"}
          </p>
          <p>
            Shortage is retained as operational and audit information. Surat
            Jalan may only use the packed quantity.
          </p>
        </section>

        <footer className="mt-8 grid gap-10 text-center text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold">Picking PIC</p>
            <p className="mt-16 border-t border-dotted border-ink/50 pt-2">
              {list.pickerName ?? "Name / Signature"}
            </p>
          </div>
          <div>
            <p className="font-semibold">Packing PIC</p>
            <p className="mt-16 border-t border-dotted border-ink/50 pt-2">
              {list.packerName ?? "Name / Signature"}
            </p>
          </div>
          <p className="sm:col-span-2">
            Completion date:{" "}
            {list.packedAt
              ? formatDate(list.packedAt)
              : "........................"}
          </p>
        </footer>
      </article>
    </div>
  );
}
