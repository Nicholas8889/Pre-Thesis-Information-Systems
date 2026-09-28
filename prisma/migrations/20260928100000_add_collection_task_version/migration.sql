ALTER TABLE "collection_tasks"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "collection_tasks"
ADD CONSTRAINT "collection_tasks_version_positive_check"
CHECK ("version" > 0);
