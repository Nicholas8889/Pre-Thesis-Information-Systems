ALTER TABLE "delivery_notes"
  ADD COLUMN "order_references_snapshot" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "invoice_references_snapshot" TEXT NOT NULL DEFAULT '[]';

UPDATE "delivery_notes" note
SET
  "order_references_snapshot" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "delivery_note_sources" source
      WHERE source."delivery_note_id" = note."id"
    ) THEN COALESCE((
      SELECT jsonb_agg(ref."reference" ORDER BY ref."order_number")::text
      FROM (
        SELECT
          source_order."order_number",
          CASE
            WHEN source_order."customer_po_number" IS NOT NULL
              THEN source_order."customer_po_number" || ' / ' || source_order."order_number"
            ELSE source_order."order_number"
          END AS "reference"
        FROM "delivery_note_sources" source
        JOIN "sales_orders" source_order ON source_order."id" = source."sales_order_id"
        WHERE source."delivery_note_id" = note."id"
      ) ref
    ), '[]')
    WHEN note."sales_order_id" IS NOT NULL THEN COALESCE((
      SELECT jsonb_build_array(
        CASE
          WHEN direct_order."customer_po_number" IS NOT NULL
            THEN direct_order."customer_po_number" || ' / ' || direct_order."order_number"
          ELSE direct_order."order_number"
        END
      )::text
      FROM "sales_orders" direct_order
      WHERE direct_order."id" = note."sales_order_id"
    ), '[]')
    WHEN note."invoice_id" IS NOT NULL THEN COALESCE((
      SELECT CASE
        WHEN invoice."order_number_snapshot" <> ''
          THEN jsonb_build_array(invoice."order_number_snapshot")::text
        ELSE '[]'
      END
      FROM "invoices" invoice
      WHERE invoice."id" = note."invoice_id"
    ), '[]')
    ELSE '[]'
  END,
  "invoice_references_snapshot" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "delivery_note_sources" source
      WHERE source."delivery_note_id" = note."id"
    ) THEN COALESCE((
      SELECT jsonb_agg(ref."invoice_number" ORDER BY ref."order_number")::text
      FROM (
        SELECT source_order."order_number", source_invoice."invoice_number"
        FROM "delivery_note_sources" source
        JOIN "sales_orders" source_order ON source_order."id" = source."sales_order_id"
        JOIN "invoices" source_invoice ON source_invoice."id" = source."invoice_id"
        WHERE source."delivery_note_id" = note."id"
      ) ref
    ), '[]')
    WHEN note."invoice_id" IS NOT NULL THEN COALESCE((
      SELECT jsonb_build_array(invoice."invoice_number")::text
      FROM "invoices" invoice
      WHERE invoice."id" = note."invoice_id"
    ), '[]')
    ELSE '[]'
  END;

CREATE INDEX "invoices_status_due_date_id_idx"
  ON "invoices"("status", "due_date", "id");

CREATE INDEX "invoices_status_remaining_amount_id_idx"
  ON "invoices"("status", "remaining_amount", "id");

CREATE INDEX "delivery_notes_status_date_id_idx"
  ON "delivery_notes"("status", "delivery_date", "id");
