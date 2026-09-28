ALTER TABLE "sales_orders"
  ADD COLUMN "delivery_destination_snapshot" TEXT NOT NULL DEFAULT '';

UPDATE "sales_orders" AS sales_order
SET "delivery_destination_snapshot" = customer."address"
FROM "customers" AS customer
WHERE customer."id" = sales_order."customer_id";

ALTER TABLE "delivery_notes"
  ALTER COLUMN "delivery_date" TYPE DATE
  USING "delivery_date"::date;
