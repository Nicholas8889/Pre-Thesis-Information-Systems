"use client";

import { Trash2 } from "lucide-react";
import { deleteSalesOrder } from "@/lib/actions";

export function DeleteSalesOrderButton({
  salesOrderId,
  orderNumber,
  relatedRecordCount,
  transactionLabel = "Sales Order"
}: {
  salesOrderId: string;
  orderNumber: string;
  relatedRecordCount: number;
  transactionLabel?: string;
}) {
  return (
    <form
      action={deleteSalesOrder}
      data-confirm-title={`Delete ${orderNumber}`}
      data-confirm-require-note="true"
    >
      <input type="hidden" name="salesOrderId" value={salesOrderId} />
      <input
        type="hidden"
        name="returnPath"
        value={transactionLabel === "Pre Order" ? "/pre-orders" : "/sales-orders"}
      />
      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        Delete {transactionLabel} ({relatedRecordCount} related records)
      </button>
    </form>
  );
}
