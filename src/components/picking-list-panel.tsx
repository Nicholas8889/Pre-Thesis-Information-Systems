import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Printer } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { CombinedDeliveryNoteForm, type PackedDeliveryOption } from "@/components/combined-delivery-note-form";
import { savePickingList } from "@/lib/picking-list-actions";
import { canFulfillOrder } from "@/lib/picking-list";
import { formatDate } from "@/lib/format";

type PickingListDetail = Prisma.PickingListGetPayload<{
  include: {
    items: true;
    deliveryNote: true;
    salesOrder: { include: { customer: true; invoice: true } };
  };
}>;
const inputClass =
  "mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm disabled:bg-soft";
const buttonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand";

export function PickingListPanel({
  list,
  canManage,
  showIssueForm,
  deliveryOptions,
}: {
  list: PickingListDetail;
  canManage: boolean;
  showIssueForm: boolean;
  deliveryOptions?: PackedDeliveryOption[];
}) {
  const editable = canManage && list.status !== "Packed" && !list.deliveryNote;
  const order = list.salesOrder;
  const eligible = canFulfillOrder(order);
  const shortfall = list.items.reduce(
    (sum, item) => sum + item.orderedQuantity - item.packedQuantity,
    0,
  );
  return (
    <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-xl font-semibold">{list.pickingListNumber}</h2>
          <p className="mt-1 text-sm text-ink/70">
            {order.orderNumber}
            {order.customerPoNumber
              ? ` · PO ${order.customerPoNumber}`
              : ""} · {order.customer.companyName}
          </p>
          <p className="mt-1 text-sm text-ink/70">
            Required date:{" "}
            {order.requiredDate
              ? formatDate(order.requiredDate)
              : "Not specified"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={
              list.status === "Pending"
                ? "Ready to Pick"
                : list.status === "InProgress"
                  ? "Picking & Packing"
                  : "Packed"
            }
          />
          <Link
            className={buttonClass}
            href={`/surat-jalan/picking-list/${list.id}/print`}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print Picking List
          </Link>
          {list.deliveryNote ? (
            <Link
              className={buttonClass}
              href={`/surat-jalan?tab=${["Delivered", "Cancelled"].includes(list.deliveryNote.status) ? "completed" : "open"}&view=${list.deliveryNote.id}${list.deliveryNote.status === "Cancelled" ? "&archive=cancelled" : ""}`}
            >
              View Surat Jalan
            </Link>
          ) : list.status === "Packed" && canManage && eligible ? (
            <Link
              className={buttonClass}
              href={`/surat-jalan?tab=picking&viewPicking=${list.id}&issue=${list.id}`}
            >
              Create Surat Jalan
            </Link>
          ) : null}
        </div>
      </div>
      {!eligible && !list.deliveryNote && (
        <p className="mb-4 rounded-md bg-soft p-3 text-sm">
          This order no longer meets order, approval, or active-invoice requirements. Resolve
          the order before issuing Surat Jalan.
        </p>
      )}
      <form action={savePickingList} key={list.updatedAt.toISOString()}>
        <input type="hidden" name="id" value={list.id} />
        <input
          type="hidden"
          name="version"
          value={list.updatedAt.toISOString()}
        />
        <fieldset disabled={!editable} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium">
              Picker name
              <input
                name="pickerName"
                defaultValue={list.pickerName ?? ""}
                maxLength={120}
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium">
              Packer name
              <input
                name="packerName"
                defaultValue={list.packerName ?? ""}
                maxLength={120}
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium">
              Package count / Koli
              <input
                name="packageCount"
                type="number"
                min={1}
                step={1}
                defaultValue={list.packageCount ?? ""}
                className={inputClass}
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-3">Product</th>
                  <th className="py-3 pr-3">Ordered (PCS)</th>
                  <th className="py-3 pr-3">Picked</th>
                  <th className="py-3 pr-3">Packed</th>
                  <th className="py-3">Discrepancy / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {list.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-3 font-medium">{item.itemName}</td>
                    <td className="py-3 pr-3">{item.orderedQuantity}</td>
                    <td className="py-3 pr-3">
                      <input
                        aria-label={`Picked ${item.itemName}`}
                        name={`picked_${item.id}`}
                        type="number"
                        min={0}
                        max={item.orderedQuantity}
                        step={1}
                        required
                        defaultValue={item.pickedQuantity}
                        className={`${inputClass} min-w-20`}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        aria-label={`Packed ${item.itemName}`}
                        name={`packed_${item.id}`}
                        type="number"
                        min={0}
                        max={item.orderedQuantity}
                        step={1}
                        required
                        defaultValue={item.packedQuantity}
                        className={`${inputClass} min-w-20`}
                      />
                    </td>
                    <td className="py-3">
                      <input
                        aria-label={`Notes ${item.itemName}`}
                        name={`notes_${item.id}`}
                        defaultValue={item.notes ?? ""}
                        maxLength={500}
                        className={`${inputClass} min-w-40`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="block text-sm font-medium">
            Internal notes
            <textarea
              name="notes"
              defaultValue={list.notes ?? ""}
              maxLength={2000}
              rows={2}
              className={inputClass}
            />
          </label>
          <p className="text-sm text-ink/70">
            {shortfall > 0
              ? `${shortfall} units still need packing. Save progress while resolving shortages.`
              : "All ordered quantities have been packed."}
            {editable
              ? " Mark Packed requires all quantities, picker, packer, and package count."
              : ""}
          </p>
          {editable && (
            <div className="flex flex-wrap gap-3">
              <button name="intent" value="save" className={buttonClass}>
                Save Progress
              </button>
              <button
                name="intent"
                value="complete"
                className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white"
              >
                Mark Packed
              </button>
            </div>
          )}
        </fieldset>
      </form>
      {list.packedAt && (
        <p className="mt-4 text-sm text-ink/70">
          Packing completed {formatDate(list.packedAt)}. Quantities are locked
          for delivery.
        </p>
      )}
      {showIssueForm &&
        list.status === "Packed" &&
        !list.deliveryNote &&
        canManage &&
        eligible && (
          <CombinedDeliveryNoteForm lists={deliveryOptions ?? [list]} initialPickingListId={list.id} />
        )}
    </section>
  );
}
