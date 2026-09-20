export type PaymentStatus = "Unpaid" | "Partial" | "Paid" | "Overdue";
export type ReceivableStatus = "Unpaid" | "Partial" | "Overdue";
export type PaymentTermType = "IMMEDIATE" | "CREDIT";

export const CREDIT_TERM_OPTIONS = [
  ...Array.from({ length: 4 }, (_, i) => ({ value: (i + 1) + "w", label: (i + 1) + (i === 0 ? " Week" : " Weeks") })),
  ...Array.from({ length: 12 }, (_, i) => ({ value: (i + 1) + "m", label: (i + 1) + (i === 0 ? " Month" : " Months") }))
];

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
  creditTermMonths = null,
  creditTermWeeks = null
}: {
  salesOrderId: string;
  customerId: string;
  total: number;
  issueDate: Date;
  paymentTermType?: PaymentTermType;
  creditTermMonths?: number | null;
  creditTermWeeks?: number | null;
}) {
  const dueDate = calculateDueDateForPaymentTerm({
    issueDate,
    paymentTermType,
    creditTermMonths,
    creditTermWeeks
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
    creditTermWeeks: paymentTermType === "CREDIT" ? creditTermWeeks : null,
    status: "Unpaid" as const
  };
}

export function calculateDueDateForPaymentTerm({
  issueDate,
  paymentTermType,
  creditTermMonths,
  creditTermWeeks
}: {
  issueDate: Date;
  paymentTermType: PaymentTermType;
  creditTermMonths?: number | null;
  creditTermWeeks?: number | null;
}) {
  const dueDate = new Date(issueDate);

  if (paymentTermType === "IMMEDIATE") {
    return dueDate;
  }

  if (creditTermWeeks != null) {
    dueDate.setDate(dueDate.getDate() + creditTermWeeks * 7);
  } else {
    dueDate.setMonth(dueDate.getMonth() + getValidCreditTermMonths(creditTermMonths));
  }
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
  creditTermMonths,
  creditTermWeeks
}: {
  paymentTermType: string;
  creditTermMonths?: number | null;
  creditTermWeeks?: number | null;
}) {
  if (paymentTermType === "IMMEDIATE") {
    return true;
  }

  if (creditTermWeeks != null) {
    return paymentTermType === "CREDIT" &&
      creditTermMonths == null &&
      Number.isInteger(creditTermWeeks) &&
      creditTermWeeks >= 1 && creditTermWeeks <= 4;
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
  creditTermMonths,
  creditTermWeeks
}: {
  paymentTermType: PaymentTermType;
  creditTermMonths?: number | null;
  creditTermWeeks?: number | null;
}) {
  if (paymentTermType === "IMMEDIATE") {
    return "Immediate Payment";
  }

  if (creditTermWeeks != null) {
    return "Credit – " + creditTermWeeks + (creditTermWeeks === 1 ? " Week" : " Weeks");
  }

  const months = getValidCreditTermMonths(creditTermMonths);
  return `Credit – ${months} Month${months === 1 ? "" : "s"}`;
}

export function canCreateDeliveryNoteForInvoice({
  status
}: {
  paymentTermType?: PaymentTermType;
  status: string;
}) {
  return ["Unpaid", "Partial", "Overdue", "Paid"].includes(status);
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

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
