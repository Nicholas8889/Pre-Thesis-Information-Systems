BEGIN;

CREATE TYPE "picking_item_availability" AS ENUM (
  'Unchecked',
  'Available',
  'Partial',
  'Unavailable'
);

ALTER TABLE "picking_list_items"
  DROP CONSTRAINT "picking_list_items_quantities_check";

ALTER TABLE "picking_list_items"
  RENAME COLUMN "picked_quantity" TO "available_quantity";

ALTER TABLE "picking_list_items"
  ADD COLUMN "availability_status" "picking_item_availability" NOT NULL DEFAULT 'Unchecked';

-- Unstarted legacy lists must be explicitly checked in the new workflow.
UPDATE "picking_list_items" AS item
SET
  "available_quantity" = 0,
  "packed_quantity" = 0,
  "availability_status" = 'Unchecked'
FROM "picking_lists" AS list
WHERE list."id" = item."picking_list_id"
  AND list."status" = 'Pending';

-- Preserve recorded progress and completed history for legacy lists.
UPDATE "picking_list_items" AS item
SET "availability_status" = CASE
  WHEN item."available_quantity" = 0
    THEN 'Unavailable'::"picking_item_availability"
  WHEN item."available_quantity" = item."ordered_quantity"
    THEN 'Available'::"picking_item_availability"
  ELSE 'Partial'::"picking_item_availability"
END
FROM "picking_lists" AS list
WHERE list."id" = item."picking_list_id"
  AND list."status" <> 'Pending';

ALTER TABLE "picking_list_items"
  ADD CONSTRAINT "picking_list_items_quantities_check" CHECK (
    "ordered_quantity" > 0
    AND "available_quantity" >= 0
    AND "packed_quantity" >= 0
    AND "packed_quantity" <= "available_quantity"
    AND "available_quantity" <= "ordered_quantity"
    AND (
      (
        "availability_status" = 'Unchecked'
        AND "available_quantity" = 0
        AND "packed_quantity" = 0
      )
      OR (
        "availability_status" = 'Unavailable'
        AND "available_quantity" = 0
      )
      OR (
        "availability_status" = 'Available'
        AND "available_quantity" = "ordered_quantity"
      )
      OR (
        "availability_status" = 'Partial'
        AND "available_quantity" > 0
        AND "available_quantity" < "ordered_quantity"
      )
    )
  );

COMMIT;
