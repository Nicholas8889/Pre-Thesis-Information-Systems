import type { InvoiceStatus } from "@prisma/client";
import {
  calculateAdjustedUnitPrice,
  calculateDueDateForPaymentTerm,
  calculateInvoiceStatus,
  calculateRemainingAmount,
  calculateSalesOrderTotal,
  type PaymentTermType
} from "./calculations";
import { nextNumberFromExisting } from "./document-numbering";
import { prisma } from "./prisma";

export type OrderItemInput = {
  productId: string;
  itemName: string;
  quantity: number;
  baseUnitPrice: number;
  markupPercent: number;
  discountPercent: number;
  finalUnitPrice: number;
};

export function normalizeOrderItems(rawItems: unknown): OrderItemInput[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((item) => {
      const record = item as Record<string, unknown>;
      const baseUnitPrice = Number(record.baseUnitPrice);
      const markupPercent = Number(record.markupPercent ?? 0);
      const discountPercent = Number(record.discountPercent ?? 0);
      return {
        productId: String(record.productId ?? "").trim(),
        itemName: String(record.itemName ?? "").trim(),
        quantity: Number(record.quantity),
        baseUnitPrice,
        markupPercent,
        discountPercent,
        finalUnitPrice: calculateAdjustedUnitPrice(baseUnitPrice, markupPercent, discountPercent)
      };
    })
    .filter(
      (item) =>
        item.productId.length > 0 &&
        Number.isFinite(item.quantity) &&
        Number.isInteger(item.quantity) &&
        Number.isFinite(item.baseUnitPrice) &&
        Number.isInteger(item.baseUnitPrice) &&
        Number.isInteger(item.markupPercent) &&
        Number.isInteger(item.discountPercent) &&
        item.quantity > 0 &&
        item.baseUnitPrice >= 0 &&
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
  creditTermMonths,
  creditTermWeeks
}: {
  issueDate: Date;
  paymentTermType: PaymentTermType;
  creditTermMonths?: number | null;
  creditTermWeeks?: number | null;
}) {
  return calculateDueDateForPaymentTerm({
    issueDate,
    paymentTermType,
    creditTermMonths,
    creditTermWeeks
  });
}

export function normalizePaymentTerm({
  paymentTermType,
  creditTermMonths,
  creditTerm
}: {
  paymentTermType: string;
  creditTermMonths?: FormDataEntryValue | null;
  creditTerm?: FormDataEntryValue | null;
}) {
  const normalizedPaymentTerm: PaymentTermType = paymentTermType === "CREDIT" ? "CREDIT" : "IMMEDIATE";
  if (normalizedPaymentTerm === "IMMEDIATE") {
    return { paymentTermType: normalizedPaymentTerm, creditTermMonths: null, creditTermWeeks: null };
  }

  // Older forms can still submit a numeric month term.
  if (creditTerm == null) {
    return {
      paymentTermType: normalizedPaymentTerm,
      creditTermMonths: creditTermMonths == null ? null : Number(creditTermMonths),
      creditTermWeeks: null
    };
  }
  const selection = typeof creditTerm === "string" ? /^(\d+)(w|m)$/.exec(creditTerm) : null;
  return {
    paymentTermType: normalizedPaymentTerm,
    creditTermMonths: selection?.[2] === "w" ? null : selection ? Number(selection[1]) : NaN,
    creditTermWeeks: selection?.[2] === "w" ? Number(selection[1]) : null
  };
}

export function toDateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function nextDocumentNumber(prefix: "SO" | "PO" | "INV") {
  const year = new Date().getFullYear();
  const sequencePrefix = `${prefix}-${year}-`;
  let existingNumbers: string[];

  if (prefix === "INV") {
    const invoices = await prisma.invoice.findMany({
      where: { invoiceNumber: { startsWith: sequencePrefix } },
      select: { invoiceNumber: true }
    });
    existingNumbers = invoices.map((invoice) => invoice.invoiceNumber);
  } else if (prefix === "PO") {
    const customerPos = await prisma.salesOrder.findMany({
      where: { customerPoNumber: { startsWith: sequencePrefix } },
      select: { customerPoNumber: true }
    });
    existingNumbers = customerPos.flatMap((order) =>
      order.customerPoNumber ? [order.customerPoNumber] : []
    );
  } else {
    const salesOrders = await prisma.salesOrder.findMany({
      where: { orderNumber: { startsWith: sequencePrefix } },
      select: { orderNumber: true }
    });
    existingNumbers = salesOrders.map((order) => order.orderNumber);
  }

  return nextNumberFromExisting({ existingNumbers, prefix, year });
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
