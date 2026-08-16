-- Normalize system-generated labels retained in existing business and audit records.
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE "CollectionTask"
SET "notes" = REPLACE("notes", 'Generated Billing follow-up for', 'Generated collection task for')
WHERE "notes" LIKE 'Generated Billing follow-up for%';

UPDATE "CollectionTask"
SET "notes" = REPLACE("notes", 'Credit billing reminder for', 'Credit payment collection reminder for')
WHERE "notes" LIKE 'Credit billing reminder for%';

UPDATE "AuditTrail"
SET "moduleName" = 'Collections'
WHERE "moduleName" = 'Billing';

UPDATE "AuditTrail"
SET "entityType" = 'COLLECTION_TASK'
WHERE "entityType" = 'FOLLOW_UP';

UPDATE "AuditTrail"
SET "moduleName" = 'Customer Outreach'
WHERE "moduleName" = 'Follow Up';

UPDATE "AuditTrail"
SET "entityType" = 'CUSTOMER_OUTREACH'
WHERE "entityType" = 'CUSTOMER_PRODUCT_FOLLOW_UP';

UPDATE "AuditTrail"
SET "changeSummary" = REPLACE("changeSummary", 'Credit billing reminder created', 'Credit payment collection task created')
WHERE "changeSummary" LIKE '%Credit billing reminder created%';

UPDATE "AuditTrail"
SET "changeSummary" = REPLACE("changeSummary", 'Billing record created', 'Collection task created')
WHERE "changeSummary" LIKE '%Billing record created%';

UPDATE "AuditTrail"
SET "changeSummary" = REPLACE("changeSummary", 'Product follow-up contact recorded', 'Customer outreach recorded')
WHERE "changeSummary" LIKE '%Product follow-up contact recorded%';

COMMIT;
