ALTER TABLE "invoices"
  ADD COLUMN "order_number_snapshot" TEXT,
  ADD COLUMN "order_source_snapshot" "sales_order_source",
  ADD COLUMN "customer_po_number_snapshot" TEXT,
  ADD COLUMN "customer_name_snapshot" TEXT,
  ADD COLUMN "customer_company_snapshot" TEXT,
  ADD COLUMN "customer_phone_snapshot" TEXT,
  ADD COLUMN "customer_email_snapshot" TEXT,
  ADD COLUMN "customer_address_snapshot" TEXT,
  ADD COLUMN "items_snapshot" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cancellation_reason" TEXT,
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by_user_id" TEXT;

-- Canonicalize legacy tax snapshots before enforcing exact Rupiah reconciliation.
UPDATE "sales_orders"
SET "ppn_rate_basis_points" = 0, "ppn_amount" = 0, "net_sales_amount" = "total"
WHERE "ppn_applied" = false
  AND ("ppn_rate_basis_points" <> 0 OR "ppn_amount" <> 0 OR "net_sales_amount" <> "total");

UPDATE "sales_orders"
SET
  "net_sales_amount" = round("total"::numeric * 10000 / (10000 + "ppn_rate_basis_points"))::integer,
  "ppn_amount" = "total" - round("total"::numeric * 10000 / (10000 + "ppn_rate_basis_points"))::integer
WHERE "ppn_applied" = true
  AND "net_sales_amount" + "ppn_amount" <> "total";

UPDATE "invoices" i
SET
  "ppn_applied" = so."ppn_applied",
  "ppn_rate_basis_points" = so."ppn_rate_basis_points",
  "ppn_amount" = so."ppn_amount",
  "net_sales_amount" = so."net_sales_amount"
FROM "sales_orders" so
WHERE i."sales_order_id" = so."id"
  AND i."net_sales_amount" + i."ppn_amount" <> i."total_amount";

UPDATE "invoices" i
SET
  "order_number_snapshot" = so."order_number",
  "order_source_snapshot" = so."source",
  "customer_po_number_snapshot" = so."customer_po_number",
  "customer_name_snapshot" = c."name",
  "customer_company_snapshot" = c."company_name",
  "customer_phone_snapshot" = c."phone",
  "customer_email_snapshot" = c."email",
  "customer_address_snapshot" = c."address",
  "items_snapshot" = COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'itemName', soi."item_name",
      'productSku', soi."product_sku_snapshot",
      'quantity', soi."quantity",
      'baseUnitPrice', soi."base_unit_price",
      'markupPercent', soi."markup_percent",
      'discountPercent', soi."discount_percent",
      'finalUnitPrice', soi."final_unit_price",
      'subtotal', soi."subtotal"
    ) ORDER BY soi."id")
    FROM "sales_order_items" soi
    WHERE soi."sales_order_id" = so."id"
  ), '[]'::jsonb)
FROM "sales_orders" so
JOIN "customers" c ON c."id" = so."customer_id"
WHERE i."sales_order_id" = so."id";

ALTER TABLE "invoices"
  ALTER COLUMN "order_number_snapshot" SET NOT NULL,
  ALTER COLUMN "order_source_snapshot" SET NOT NULL,
  ALTER COLUMN "customer_name_snapshot" SET NOT NULL,
  ALTER COLUMN "customer_company_snapshot" SET NOT NULL,
  ALTER COLUMN "customer_phone_snapshot" SET NOT NULL,
  ALTER COLUMN "customer_email_snapshot" SET NOT NULL,
  ALTER COLUMN "customer_address_snapshot" SET NOT NULL,
  ALTER COLUMN "items_snapshot" SET NOT NULL,
  ADD CONSTRAINT "invoices_amount_reconciliation_check" CHECK (
    "total_amount" >= 0 AND "paid_amount" >= 0 AND "remaining_amount" >= 0 AND
    "paid_amount" <= "total_amount" AND "remaining_amount" = "total_amount" - "paid_amount"
  ),
  ADD CONSTRAINT "invoices_tax_reconciliation_check" CHECK (
    "ppn_rate_basis_points" BETWEEN 0 AND 10000 AND "ppn_amount" >= 0 AND
    "net_sales_amount" >= 0 AND "net_sales_amount" + "ppn_amount" = "total_amount"
  ),
  ADD CONSTRAINT "invoices_payment_term_shape_check" CHECK (
    ("payment_term_type" = 'IMMEDIATE' AND "credit_term_weeks" IS NULL AND "credit_term_months" IS NULL) OR
    ("payment_term_type" = 'CREDIT' AND (
      ("credit_term_weeks" BETWEEN 1 AND 4 AND "credit_term_months" IS NULL) OR
      ("credit_term_months" BETWEEN 1 AND 12 AND "credit_term_weeks" IS NULL)
    ))
  ),
  ADD CONSTRAINT "invoices_version_positive_check" CHECK ("version" > 0),
  ADD CONSTRAINT "invoices_cancellation_metadata_check" CHECK (
    ("cancellation_reason" IS NULL AND "cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL) OR
    ("status" = 'Cancelled' AND btrim("cancellation_reason") <> '' AND
      "cancelled_at" IS NOT NULL AND "cancelled_by_user_id" IS NOT NULL)
  );

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive_check" CHECK ("amount" > 0);

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_tax_reconciliation_check" CHECK (
    "ppn_rate_basis_points" BETWEEN 0 AND 10000 AND "ppn_amount" >= 0 AND
    "net_sales_amount" >= 0 AND "net_sales_amount" + "ppn_amount" = "total"
  );

CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");
