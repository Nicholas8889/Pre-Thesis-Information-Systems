"use client";

import Link from "next/link";
import { useState } from "react";
import type { CollectionTaskStatus } from "@prisma/client";
import { createCollectionTask, updateCollectionTask } from "@/lib/actions";
import { MAX_ACTION_NOTE_LENGTH } from "@/lib/action-notes";
import { formatCurrency } from "@/lib/format";

type CollectionTaskFormProps = {
  customers: Array<{ id: string; companyName: string; name: string }>;
  invoices: Array<{ id: string; customerId: string; invoiceNumber: string; companyName: string; remainingAmount: number }>;
  customerId?: string;
  invoiceId?: string;
  scheduledDate: string;
  notes: string;
  task?: {
    id: string;
    version: number;
    status: CollectionTaskStatus;
    customerName: string;
    invoiceNumber?: string;
    salesOrderId?: string;
  };
};

const inputClass = "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export function CollectionTaskForm({
  customers, invoices, customerId, invoiceId, scheduledDate, notes, task
}: CollectionTaskFormProps) {
  const [status, setStatus] = useState<CollectionTaskStatus>(task?.status ?? "Planned");
  const readOnly = Boolean(task && task.status !== "Planned");
  const requiresReason = Boolean(task && status !== "Planned");

  return (
    <form
      action={task ? updateCollectionTask : createCollectionTask}
      data-no-action-confirmation={task ? "true" : undefined}
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      {task && !readOnly && <>
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="expectedVersion" value={task.version} />
      </>}
      <fieldset disabled={readOnly} className="contents disabled:text-ink/70">
        <label className="text-sm font-medium text-ink">
          Customer
          {task ? (
            <input readOnly value={task.customerName} className={`${inputClass} mt-1 bg-soft`} />
          ) : (
            <select name="customerId" required defaultValue={customerId ?? ""} className={`${inputClass} mt-1`}>
              <option value="">Select customer</option>
              {customers.map(customer => <option key={customer.id} value={customer.id}>
                {customer.companyName} - {customer.name}
              </option>)}
            </select>
          )}
        </label>
        <label className="text-sm font-medium text-ink">
          Invoice
          {task ? (
            <input readOnly value={task.invoiceNumber ?? "No invoice link"} className={`${inputClass} mt-1 bg-soft`} />
          ) : (
            <select name="invoiceId" defaultValue={invoiceId ?? ""} className={`${inputClass} mt-1`}>
              <option value="">No invoice link</option>
              {invoices.map(invoice => <option key={invoice.id} value={invoice.id}>
                {invoice.invoiceNumber} - {invoice.companyName} - {formatCurrency(invoice.remainingAmount)} remaining
              </option>)}
            </select>
          )}
        </label>
        <label className="text-sm font-medium text-ink">
          Scheduled Date
          <input name="scheduledDate" type="date" required defaultValue={scheduledDate} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium text-ink">
          Status
          <select name="status" value={status} onChange={event => setStatus(event.target.value as CollectionTaskStatus)} className={`${inputClass} mt-1`}>
            <option value="Planned">Planned</option>
            {task && <>
              <option value="Done">Done</option>
              <option value="Cancelled">Cancelled</option>
            </>}
          </select>
        </label>
        <label className="text-sm font-medium text-ink xl:col-span-3">
          Notes
          <input name="notes" required defaultValue={notes} className={`${inputClass} mt-1`} />
        </label>
        {!readOnly && <div className="order-2 flex items-end md:order-none">
          <button className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
            {task ? "Save Changes" : "Add Collection Task"}
          </button>
        </div>}
        {task && !readOnly && <label className="text-sm font-medium text-ink md:col-span-2 xl:col-span-4">
          Reason {requiresReason ? "(required)" : "(optional)"}
          <input
            name="confirmationNote"
            required={requiresReason}
            maxLength={MAX_ACTION_NOTE_LENGTH}
            placeholder={requiresReason ? "Explain why this task is completed or cancelled" : "Optional reason for this update"}
            className={`${inputClass} mt-1`}
          />
        </label>}
      </fieldset>
      {task && <div className="order-3 flex flex-wrap items-center gap-4 text-sm font-semibold text-brand md:order-none md:col-span-2 xl:col-span-4">
        <Link href="/collections#collection-task-form">Back to Add Task</Link>
        {task.salesOrderId && <Link href={`/sales-orders/${task.salesOrderId}`}>View Sales Order</Link>}
      </div>}
      {readOnly && <p className="text-sm text-ink/70 md:col-span-2 xl:col-span-4">This task is closed. Its schedule, notes, and status are read-only.</p>}
    </form>
  );
}
