"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DELIVERY_DRIVER_OPTIONS,
  DELIVERY_VEHICLE_PLATE_OPTIONS
} from "@/lib/delivery-options";

type CustomerOption = {
  id: string;
  name: string;
  companyName: string;
  phone: string;
  address: string;
};

type DeliveryNoteItemDraft = {
  productCode: string;
  itemName: string;
  quantity: number;
  unit: string;
  description: string;
};

type SourceItem = {
  itemName: string;
  quantity: number;
};

type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentTermType: string;
  paymentTermLabel: string;
  canCreateDeliveryNote: boolean;
  customerId: string;
  salesOrderId: string;
  customerName: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  items: SourceItem[];
};

type SalesOrderOption = {
  id: string;
  orderNumber: string;
  customerPoNumber?: string | null;
  source: string;
  customerId: string;
  customerName: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  items: SourceItem[];
};

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

const unitOptions = ["PCS", "ROLL", "KG", "BOX", "OTHER"];

export function DeliveryNoteForm({
  customers,
  invoices,
  salesOrders,
  action,
  today,
  initialInvoiceId = "",
  initialSalesOrderId = "",
  disabled = false,
  restrictionMessage = ""
}: {
  customers: CustomerOption[];
  invoices: InvoiceOption[];
  salesOrders: SalesOrderOption[];
  action: (formData: FormData) => void | Promise<void>;
  today: string;
  initialInvoiceId?: string;
  initialSalesOrderId?: string;
  disabled?: boolean;
  restrictionMessage?: string;
}) {
  const initialInvoice = invoices.find((invoice) => invoice.id === initialInvoiceId);
  const initialSalesOrder =
    salesOrders.find((order) => order.id === initialSalesOrderId) ??
    salesOrders.find((order) => order.id === initialInvoice?.salesOrderId);
  const initialCustomer = customers.find(
    (customer) =>
      customer.id === initialInvoice?.customerId ||
      customer.id === initialSalesOrder?.customerId
  );

  const [selectedInvoiceId, setSelectedInvoiceId] = useState(initialInvoice?.id ?? "");
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState(
    initialInvoice?.salesOrderId ?? initialSalesOrder?.id ?? ""
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomer?.id ?? "");
  const [recipientName, setRecipientName] = useState(
    initialInvoice?.recipientName ?? initialSalesOrder?.recipientName ?? initialCustomer?.name ?? ""
  );
  const [recipientPhone, setRecipientPhone] = useState(
    initialInvoice?.recipientPhone ??
      initialSalesOrder?.recipientPhone ??
      initialCustomer?.phone ??
      ""
  );
  const [recipientAddress, setRecipientAddress] = useState(
    initialInvoice?.recipientAddress ??
      initialSalesOrder?.recipientAddress ??
      initialCustomer?.address ??
      ""
  );
  const [items, setItems] = useState<DeliveryNoteItemDraft[]>(
    sourceItemsToDraft(initialInvoice?.items ?? initialSalesOrder?.items ?? [])
  );

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId),
    [invoices, selectedInvoiceId]
  );
  const isImmediatePaymentBlocked = Boolean(selectedInvoice && !selectedInvoice.canCreateDeliveryNote);

  function applyCustomer(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);
    setSelectedCustomerId(customerId);
    if (customer) {
      setRecipientName(customer.name);
      setRecipientPhone(customer.phone);
      setRecipientAddress(customer.address);
    }
  }

  function applyInvoice(invoiceId: string) {
    const invoice = invoices.find((item) => item.id === invoiceId);
    setSelectedInvoiceId(invoiceId);
    if (!invoice) {
      return;
    }

    setSelectedSalesOrderId(invoice.salesOrderId);
    setSelectedCustomerId(invoice.customerId);
    setRecipientName(invoice.recipientName);
    setRecipientPhone(invoice.recipientPhone);
    setRecipientAddress(invoice.recipientAddress);
    setItems(sourceItemsToDraft(invoice.items));
  }

  function applySalesOrder(salesOrderId: string) {
    const salesOrder = salesOrders.find((item) => item.id === salesOrderId);
    setSelectedSalesOrderId(salesOrderId);
    setSelectedInvoiceId("");
    if (!salesOrder) {
      return;
    }

    setSelectedCustomerId(salesOrder.customerId);
    setRecipientName(salesOrder.recipientName);
    setRecipientPhone(salesOrder.recipientPhone);
    setRecipientAddress(salesOrder.recipientAddress);
    setItems(sourceItemsToDraft(salesOrder.items));
  }

  function updateItem(index: number, patch: Partial<DeliveryNoteItemDraft>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      { productCode: "", itemName: "", quantity: 1, unit: "PCS", description: "" }
    ]);
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
        <fieldset disabled={disabled} className="space-y-5 disabled:cursor-not-allowed disabled:opacity-60">
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-medium text-ink">
          Invoice
          <select
            name="invoiceId"
            value={selectedInvoiceId}
            onChange={(event) => applyInvoice(event.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="">No invoice link</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoiceNumber} - {invoice.customerName} - {invoice.paymentTermLabel} -{" "}
                {invoice.status}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-ink">
          Sales Order
          <select
            name="salesOrderId"
            value={selectedSalesOrderId}
            onChange={(event) => applySalesOrder(event.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="">No sales order link</option>
            {salesOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber}
                {order.source === "CUSTOMER_PO" && order.customerPoNumber
                  ? ` / ${order.customerPoNumber}`
                  : ""}{" "}
                - {order.customerName}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-ink">
          Customer
          <select
            name="customerId"
            required
            value={selectedCustomerId}
            onChange={(event) => applyCustomer(event.target.value)}
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
      </div>

      {isImmediatePaymentBlocked ? (
        <div className="rounded-md bg-warning px-4 py-3 text-sm font-medium text-strong">
          An immediate-payment order must be paid before Surat Jalan can be created.
        </div>
      ) : (
        selectedInvoice &&
        selectedInvoice.paymentTermType === "CREDIT" &&
        selectedInvoice.status !== "Paid" && (
          <div className="rounded-md bg-warning px-4 py-3 text-sm font-medium text-strong">
            Credit order: Surat Jalan can be created before full payment.
          </div>
        )
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium text-ink">
          Recipient Name
          <input
            name="recipientName"
            required
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>

        <label className="text-sm font-medium text-ink">
          Recipient Phone
          <input
            name="recipientPhone"
            value={recipientPhone}
            onChange={(event) => setRecipientPhone(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>

        <label className="text-sm font-medium text-ink">
          Delivery Date
          <input
            name="deliveryDate"
            type="date"
            required
            defaultValue={today}
            className={`${inputClass} mt-1`}
          />
        </label>

        <label className="text-sm font-medium text-ink">
          Driver Name
          <select
            name="driverName"
            required
            defaultValue=""
            className={`${inputClass} mt-1`}
          >
            <option value="" disabled>
              Select driver
            </option>
            {DELIVERY_DRIVER_OPTIONS.map((driverName) => (
              <option key={driverName} value={driverName}>
                {driverName}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-ink">
          Vehicle Plate Number
          <select
            name="vehiclePlateNumber"
            required
            defaultValue=""
            className={`${inputClass} mt-1`}
          >
            <option value="" disabled>
              Select vehicle plate
            </option>
            {DELIVERY_VEHICLE_PLATE_OPTIONS.map((vehiclePlateNumber) => (
              <option key={vehiclePlateNumber} value={vehiclePlateNumber}>
                {vehiclePlateNumber}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-ink">
          Sender Name
          <input name="senderName" className={`${inputClass} mt-1`} />
        </label>

        <label className="text-sm font-medium text-ink md:col-span-2">
          Recipient Address
          <input
            name="recipientAddress"
            required
            value={recipientAddress}
            onChange={(event) => setRecipientAddress(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>

        <label className="text-sm font-medium text-ink">
          Authorized By
          <input name="authorizedBy" className={`${inputClass} mt-1`} />
        </label>

        <label className="text-sm font-medium text-ink">
          Receiver Name
          <input name="receiverName" className={`${inputClass} mt-1`} />
        </label>

        <label className="text-sm font-medium text-ink md:col-span-2 xl:col-span-4">
          Notes
          <input name="notes" className={`${inputClass} mt-1`} placeholder="Optional" />
        </label>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-md border border-line p-3 xl:grid-cols-[130px_1fr_100px_120px_1fr_44px]"
          >
            <label className="text-sm font-medium text-ink">
              Product Code
              <input
                value={item.productCode}
                onChange={(event) => updateItem(index, { productCode: event.target.value })}
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className="text-sm font-medium text-ink">
              Product Name
              <input
                required
                value={item.itemName}
                onChange={(event) => updateItem(index, { itemName: event.target.value })}
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className="text-sm font-medium text-ink">
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

            <label className="text-sm font-medium text-ink">
              Unit
              <select
                value={item.unit}
                onChange={(event) => updateItem(index, { unit: event.target.value })}
                className={`${inputClass} mt-1`}
              >
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-ink">
              Keterangan
              <input
                value={item.description}
                onChange={(event) => updateItem(index, { description: event.target.value })}
                className={`${inputClass} mt-1`}
              />
            </label>

            <button
              type="button"
              onClick={() => removeItem(index)}
              className="mt-6 flex h-10 w-10 items-center justify-center rounded-md border border-line text-ink/70"
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

        <button
          disabled={isImmediatePaymentBlocked}
          className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink/25"
        >
          Save Surat Jalan
        </button>
      </div>
        </fieldset>
      </form>
    </div>
  );
}

function RestrictionTooltip({ message }: { message: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-72 -translate-x-1/2 rounded-md bg-strong px-3 py-2 text-center text-xs font-medium leading-5 text-white shadow-lg group-hover/form-restriction:block">
      {message}
    </span>
  );
}

function sourceItemsToDraft(items: SourceItem[]): DeliveryNoteItemDraft[] {
  if (items.length === 0) {
    return [{ productCode: "", itemName: "", quantity: 1, unit: "PCS", description: "" }];
  }

  return items.map((item) => ({
    productCode: "",
    itemName: item.itemName,
    quantity: item.quantity,
    unit: "PCS",
    description: ""
  }));
}
