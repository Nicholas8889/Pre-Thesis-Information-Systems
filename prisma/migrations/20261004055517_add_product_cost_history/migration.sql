-- CreateTable
CREATE TABLE "product_cost_history" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_cost" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_cost_history_created_by_user_id_idx" ON "product_cost_history"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_cost_history_product_effective_key" ON "product_cost_history"("product_id", "effective_from");

-- AddForeignKey
ALTER TABLE "product_cost_history" ADD CONSTRAINT "product_cost_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_history" ADD CONSTRAINT "product_cost_history_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_cost_history"
  ADD CONSTRAINT "product_cost_history_unit_cost_check" CHECK ("unit_cost" >= 0);

-- The application uses server-side Prisma access; no public Data API policy.
ALTER TABLE "product_cost_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "product_cost_history" FROM anon, authenticated;

-- Existing List Price values are confirmed production costs. Record only the
-- currently known value from migration time; do not invent past cost history.
INSERT INTO "product_cost_history" ("id", "product_id", "unit_cost", "effective_from")
SELECT 'cost-baseline-' || "id", "id", "list_price", CURRENT_TIMESTAMP
FROM "products";
