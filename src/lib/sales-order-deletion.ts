import type { Prisma } from "@prisma/client";

export function canDeleteOngoingSalesOrder(input: {
  salesOrderStatus: string;
  invoiceStatus?: string | null;
  deliveryNoteStatuses: string[];
  hasPickingList?: boolean;
  hasInquiry?: boolean;
  hasItemRevisions?: boolean;
}) {
  return (
    input.salesOrderStatus === "Draft" &&
    !input.invoiceStatus &&
    !input.hasPickingList &&
    !input.hasInquiry &&
    !input.hasItemRevisions &&
    input.deliveryNoteStatuses.length === 0
  );
}

export async function deleteSalesOrderProcess(
  tx: Prisma.TransactionClient,
  input: { salesOrderId: string; invoiceId?: string | null }
) {
  await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${input.salesOrderId} FOR UPDATE`;
  const order = await tx.salesOrder.findUnique({
    where: { id: input.salesOrderId },
    include: {
      invoice: { select: { status: true } },
      pickingList: { select: { id: true } },
      customerInquiry: { select: { id: true } },
      deliveryNotes: { select: { status: true } },
      deliverySources: { select: { id: true } }
    }
  });
  if (
    !order || order.deliverySources.length > 0 ||
    !canDeleteOngoingSalesOrder({
      salesOrderStatus: order.status,
      invoiceStatus: order.invoice?.status,
      deliveryNoteStatuses: order.deliveryNotes.map(note => note.status),
      hasPickingList: Boolean(order.pickingList),
      hasInquiry: Boolean(order.customerInquiry),
      hasItemRevisions: order.revisionNumber > 1,
    })
  ) {
    throw new Error("Only an unlinked Draft without downstream evidence or item revisions can be deleted");
  }
  await tx.salesOrder.delete({ where: { id: input.salesOrderId } });
}
