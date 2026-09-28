ALTER TABLE "invoices"
  ALTER COLUMN "order_number_snapshot" SET DEFAULT '',
  ALTER COLUMN "order_source_snapshot" SET DEFAULT 'DIRECT',
  ALTER COLUMN "customer_name_snapshot" SET DEFAULT '',
  ALTER COLUMN "customer_company_snapshot" SET DEFAULT '',
  ALTER COLUMN "customer_phone_snapshot" SET DEFAULT '',
  ALTER COLUMN "customer_email_snapshot" SET DEFAULT '',
  ALTER COLUMN "customer_address_snapshot" SET DEFAULT '',
  ALTER COLUMN "items_snapshot" SET DEFAULT '[]'::jsonb;
