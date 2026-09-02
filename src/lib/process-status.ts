const ongoingInvoiceStatuses = ["Unpaid", "Partial", "Overdue"];
const doneInvoiceStatuses = ["Paid", "Cancelled"];

export const ONGOING_SALES_ORDER_STATUSES = ["Draft", "Confirmed", "Invoiced"] as const;
export const DONE_SALES_ORDER_STATUSES = ["Shipped", "Cancelled"] as const;

const ongoingDeliveryNoteStatuses = ["Draft", "Issued"];
const doneDeliveryNoteStatuses = ["Delivered", "Cancelled"];

const ongoingCollectionTaskStatuses = ["Planned"];
const doneCollectionTaskStatuses = ["Done", "Cancelled"];

export function isOngoingInvoice(status: string) {
  return ongoingInvoiceStatuses.includes(status);
}

export function isDoneInvoice(status: string) {
  return doneInvoiceStatuses.includes(status);
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
  return remainingAmount <= 0 || doneInvoiceStatuses.includes(status);
}

export function isOngoingCollectionTask(status: string) {
  return ongoingCollectionTaskStatuses.includes(status);
}

export function isDoneCollectionTask(status: string) {
  return doneCollectionTaskStatuses.includes(status);
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
