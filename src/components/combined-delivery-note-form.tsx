
"use client";
import { useState } from "react";
import { createDeliveryNote } from "@/lib/actions";
import { DELIVERY_DRIVER_OPTIONS, DELIVERY_VEHICLE_PLATE_OPTIONS } from "@/lib/delivery-options";
import { orderReference } from "@/lib/delivery-note-links";

export type PackedDeliveryOption = {
  id: string;
  pickingListNumber: string;
  packageCount: number | null;
  packerName: string | null;
  items: Array<{ itemName: string; packedQuantity: number }>;
  salesOrder: {
    orderNumber: string;
    customerPoNumber: string | null;
    customerId: string;
    customer: { id: string; name: string; companyName: string; phone: string; address: string };
  };
};
const inputClass = "mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm disabled:bg-soft";
function toDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function CombinedDeliveryNoteForm({ lists, initialPickingListId }: { lists: PackedDeliveryOption[]; initialPickingListId?: string }) {
  const initial = lists.find(list => list.id === initialPickingListId);
  const [customerId, setCustomerId] = useState(initial?.salesOrder.customerId ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(initial ? [initial.id] : []);
  const customers = Array.from(new Map(lists.map(list => [list.salesOrder.customerId, list.salesOrder.customer])).values());
  const available = lists.filter(list => list.salesOrder.customerId === customerId);
  const order = available[0]?.salesOrder;
  return (
          <form
            action={createDeliveryNote}
            className="mt-6 space-y-4 border-t border-line pt-5"
          >
            <h3 className="text-lg font-semibold">Create Surat Jalan</h3>
            <p className="text-sm text-ink/70">
              Combine fully packed orders for one customer and one destination.
            </p>

            <label className="block text-sm font-medium">
              Customer
              <select className={inputClass} required value={customerId} onChange={event => {
                setCustomerId(event.target.value); setSelectedIds([]);
              }}>
                <option value="">Select customer</option>
                {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
              </select>
            </label>
            {order && <p className="text-sm text-ink/70">Set one delivery address below for every selected order. Use a separate Surat Jalan for another destination.</p>}
            <fieldset disabled={!customerId} className="space-y-3">
              <legend className="font-semibold">Packed SO / Customer PO</legend>
              {!available.length && <p className="text-sm text-ink/70">Select a customer with packed orders ready for delivery.</p>}
              {available.map(candidate => (
                <label key={candidate.id} className="flex items-start gap-3 rounded-md border border-line p-3 text-sm">
                  <input type="checkbox" name="pickingListId" value={candidate.id}
                    checked={selectedIds.includes(candidate.id)}
                    onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, candidate.id] : ids.filter(id => id !== candidate.id))} />
                  <span><strong>{orderReference(candidate.salesOrder)}</strong> · {candidate.pickingListNumber}
                    <span className="block text-ink/70">{candidate.items.map(item => item.itemName + " × " + item.packedQuantity + " PCS").join(", ")} · {candidate.packageCount} koli</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-sm font-medium">{selectedIds.length} order(s) selected. Each order will be shipped in full; invoices stay separate.</p>

            <fieldset disabled={!order} key={customerId} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm font-medium">
                Recipient
                <input
                  name="recipientName"
                  required
                  defaultValue={order?.customer.name}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium">
                Phone
                <input
                  name="recipientPhone"
                  defaultValue={order?.customer.phone}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium">
                Delivery date
                <input
                  name="deliveryDate"
                  type="date"
                  required
                  defaultValue={toDateInputValue()}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium md:col-span-2 xl:col-span-3">
                Recipient address
                <textarea
                  name="recipientAddress"
                  required
                  defaultValue={order?.customer.address}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium">
                Driver
                <select
                  name="driverName"
                  required
                  defaultValue=""
                  className={inputClass}
                >
                  <option value="" disabled>
                    Select driver
                  </option>
                  {DELIVERY_DRIVER_OPTIONS.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Vehicle plate
                <select
                  name="vehiclePlateNumber"
                  required
                  defaultValue=""
                  className={inputClass}
                >
                  <option value="" disabled>
                    Select vehicle plate
                  </option>
                  {DELIVERY_VEHICLE_PLATE_OPTIONS.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Sender
                <input
                  name="senderName"
                  defaultValue={initial?.packerName ?? ""}
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
            <button disabled={!selectedIds.length} className="disabled:opacity-50 inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
              Issue Surat Jalan
            </button>
          </form>
  );
}
