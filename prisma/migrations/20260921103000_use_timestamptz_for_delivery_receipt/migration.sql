ALTER TABLE "delivery_notes"
  ALTER COLUMN "received_at" TYPE TIMESTAMPTZ(3)
  USING "received_at" AT TIME ZONE 'UTC';
