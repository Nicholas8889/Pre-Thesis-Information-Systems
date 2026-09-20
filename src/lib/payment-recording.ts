import type { PaymentMethod, Prisma } from "@prisma/client";
import { canRecordPayment } from "@/lib/calculations";
import {
  getInvoiceStatusForAmounts,
  getRemainingAmount
} from "@/lib/workflow";

export type PaymentRecordingErrorCode =
  | "INVOICE_NOT_FOUND"
  | "INVOICE_CANCELLED"
  | "INVALID_PAYMENT_AMOUNT";

export class PaymentRecordingError extends Error {
  constructor(public readonly code: PaymentRecordingErrorCode) {
    super(code);
    this.name = "PaymentRecordingError";
  }
}

export async function recordInvoicePayment(
  tx: Prisma.TransactionClient,
  {
    invoiceId,
    paymentDate,
    amount,
    paymentMethod,
    notes
  }: {
    invoiceId: string;
    paymentDate: Date;
    amount: number;
    paymentMethod: PaymentMethod;
    notes: string | null;
  }
) {
  const lockedInvoices = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "invoices"
    WHERE "id" = ${invoiceId}
    FOR UPDATE
  `;

  if (lockedInvoices.length === 0) {
    throw new PaymentRecordingError("INVOICE_NOT_FOUND");
  }

  const previousInvoice = await tx.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!previousInvoice) {
    throw new PaymentRecordingError("INVOICE_NOT_FOUND");
  }

  if (previousInvoice.status === "Cancelled") {
    throw new PaymentRecordingError("INVOICE_CANCELLED");
  }

  const existingPayments = await tx.payment.aggregate({
    where: { invoiceId },
    _sum: { amount: true }
  });
  const previousPaidAmount = existingPayments._sum.amount ?? 0;
  const previousRemainingAmount = getRemainingAmount(
    previousInvoice.totalAmount,
    previousPaidAmount
  );

  if (!canRecordPayment(previousRemainingAmount, amount)) {
    throw new PaymentRecordingError("INVALID_PAYMENT_AMOUNT");
  }

  const payment = await tx.payment.create({
    data: {
      invoiceId,
      paymentDate,
      amount,
      paymentMethod,
      notes
    }
  });
  const paidAmount = previousPaidAmount + amount;
  const remainingAmount = getRemainingAmount(
    previousInvoice.totalAmount,
    paidAmount
  );
  const status = getInvoiceStatusForAmounts({
    totalAmount: previousInvoice.totalAmount,
    paidAmount,
    dueDate: previousInvoice.dueDate
  });
  const invoice = await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount,
      remainingAmount,
      status
    }
  });

  return {
    payment,
    invoice,
    previousInvoice
  };
}
