BEGIN;

-- Surat Jalan list/detail and relation cleanup join through these foreign keys.
CREATE INDEX "DeliveryNote_invoiceId_idx" ON "DeliveryNote"("invoiceId");
CREATE INDEX "DeliveryNote_salesOrderId_idx" ON "DeliveryNote"("salesOrderId");
CREATE INDEX "DeliveryNote_customerId_idx" ON "DeliveryNote"("customerId");
CREATE INDEX "DeliveryNoteItem_deliveryNoteId_idx" ON "DeliveryNoteItem"("deliveryNoteId");

COMMIT;
