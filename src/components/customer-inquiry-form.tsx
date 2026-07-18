"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

type Item = {
  productId: string;
  itemName: string;
  quantity: number;
  requestedPrice: number | "";
  agreedPrice: number | "";
  notes: string;
};

const inputClass = "mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export function CustomerInquiryForm({
  customers,
  products,
  action
}: {
  customers: { id: string; companyName: string; name: string }[];
  products: { id: string; productName: string; basePrice: number }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const updateItem = (index: number, patch: Partial<Item>) =>
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Customer
          <select name="customerId" required className={inputClass}>
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName} - {customer.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Needed By
          <input name="neededBy" type="date" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Inquiry Notes
          <input name="notes" placeholder="Optional customer request notes" className={inputClass} />
        </label>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="grid gap-3 rounded-md border border-line p-3 lg:grid-cols-[1.4fr_1.2fr_90px_130px_130px_1fr_44px]">
            <label className="text-sm font-medium text-slate-700">Product
              <select value={item.productId} onChange={(event) => {
                const product = products.find((candidate) => candidate.id === event.target.value);
                updateItem(index, { productId: event.target.value, itemName: product?.productName ?? "", agreedPrice: product?.basePrice ?? item.agreedPrice });
              }} className={inputClass}>
                <option value="">Not listed / unavailable</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.productName}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Requested Item
              <input required value={item.itemName} onChange={(event) => updateItem(index, { itemName: event.target.value })} className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">Qty
              <input required min={1} type="number" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">Requested Price
              <input min={0} type="number" value={item.requestedPrice} onChange={(event) => updateItem(index, { requestedPrice: event.target.value === "" ? "" : Number(event.target.value) })} className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">Agreed Price
              <input min={0} type="number" value={item.agreedPrice} onChange={(event) => updateItem(index, { agreedPrice: event.target.value === "" ? "" : Number(event.target.value) })} className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">Item Note
              <input value={item.notes} onChange={(event) => updateItem(index, { notes: event.target.value })} className={inputClass} />
            </label>
            <button type="button" title="Remove item" onClick={() => setItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))} className="mt-6 flex h-10 w-10 items-center justify-center rounded-md border border-line text-slate-500"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4">
        <button type="button" onClick={() => setItems((current) => [...current, emptyItem()])} className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand"><Plus className="h-4 w-4" />Add Item</button>
        <button className="h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white">Create Customer Inquiry</button>
      </div>
    </form>
  );
}

function emptyItem(): Item { return { productId: "", itemName: "", quantity: 1, requestedPrice: "", agreedPrice: "", notes: "" }; }
