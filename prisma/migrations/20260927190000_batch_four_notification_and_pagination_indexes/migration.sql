CREATE INDEX "customers_status_portfolio_company_idx"
  ON "customers"("status", "portfolio_owner_user_id", "company_name");

CREATE INDEX "sales_orders_source_status_required_id_idx"
  ON "sales_orders"("source", "status", "required_date", "id");

CREATE INDEX "customer_inquiry_items_inquiry_id_idx"
  ON "customer_inquiry_items"("customer_inquiry_id");

CREATE INDEX "sales_order_items_order_id_idx"
  ON "sales_order_items"("sales_order_id");

CREATE INDEX "picking_lists_status_packed_at_id_idx"
  ON "picking_lists"("status", "packed_at", "id");

CREATE INDEX "collection_tasks_status_scheduled_id_idx"
  ON "collection_tasks"("status", "scheduled_date", "id");
