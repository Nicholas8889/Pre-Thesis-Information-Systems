CREATE TYPE "picking_list_status" AS ENUM ('Pending', 'InProgress', 'Packed');

CREATE TABLE "picking_lists" (
  "id" TEXT NOT NULL,
  "picking_list_number" TEXT NOT NULL,
  "sales_order_id" TEXT NOT NULL,
  "status" "picking_list_status" NOT NULL DEFAULT 'Pending',
  "picker_name" TEXT,
  "packer_name" TEXT,
  "package_count" INTEGER,
  "notes" TEXT,
  "packed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "picking_lists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "picking_lists_package_count_check" CHECK ("package_count" IS NULL OR "package_count" > 0)
);

CREATE TABLE "picking_list_items" (
  "id" TEXT NOT NULL,
  "picking_list_id" TEXT NOT NULL,
  "sales_order_item_id" TEXT NOT NULL,
  "item_name" TEXT NOT NULL,
  "ordered_quantity" INTEGER NOT NULL,
  "picked_quantity" INTEGER NOT NULL DEFAULT 0,
  "packed_quantity" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  CONSTRAINT "picking_list_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "picking_list_items_quantities_check" CHECK (
    "ordered_quantity" > 0 AND
    "picked_quantity" >= 0 AND
    "packed_quantity" >= 0 AND
    "packed_quantity" <= "picked_quantity" AND
    "picked_quantity" <= "ordered_quantity"
  )
);

ALTER TABLE "delivery_notes" ADD COLUMN "picking_list_id" TEXT;

CREATE UNIQUE INDEX "picking_lists_picking_list_number_key" ON "picking_lists"("picking_list_number");
CREATE UNIQUE INDEX "picking_lists_sales_order_id_key" ON "picking_lists"("sales_order_id");
CREATE INDEX "picking_lists_status_created_at_idx" ON "picking_lists"("status", "created_at");
CREATE UNIQUE INDEX "picking_list_items_list_order_item_key" ON "picking_list_items"("picking_list_id", "sales_order_item_id");
CREATE INDEX "picking_list_items_picking_list_id_idx" ON "picking_list_items"("picking_list_id");
CREATE UNIQUE INDEX "delivery_notes_picking_list_id_key" ON "delivery_notes"("picking_list_id");

ALTER TABLE "picking_lists" ADD CONSTRAINT "picking_lists_sales_order_id_fkey"
  FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "picking_list_items" ADD CONSTRAINT "picking_list_items_picking_list_id_fkey"
  FOREIGN KEY ("picking_list_id") REFERENCES "picking_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_picking_list_id_fkey"
  FOREIGN KEY ("picking_list_id") REFERENCES "picking_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "picking_lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "picking_list_items" ENABLE ROW LEVEL SECURITY;
