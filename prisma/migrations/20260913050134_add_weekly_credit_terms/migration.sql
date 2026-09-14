BEGIN;

-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN     "credit_term_weeks" INTEGER;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "credit_term_weeks" INTEGER;

-- Weekly terms are exclusive of calendar-month terms.
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_credit_term_weeks_check"
CHECK ("credit_term_weeks" IS NULL OR (
  "payment_term_type" = 'CREDIT' AND "credit_term_months" IS NULL
  AND "credit_term_weeks" BETWEEN 1 AND 4
));

-- Weekly terms are exclusive of calendar-month terms.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credit_term_weeks_check"
CHECK ("credit_term_weeks" IS NULL OR (
  "payment_term_type" = 'CREDIT' AND "credit_term_months" IS NULL
  AND "credit_term_weeks" BETWEEN 1 AND 4
));

COMMIT;
