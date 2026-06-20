"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";

type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  paymentTermLabel: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
};

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export function PaymentForm({
  invoices,
  action,
  today,
  initialInvoiceId,
  disabled = false,
  restrictionMessage = ""
}: {
  invoices: InvoiceOption[];
  action: (formData: FormData) => void | Promise<void>;
  today: string;
  initialInvoiceId?: string;
  disabled?: boolean;
  restrictionMessage?: string;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(
    initialInvoiceId && invoices.some((invoice) => invoice.id === initialInvoiceId)
      ? initialInvoiceId
      : invoices[0]?.id ?? ""
  );
  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId),
    [invoices, selectedInvoiceId]
  );

  return (
    <div className={disabled ? "group/form-restriction relative" : ""}>
      {disabled && <RestrictionTooltip message={restrictionMessage} />}
      <form action={action}>
        <fieldset disabled={disabled} className="grid gap-4 disabled:cursor-not-allowed disabled:opacity-60 md:grid-cols-2 xl:grid-cols-5">
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Invoice
        <select
          name="invoiceId"
          required
          value={selectedInvoiceId}
          onChange={(event) => setSelectedInvoiceId(event.target.value)}
          className={`${inputClass} mt-1`}
        >
          <option value="">Select invoice</option>
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.invoiceNumber} - {invoice.customerName} -{" "}
              {formatCurrency(invoice.remainingAmount)} remaining
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm font-medium text-slate-700">
        Payment Date
        <input
          name="paymentDate"
          type="date"
          defaultValue={today}
          required
          className={`${inputClass} mt-1`}
        />
      </label>

      <label className="text-sm font-medium text-slate-700">
        Amount
        <input
          name="amount"
          type="number"
          min={1}
          max={selectedInvoice?.remainingAmount}
          required
          className={`${inputClass} mt-1`}
          placeholder={selectedInvoice ? formatCurrency(selectedInvoice.remainingAmount) : "0"}
        />
      </label>

      <label className="text-sm font-medium text-slate-700">
        Method
        <select name="paymentMethod" className={`${inputClass} mt-1`} defaultValue="BankTransfer">
          <option value="Cash">Cash</option>
          <option value="BankTransfer">Bank Transfer</option>
          <option value="Other">Other</option>
        </select>
      </label>

      {selectedInvoice && (
        <div className="rounded-md border border-line bg-slate-50 px-3 py-2 text-sm xl:col-span-5">
          <span className="font-semibold">{selectedInvoice.invoiceNumber}</span>{" "}
          {selectedInvoice.paymentTermLabel}, total {formatCurrency(selectedInvoice.totalAmount)}, paid{" "}
          {formatCurrency(selectedInvoice.paidAmount)}, remaining{" "}
          {formatCurrency(selectedInvoice.remainingAmount)}.
        </div>
      )}

      <label className="text-sm font-medium text-slate-700 xl:col-span-4">
        Notes
        <input name="notes" className={`${inputClass} mt-1`} placeholder="Optional" />
      </label>

      <div className="flex items-end">
        <button className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
          Record Payment
        </button>
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
