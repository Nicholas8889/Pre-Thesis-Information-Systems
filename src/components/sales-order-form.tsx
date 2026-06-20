"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";

type CustomerOption = {
  id: string;
  companyName: string;
  name: string;
};

type DraftItem = {
  itemName: string;
  quantity: number;
  unitPrice: number;
};

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export function SalesOrderForm({
  customers,
  action,
  disabled = false,
  restrictionMessage = ""
}: {
  customers: CustomerOption[];
  action: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
  restrictionMessage?: string;
}) {
  const [paymentTermType, setPaymentTermType] = useState("DEBIT");
  const [items, setItems] = useState<DraftItem[]>([
    { itemName: "", quantity: 1, unitPrice: 0 }
  ]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  );

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function addItem() {
    setItems((current) => [...current, { itemName: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    setItems((current) =>
      current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  return (
    <div className={disabled ? "group/form-restriction relative" : ""}>
      {disabled && <RestrictionTooltip message={restrictionMessage} />}
      <form action={action}>
        <fieldset disabled={disabled} className="space-y-4 disabled:cursor-not-allowed disabled:opacity-60">
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Customer
          <select name="customerId" required className={`${inputClass} mt-1`}>
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName} - {customer.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Notes
          <input name="notes" className={`${inputClass} mt-1`} placeholder="Optional" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Payment Method / Term
          <select
            name="paymentTermType"
            required
            value={paymentTermType}
            onChange={(event) => setPaymentTermType(event.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="DEBIT">Debit</option>
            <option value="CREDIT">Credit</option>
          </select>
        </label>

        {paymentTermType === "CREDIT" && (
          <label className="text-sm font-medium text-slate-700">
            Credit Term
            <select name="creditTermMonths" required className={`${inputClass} mt-1`}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>
                  {month} Month{month === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-[1fr_110px_150px_150px_44px]">
            <label className="text-sm font-medium text-slate-700">
              Item Name
              <input
                required
                value={item.itemName}
                onChange={(event) => updateItem(index, { itemName: event.target.value })}
                className={`${inputClass} mt-1`}
                placeholder="Product or service"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Qty
              <input
                required
                min={1}
                type="number"
                value={item.quantity}
                onChange={(event) =>
                  updateItem(index, { quantity: Number(event.target.value) })
                }
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Unit Price
              <input
                required
                min={0}
                type="number"
                value={item.unitPrice}
                onChange={(event) =>
                  updateItem(index, { unitPrice: Number(event.target.value) })
                }
                className={`${inputClass} mt-1`}
              />
            </label>

            <div className="text-sm font-medium text-slate-700">
              Subtotal
              <div className="mt-1 flex h-10 items-center rounded-md border border-line bg-slate-50 px-3">
                {formatCurrency(item.quantity * item.unitPrice)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => removeItem(index)}
              className="mt-6 flex h-10 w-10 items-center justify-center rounded-md border border-line text-slate-500"
              title="Remove item"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={addItem}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add Item
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-base font-semibold">Total: {formatCurrency(total)}</p>
          <button className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
            Create Sales Order
          </button>
        </div>
      </div>
        </fieldset>
      </form>
    </div>
  );
}

function RestrictionTooltip({ message }: { message: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-72 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-center text-xs font-medium leading-5 text-white shadow-lg group-hover/form-restriction:block">
      {message}
    </span>
  );
}
