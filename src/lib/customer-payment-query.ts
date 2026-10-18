import type { Prisma } from "@prisma/client";

// Balance determines current outstanding; payment/delivery evidence is also used
// by the separate historical payment-reliability calculation.
export const customerInvoiceBalanceSelect = {
  dueDate: true,
  remainingAmount: true,
  status: true,
  payments: {
    select: { paymentDate: true, amount: true },
    orderBy: { paymentDate: "asc" as const }
  },
  deliverySources: { where: { deliveryNote: { status: "Delivered" } }, select: { deliveryNote: { select: { status: true } } }, take: 1 },
  deliveryNotes: {
    where: { status: "Delivered" },
    select: { status: true },
    take: 1
  },
  salesOrder: {
    select: {
      deliveryNotes: {
        where: { status: "Delivered", invoiceId: null },
        select: { status: true, invoiceId: true },
        take: 1
      }
    }
  }
} satisfies Prisma.InvoiceSelect;
