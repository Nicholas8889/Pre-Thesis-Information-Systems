BEGIN;

-- Preserve all existing monetary values while adopting the new database-level name.
ALTER TABLE "Product" RENAME COLUMN "basePrice" TO "price";
ALTER TABLE "SalesOrderItem" RENAME COLUMN "basePrice" TO "price";

-- Customer tax identity. PostgreSQL unique indexes allow multiple NULL values.
ALTER TABLE "Customer" ADD COLUMN "npwp" TEXT;
CREATE UNIQUE INDEX "Customer_npwp_key" ON "Customer"("npwp");
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_npwp_format_check"
  CHECK ("npwp" IS NULL OR "npwp" ~ '^[0-9]{15,16}$');

-- Sales Order tax snapshots. Existing records are treated as non-PPN transactions.
ALTER TABLE "SalesOrder"
  ADD COLUMN "customerNpwpSnapshot" TEXT,
  ADD COLUMN "ppnApplied" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ppnRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ppnAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "netSalesAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "SalesOrder"
SET "netSalesAmount" = "total";

ALTER TABLE "SalesOrder"
  ADD CONSTRAINT "SalesOrder_ppnRateBasisPoints_check"
    CHECK ("ppnRateBasisPoints" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "SalesOrder_ppnAmount_check"
    CHECK ("ppnAmount" >= 0),
  ADD CONSTRAINT "SalesOrder_netSalesAmount_check"
    CHECK ("netSalesAmount" >= 0);

-- Invoice snapshots copy the finalized Sales Order values in later batches.
ALTER TABLE "Invoice"
  ADD COLUMN "customerNpwpSnapshot" TEXT,
  ADD COLUMN "ppnApplied" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ppnRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ppnAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "netSalesAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Invoice"
SET "netSalesAmount" = "totalAmount";

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_ppnRateBasisPoints_check"
    CHECK ("ppnRateBasisPoints" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "Invoice_ppnAmount_check"
    CHECK ("ppnAmount" >= 0),
  ADD CONSTRAINT "Invoice_netSalesAmount_check"
    CHECK ("netSalesAmount" >= 0);

-- Nullable for historical documents; application validation requires both on new records.
ALTER TABLE "DeliveryNote"
  ADD COLUMN "driverName" TEXT,
  ADD COLUMN "vehiclePlateNumber" TEXT,
  ADD CONSTRAINT "DeliveryNote_driver_vehicle_pair_check"
    CHECK (
      ("driverName" IS NULL AND "vehiclePlateNumber" IS NULL)
      OR
      ("driverName" IS NOT NULL AND "vehiclePlateNumber" IS NOT NULL)
    );

COMMIT;
