ALTER TABLE "customers"
  ADD COLUMN "portfolio_owner_user_id" TEXT;

UPDATE "customers" AS customer
SET "portfolio_owner_user_id" = (
  SELECT sales_order."created_by_user_id"
  FROM "sales_orders" AS sales_order
  WHERE sales_order."customer_id" = customer."id"
    AND sales_order."created_by_user_id" IS NOT NULL
  ORDER BY sales_order."order_date" ASC, sales_order."created_at" ASC, sales_order."id" ASC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM "sales_orders" AS sales_order
  WHERE sales_order."customer_id" = customer."id"
    AND sales_order."created_by_user_id" IS NOT NULL
);

CREATE INDEX "customers_portfolio_owner_user_id_idx"
  ON "customers"("portfolio_owner_user_id");

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_portfolio_owner_user_id_fkey"
  FOREIGN KEY ("portfolio_owner_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
