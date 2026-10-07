import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { StatusBadge } from "@/components/status-badge";
import { LegacyPickingListPanel } from "@/components/legacy-picking-list-panel";
import { PackChecklistForm } from "@/components/pack-checklist-form";
import { reopenPickingList, savePickingList } from "@/lib/picking-list-actions";
import { canCreateDeliveryFromSheet, canFulfillOrder } from "@/lib/picking-list";
import { formatDate } from "@/lib/format";

type PickingListDetail = Prisma.PickingListGetPayload<{
  include: {
    items: true;
    deliveryNote: true;
    salesOrder: { include: { customer: true; invoice: true } };
  };
}>;
const buttonClass = "inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-brand";

export function PickingListPanel({ list, canManage }: {
  list: PickingListDetail;
  canManage: boolean;
}) {
  if (list.status === "Packed" && !list.usesChecklist) {
    return <LegacyPickingListPanel list={list} canManage={canManage} />;
  }
  const completed = list.status === "Packed";
  const isPick = list.status === "Pending";
  const editable = canManage && !completed && !list.deliveryNote;
  const eligible = canFulfillOrder(list.salesOrder);
  const canCreateDelivery = eligible && canCreateDeliveryFromSheet(list);
  return (
    <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-xl font-semibold">{list.pickingListNumber}</h2>
          <p className="mt-1 text-sm text-ink/70">
            {list.salesOrder.orderNumber}
            {list.salesOrder.customerPoNumber ? ` · PO ${list.salesOrder.customerPoNumber}` : ""}
            {" · "}{list.salesOrder.customer.companyName}
          </p>
          <p className="mt-1 text-sm text-ink/70">Required date: {list.salesOrder.requiredDate ? formatDate(list.salesOrder.requiredDate) : "Not specified"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={completed ? "Completed" : isPick ? "Pick" : "Pack"} />
          <Link className={buttonClass} href={`/pick-pack/${list.id}/print`}>Print Pick &amp; Pack</Link>
          {completed && !list.deliveryNote && canManage && (
            <form action={reopenPickingList} data-confirm-title="Reopen Picking List" data-confirm-require-note="true"
              data-confirm-summary={`${list.pickingListNumber}\n${list.salesOrder.orderNumber}\nAll Pack checks will be reset for review.`}>
              <input type="hidden" name="id" value={list.id} />
              <input type="hidden" name="version" value={list.updatedAt.toISOString()} />
              <button className={buttonClass}>Reopen</button>
            </form>
          )}
          {list.deliveryNote ? (
            <Link className={buttonClass}
              href={`/surat-jalan?tab=${["Delivered", "Cancelled"].includes(list.deliveryNote.status) ? "completed" : "open"}&view=${list.deliveryNote.id}${list.deliveryNote.status === "Cancelled" ? "&archive=cancelled" : ""}`}>
              View Surat Jalan
            </Link>
          ) : completed && canManage && canCreateDelivery ? (
            <Link className={buttonClass} href={`/surat-jalan?mode=create&pickingListId=${list.id}`}>Create Surat Jalan</Link>
          ) : null}
        </div>
      </div>
      {!eligible && !list.deliveryNote && (
        <p className="mb-4 rounded-md bg-soft p-3 text-sm">This order no longer meets order, approval, or active-invoice requirements. Resolve the order before issuing Surat Jalan.</p>
      )}
      <ol aria-label="Sheet stages" className="mb-4 flex gap-3 text-sm font-semibold">
        <li aria-current={isPick ? "step" : undefined}>1. Pick</li>
        <li aria-current={!isPick && !completed ? "step" : undefined}>2. Pack</li>
        <li aria-current={completed ? "step" : undefined}>3. Completed</li>
      </ol>
      {isPick ? (
        <>
          <p className="mb-4 text-sm"><span className="font-semibold">PIC Pick &amp; Pack:</span> {list.pickerName ?? "—"}</p>
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr><th className="py-3 pr-4">Product</th><th className="py-3">Ordered quantity</th></tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {list.items.map(item => <tr key={item.id}><td className="py-3 pr-4 font-medium">{item.itemName}</td><td className="py-3">{item.orderedQuantity}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="my-4 text-sm text-ink/70">Prepare the items shown above, then continue to Pack to check them.</p>
          {editable && (
            <form action={savePickingList}>
              <input type="hidden" name="id" value={list.id} />
              <input type="hidden" name="version" value={list.updatedAt.toISOString()} />
              {list.items.map(item => <input key={item.id} type="hidden" name="itemId" value={item.id} />)}
              <button name="intent" value="continue" className={buttonClass}>Lanjut ke Pack</button>
            </form>
          )}
        </>
      ) : (
        <PackChecklistForm key={list.updatedAt.toISOString()} id={list.id}
          version={list.updatedAt.toISOString()} pickerName={list.pickerName ?? ""}
          notes={list.notes ?? ""} items={list.items} editable={editable} completed={completed} />
      )}
      {completed && list.packedAt && <p className="mt-4 text-sm text-ink/70">Completed {formatDate(list.packedAt)}. This sheet is locked.</p>}
    </section>
  );
}
