import type { Prisma, UserRole } from "@prisma/client";

export type PortfolioUser = { id: string; role: UserRole };

export function isPortfolioScoped(user: PortfolioUser) {
  return user.role === "SALES";
}

export function buildPortfolioScope(user: PortfolioUser) {
  const ownerUserId = isPortfolioScoped(user) ? user.id : null;

  const customerWhere: Prisma.CustomerWhereInput = ownerUserId
    ? { portfolioOwnerUserId: ownerUserId }
    : {};
  const salesOrderWhere: Prisma.SalesOrderWhereInput = ownerUserId
    ? { createdByUserId: ownerUserId }
    : {};
  const invoiceWhere: Prisma.InvoiceWhereInput = ownerUserId
    ? { salesOrder: { createdByUserId: ownerUserId } }
    : {};
  const paymentWhere: Prisma.PaymentWhereInput = ownerUserId
    ? { invoice: { salesOrder: { createdByUserId: ownerUserId } } }
    : {};
  const inquiryWhere: Prisma.CustomerInquiryWhereInput = ownerUserId
    ? { customer: { portfolioOwnerUserId: ownerUserId } }
    : {};
  const collectionTaskWhere: Prisma.CollectionTaskWhereInput = ownerUserId
    ? { customer: { portfolioOwnerUserId: ownerUserId } }
    : {};
  const outreachWhere: Prisma.CustomerOutreachWhereInput = ownerUserId
    ? { customer: { portfolioOwnerUserId: ownerUserId } }
    : {};
  const pickingListWhere: Prisma.PickingListWhereInput = ownerUserId
    ? { salesOrder: { createdByUserId: ownerUserId } }
    : {};
  const deliveryNoteWhere: Prisma.DeliveryNoteWhereInput = ownerUserId
    ? {
        OR: [
          { salesOrder: { createdByUserId: ownerUserId } },
          { sources: { some: { salesOrder: { createdByUserId: ownerUserId } } } }
        ]
      }
    : {};

  return {
    ownerUserId,
    customerWhere,
    salesOrderWhere,
    invoiceWhere,
    paymentWhere,
    inquiryWhere,
    collectionTaskWhere,
    outreachWhere,
    pickingListWhere,
    deliveryNoteWhere
  };
}
