import type { InvoiceStatus, Prisma } from "@prisma/client";
import {
  calculateDueDateForPaymentTerm,
  calculateInvoiceStatus,
  calculateRemainingAmount,
  calculateSalesOrderTotal,
  type PaymentTermType
} from "./calculations";
import {
  formatDocumentNumber,
  getJakartaDocumentYear,
  type DocumentNumberType
} from "./document-numbering";
import { prisma } from "./prisma";

export type OrderItemInput = {
  productId: string;
  itemName: string;
  quantity: number;
  baseUnitPrice: number;
  markupPercent: number;
  discountPercent: number;
  markupBasisPoints: number;
  discountBasisPoints: number;
  finalUnitPrice: number;
};

export const MAX_ORDER_QUANTITY = 1_000_000;
// Keeps every basis-point multiplication within Number.MAX_SAFE_INTEGER.
export const MAX_ORDER_UNIT_PRICE = 1_000_000_000;
export const MAX_PRICE_ADJUSTMENT_BASIS_POINTS = 10_000;

export function normalizeOrderItems(rawItems: unknown): OrderItemInput[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const normalized = rawItems.map((item) => {
      const record = item as Record<string, unknown>;
      const baseUnitPrice = Number(record.baseUnitPrice);
      const markupPercent = Number(record.markupPercent ?? 0);
      const discountPercent = Number(record.discountPercent ?? 0);
      const markupBasisPoints = markupPercent * 100;
      const discountBasisPoints = discountPercent * 100;
      let finalUnitPrice = Number.NaN;
      try {
        finalUnitPrice = calculateAdjustedUnitPriceBasisPoints(
          baseUnitPrice,
          markupBasisPoints,
          discountBasisPoints
        );
      } catch {
        // The whole payload is rejected below; never drop only the invalid line.
      }
      return {
        productId: String(record.productId ?? "").trim(),
        itemName: String(record.itemName ?? "").trim(),
        quantity: Number(record.quantity),
        baseUnitPrice,
        markupPercent,
        discountPercent,
        markupBasisPoints,
        discountBasisPoints,
        finalUnitPrice
      };
    });

  const allValid = normalized.every(
    (item) =>
        item.productId.length > 0 &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity <= MAX_ORDER_QUANTITY &&
        Number.isSafeInteger(item.baseUnitPrice) &&
        item.baseUnitPrice <= MAX_ORDER_UNIT_PRICE &&
        Number.isInteger(item.markupPercent) &&
        Number.isInteger(item.discountPercent) &&
        Number.isSafeInteger(item.markupBasisPoints) &&
        Number.isSafeInteger(item.discountBasisPoints) &&
        item.quantity > 0 &&
        item.baseUnitPrice >= 0 &&
        item.markupBasisPoints >= 0 &&
        item.markupBasisPoints <= MAX_PRICE_ADJUSTMENT_BASIS_POINTS &&
        item.discountBasisPoints >= 0 &&
        item.discountBasisPoints <= MAX_PRICE_ADJUSTMENT_BASIS_POINTS &&
        Number.isSafeInteger(item.finalUnitPrice) &&
        item.finalUnitPrice >= 0 &&
        Number.isSafeInteger(item.quantity * item.finalUnitPrice)
  );

  return allValid ? normalized : [];
}

export function calculateAdjustedUnitPriceBasisPoints(
  baseUnitPrice: number,
  markupBasisPoints = 0,
  discountBasisPoints = 0
) {
  if (
    !Number.isSafeInteger(baseUnitPrice) ||
    baseUnitPrice < 0 ||
    baseUnitPrice > MAX_ORDER_UNIT_PRICE ||
    !Number.isSafeInteger(markupBasisPoints) ||
    !Number.isSafeInteger(discountBasisPoints) ||
    markupBasisPoints < 0 ||
    markupBasisPoints > MAX_PRICE_ADJUSTMENT_BASIS_POINTS ||
    discountBasisPoints < 0 ||
    discountBasisPoints > MAX_PRICE_ADJUSTMENT_BASIS_POINTS
  ) {
    throw new Error("INVALID_ORDER_PRICING");
  }

  const numerator = baseUnitPrice * (10_000 + markupBasisPoints - discountBasisPoints);
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new Error("INVALID_ORDER_PRICING");
  }
  const result = Math.round(numerator / 10_000);
  if (!Number.isSafeInteger(result)) throw new Error("INVALID_ORDER_PRICING");
  return result;
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
  const year = getJakartaDocumentYear();
  return allocateDocumentNumber(prefix, year);
}

export function parseSalesOrderPaymentTerm(input: {
  paymentTermType: FormDataEntryValue | null;
  creditTerm: FormDataEntryValue | null;
  creditTermMonths: FormDataEntryValue | null;
  creditTermWeeks: FormDataEntryValue | null;
}): {
  paymentTermType: PaymentTermType;
  creditTermMonths: number | null;
  creditTermWeeks: number | null;
} | null {
  const paymentTermType = String(input.paymentTermType ?? "").trim();
  const creditTerm = String(input.creditTerm ?? "").trim();
  const rawMonths = String(input.creditTermMonths ?? "").trim();
  const rawWeeks = String(input.creditTermWeeks ?? "").trim();

  if (paymentTermType === "IMMEDIATE") {
    return creditTerm || rawMonths || rawWeeks
      ? null
      : { paymentTermType: "IMMEDIATE", creditTermMonths: null, creditTermWeeks: null };
  }
  if (paymentTermType !== "CREDIT") return null;

  const representations = [creditTerm, rawMonths, rawWeeks].filter(Boolean);
  if (representations.length !== 1) return null;

  if (creditTerm) {
    const match = /^(\d+)(w|m)$/.exec(creditTerm);
    if (!match) return null;
    const duration = Number(match[1]);
    if (match[2] === "w") {
      return duration >= 1 && duration <= 4
        ? { paymentTermType: "CREDIT", creditTermMonths: null, creditTermWeeks: duration }
        : null;
    }
    return duration >= 1 && duration <= 12
      ? { paymentTermType: "CREDIT", creditTermMonths: duration, creditTermWeeks: null }
      : null;
  }

  const duration = Number(rawWeeks || rawMonths);
  if (!Number.isInteger(duration)) return null;
  if (rawWeeks) {
    return duration >= 1 && duration <= 4
      ? { paymentTermType: "CREDIT", creditTermMonths: null, creditTermWeeks: duration }
      : null;
  }
  return duration >= 1 && duration <= 12
    ? { paymentTermType: "CREDIT", creditTermMonths: duration, creditTermWeeks: null }
    : null;
}

export async function allocateDocumentNumber(
  documentType: DocumentNumberType,
  year: number,
  db: Pick<Prisma.TransactionClient, "documentSequence"> = prisma
) {
  const sequence = await db.documentSequence.upsert({
    where: { documentType_year: { documentType, year } },
    create: { documentType, year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true }
  });
  return formatDocumentNumber(documentType, year, sequence.lastValue);
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
