CREATE TABLE "document_sequences" (
    "document_type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("document_type", "year"),
    CONSTRAINT "document_sequences_year_check" CHECK ("year" BETWEEN 2000 AND 9999),
    CONSTRAINT "document_sequences_last_value_check" CHECK ("last_value" >= 0)
);

ALTER TABLE "products" ADD COLUMN "sku" TEXT;
ALTER TABLE "customer_inquiry_items" ADD COLUMN "product_sku_snapshot" TEXT;
ALTER TABLE "sales_order_items" ADD COLUMN "product_sku_snapshot" TEXT;
ALTER TABLE "sales_orders"
  ADD COLUMN "customer_po_document_size" INTEGER,
  ADD COLUMN "customer_po_document_sha256" TEXT,
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "sales_orders_idempotency_key_key" ON "sales_orders"("idempotency_key");

ALTER TABLE "products"
  ADD CONSTRAINT "products_list_price_non_negative_check" CHECK ("list_price" >= 0),
  ADD CONSTRAINT "products_sku_canonical_check" CHECK ("sku" IS NULL OR ("sku" = upper(btrim("sku")) AND char_length("sku") BETWEEN 1 AND 64));

ALTER TABLE "customer_inquiry_items"
  ADD CONSTRAINT "customer_inquiry_items_quantity_positive_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "customer_inquiry_items_prices_non_negative_check" CHECK (
    ("requested_unit_price" IS NULL OR "requested_unit_price" >= 0) AND
    ("agreed_unit_price" IS NULL OR "agreed_unit_price" >= 0)
  );

ALTER TABLE "sales_order_items"
  ADD CONSTRAINT "sales_order_items_quantity_positive_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "sales_order_items_amounts_non_negative_check" CHECK (
    "base_unit_price" >= 0 AND "markup_percent" BETWEEN 0 AND 100 AND
    "discount_percent" BETWEEN 0 AND 100 AND "final_unit_price" >= 0 AND "subtotal" >= 0
  );

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_amounts_non_negative_check" CHECK (
    "subtotal" >= 0 AND "total" >= 0 AND "ppn_rate_basis_points" >= 0 AND
    "ppn_amount" >= 0 AND "net_sales_amount" >= 0
  ),
  ADD CONSTRAINT "sales_orders_version_positive_check" CHECK ("version" > 0),
  ADD CONSTRAINT "sales_orders_document_size_check" CHECK ("customer_po_document_size" IS NULL OR "customer_po_document_size" > 0),
  ADD CONSTRAINT "sales_orders_payment_term_shape_check" CHECK (
    ("payment_term_type" = 'IMMEDIATE' AND "credit_term_weeks" IS NULL AND "credit_term_months" IS NULL) OR
    ("payment_term_type" = 'CREDIT' AND (
      ("credit_term_weeks" BETWEEN 1 AND 4 AND "credit_term_months" IS NULL) OR
      ("credit_term_months" BETWEEN 1 AND 12 AND "credit_term_weeks" IS NULL)
    ))
  ),
  ADD CONSTRAINT "sales_orders_customer_po_metadata_check" CHECK (
    ("source" = 'DIRECT' AND "customer_po_number" IS NULL AND "required_date" IS NULL AND
      "customer_po_document_name" IS NULL AND "customer_po_document_stored_name" IS NULL AND
      "customer_po_document_mime_type" IS NULL AND "customer_po_document_size" IS NULL AND
      "customer_po_document_sha256" IS NULL) OR
    ("source" = 'CUSTOMER_PO' AND "customer_po_number" IS NOT NULL AND "required_date" IS NOT NULL AND
      "customer_po_document_name" IS NOT NULL AND "customer_po_document_stored_name" IS NOT NULL AND
      "customer_po_document_mime_type" IS NOT NULL AND
      (("customer_po_document_size" IS NULL AND "customer_po_document_sha256" IS NULL) OR
       ("customer_po_document_size" > 0 AND "customer_po_document_sha256" ~ '^[0-9a-f]{64}$')))
  );

INSERT INTO "document_sequences" ("document_type", "year", "last_value", "updated_at")
SELECT document_type, document_year, MAX(sequence_value), CURRENT_TIMESTAMP
FROM (
  SELECT 'SO'::text AS document_type,
         substring("order_number" from '^SO-([0-9]{4})-[0-9]+$')::integer AS document_year,
         substring("order_number" from '^SO-[0-9]{4}-([0-9]+)$')::integer AS sequence_value
  FROM "sales_orders" WHERE "order_number" ~ '^SO-[0-9]{4}-[0-9]+$'
  UNION ALL
  SELECT 'PO',
         substring("customer_po_number" from '^PO-([0-9]{4})-[0-9]+$')::integer,
         substring("customer_po_number" from '^PO-[0-9]{4}-([0-9]+)$')::integer
  FROM "sales_orders" WHERE "customer_po_number" ~ '^PO-[0-9]{4}-[0-9]+$'
  UNION ALL
  SELECT 'INV',
         substring("invoice_number" from '^INV-([0-9]{4})-[0-9]+$')::integer,
         substring("invoice_number" from '^INV-[0-9]{4}-([0-9]+)$')::integer
  FROM "invoices" WHERE "invoice_number" ~ '^INV-[0-9]{4}-[0-9]+$'
  UNION ALL
  SELECT 'INQ',
         substring("inquiry_number" from '^INQ-([0-9]{4})-[0-9]+$')::integer,
         substring("inquiry_number" from '^INQ-[0-9]{4}-([0-9]+)$')::integer
  FROM "customer_inquiries" WHERE "inquiry_number" ~ '^INQ-[0-9]{4}-[0-9]+$'
  UNION ALL
  SELECT 'SJ',
         substring("delivery_note_number" from '^SJ-([0-9]{4})-[0-9]+$')::integer,
         substring("delivery_note_number" from '^SJ-[0-9]{4}-([0-9]+)$')::integer
  FROM "delivery_notes" WHERE "delivery_note_number" ~ '^SJ-[0-9]{4}-[0-9]+$'
) canonical_numbers
WHERE document_year IS NOT NULL AND sequence_value IS NOT NULL
GROUP BY document_type, document_year
ON CONFLICT ("document_type", "year") DO UPDATE SET
  "last_value" = GREATEST("document_sequences"."last_value", EXCLUDED."last_value"),
  "updated_at" = CURRENT_TIMESTAMP;
