const ongoingInvoiceStatuses = ["Unpaid", "Partial", "Overdue"];
const doneInvoiceStatuses = ["Paid", "Cancelled"];

const ongoingSalesOrderStatuses = ["Draft", "Confirmed", "Invoiced"];
const doneSalesOrderStatuses = ["Shipped", "Cancelled"];

const ongoingDeliveryNoteStatuses = ["Draft", "Issued"];
const doneDeliveryNoteStatuses = ["Delivered", "Cancelled"];

const ongoingFollowUpStatuses = ["Planned"];
const doneFollowUpStatuses = ["Done", "Cancelled"];

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

  return ongoingSalesOrderStatuses.includes(status) && deliveryNoteCount === 0;
}

export function isDoneSalesOrder(input: SalesOrderProcessInput) {
  const { status, deliveryNoteCount } = normalizeSalesOrderProcessInput(input);

  return doneSalesOrderStatuses.includes(status) || deliveryNoteCount > 0;
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

export function isOngoingFollowUp(status: string) {
  return ongoingFollowUpStatuses.includes(status);
}

export function isDoneFollowUp(status: string) {
  return doneFollowUpStatuses.includes(status);
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
