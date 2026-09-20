import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Printer } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { reopenPickingList, savePickingList } from "@/lib/picking-list-actions";
import {
  canCreateDeliveryFromPickingList,
  canFulfillOrder,
  getPickingTotals,
  PICKING_AVAILABILITY_STATUSES,
} from "@/lib/picking-list";
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

function availabilityLabel(status: string) {
  switch (status) {
    case "Available":
      return "Available";
    case "Partial":
      return "Partially available";
    case "Unavailable":
      return "Unavailable";
    default:
      return "Not checked";
  }
}

function packingLabel(availableQuantity: number, packedQuantity: number) {
  if (availableQuantity === 0) return "Nothing to pack";
  if (packedQuantity === 0) return "Not packed";
  if (packedQuantity === availableQuantity) return "Packed";
  return "Partially packed";
}

export function PickingListPanel({
  list,
  canManage,
}: {
  list: PickingListDetail;
  canManage: boolean;
}) {
  const editable = canManage && list.status !== "Packed" && !list.deliveryNote;
  const order = list.salesOrder;
  const eligible = canFulfillOrder(order);
  const totals = getPickingTotals(list.items);
  const canCreateDelivery =
    eligible && canCreateDeliveryFromPickingList(list.items);

  return (
    <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-xl font-semibold">{list.pickingListNumber}</h2>
          <p className="mt-1 text-sm text-ink/70">
            {order.orderNumber}
            {order.customerPoNumber
              ? ` · PO ${order.customerPoNumber}`
              : ""}{" "}
            · {order.customer.companyName}
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
                  : totals.shortage > 0
                    ? "Completed with Shortage"
                    : "Completed"
            }
          />
          <Link className={buttonClass} href={`/pick-pack/${list.id}/print`}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print Picking List
          </Link>
          {list.status === "Packed" && !list.deliveryNote && canManage && (
            <form
              action={reopenPickingList}
              data-confirm-title="Reopen Picking List"
              data-confirm-require-note="true"
              data-confirm-summary={`${list.pickingListNumber}\n${order.orderNumber}\nCompleted quantities will be editable again.`}
            >
              <input type="hidden" name="id" value={list.id} />
              <input
                type="hidden"
                name="version"
                value={list.updatedAt.toISOString()}
              />
              <button className={buttonClass}>Reopen</button>
            </form>
          )}
          {list.deliveryNote ? (
            <Link
              className={buttonClass}
              href={`/surat-jalan?tab=${["Delivered", "Cancelled"].includes(list.deliveryNote.status) ? "completed" : "open"}&view=${list.deliveryNote.id}${list.deliveryNote.status === "Cancelled" ? "&archive=cancelled" : ""}`}
            >
              View Surat Jalan
            </Link>
          ) : list.status === "Packed" && canManage && canCreateDelivery ? (
            <Link
              className={buttonClass}
              href={`/surat-jalan?mode=create&pickingListId=${list.id}`}
            >
              Create Surat Jalan
            </Link>
          ) : null}
        </div>
      </div>

      {!eligible && !list.deliveryNote && (
        <p className="mb-4 rounded-md bg-soft p-3 text-sm">
          This order no longer meets order, approval, or active-invoice
          requirements. Resolve the order before issuing Surat Jalan.
        </p>
      )}
      {list.status === "Packed" && totals.packed === 0 && !list.deliveryNote && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          This Pick & Pack has no packed quantity. It remains recorded as a
          completed shortage, but a Surat Jalan cannot be created.
        </p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          ["Ordered", totals.ordered],
          ["Available", totals.available],
          ["Packed", totals.packed],
          ["Shortage", totals.shortage],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-line bg-soft p-3">
            <p className="text-xs font-semibold uppercase text-ink/60">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <form action={savePickingList} key={list.updatedAt.toISOString()}>
        <input type="hidden" name="id" value={list.id} />
        <input
          type="hidden"
          name="version"
          value={list.updatedAt.toISOString()}
        />
        <fieldset disabled={!editable} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium">
              Picking PIC
              <input
                name="pickerName"
                required
                defaultValue={list.pickerName ?? ""}
                maxLength={120}
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium">
              Packing PIC
              <input
                name="packerName"
                defaultValue={list.packerName ?? ""}
                maxLength={120}
                className={inputClass}
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-3">Product</th>
                  <th className="py-3 pr-3">Ordered</th>
                  <th className="py-3 pr-3">Availability</th>
                  <th className="py-3 pr-3">Available</th>
                  <th className="py-3 pr-3">Packed</th>
                  <th className="py-3 pr-3">Packing</th>
                  <th className="py-3 pr-3">Shortage</th>
                  <th className="py-3">Operational notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {list.items.map((item) => {
                  const shortage =
                    item.orderedQuantity - item.availableQuantity;
                  return (
                    <tr key={item.id}>
                      <td className="py-3 pr-3 font-medium">
                        {item.itemName}
                      </td>
                      <td className="py-3 pr-3">{item.orderedQuantity}</td>
                      <td className="py-3 pr-3">
                        <select
                          aria-label={`Availability ${item.itemName}`}
                          name={`availability_${item.id}`}
                          required
                          defaultValue={item.availabilityStatus}
                          className={`${inputClass} min-w-36`}
                        >
                          {PICKING_AVAILABILITY_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {availabilityLabel(status)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          aria-label={`Available ${item.itemName}`}
                          name={`available_${item.id}`}
                          type="number"
                          min={0}
                          max={item.orderedQuantity}
                          step={1}
                          required
                          defaultValue={item.availableQuantity}
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
                      <td className="py-3 pr-3">
                        {packingLabel(
                          item.availableQuantity,
                          item.packedQuantity,
                        )}
                      </td>
                      <td className="py-3 pr-3 font-semibold">
                        {shortage}
                      </td>
                      <td className="py-3">
                        <input
                          aria-label={`Notes ${item.itemName}`}
                          name={`notes_${item.id}`}
                          defaultValue={item.notes ?? ""}
                          maxLength={500}
                          placeholder={
                            shortage > 0
                              ? "Required for shortage"
                              : "Optional"
                          }
                          className={`${inputClass} min-w-48`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-md bg-soft p-3 text-sm text-ink/75">
            <p>
              Available must match the selected availability status. Complete
              Pick & Pack is allowed with shortages when every available unit
              is packed, Packing PIC is filled, and every shortage has a note.
            </p>
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
                Complete Pick & Pack
              </button>
            </div>
          )}
        </fieldset>
      </form>

      {list.packedAt && (
        <p className="mt-4 text-sm text-ink/70">
          Pick & Pack completed {formatDate(list.packedAt)} by{" "}
          {list.packerName ?? "an unspecified Packing PIC"}. Quantities are
          locked for delivery.
        </p>
      )}
    </section>
  );
}
