"use client";

import { Banknote } from "lucide-react";
import { TableActionButton } from "@/components/table-actions";

const paymentInvoiceSelectionEvent = "cv-tajuk:select-payment-invoice";

export function RecordPaymentButton({ invoiceId }: { invoiceId: string }) {
  function selectInvoice() {
    window.dispatchEvent(
      new CustomEvent(paymentInvoiceSelectionEvent, { detail: { invoiceId } })
    );
    document.getElementById("record-payment")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  return (
    <TableActionButton
      onClick={selectInvoice}
      label="Record payment"
    >
      <Banknote aria-hidden="true" />
    </TableActionButton>
  );
}

export { paymentInvoiceSelectionEvent };
