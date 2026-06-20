import { clsx } from "clsx";

const statusStyles: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Inactive: "bg-slate-100 text-slate-600 ring-slate-200",
  Draft: "bg-slate-100 text-slate-700 ring-slate-200",
  Confirmed: "bg-blue-50 text-blue-700 ring-blue-200",
  Shipped: "bg-slate-100 text-slate-700 ring-slate-200",
  Invoiced: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  Issued: "bg-blue-50 text-blue-700 ring-blue-200",
  Delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
  Unpaid: "bg-amber-50 text-amber-800 ring-amber-200",
  Partial: "bg-blue-50 text-blue-700 ring-blue-200",
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Overdue: "bg-rose-50 text-rose-700 ring-rose-200",
  Planned: "bg-amber-50 text-amber-800 ring-amber-200",
  Done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Pending: "bg-amber-50 text-amber-800 ring-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  NotRequired: "bg-slate-100 text-slate-600 ring-slate-200",
  "Late Payment": "bg-rose-50 text-rose-700 ring-rose-200",
  "Historically Late": "bg-amber-50 text-amber-800 ring-amber-200"
};

const statusDescriptions: Record<string, string> = {
  Active: "Customer can be used in transactions",
  Inactive: "Customer is not currently used",
  Draft: "Sales order is not confirmed yet",
  Confirmed: "Sales order is ready for invoice generation",
  Shipped: "Sales order has been shipped",
  Invoiced: "Sales order already has an invoice",
  Issued: "Surat Jalan has been issued",
  Delivered: "Delivery has been completed",
  Cancelled: "Record is cancelled",
  Unpaid: "No payment has been recorded",
  Partial: "Some payment has been recorded but balance remains",
  Paid: "Invoice has been fully paid",
  Overdue: "Due date has passed and balance remains",
  Planned: "Billing activity is scheduled",
  Done: "Billing activity is completed",
  Pending: "Waiting for Manager approval",
  Approved: "Approved by a Manager",
  Rejected: "Rejected by a Manager",
  NotRequired: "Manager approval is not required",
  "Late Payment": "Customer currently has overdue unpaid receivables",
  "Historically Late": "Customer has paid an invoice after its due date"
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      title={statusDescriptions[status] ?? status}
      className={clsx(
        "inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        statusStyles[status] ?? "bg-slate-100 text-slate-700 ring-slate-200"
      )}
    >
      {status}
    </span>
  );
}
