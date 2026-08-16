export type PaymentStatus = "Unpaid" | "Partial" | "Paid" | "Overdue";
export type ReceivableStatus = "Unpaid" | "Partial" | "Overdue";
export type PaymentTermType = "IMMEDIATE" | "CREDIT";

export function calculateLineSubtotal(quantity: number, finalUnitPrice: number) {
  return quantity * finalUnitPrice;
}

export function calculateAdjustedUnitPrice(
  baseUnitPrice: number,
  markupPercent = 0,
  discountPercent = 0
) {
  const adjustedPrice = baseUnitPrice * (100 + markupPercent - discountPercent) / 100;
  return Math.max(0, Math.round(adjustedPrice));
}

export function calculateSalesOrderTotal(
  items: Array<{ quantity: number; finalUnitPrice: number }>
) {
  return items.reduce(
    (total, item) => total + calculateLineSubtotal(item.quantity, item.finalUnitPrice),
    0
  );
}

export function calculateRemainingAmount(totalAmount: number, paidAmount: number) {
  return Math.max(totalAmount - paidAmount, 0);
}

export function canRecordPayment(remainingAmount: number, paymentAmount: number) {
  return paymentAmount > 0 && paymentAmount <= remainingAmount;
}

export function canGenerateInvoice(existingInvoiceId?: string | null) {
  return !existingInvoiceId;
}

export function isActiveReceivable({
  remainingAmount,
  status
}: {
  remainingAmount: number;
  status: PaymentStatus;
}) {
  return (
    remainingAmount > 0 &&
    (status === "Unpaid" || status === "Partial" || status === "Overdue")
  );
}

export function buildInvoiceDraftFromSalesOrder({
  salesOrderId,
  customerId,
  total,
  issueDate,
  paymentTermType = "IMMEDIATE",
  creditTermMonths = null
}: {
  salesOrderId: string;
  customerId: string;
  total: number;
  issueDate: Date;
  paymentTermType?: PaymentTermType;
  creditTermMonths?: number | null;
}) {
  const dueDate = calculateDueDateForPaymentTerm({
    issueDate,
    paymentTermType,
    creditTermMonths
  });

  return {
    salesOrderId,
    customerId,
    issueDate,
    dueDate,
    totalAmount: total,
    paidAmount: 0,
    remainingAmount: total,
    paymentTermType,
    creditTermMonths: paymentTermType === "CREDIT" ? creditTermMonths : null,
    status: "Unpaid" as const
  };
}

export function calculateDueDateForPaymentTerm({
  issueDate,
  paymentTermType,
  creditTermMonths
}: {
  issueDate: Date;
  paymentTermType: PaymentTermType;
  creditTermMonths?: number | null;
}) {
  const dueDate = new Date(issueDate);

  if (paymentTermType === "IMMEDIATE") {
    return dueDate;
  }

  dueDate.setMonth(dueDate.getMonth() + getValidCreditTermMonths(creditTermMonths));
  return dueDate;
}

export function getValidCreditTermMonths(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 1;
  }

  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : 1;
}

export function isValidSalesOrderPaymentTerm({
  paymentTermType,
  creditTermMonths
}: {
  paymentTermType: string;
  creditTermMonths?: number | null;
}) {
  if (paymentTermType === "IMMEDIATE") {
    return true;
  }

  if (creditTermMonths === null || creditTermMonths === undefined) {
    return false;
  }

  return (
    paymentTermType === "CREDIT" &&
    Number.isInteger(creditTermMonths) &&
    creditTermMonths >= 1 &&
    creditTermMonths <= 12
  );
}

export function getPaymentTermLabel({
  paymentTermType,
  creditTermMonths
}: {
  paymentTermType: PaymentTermType;
  creditTermMonths?: number | null;
}) {
  if (paymentTermType === "IMMEDIATE") {
    return "Immediate Payment";
  }

  const months = getValidCreditTermMonths(creditTermMonths);
  return `Credit – ${months} Month${months === 1 ? "" : "s"}`;
}

export function canCreateDeliveryNoteForInvoice({
  paymentTermType,
  status
}: {
  paymentTermType: PaymentTermType;
  status: string;
}) {
  return paymentTermType === "CREDIT" || status === "Paid";
}

export function calculateTotalPaidFromPayments(payments: Array<{ amount: number }>) {
  return payments.reduce((total, payment) => total + payment.amount, 0);
}

export function calculateRemainingBalance(totalAmount: number, totalPaid: number) {
  return Math.max(totalAmount - totalPaid, 0);
}

export function isInvoiceFullyPaid({
  invoiceStatus,
  remainingAmount,
  totalPaid,
  totalAmount
}: {
  invoiceStatus?: string | null;
  remainingAmount?: number | null;
  totalPaid: number;
  totalAmount: number;
}) {
  return (
    invoiceStatus === "Paid" ||
    (remainingAmount !== null && remainingAmount !== undefined && remainingAmount <= 0) ||
    totalPaid >= totalAmount
  );
}

export function getSalesOrderProgressStatus({
  hasInvoice,
  paymentCount,
  deliveryNoteCount,
  remainingAmount,
  collectionTaskCount
}: {
  hasInvoice: boolean;
  paymentCount: number;
  deliveryNoteCount: number;
  remainingAmount: number;
  collectionTaskCount: number;
}) {
  if (!hasInvoice) {
    return "Sales Order Only";
  }

  if (remainingAmount === 0 && deliveryNoteCount > 0) {
    return "Paid and Delivered";
  }

  if (remainingAmount === 0) {
    return "Paid";
  }

  if (collectionTaskCount > 0) {
    return "Collections Active";
  }

  if (paymentCount > 0) {
    return "Payment In Progress";
  }

  return "Invoice Open";
}

export function buildDeliveryNoteItemsFromSalesOrder(
  items: Array<{ itemName: string; quantity: number }>
) {
  return items.map((item) => ({
    productCode: "",
    itemName: item.itemName,
    quantity: item.quantity,
    unit: "PCS",
    description: ""
  }));
}

export function calculateInvoiceStatus({
  totalAmount,
  paidAmount,
  dueDate,
  asOfDate = new Date()
}: {
  totalAmount: number;
  paidAmount: number;
  dueDate: Date;
  asOfDate?: Date;
}): PaymentStatus {
  const remainingAmount = calculateRemainingAmount(totalAmount, paidAmount);

  if (remainingAmount === 0) {
    return "Paid";
  }

  if (dueDate < startOfDay(asOfDate)) {
    return "Overdue";
  }

  if (paidAmount > 0 && paidAmount < totalAmount) {
    return "Partial";
  }

  return "Unpaid";
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
