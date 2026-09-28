CREATE UNIQUE INDEX "invoices_id_customer_id_key"
  ON "invoices"("id", "customer_id");

ALTER TABLE "collection_tasks"
  DROP CONSTRAINT "collection_tasks_invoice_id_fkey";

ALTER TABLE "collection_tasks"
  ADD CONSTRAINT "collection_tasks_invoice_customer_id_fkey"
  FOREIGN KEY ("invoice_id", "customer_id")
  REFERENCES "invoices"("id", "customer_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
