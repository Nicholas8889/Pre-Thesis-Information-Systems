BEGIN;

-- Batch 6 reads recent order history for every active customer in one scoped query.
CREATE INDEX "SalesOrder_customerId_orderDate_idx"
  ON "SalesOrder"("customerId", "orderDate");

-- Payment-risk insights batch-load customer invoices and their payments.
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

COMMIT;
