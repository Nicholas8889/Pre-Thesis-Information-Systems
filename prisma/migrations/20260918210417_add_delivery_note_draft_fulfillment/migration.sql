ALTER TABLE "delivery_notes"
  ADD COLUMN "issued_at" TIMESTAMP(3),
  ADD COLUMN "issued_by" TEXT;

ALTER TABLE "delivery_note_items"
  ADD COLUMN "picking_list_item_id" TEXT,
  ADD COLUMN "ordered_quantity_snapshot" INTEGER,
  ADD COLUMN "packed_quantity_snapshot" INTEGER,
  ADD COLUMN "outstanding_quantity" INTEGER,
  ADD COLUMN "adjustment_note" TEXT;

UPDATE "delivery_notes"
SET "issued_at" = "created_at"
WHERE "status" <> ('Draft'::"delivery_note_status");

UPDATE "delivery_note_items"
SET "ordered_quantity_snapshot" = "quantity",
    "packed_quantity_snapshot" = "quantity",
    "outstanding_quantity" = 0;

ALTER TABLE "delivery_note_items"
  ALTER COLUMN "ordered_quantity_snapshot" SET NOT NULL,
  ALTER COLUMN "packed_quantity_snapshot" SET NOT NULL,
  ALTER COLUMN "outstanding_quantity" SET NOT NULL;

CREATE UNIQUE INDEX "delivery_note_items_picking_list_item_id_key"
  ON "delivery_note_items"("picking_list_item_id");

ALTER TABLE "delivery_note_items"
  ADD CONSTRAINT "delivery_note_items_picking_list_item_id_fkey"
  FOREIGN KEY ("picking_list_item_id") REFERENCES "picking_list_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_note_items_fulfillment_check" CHECK (
    "ordered_quantity_snapshot" > 0
    AND "packed_quantity_snapshot" >= 0
    AND "packed_quantity_snapshot" <= "ordered_quantity_snapshot"
    AND "quantity" >= 0
    AND "quantity" <= "packed_quantity_snapshot"
    AND "outstanding_quantity" = "ordered_quantity_snapshot" - "quantity"
);
