-- AlterTable
ALTER TABLE "SalesOrderItem" ADD COLUMN "productId" TEXT REFERENCES "Product"("idProduct") ON DELETE SET NULL;
ALTER TABLE "SalesOrderItem" ADD COLUMN "basePrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrderItem" ADD COLUMN "markupPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrderItem" ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;

-- Preserve the original price as the base-price snapshot for existing transactions.
UPDATE "SalesOrderItem" SET "basePrice" = "unitPrice";

-- CreateIndex
CREATE INDEX "SalesOrderItem_productId_idx" ON "SalesOrderItem"("productId");
