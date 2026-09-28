import { isBusinessDateOnOrBeforeWib } from "@/lib/business-clock";
import { getJakartaTrailingTwelveMonthWindow } from "@/lib/customer-intelligence";

export const PAYMENT_RELIABILITY_THRESHOLD_PERCENT = 60;
export const PAYMENT_RELIABILITY_MINIMUM_SAMPLE = 3;

export type PaymentReliabilityLabel =
  | "On-Time Payer"
  | "Late Payer"
  | "Insufficient Payment History"
  | "No Payment History";

export type CustomerPaymentReliabilityResult = {
  label: PaymentReliabilityLabel;
  eligibleInvoiceCount: number;
  onTimeCount: number;
  lateCount: number;
  onTimePercentage: number | null;
  limitedHistory: boolean;
  evidence: string;
};

type ReliabilityInvoice = {
  status: string;
  dueDate: Date;
  remainingAmount: number;
  payments?: Array<{ paymentDate: Date; amount: number }>;
  deliveryNotes: Array<{ status: string }>;
  deliverySources?: Array<{ deliveryNote: { status: string } }>;
  salesOrder: { deliveryNotes: Array<{ status: string; invoiceId: string | null }> };
};

export function getCustomerPaymentReliability(
  customer: { invoices: ReliabilityInvoice[] },
  now = new Date()
) {
  const { observationStart, observationEnd } = getJakartaTrailingTwelveMonthWindow(now);
  let onTimeCount = 0;
  let lateCount = 0;

  for (const invoice of customer.invoices) {
    const hasDeliveredEvidence =
      (invoice.deliverySources ?? []).some(source => source.deliveryNote.status === "Delivered") ||
      invoice.deliveryNotes.some(note => note.status === "Delivered") ||
      invoice.salesOrder.deliveryNotes.some(
        note => note.invoiceId === null && note.status === "Delivered"
      );
    const settledAt = (invoice.payments ?? []).reduce<Date | null>(
      (latest, payment) => !latest || payment.paymentDate > latest ? payment.paymentDate : latest,
      null
    );
    if (
      invoice.status === "Cancelled" ||
      invoice.remainingAmount > 0 ||
      !hasDeliveredEvidence ||
      !settledAt ||
      settledAt < observationStart ||
      settledAt > observationEnd
    ) {
      continue;
    }
    if (isBusinessDateOnOrBeforeWib(settledAt, invoice.dueDate)) onTimeCount += 1;
    else lateCount += 1;
  }

  return getCustomerPaymentReliabilityFromCounts({ onTimeCount, lateCount });
}

export function getCustomerPaymentReliabilityFromCounts({
  onTimeCount,
  lateCount
}: {
  onTimeCount: number;
  lateCount: number;
}): CustomerPaymentReliabilityResult {
  if (!Number.isSafeInteger(onTimeCount) || !Number.isSafeInteger(lateCount) || onTimeCount < 0 || lateCount < 0) {
    throw new RangeError("Payment reliability counts must be non-negative safe integers");
  }
  const eligibleInvoiceCount = onTimeCount + lateCount;
  if (eligibleInvoiceCount === 0) {
    return {
      label: "No Payment History",
      eligibleInvoiceCount,
      onTimeCount,
      lateCount,
      onTimePercentage: null,
      limitedHistory: false,
      evidence: "No settled, delivered invoices were eligible in the last 12 months."
    };
  }
  if (eligibleInvoiceCount < PAYMENT_RELIABILITY_MINIMUM_SAMPLE) {
    return {
      label: "Insufficient Payment History",
      eligibleInvoiceCount,
      onTimeCount,
      lateCount,
      onTimePercentage: null,
      limitedHistory: true,
      evidence: `${eligibleInvoiceCount} eligible invoice(s); at least ${PAYMENT_RELIABILITY_MINIMUM_SAMPLE} are required for classification.`
    };
  }
  const qualifiesOnTime =
    onTimeCount * 100 >= eligibleInvoiceCount * PAYMENT_RELIABILITY_THRESHOLD_PERCENT;
  const onTimePercentage = Math.round(onTimeCount * 1000 / eligibleInvoiceCount) / 10;
  return {
    label: qualifiesOnTime ? "On-Time Payer" : "Late Payer",
    eligibleInvoiceCount,
    onTimeCount,
    lateCount,
    onTimePercentage,
    limitedHistory: false,
    evidence: `${onTimeCount} of ${eligibleInvoiceCount} eligible invoice(s) were settled on or before the due date (${onTimePercentage}%).`
  };
}
