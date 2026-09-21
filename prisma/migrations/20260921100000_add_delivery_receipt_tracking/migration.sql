ALTER TABLE "delivery_notes"
  ADD COLUMN "created_by" TEXT,
  ADD COLUMN "received_at" TIMESTAMP(3),
  ADD COLUMN "received_by" TEXT,
  ADD COLUMN "receipt_notes" TEXT;

UPDATE "delivery_notes"
SET "created_by" = COALESCE("issued_by", 'Historical data')
WHERE "created_by" IS NULL;

UPDATE "delivery_notes"
SET "received_at" = "updated_at",
    "received_by" = COALESCE("issued_by", 'Historical data')
WHERE "status" = 'Delivered'::"delivery_note_status"
  AND "received_at" IS NULL;
