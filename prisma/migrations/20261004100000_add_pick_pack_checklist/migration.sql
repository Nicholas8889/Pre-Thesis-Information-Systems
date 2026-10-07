BEGIN;

-- Existing quantity snapshots and completion records are left intact.
ALTER TABLE "picking_lists"
  ADD COLUMN "uses_checklist" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "picking_list_items"
  ADD COLUMN "is_checked" BOOLEAN NOT NULL DEFAULT false;

-- Checklist completion requires no physical package count.
ALTER TABLE "picking_lists"
  DROP CONSTRAINT "picking_lists_package_count_lifecycle_check";
ALTER TABLE "picking_lists"
  ADD CONSTRAINT "picking_lists_package_count_lifecycle_check" CHECK (
    ("status" = 'Packed' AND ("uses_checklist" OR "package_count" IS NOT NULL)) OR
    ("status" <> 'Packed' AND "package_count" IS NULL)
  ) NOT VALID;

COMMIT;
