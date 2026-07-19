-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "paymentTermType" TEXT NOT NULL DEFAULT 'DEBIT';
ALTER TABLE "SalesOrder" ADD COLUMN "creditTermMonths" INTEGER;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paymentTermType" TEXT NOT NULL DEFAULT 'DEBIT';
ALTER TABLE "Invoice" ADD COLUMN "creditTermMonths" INTEGER;
