"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveDeliveryNoteDraft } from "@/lib/actions";
import { DELIVERY_DRIVER_OPTIONS, DELIVERY_VEHICLE_PLATE_OPTIONS } from "@/lib/delivery-options";

type DraftItem = {
  id: string;
  sourceLabel: string;
  itemName: string;
  orderedQuantitySnapshot: number;
  packedQuantitySnapshot: number;
  quantity: number;
  outstandingQuantity: number;
  adjustmentNote: string | null;
  unit: string;
};

type DraftNote = {
  id: string;
  updatedAt: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  deliveryDate: string;
  notes: string | null;
  senderName: string | null;
  driverName: string | null;
  vehiclePlateNumber: string | null;
  authorizedBy: string | null;
  items: DraftItem[];
};

const inputClass = "mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm";

export function DeliveryNoteDraftForm({ note }: { note: DraftNote }) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(note.items.map(item => [item.id, item.quantity]))
  );
  const totals = useMemo(() => note.items.reduce((sum, item) => {
    const quantity = quantities[item.id] ?? 0;
    return {
      ordered: sum.ordered + item.orderedQuantitySnapshot,
      packed: sum.packed + item.packedQuantitySnapshot,
      sent: sum.sent + quantity,
      outstanding: sum.outstanding + item.orderedQuantitySnapshot - quantity
    };
  }, { ordered: 0, packed: 0, sent: 0, outstanding: 0 }), [note.items, quantities]);

  return (
    <form action={saveDeliveryNoteDraft} className="space-y-5">
      <input type="hidden" name="id" value={note.id} />
      <input type="hidden" name="version" value={note.updatedAt} />

      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        Draft can still be adjusted. Issue locks the header and item quantities permanently; only final quantities above zero will be printed.
      </div>

      <fieldset className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-medium">
          Recipient
          <input name="recipientName" required defaultValue={note.recipientName} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          Phone
          <input name="recipientPhone" defaultValue={note.recipientPhone} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          Delivery date
          <input name="deliveryDate" type="date" required defaultValue={note.deliveryDate} className={inputClass} />
        </label>
        <label className="text-sm font-medium md:col-span-2 xl:col-span-3">
          Recipient address
          <textarea name="recipientAddress" required defaultValue={note.recipientAddress} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          Driver
          <select name="driverName" required defaultValue={note.driverName ?? ""} className={inputClass}>
            <option value="" disabled>Select driver</option>
            {DELIVERY_DRIVER_OPTIONS.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Vehicle plate
          <select name="vehiclePlateNumber" required defaultValue={note.vehiclePlateNumber ?? ""} className={inputClass}>
            <option value="" disabled>Select vehicle plate</option>
            {DELIVERY_VEHICLE_PLATE_OPTIONS.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Sender
          <input name="senderName" defaultValue={note.senderName ?? ""} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          Authorized by
          <input name="authorizedBy" defaultValue={note.authorizedBy ?? ""} className={inputClass} />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Delivery notes
          <input name="notes" defaultValue={note.notes ?? ""} className={inputClass} />
        </label>
      </fieldset>

      <div className="overflow-x-auto">
        <table>
          <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
            <tr>
              <th className="py-3 pr-4">SO / Customer PO</th>
              <th className="py-3 pr-4">Product</th>
              <th className="py-3 pr-4 text-right">Ordered</th>
              <th className="py-3 pr-4 text-right">Packed</th>
              <th className="py-3 pr-4 text-right">Send</th>
              <th className="py-3 pr-4 text-right">Outstanding</th>
              <th className="py-3">Adjustment note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-sm">
            {note.items.map(item => {
              const quantity = quantities[item.id] ?? 0;
              const fulfillmentShortage = item.orderedQuantitySnapshot - item.packedQuantitySnapshot;
              const deliveryReduction = item.packedQuantitySnapshot - quantity;
              return (
                <tr key={item.id} className={quantity === 0 ? "bg-soft text-ink/70" : ""}>
                  <td className="py-3 pr-4">{item.sourceLabel}</td>
                  <td className="py-3 pr-4 font-medium">
                    {item.itemName}
                    <span className="block text-xs font-normal text-ink/60">
                      {fulfillmentShortage > 0 ? `Pick & Pack shortage: ${fulfillmentShortage}` : "Packed in full"}
                      {deliveryReduction > 0 ? ` · Draft reduction: ${deliveryReduction}` : ""}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right">{item.orderedQuantitySnapshot}</td>
                  <td className="py-3 pr-4 text-right">{item.packedQuantitySnapshot}</td>
                  <td className="min-w-32 py-3 pr-4">
                    <div className="flex items-center justify-end gap-2">
                      <input
                        name={"quantity_" + item.id}
                        type="number"
                        min={0}
                        max={item.packedQuantitySnapshot}
                        required
                        value={quantity}
                        onChange={event => setQuantities(current => ({
                          ...current,
                          [item.id]: Math.max(0, Math.min(item.packedQuantitySnapshot, Number(event.target.value)))
                        }))}
                        className="w-20 rounded-md border border-line bg-white px-2 py-1.5 text-right"
                      />
                      <button
                        type="button"
                        onClick={() => setQuantities(current => ({
                          ...current,
                          [item.id]: quantity === 0 ? item.packedQuantitySnapshot : 0
                        }))}
                        className="text-xs font-semibold text-brand"
                      >
                        {quantity === 0 ? "Restore" : "Remove"}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold">
                    {item.orderedQuantitySnapshot - quantity}
                  </td>
                  <td className="min-w-56 py-3">
                    <input
                      name={"adjustmentNote_" + item.id}
                      defaultValue={item.adjustmentNote ?? ""}
                      placeholder={deliveryReduction > 0 ? "Optional operational note" : "Optional"}
                      className="w-full rounded-md border border-line bg-white px-2 py-1.5"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-line text-sm font-semibold">
            <tr>
              <td className="py-3 pr-4" colSpan={2}>Total</td>
              <td className="py-3 pr-4 text-right">{totals.ordered}</td>
              <td className="py-3 pr-4 text-right">{totals.packed}</td>
              <td className="py-3 pr-4 text-right">{totals.sent}</td>
              <td className="py-3 pr-4 text-right">{totals.outstanding}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <label className="block text-sm font-medium">
        Internal change / issue note
        <input name="confirmationNote" className={inputClass} placeholder="Optional audit note" />
      </label>
      <DraftActions canIssue={totals.sent > 0} />
    </form>
  );
}

function DraftActions({ canIssue }: { canIssue: boolean }) {
  const { pending } = useFormStatus();
  const [confirmingIssue, setConfirmingIssue] = useState(false);
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          name="intent"
          value="save"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-brand disabled:opacity-50"
        >
          {pending ? "Menyimpan..." : "Simpan Draft"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingIssue(true)}
          disabled={pending || !canIssue}
          className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Kirim Surat Jalan
        </button>
      </div>

      {confirmingIssue && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-strong/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-delivery-note-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmingIssue(false);
          }}
        >
          <section className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-xl">
            <h2 id="issue-delivery-note-title" className="text-lg font-semibold text-ink">
              Kirim Surat Jalan?
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink/80">
              Data penerima, kendaraan, dan jumlah barang akan dikunci. Setelah dikirim,
              Surat Jalan tidak dapat diedit lagi.
            </p>
            <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setConfirmingIssue(false)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink/80"
              >
                Kembali
              </button>
              <button
                name="intent"
                value="issue"
                disabled={pending}
                className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Memproses..." : "Ya, Kirim & Kunci"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
