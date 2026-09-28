DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT LOWER(BTRIM("username")) AS canonical_username
      FROM "users"
      GROUP BY LOWER(BTRIM("username"))
      HAVING COUNT(*) > 1
    ) AS duplicates
  ) THEN
    RAISE EXCEPTION 'Cannot canonicalize usernames: duplicates differ only by case or surrounding whitespace';
  END IF;
END $$;

UPDATE "users"
SET "username" = LOWER(BTRIM("username"))
WHERE "username" <> LOWER(BTRIM("username"));

CREATE UNIQUE INDEX "users_username_canonical_key"
  ON "users" (LOWER(BTRIM("username")));

ALTER TABLE "users"
  ADD CONSTRAINT "users_username_canonical_check"
  CHECK (
    "username" = LOWER(BTRIM("username"))
    AND CHAR_LENGTH("username") BETWEEN 1 AND 64
  );
