import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PickingListPrintPage({
  params,
}: {
  params: Promise<{ pickingListId: string }>;
}) {
  await requireCurrentUser();
  const { pickingListId } = await params;
  const list = await prisma.pickingList.findUnique({
    where: { id: pickingListId },
    include: { items: true, salesOrder: { include: { customer: true } } },
  });
  if (!list) notFound();
  const order = list.salesOrder;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/surat-jalan?tab=picking&viewPicking=${list.id}`}
          className="text-sm font-semibold text-brand"
        >
          Back to Picking List
        </Link>
        <PrintButton />
      </div>
      <article className="print-page rounded-md border border-line bg-white p-6 text-strong shadow-card sm:p-8">
        <header className="flex flex-wrap justify-between gap-4 border-b-2 border-strong pb-5">
          <div>
            <p className="text-lg font-bold">CV TAJUK</p>
            <p className="mt-1 text-sm">Internal warehouse checklist</p>
          </div>
          <div>
            <h1 className="text-2xl font-bold">PICK & PACK SHEET</h1>
            <p className="mt-2 font-semibold">{list.pickingListNumber}</p>
            <p className="mt-1 text-sm">
              {list.status === "Packed"
                ? "Packed / Verified"
                : "Work in progress"}
            </p>
          </div>
        </header>
        <section className="grid gap-3 border-b border-line py-5 text-sm sm:grid-cols-2">
          <p>
            <strong>Sales Order:</strong> {order.orderNumber}
          </p>
          <p>
            <strong>Customer PO:</strong> {order.customerPoNumber ?? "-"}
          </p>
          <p>
            <strong>Customer:</strong> {order.customer.companyName}
          </p>
          <p>
            <strong>Contact:</strong> {order.customer.name}
          </p>
          <p>
            <strong>Created:</strong> {formatDate(list.createdAt)}
          </p>
          <p>
            <strong>Required date:</strong>{" "}
            {order.requiredDate ? formatDate(order.requiredDate) : "-"}
          </p>
          <p className="sm:col-span-2">
            <strong>Destination:</strong> {order.customer.address || "-"}
          </p>
        </section>
        <table className="my-5 border border-ink/50 text-sm">
          <thead className="bg-canvas text-left">
            <tr>
              {[
                "No.",
                "Product",
                "Ordered (PCS)",
                "Picked",
                "Packed",
                "Checked",
                "Discrepancy / Notes",
              ].map((label) => (
                <th key={label} className="border border-ink/50 px-2 py-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.items.map((item, index) => (
              <tr key={item.id} className="break-inside-avoid">
                <td className="border border-ink/50 px-2 py-4">{index + 1}</td>
                <td className="border border-ink/50 px-2 py-4 font-medium">
                  {item.itemName}
                </td>
                <td className="border border-ink/50 px-2 py-4 text-center">
                  {item.orderedQuantity}
                </td>
                <td className="border border-ink/50 px-2 py-4 text-center">
                  {item.pickedQuantity || ""}
                </td>
                <td className="border border-ink/50 px-2 py-4 text-center">
                  {item.packedQuantity || ""}
                </td>
                <td className="border border-ink/50 px-2 py-4">
                  <span className="mx-auto block h-4 w-4 border border-strong" />
                </td>
                <td className="min-w-28 border border-ink/50 px-2 py-4">
                  {item.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className="space-y-3 text-sm">
          <p>
            <strong>Package count / Koli:</strong>{" "}
            {list.packageCount ?? "........................"}
          </p>
          <p>
            <strong>Notes:</strong>{" "}
            {list.notes ||
              "................................................................................"}
          </p>
          <p>
            Record actual quantities and resolve discrepancies before issuing
            Surat Jalan.
          </p>
        </section>
        <footer className="mt-8 grid grid-cols-2 gap-12 text-center text-sm">
          <div>
            <p className="font-semibold">Picked by</p>
            <p className="mt-16 border-t border-dotted border-ink/50 pt-2">
              {list.pickerName ?? "Name / Signature"}
            </p>
            <p className="mt-3">Date / Time: ........................</p>
          </div>
          <div>
            <p className="font-semibold">Packed and checked by</p>
            <p className="mt-16 border-t border-dotted border-ink/50 pt-2">
              {list.packerName ?? "Name / Signature"}
            </p>
            <p className="mt-3">
              Date / Time:{" "}
              {list.packedAt
                ? formatDate(list.packedAt)
                : "........................"}
            </p>
          </div>
        </footer>
      </article>
    </div>
  );
}
