import type { InvoiceStatus, Prisma } from "@prisma/client";
import { calculateInvoiceStatus, startOfDay } from "@/lib/calculations";

type InvoiceStatusSource = {
  dueDate: Date;
  paidAmount: number;
  status: InvoiceStatus | string;
  totalAmount: number;
};

export function getEffectiveInvoiceStatus(
  invoice: InvoiceStatusSource,
  asOfDate = new Date()
): InvoiceStatus {
  if (invoice.status === "Cancelled") {
    return "Cancelled";
  }

  return calculateInvoiceStatus({
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    dueDate: invoice.dueDate,
    asOfDate
  }) as InvoiceStatus;
}

export function withEffectiveInvoiceStatus<T extends InvoiceStatusSource>(
  invoice: T,
  asOfDate = new Date()
): Omit<T, "status"> & { status: InvoiceStatus } {
  return {
    ...invoice,
    status: getEffectiveInvoiceStatus(invoice, asOfDate)
  };
}

export function getOpenInvoiceWhere(): Prisma.InvoiceWhereInput {
  return {
    remainingAmount: { gt: 0 },
    status: { not: "Cancelled" }
  };
}

export function getClosedInvoiceWhere(): Prisma.InvoiceWhereInput {
  return {
    OR: [{ remainingAmount: { lte: 0 } }, { status: "Cancelled" }]
  };
}

export function getEffectiveInvoiceStatusWhere(
  status: InvoiceStatus,
  asOfDate = new Date()
): Prisma.InvoiceWhereInput {
  const today = startOfDay(asOfDate);

  switch (status) {
    case "Overdue":
      return {
        dueDate: { lt: today },
        remainingAmount: { gt: 0 },
        status: { not: "Cancelled" }
      };
    case "Partial":
      return {
        dueDate: { gte: today },
        paidAmount: { gt: 0 },
        remainingAmount: { gt: 0 },
        status: { not: "Cancelled" }
      };
    case "Unpaid":
      return {
        dueDate: { gte: today },
        paidAmount: { lte: 0 },
        remainingAmount: { gt: 0 },
        status: { not: "Cancelled" }
      };
    case "Paid":
      return {
        remainingAmount: { lte: 0 },
        status: { not: "Cancelled" }
      };
    case "Cancelled":
      return { status: "Cancelled" };
  }
}
