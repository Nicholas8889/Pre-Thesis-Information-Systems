-- Standardize existing demo role values before Prisma starts validating the new enum names.
UPDATE "User"
SET "role" = CASE
  WHEN "role" = 'Admin' THEN 'ADMIN'
  WHEN "role" = 'Sales' THEN 'SALES'
  WHEN "role" = 'GeneralManager' THEN 'MANAGER'
  WHEN "role" = 'MN' THEN 'MANAGER'
  WHEN "role" = 'Staff' THEN 'SALES'
  ELSE 'SALES'
END;

-- CreateTable
CREATE TABLE "AuditTrail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT,
    "actorUsername" TEXT NOT NULL,
    "actorDisplayName" TEXT,
    "actorRole" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "transactionCode" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AuditTrail_createdAt_idx" ON "AuditTrail"("createdAt");

-- CreateIndex
CREATE INDEX "AuditTrail_moduleName_idx" ON "AuditTrail"("moduleName");

-- CreateIndex
CREATE INDEX "AuditTrail_actorUsername_idx" ON "AuditTrail"("actorUsername");

-- CreateIndex
CREATE INDEX "AuditTrail_transactionCode_idx" ON "AuditTrail"("transactionCode");
