"use client";

import { Banknote } from "lucide-react";

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
    <button
      type="button"
      onClick={selectInvoice}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
    >
      <Banknote aria-hidden="true" className="h-4 w-4" />
      Record Payment
    </button>
  );
}

export { paymentInvoiceSelectionEvent };
