import type { InvoiceStatus } from "@prisma/client";
import {
  calculateAdjustedUnitPrice,
  calculateDueDateForPaymentTerm,
  calculateInvoiceStatus,
  calculateRemainingAmount,
  calculateSalesOrderTotal,
  getValidCreditTermMonths,
  type PaymentTermType
} from "./calculations";
import { prisma } from "./prisma";

export type OrderItemInput = {
  productId: string;
  itemName: string;
  quantity: number;
  basePrice: number;
  markupPercent: number;
  discountPercent: number;
  unitPrice: number;
};

export function normalizeOrderItems(rawItems: unknown): OrderItemInput[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((item) => {
      const record = item as Record<string, unknown>;
      const basePrice = Number(record.basePrice);
      const markupPercent = Number(record.markupPercent ?? 0);
      const discountPercent = Number(record.discountPercent ?? 0);
      return {
        productId: String(record.productId ?? "").trim(),
        itemName: String(record.itemName ?? "").trim(),
        quantity: Number(record.quantity),
        basePrice,
        markupPercent,
        discountPercent,
        unitPrice: calculateAdjustedUnitPrice(basePrice, markupPercent, discountPercent)
      };
    })
    .filter(
      (item) =>
        item.productId.length > 0 &&
        Number.isFinite(item.quantity) &&
        Number.isInteger(item.quantity) &&
        Number.isFinite(item.basePrice) &&
        Number.isInteger(item.basePrice) &&
        Number.isInteger(item.markupPercent) &&
        Number.isInteger(item.discountPercent) &&
        item.quantity > 0 &&
        item.basePrice >= 0 &&
        item.markupPercent >= 0 &&
        item.markupPercent <= 100 &&
        item.discountPercent >= 0 &&
        item.discountPercent <= 100
    );
}

export function calculateOrderTotals(items: OrderItemInput[]) {
  const total = calculateSalesOrderTotal(items);
  return {
    subtotal: total,
    total
  };
}

export function getInvoiceStatusForAmounts({
  totalAmount,
  paidAmount,
  dueDate,
  asOfDate = new Date()
}: {
  totalAmount: number;
  paidAmount: number;
  dueDate: Date;
  asOfDate?: Date;
}): InvoiceStatus {
  return calculateInvoiceStatus({
    totalAmount,
    paidAmount,
    dueDate,
    asOfDate
  }) as InvoiceStatus;
}

export function getRemainingAmount(totalAmount: number, paidAmount: number) {
  return calculateRemainingAmount(totalAmount, paidAmount);
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function getDueDateForPaymentTerm({
  issueDate,
  paymentTermType,
  creditTermMonths
}: {
  issueDate: Date;
  paymentTermType: PaymentTermType;
  creditTermMonths?: number | null;
}) {
  return calculateDueDateForPaymentTerm({
    issueDate,
    paymentTermType,
    creditTermMonths
  });
}

export function normalizePaymentTerm({
  paymentTermType,
  creditTermMonths
}: {
  paymentTermType: string;
  creditTermMonths: FormDataEntryValue | null;
}) {
  const normalizedPaymentTerm: PaymentTermType =
    paymentTermType === "CREDIT" ? "CREDIT" : "DEBIT";
  const normalizedCreditTerm =
    normalizedPaymentTerm === "CREDIT"
      ? getValidCreditTermMonths(Number(creditTermMonths))
      : null;

  return {
    paymentTermType: normalizedPaymentTerm,
    creditTermMonths: normalizedCreditTerm
  };
}

export function toDateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function syncOverdueInvoices() {
  const today = new Date(toDateInputValue());

  await prisma.invoice.updateMany({
    where: {
      dueDate: {
        lt: today
      },
      remainingAmount: {
        gt: 0
      },
      status: {
        notIn: ["Overdue", "Cancelled"]
      }
    },
    data: {
      status: "Overdue"
    }
  });
}

export async function nextDocumentNumber(prefix: "SO" | "PO" | "INV") {
  const year = new Date().getFullYear();
  const count =
    prefix === "INV"
      ? await prisma.invoice.count()
      : prefix === "PO"
        ? await prisma.salesOrder.count({ where: { poNumber: { not: null } } })
        : await prisma.salesOrder.count();
  return `${prefix}-${year}-${String(count + 1).padStart(3, "0")}`;
}

export function parseAmount(value: FormDataEntryValue | null) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

export function getSearchMessage(searchParams: Record<string, string | string[] | undefined>) {
  const success = getFirst(searchParams.success);
  const error = getFirst(searchParams.error);

  return {
    success,
    error
  };
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
