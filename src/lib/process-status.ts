export const ONGOING_INVOICE_STATUSES = ["Unpaid", "Partial", "Overdue"] as const;
export const DONE_INVOICE_STATUSES = ["Paid", "Cancelled"] as const;

export const ONGOING_SALES_ORDER_STATUSES = ["Draft", "Confirmed", "Invoiced"] as const;
export const DONE_SALES_ORDER_STATUSES = ["Shipped", "Cancelled"] as const;

const ongoingDeliveryNoteStatuses = ["Draft", "Issued"];
const doneDeliveryNoteStatuses = ["Delivered", "Cancelled"];

export const ONGOING_COLLECTION_TASK_STATUSES = ["Planned"] as const;
export const DONE_COLLECTION_TASK_STATUSES = ["Done", "Cancelled"] as const;

export function isOngoingInvoice(status: string) {
  return ONGOING_INVOICE_STATUSES.some((ongoingStatus) => ongoingStatus === status);
}

export function isDoneInvoice(status: string) {
  return DONE_INVOICE_STATUSES.some((doneStatus) => doneStatus === status);
}

type SalesOrderProcessInput =
  | string
  | {
      status: string;
      deliveryNoteCount?: number;
    };

export function isOngoingSalesOrder(input: SalesOrderProcessInput) {
  const { status, deliveryNoteCount } = normalizeSalesOrderProcessInput(input);

  return ONGOING_SALES_ORDER_STATUSES.some((ongoingStatus) => ongoingStatus === status) && deliveryNoteCount === 0;
}

export function isDoneSalesOrder(input: SalesOrderProcessInput) {
  const { status, deliveryNoteCount } = normalizeSalesOrderProcessInput(input);

  return DONE_SALES_ORDER_STATUSES.some((doneStatus) => doneStatus === status) || deliveryNoteCount > 0;
}

export function isOngoingDeliveryNote(status: string) {
  return ongoingDeliveryNoteStatuses.includes(status);
}

export function isDoneDeliveryNote(status: string) {
  return doneDeliveryNoteStatuses.includes(status);
}

export function isOngoingReceivable({
  status,
  remainingAmount
}: {
  status: string;
  remainingAmount: number;
}) {
  return remainingAmount > 0 && !isDoneReceivable({ status, remainingAmount });
}

export function isDoneReceivable({
  status,
  remainingAmount
}: {
  status: string;
  remainingAmount: number;
}) {
  return (
    remainingAmount <= 0 ||
    DONE_INVOICE_STATUSES.some((doneStatus) => doneStatus === status)
  );
}

export function isOngoingCollectionTask(status: string) {
  return ONGOING_COLLECTION_TASK_STATUSES.some(
    (ongoingStatus) => ongoingStatus === status
  );
}

export function isDoneCollectionTask(status: string) {
  return DONE_COLLECTION_TASK_STATUSES.some(
    (doneStatus) => doneStatus === status
  );
}

function normalizeSalesOrderProcessInput(input: SalesOrderProcessInput) {
  if (typeof input === "string") {
    return { status: input, deliveryNoteCount: 0 };
  }

  return {
    status: input.status,
    deliveryNoteCount: input.deliveryNoteCount ?? 0
  };
}
