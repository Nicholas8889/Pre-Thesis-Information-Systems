BEGIN;
-- AlterTable
ALTER TABLE "delivery_note_items" ADD COLUMN     "source_id" TEXT;

-- CreateTable
CREATE TABLE "delivery_note_sources" (
    "id" TEXT NOT NULL,
    "delivery_note_id" TEXT NOT NULL,
    "picking_list_id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,

    CONSTRAINT "delivery_note_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_note_sources_picking_list_id_key" ON "delivery_note_sources"("picking_list_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_note_sources_sales_order_id_key" ON "delivery_note_sources"("sales_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_note_sources_invoice_id_key" ON "delivery_note_sources"("invoice_id");

-- CreateIndex
CREATE INDEX "delivery_note_sources_delivery_note_id_idx" ON "delivery_note_sources"("delivery_note_id");

-- CreateIndex
CREATE INDEX "delivery_note_items_source_id_idx" ON "delivery_note_items"("source_id");

-- AddForeignKey
ALTER TABLE "delivery_note_items" ADD CONSTRAINT "delivery_note_items_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "delivery_note_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_note_sources" ADD CONSTRAINT "delivery_note_sources_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "delivery_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_note_sources" ADD CONSTRAINT "delivery_note_sources_picking_list_id_fkey" FOREIGN KEY ("picking_list_id") REFERENCES "picking_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_note_sources" ADD CONSTRAINT "delivery_note_sources_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_note_sources" ADD CONSTRAINT "delivery_note_sources_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-only Prisma access; do not expose order or delivery data through public API roles.
ALTER TABLE "delivery_note_sources" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "delivery_note_sources" FROM anon, authenticated;

-- Preserve the original document and attach its existing picking/order/invoice links.
INSERT INTO "delivery_note_sources" ("id", "delivery_note_id", "picking_list_id", "sales_order_id", "invoice_id")
SELECT 'legacy-' || d.id, d.id, d.picking_list_id, p.sales_order_id, i.id
FROM delivery_notes d
JOIN picking_lists p ON p.id = d.picking_list_id
JOIN invoices i ON i.sales_order_id = p.sales_order_id
WHERE (d.sales_order_id IS NULL OR d.sales_order_id = p.sales_order_id)
  AND (d.invoice_id IS NULL OR d.invoice_id = i.id)
  AND d.customer_id = i.customer_id;
UPDATE delivery_note_items item SET source_id = source.id
FROM delivery_note_sources source WHERE source.delivery_note_id = item.delivery_note_id;
COMMIT;
