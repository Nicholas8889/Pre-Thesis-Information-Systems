-- Rename legacy business terms without recreating tables or rewriting data.
-- Keep the transaction short because these ALTER statements take metadata locks.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Customer Purchase Order source
ALTER TYPE "TransactionType" RENAME TO "SalesOrderSource";
ALTER TYPE "SalesOrderSource" RENAME VALUE 'SALES_ORDER' TO 'DIRECT';
ALTER TYPE "SalesOrderSource" RENAME VALUE 'PRE_ORDER' TO 'CUSTOMER_PO';

ALTER TABLE "SalesOrder" RENAME COLUMN "transactionType" TO "source";
ALTER TABLE "SalesOrder" RENAME COLUMN "poNumber" TO "customerPoNumber";
ALTER TABLE "SalesOrder" RENAME COLUMN "poDocumentName" TO "customerPoDocumentName";
ALTER TABLE "SalesOrder" RENAME COLUMN "poDocumentStoredName" TO "customerPoDocumentStoredName";
ALTER TABLE "SalesOrder" RENAME COLUMN "poDocumentMimeType" TO "customerPoDocumentMimeType";

ALTER INDEX "SalesOrder_transactionType_idx" RENAME TO "SalesOrder_source_idx";
ALTER INDEX "SalesOrder_poNumber_key" RENAME TO "SalesOrder_customerPoNumber_key";

-- Immediate versus credit payment terms
ALTER TYPE "PaymentTermType" RENAME VALUE 'DEBIT' TO 'IMMEDIATE';

-- Collection work that was previously stored as a generic follow-up
ALTER TYPE "FollowUpStatus" RENAME TO "CollectionTaskStatus";
ALTER TABLE "FollowUp" RENAME TO "CollectionTask";
ALTER TABLE "CollectionTask" RENAME COLUMN "idFollowUp" TO "idCollectionTask";
ALTER TABLE "CollectionTask" RENAME COLUMN "followUpDate" TO "scheduledDate";
ALTER TABLE "CollectionTask" RENAME CONSTRAINT "FollowUp_pkey" TO "CollectionTask_pkey";
ALTER TABLE "CollectionTask" RENAME CONSTRAINT "FollowUp_customerId_fkey" TO "CollectionTask_customerId_fkey";
ALTER TABLE "CollectionTask" RENAME CONSTRAINT "FollowUp_invoiceId_fkey" TO "CollectionTask_invoiceId_fkey";
CREATE INDEX "CollectionTask_customerId_idx" ON "CollectionTask"("customerId");
CREATE INDEX "CollectionTask_invoiceId_idx" ON "CollectionTask"("invoiceId");

-- Product-information customer contact
ALTER TABLE "CustomerProductFollowUp" RENAME TO "CustomerOutreach";
ALTER TABLE "CustomerOutreach" RENAME COLUMN "idCustomerProductFollowUp" TO "idCustomerOutreach";
ALTER TABLE "CustomerOutreach" RENAME CONSTRAINT "CustomerProductFollowUp_pkey" TO "CustomerOutreach_pkey";
ALTER TABLE "CustomerOutreach" RENAME CONSTRAINT "CustomerProductFollowUp_customerId_fkey" TO "CustomerOutreach_customerId_fkey";
ALTER INDEX "CustomerProductFollowUp_customerId_contactDate_idx" RENAME TO "CustomerOutreach_customerId_contactDate_idx";

-- Inquiry lifecycle label for orders backed by a customer PO
ALTER TYPE "CustomerInquiryStatus" RENAME VALUE 'ConvertedToPO' TO 'ConvertedToCustomerPO';

-- Audit references can identify any business or master-data record
ALTER TABLE "AuditTrail" RENAME COLUMN "transactionCode" TO "recordReference";
ALTER INDEX "AuditTrail_transactionCode_idx" RENAME TO "AuditTrail_recordReference_idx";

COMMIT;
