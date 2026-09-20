"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createDeliveryNote } from "@/lib/actions";
import { DELIVERY_DRIVER_OPTIONS, DELIVERY_VEHICLE_PLATE_OPTIONS } from "@/lib/delivery-options";
import { orderReference } from "@/lib/delivery-note-links";

export type PackedDeliveryOption = {
  id: string;
  pickingListNumber: string;
  pickerName: string | null;
  items: Array<{
    id: string;
    itemName: string;
    orderedQuantity: number;
    packedQuantity: number;
  }>;
  salesOrder: {
    orderNumber: string;
    customerPoNumber: string | null;
    customerId: string;
    customer: {
      id: string;
      name: string;
      companyName: string;
      phone: string;
      address: string;
    };
  };
};

const inputClass = "mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm disabled:bg-soft";

function toDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function CombinedDeliveryNoteForm({
  lists,
  initialPickingListId
}: {
  lists: PackedDeliveryOption[];
  initialPickingListId?: string;
}) {
  const initial = lists.find(list => list.id === initialPickingListId);
  const initialItems = initial?.items.filter(item => item.packedQuantity > 0) ?? [];
  const [customerId, setCustomerId] = useState(initial?.salesOrder.customerId ?? "");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
    initialItems.map(item => item.id)
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(
      lists.flatMap(list => list.items.map(item => [item.id, item.packedQuantity]))
    )
  );

  const customers = Array.from(
    new Map(lists.map(list => [list.salesOrder.customerId, list.salesOrder.customer])).values()
  );
  const available = lists.filter(list => list.salesOrder.customerId === customerId);
  const selectedItemSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const selectedLists = available.filter(list =>
    list.items.some(item => selectedItemSet.has(item.id))
  );
  const order = available[0]?.salesOrder;
  const selectedList = selectedLists[0] ?? initial;
  const selectedQuantity = available.reduce(
    (total, list) => total + list.items.reduce(
      (itemTotal, item) => itemTotal + (
        selectedItemSet.has(item.id) ? (quantities[item.id] ?? item.packedQuantity) : 0
      ),
      0
    ),
    0
  );

  function toggleItem(itemId: string, checked: boolean) {
    setSelectedItemIds(current =>
      checked
        ? Array.from(new Set([...current, itemId]))
        : current.filter(id => id !== itemId)
    );
  }

  function selectOrderItems(candidate: PackedDeliveryOption) {
    const candidateIds = candidate.items
      .filter(item => item.packedQuantity > 0)
      .map(item => item.id);
    setSelectedItemIds(current => Array.from(new Set([...current, ...candidateIds])));
  }

  function clearOrderItems(candidate: PackedDeliveryOption) {
    const candidateIds = new Set(candidate.items.map(item => item.id));
    setSelectedItemIds(current => current.filter(id => !candidateIds.has(id)));
  }

  return (
    <form action={createDeliveryNote} className="mt-6 space-y-5 border-t border-line pt-5">
      <input type="hidden" name="itemSelectionMode" value="explicit" />
      {selectedLists.map(list => (
        <input key={list.id} type="hidden" name="pickingListId" value={list.id} />
      ))}

      <div>
        <h3 className="text-lg font-semibold">Create Draft Surat Jalan</h3>
        <p className="mt-1 text-sm text-ink/70">
          Select packed items from one or more SO / Customer PO for the same customer and destination; invoices stay separate.
        </p>
      </div>

      <label className="block text-sm font-medium">
        Customer
        <select
          className={inputClass}
          required
          value={customerId}
          onChange={event => {
            setCustomerId(event.target.value);
            setSelectedItemIds([]);
          }}
        >
          <option value="">Select customer</option>
          {customers.map(customer => (
            <option key={customer.id} value={customer.id}>{customer.companyName}</option>
          ))}
        </select>
      </label>

      {order && (
        <p className="rounded-md bg-soft p-3 text-sm text-ink/70">
          One Surat Jalan uses one customer and destination. Unselected items from a selected order remain recorded as outstanding and cannot be placed in another Surat Jalan in this version.
        </p>
      )}

      <fieldset disabled={!customerId} className="space-y-4">
        <legend className="font-semibold">Packed items ready to ship</legend>
        {!available.length && (
          <p className="text-sm text-ink/70">Select a customer with completed Pick & Pack records.</p>
        )}

        {available.map(candidate => {
          const selectedInOrder = candidate.items.filter(item => selectedItemSet.has(item.id)).length;
          return (
            <section key={candidate.id} className="rounded-md border border-line">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-soft px-4 py-3">
                <div>
                  <p className="font-semibold">{orderReference(candidate.salesOrder)}</p>
                  <p className="text-xs text-ink/60">{candidate.pickingListNumber} · {selectedInOrder} item selected</p>
                </div>
                <div className="flex gap-3 text-xs font-semibold">
                  <button type="button" className="text-brand" onClick={() => selectOrderItems(candidate)}>
                    Select packed
                  </button>
                  <button type="button" className="text-ink/60" onClick={() => clearOrderItems(candidate)}>
                    Clear
                  </button>
                </div>
              </header>

              <div className="hidden grid-cols-[minmax(220px,1fr)_90px_90px_150px_110px] border-b border-line px-4 py-2 text-right text-xs font-semibold uppercase text-ink/50 md:grid">
                <span className="text-left">Item</span>
                <span>Ordered</span>
                <span>Packed</span>
                <span>Final send</span>
                <span>Outstanding</span>
              </div>

              <div className="divide-y divide-line">
                {candidate.items.map(item => {
                  const selected = selectedItemSet.has(item.id);
                  const quantity = quantities[item.id] ?? item.packedQuantity;
                  const outstanding = item.orderedQuantity - (selected ? quantity : 0);
                  return (
                    <div
                      key={item.id}
                      className={`grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(220px,1fr)_90px_90px_150px_110px] md:items-center ${selected ? "bg-white" : "bg-soft/40"}`}
                    >
                      <label className="flex items-start gap-3 font-medium">
                        <input
                          type="checkbox"
                          name="selectedItemId"
                          value={item.id}
                          checked={selected}
                          disabled={item.packedQuantity <= 0}
                          onChange={event => toggleItem(item.id, event.target.checked)}
                          className="mt-1"
                        />
                        <span>
                          {item.itemName}
                          {item.packedQuantity <= 0 && (
                            <span className="block text-xs font-normal text-amber-700">
                              Not selectable: packed quantity is zero
                            </span>
                          )}
                        </span>
                      </label>
                      <p className="text-right"><span className="md:hidden">Ordered: </span>{item.orderedQuantity}</p>
                      <p className="text-right"><span className="md:hidden">Packed: </span>{item.packedQuantity}</p>
                      <label className="flex items-center justify-end gap-2">
                        <span className="md:hidden">Send</span>
                        <input
                          name={"quantity_" + item.id}
                          type="number"
                          min={1}
                          max={item.packedQuantity}
                          required={selected}
                          disabled={!selected}
                          value={quantity}
                          onChange={event => {
                            const next = Number(event.target.value);
                            setQuantities(current => ({
                              ...current,
                              [item.id]: Math.max(1, Math.min(item.packedQuantity, next))
                            }));
                          }}
                          className="w-24 rounded-md border border-line bg-white px-2 py-1.5 text-right disabled:bg-soft"
                        />
                        <span>{item.packedQuantity > 0 ? "PCS" : ""}</span>
                      </label>
                      <p className="text-right font-semibold">
                        <span className="md:hidden">Outstanding: </span>{outstanding}
                      </p>
                    </div>
                  );
                })}
              </div>

            </section>
          );
        })}
      </fieldset>

      <p className="text-sm font-medium">
        {selectedItemIds.length} item(s) from {selectedLists.length} order(s) selected · {selectedQuantity} PCS final delivery quantity.
      </p>

      <fieldset disabled={!order} key={customerId} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-medium">
          Recipient
          <input name="recipientName" required defaultValue={order?.customer.name} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          Phone
          <input name="recipientPhone" defaultValue={order?.customer.phone} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          Delivery date
          <input name="deliveryDate" type="date" required defaultValue={toDateInputValue()} className={inputClass} />
        </label>
        <label className="text-sm font-medium md:col-span-2 xl:col-span-3">
          Recipient address
          <textarea name="recipientAddress" required defaultValue={order?.customer.address} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          Driver
          <select name="driverName" required defaultValue="" className={inputClass}>
            <option value="" disabled>Select driver</option>
            {DELIVERY_DRIVER_OPTIONS.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Vehicle plate
          <select name="vehiclePlateNumber" required defaultValue="" className={inputClass}>
            <option value="" disabled>Select vehicle plate</option>
            {DELIVERY_VEHICLE_PLATE_OPTIONS.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Sender
          <input
            key={selectedList?.id ?? "sender"}
            name="senderName"
            defaultValue={selectedList?.pickerName ?? ""}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium">
          Authorized by
          <input name="authorizedBy" className={inputClass} />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Delivery notes
          <input name="notes" className={inputClass} />
        </label>
      </fieldset>

      <CreateDraftButton disabled={!selectedItemIds.length} />
    </form>
  );
}

function CreateDraftButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={disabled || pending}
      className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Creating Draft..." : "Create Draft Surat Jalan"}
    </button>
  );
}
