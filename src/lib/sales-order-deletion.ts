export function canDeleteOngoingSalesOrder(input: {
  salesOrderStatus: string;
  invoiceStatus?: string | null;
  deliveryNoteStatuses: string[];
  hasPickingList?: boolean;
}) {
  if (input.hasPickingList) return false;
  if (input.salesOrderStatus === "Cancelled") return false;
  if (["Paid", "Cancelled"].includes(input.invoiceStatus ?? "")) return false;
  return !input.deliveryNoteStatuses.includes("Delivered");
}

export async function deleteSalesOrderProcess(
  tx: Prisma.TransactionClient,
  input: { salesOrderId: string; invoiceId?: string | null }
) {
  if (await tx.deliveryNoteSource.count({ where: { salesOrderId: input.salesOrderId } })) {
    throw new Error("Orders linked to a Surat Jalan cannot be deleted");
  }
  await tx.deliveryNote.deleteMany({
    where: {
      OR: [
        { salesOrderId: input.salesOrderId },
        ...(input.invoiceId ? [{ invoiceId: input.invoiceId }] : [])
      ]
    }
  });

  if (input.invoiceId) {
    await tx.collectionTask.deleteMany({ where: { invoiceId: input.invoiceId } });
    await tx.payment.deleteMany({ where: { invoiceId: input.invoiceId } });
    await tx.invoice.delete({ where: { id: input.invoiceId } });
  }

  await tx.salesOrder.delete({ where: { id: input.salesOrderId } });
}
import type { Prisma } from "@prisma/client";
