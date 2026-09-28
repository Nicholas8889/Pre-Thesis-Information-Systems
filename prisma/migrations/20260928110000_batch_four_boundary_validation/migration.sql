-- Existing Packed rows without a trustworthy physical package count remain readable.
-- NOT VALID enforces the lifecycle rule for new/updated rows without inventing a backfill.
ALTER TABLE "picking_lists"
ADD CONSTRAINT "picking_lists_package_count_lifecycle_check"
CHECK (
  ("status" = 'Packed' AND "package_count" IS NOT NULL) OR
  ("status" <> 'Packed' AND "package_count" IS NULL)
) NOT VALID;
