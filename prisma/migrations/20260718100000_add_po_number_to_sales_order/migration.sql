ALTER TABLE "SalesOrder" ADD COLUMN "poNumber" TEXT;

UPDATE "SalesOrder"
SET "poNumber" = "orderNumber"
WHERE "transactionType" = 'PRE_ORDER'
  AND "poNumber" IS NULL;

CREATE UNIQUE INDEX "SalesOrder_poNumber_key" ON "SalesOrder"("poNumber");
