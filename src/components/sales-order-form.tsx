"use client";

import { CircleHelp, FileUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { calculateAdjustedUnitPrice } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";

type CustomerOption = {
  id: string;
  companyName: string;
  name: string;
  category: string;
};

type ProductOption = {
  id: string;
  productName: string;
  basePrice: number;
};

type DraftItem = {
  productId: string;
  itemName: string;
  quantity: number;
  basePrice: number;
  markupPercent: number | "";
  discountPercent: number | "";
};

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export function SalesOrderForm({
  customers,
  products,
  action,
  transactionType = "SALES_ORDER",
  inquiryId = "",
  initialCustomerId = "",
  initialItems,
  disabled = false,
  restrictionMessage = ""
}: {
  customers: CustomerOption[];
  products: ProductOption[];
  action: (formData: FormData) => void | Promise<void>;
  transactionType?: "SALES_ORDER" | "PRE_ORDER";
  inquiryId?: string;
  initialCustomerId?: string;
  initialItems?: DraftItem[];
  disabled?: boolean;
  restrictionMessage?: string;
}) {
  const isPreOrder = transactionType === "PRE_ORDER";
  const [paymentTermType, setPaymentTermType] = useState("DEBIT");
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId);
  const [items, setItems] = useState<DraftItem[]>(initialItems?.length ? initialItems : [createEmptyItem()]);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const serializedItems = items.map((item) => ({
    ...item,
    markupPercent: Number(item.markupPercent || 0),
    discountPercent: Number(item.discountPercent || 0),
    unitPrice: getUnitPrice(item)
  }));

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * getUnitPrice(item), 0),
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
    setItems((current) => [...current, createEmptyItem()]);
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((option) => option.id === productId);
    updateItem(index, {
      productId,
      itemName: product?.productName ?? "",
      basePrice: product?.basePrice ?? 0
    });
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
      <input type="hidden" name="items" value={JSON.stringify(serializedItems)} />
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="transactionType" value={transactionType} />

      {isPreOrder && (
        <div className="grid gap-4 rounded-md border border-blue-200 bg-blue-50 p-4 md:grid-cols-2">
          <div className="text-sm font-medium text-slate-700">
            Generated IDs
            <div className="mt-1 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              Sales Order ID and PO ID are generated after save.
            </div>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Pre Orders receive both an SO number and a PO number.
            </span>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Product Required Date
            <input
              name="requiredDate"
              type="date"
              required
              className={`${inputClass} mt-1 bg-white`}
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              The system will remind users as this processing date approaches.
            </span>
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            PO Document
            <span className="mt-1 flex min-h-12 items-center gap-3 rounded-md border border-dashed border-blue-300 bg-white px-3 py-2">
              <FileUp aria-hidden="true" className="h-5 w-5 shrink-0 text-brand" />
              <input
                name="poDocument"
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </span>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              PDF, JPG, PNG, DOC, or DOCX. Maximum file size 8 MB.
            </span>
          </label>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Customer
          <select
            name="customerId"
            required
            value={selectedCustomerId}
            onChange={(event) => setSelectedCustomerId(event.target.value)}
            className={`${inputClass} mt-1`}
          >
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
          <div key={index} className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,1.4fr)_90px_140px_110px_110px_150px_150px_44px]">
            <label className="text-sm font-medium text-slate-700">
              Product Name
              <select
                required
                value={item.productId}
                onChange={(event) => selectProduct(index, event.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.productName}
                  </option>
                ))}
              </select>
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
              Base Price
              <input
                required
                min={0}
                step={1}
                type="number"
                value={item.basePrice}
                onChange={(event) =>
                  updateItem(index, { basePrice: Number(event.target.value) })
                }
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Markup (%)
              <input
                min={0}
                max={100}
                step={1}
                type="number"
                value={item.markupPercent}
                placeholder="Optional"
                onChange={(event) =>
                  updateItem(index, {
                    markupPercent: event.target.value === "" ? "" : Number(event.target.value)
                  })
                }
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Discount (%)
              <input
                min={0}
                max={100}
                step={1}
                type="number"
                value={item.discountPercent}
                placeholder="Optional"
                onChange={(event) =>
                  updateItem(index, {
                    discountPercent: event.target.value === "" ? "" : Number(event.target.value)
                  })
                }
                className={`${inputClass} mt-1`}
              />
            </label>

            <div className="text-sm font-medium text-slate-700">
              <span className="flex items-center gap-1.5">
                Unit Price
                <span
                  className="group/price-help relative inline-flex"
                  tabIndex={0}
                  aria-label={`Customer category: ${selectedCustomer?.category ?? "Select a customer first"}`}
                >
                  <CircleHelp aria-hidden="true" className="h-4 w-4 text-slate-400" />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-52 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-center text-xs font-medium text-white shadow-lg group-hover/price-help:block group-focus/price-help:block">
                    Customer category: {selectedCustomer?.category ?? "Select a customer first"}
                  </span>
                </span>
              </span>
              <div className="mt-1 flex h-10 items-center rounded-md border border-line bg-slate-50 px-3">
                {formatCurrency(getUnitPrice(item))}
              </div>
            </div>

            <div className="text-sm font-medium text-slate-700">
              Subtotal
              <div className="mt-1 flex h-10 items-center rounded-md border border-line bg-slate-50 px-3">
                {formatCurrency(item.quantity * getUnitPrice(item))}
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
            {isPreOrder ? "Create Pre Order" : "Create Sales Order"}
          </button>
        </div>
      </div>
        </fieldset>
      </form>
    </div>
  );
}

function createEmptyItem(): DraftItem {
  return {
    productId: "",
    itemName: "",
    quantity: 1,
    basePrice: 0,
    markupPercent: "",
    discountPercent: ""
  };
}

function getUnitPrice(item: DraftItem) {
  return calculateAdjustedUnitPrice(
    item.basePrice,
    Number(item.markupPercent || 0),
    Number(item.discountPercent || 0)
  );
}

function RestrictionTooltip({ message }: { message: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-72 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-center text-xs font-medium leading-5 text-white shadow-lg group-hover/form-restriction:block">
      {message}
    </span>
  );
}
