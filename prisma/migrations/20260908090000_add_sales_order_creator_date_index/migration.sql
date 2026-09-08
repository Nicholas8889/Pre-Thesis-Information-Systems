CREATE INDEX "sales_orders_created_by_user_id_order_date_idx"
ON "sales_orders"("created_by_user_id", "order_date");
