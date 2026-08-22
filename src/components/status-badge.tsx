import { clsx } from "clsx";

const statusStyles: Record<string, string> = {
  Active: "bg-success text-white",
  Inactive: "bg-canvas text-ink",
  Draft: "bg-canvas text-ink",
  Open: "bg-info text-white",
  Confirmed: "bg-info text-white",
  Shipped: "bg-info text-white",
  Invoiced: "bg-info text-white",
  Issued: "bg-info text-white",
  Partial: "bg-info text-white",
  Delivered: "bg-success text-white",
  Paid: "bg-success text-white",
  Done: "bg-success text-white",
  Approved: "bg-success text-white",
  "Converted to Customer PO": "bg-success text-white",
  "Converted to SO": "bg-success text-white",
  Unpaid: "bg-warning text-strong",
  Planned: "bg-warning text-strong",
  Pending: "bg-warning text-strong",
  "Historically Late": "bg-warning text-strong",
  Overdue: "bg-danger text-white",
  Rejected: "bg-danger text-white",
  Cancelled: "bg-danger text-white",
  "Late Payment": "bg-danger text-white",
  "Payment risk": "bg-danger text-white",
  Closed: "bg-canvas text-ink",
  NotRequired: "bg-canvas text-ink"
};

const statusDescriptions: Record<string, string> = {
  Active: "Customer can be used in orders",
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
  Planned: "Collections activity is scheduled",
  Done: "Collections activity is completed",
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
        "inline-flex whitespace-nowrap rounded-md px-2.5 py-1 text-left text-xs font-semibold",
        statusStyles[status] ?? "bg-canvas text-ink"
      )}
    >
      {status}
    </span>
  );
}
