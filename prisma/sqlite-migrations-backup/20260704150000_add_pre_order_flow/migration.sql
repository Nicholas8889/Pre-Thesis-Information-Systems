-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "transactionType" TEXT NOT NULL DEFAULT 'SALES_ORDER';
ALTER TABLE "SalesOrder" ADD COLUMN "requiredDate" DATETIME;
ALTER TABLE "SalesOrder" ADD COLUMN "poDocumentName" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "poDocumentStoredName" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "poDocumentMimeType" TEXT;

-- CreateIndex
CREATE INDEX "SalesOrder_transactionType_idx" ON "SalesOrder"("transactionType");

-- CreateIndex
CREATE INDEX "SalesOrder_requiredDate_idx" ON "SalesOrder"("requiredDate");
