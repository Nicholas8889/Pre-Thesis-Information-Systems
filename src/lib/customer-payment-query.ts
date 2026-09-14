import type { Prisma } from "@prisma/client";

// Fetch only the delivery evidence needed for customer payment status.
// A Surat Jalan linked only to the Sales Order belongs to its unique invoice.
export const customerInvoiceBalanceSelect = {
  remainingAmount: true,
  status: true,
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
