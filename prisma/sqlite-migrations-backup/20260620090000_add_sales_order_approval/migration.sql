ALTER TABLE "SalesOrder" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'NotRequired';
ALTER TABLE "SalesOrder" ADD COLUMN "approvalRisk" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "approvalDecisionNote" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "approvalDecidedAt" DATETIME;
ALTER TABLE "SalesOrder" ADD COLUMN "approvalDecidedById" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "SalesOrder_approvalStatus_idx" ON "SalesOrder"("approvalStatus");
