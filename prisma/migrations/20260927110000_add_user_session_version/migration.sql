ALTER TABLE "users"
  ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "users"
  ADD CONSTRAINT "users_session_version_check" CHECK ("session_version" > 0);
