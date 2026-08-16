-- Standardize physical PostgreSQL identifiers without recreating tables or rewriting rows.
-- Prisma keeps the canonical camelCase domain API through explicit @map/@@map metadata.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Enum type identifiers
ALTER TYPE "CustomerStatus" RENAME TO "customer_status";
ALTER TYPE "ProductStatus" RENAME TO "product_status";
ALTER TYPE "SalesOrderSource" RENAME TO "sales_order_source";
ALTER TYPE "SalesOrderStatus" RENAME TO "sales_order_status";
ALTER TYPE "SalesOrderApprovalStatus" RENAME TO "sales_order_approval_status";
ALTER TYPE "InvoiceStatus" RENAME TO "invoice_status";
ALTER TYPE "PaymentMethod" RENAME TO "payment_method";
ALTER TYPE "PaymentTermType" RENAME TO "payment_term_type";
ALTER TYPE "CollectionTaskStatus" RENAME TO "collection_task_status";
ALTER TYPE "CustomerInquiryStatus" RENAME TO "customer_inquiry_status";
ALTER TYPE "DeliveryNoteStatus" RENAME TO "delivery_note_status";
ALTER TYPE "UserRole" RENAME TO "user_role";
ALTER TYPE "UserStatus" RENAME TO "user_status";

-- Table identifiers
ALTER TABLE "User" RENAME TO "users";
ALTER TABLE "AuditTrail" RENAME TO "audit_trails";
ALTER TABLE "Customer" RENAME TO "customers";
ALTER TABLE "Product" RENAME TO "products";
ALTER TABLE "SalesOrder" RENAME TO "sales_orders";
ALTER TABLE "CustomerInquiry" RENAME TO "customer_inquiries";
ALTER TABLE "CustomerInquiryItem" RENAME TO "customer_inquiry_items";
ALTER TABLE "SalesOrderItem" RENAME TO "sales_order_items";
ALTER TABLE "Invoice" RENAME TO "invoices";
ALTER TABLE "Payment" RENAME TO "payments";
ALTER TABLE "CollectionTask" RENAME TO "collection_tasks";
ALTER TABLE "CustomerOutreach" RENAME TO "customer_outreach";
ALTER TABLE "DeliveryNote" RENAME TO "delivery_notes";
ALTER TABLE "DeliveryNoteItem" RENAME TO "delivery_note_items";

-- User columns
ALTER TABLE "users" RENAME COLUMN "idUser" TO "id";
ALTER TABLE "users" RENAME COLUMN "passwordHash" TO "password_hash";
ALTER TABLE "users" RENAME COLUMN "displayName" TO "display_name";
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";

-- Audit columns
ALTER TABLE "audit_trails" RENAME COLUMN "idAuditTrail" TO "id";
ALTER TABLE "audit_trails" RENAME COLUMN "actorUserId" TO "actor_user_id";
ALTER TABLE "audit_trails" RENAME COLUMN "actorUsername" TO "actor_username";
ALTER TABLE "audit_trails" RENAME COLUMN "actorDisplayName" TO "actor_display_name";
ALTER TABLE "audit_trails" RENAME COLUMN "actorRole" TO "actor_role";
ALTER TABLE "audit_trails" RENAME COLUMN "moduleName" TO "module_name";
ALTER TABLE "audit_trails" RENAME COLUMN "entityType" TO "entity_type";
ALTER TABLE "audit_trails" RENAME COLUMN "entityId" TO "entity_id";
ALTER TABLE "audit_trails" RENAME COLUMN "recordReference" TO "record_reference";
ALTER TABLE "audit_trails" RENAME COLUMN "changeSummary" TO "change_summary";
ALTER TABLE "audit_trails" RENAME COLUMN "actionNote" TO "action_note";
ALTER TABLE "audit_trails" RENAME COLUMN "oldValue" TO "old_value";
ALTER TABLE "audit_trails" RENAME COLUMN "newValue" TO "new_value";
ALTER TABLE "audit_trails" RENAME COLUMN "createdAt" TO "created_at";

-- Customer and product columns
ALTER TABLE "customers" RENAME COLUMN "idCustomer" TO "id";
ALTER TABLE "customers" RENAME COLUMN "companyName" TO "company_name";
ALTER TABLE "customers" RENAME COLUMN "customerType" TO "customer_segment";
ALTER TABLE "customers" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "customers" RENAME COLUMN "updatedAt" TO "updated_at";

ALTER TABLE "products" RENAME COLUMN "idProduct" TO "id";
ALTER TABLE "products" RENAME COLUMN "productName" TO "product_name";
ALTER TABLE "products" RENAME COLUMN "price" TO "list_price";
ALTER TABLE "products" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "products" RENAME COLUMN "updatedAt" TO "updated_at";

-- Sales order columns
ALTER TABLE "sales_orders" RENAME COLUMN "idSalesOrder" TO "id";
ALTER TABLE "sales_orders" RENAME COLUMN "orderNumber" TO "order_number";
ALTER TABLE "sales_orders" RENAME COLUMN "customerPoNumber" TO "customer_po_number";
ALTER TABLE "sales_orders" RENAME COLUMN "requiredDate" TO "required_date";
ALTER TABLE "sales_orders" RENAME COLUMN "customerPoDocumentName" TO "customer_po_document_name";
ALTER TABLE "sales_orders" RENAME COLUMN "customerPoDocumentStoredName" TO "customer_po_document_stored_name";
ALTER TABLE "sales_orders" RENAME COLUMN "customerPoDocumentMimeType" TO "customer_po_document_mime_type";
ALTER TABLE "sales_orders" RENAME COLUMN "customerId" TO "customer_id";
ALTER TABLE "sales_orders" RENAME COLUMN "orderDate" TO "order_date";
ALTER TABLE "sales_orders" RENAME COLUMN "customerNpwpSnapshot" TO "customer_npwp_snapshot";
ALTER TABLE "sales_orders" RENAME COLUMN "ppnApplied" TO "ppn_applied";
ALTER TABLE "sales_orders" RENAME COLUMN "ppnRateBasisPoints" TO "ppn_rate_basis_points";
ALTER TABLE "sales_orders" RENAME COLUMN "ppnAmount" TO "ppn_amount";
ALTER TABLE "sales_orders" RENAME COLUMN "netSalesAmount" TO "net_sales_amount";
ALTER TABLE "sales_orders" RENAME COLUMN "paymentTermType" TO "payment_term_type";
ALTER TABLE "sales_orders" RENAME COLUMN "creditTermMonths" TO "credit_term_months";
ALTER TABLE "sales_orders" RENAME COLUMN "approvalStatus" TO "approval_status";
ALTER TABLE "sales_orders" RENAME COLUMN "approvalRisk" TO "approval_risk";
ALTER TABLE "sales_orders" RENAME COLUMN "approvalDecisionNote" TO "approval_decision_note";
ALTER TABLE "sales_orders" RENAME COLUMN "approvalDecidedAt" TO "approval_decided_at";
ALTER TABLE "sales_orders" RENAME COLUMN "approvalDecidedById" TO "approval_decided_by_id";
ALTER TABLE "sales_orders" RENAME COLUMN "createdByUserId" TO "created_by_user_id";
ALTER TABLE "sales_orders" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "sales_orders" RENAME COLUMN "updatedAt" TO "updated_at";

-- Inquiry and item columns
ALTER TABLE "customer_inquiries" RENAME COLUMN "idCustomerInquiry" TO "id";
ALTER TABLE "customer_inquiries" RENAME COLUMN "inquiryNumber" TO "inquiry_number";
ALTER TABLE "customer_inquiries" RENAME COLUMN "customerId" TO "customer_id";
ALTER TABLE "customer_inquiries" RENAME COLUMN "inquiryDate" TO "inquiry_date";
ALTER TABLE "customer_inquiries" RENAME COLUMN "neededBy" TO "needed_by";
ALTER TABLE "customer_inquiries" RENAME COLUMN "statusNote" TO "status_note";
ALTER TABLE "customer_inquiries" RENAME COLUMN "salesOrderId" TO "sales_order_id";
ALTER TABLE "customer_inquiries" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "customer_inquiries" RENAME COLUMN "updatedAt" TO "updated_at";

ALTER TABLE "customer_inquiry_items" RENAME COLUMN "idCustomerInquiryItem" TO "id";
ALTER TABLE "customer_inquiry_items" RENAME COLUMN "customerInquiryId" TO "customer_inquiry_id";
ALTER TABLE "customer_inquiry_items" RENAME COLUMN "productId" TO "product_id";
ALTER TABLE "customer_inquiry_items" RENAME COLUMN "itemName" TO "item_name";
ALTER TABLE "customer_inquiry_items" RENAME COLUMN "requestedPrice" TO "requested_unit_price";
ALTER TABLE "customer_inquiry_items" RENAME COLUMN "agreedPrice" TO "agreed_unit_price";

ALTER TABLE "sales_order_items" RENAME COLUMN "idSalesOrderItem" TO "id";
ALTER TABLE "sales_order_items" RENAME COLUMN "salesOrderId" TO "sales_order_id";
ALTER TABLE "sales_order_items" RENAME COLUMN "productId" TO "product_id";
ALTER TABLE "sales_order_items" RENAME COLUMN "itemName" TO "item_name";
ALTER TABLE "sales_order_items" RENAME COLUMN "price" TO "base_unit_price";
ALTER TABLE "sales_order_items" RENAME COLUMN "markupPercent" TO "markup_percent";
ALTER TABLE "sales_order_items" RENAME COLUMN "discountPercent" TO "discount_percent";
ALTER TABLE "sales_order_items" RENAME COLUMN "unitPrice" TO "final_unit_price";

-- Invoice and payment columns
ALTER TABLE "invoices" RENAME COLUMN "idInvoice" TO "id";
ALTER TABLE "invoices" RENAME COLUMN "invoiceNumber" TO "invoice_number";
ALTER TABLE "invoices" RENAME COLUMN "salesOrderId" TO "sales_order_id";
ALTER TABLE "invoices" RENAME COLUMN "customerId" TO "customer_id";
ALTER TABLE "invoices" RENAME COLUMN "issueDate" TO "issue_date";
ALTER TABLE "invoices" RENAME COLUMN "dueDate" TO "due_date";
ALTER TABLE "invoices" RENAME COLUMN "totalAmount" TO "total_amount";
ALTER TABLE "invoices" RENAME COLUMN "paidAmount" TO "paid_amount";
ALTER TABLE "invoices" RENAME COLUMN "remainingAmount" TO "remaining_amount";
ALTER TABLE "invoices" RENAME COLUMN "customerNpwpSnapshot" TO "customer_npwp_snapshot";
ALTER TABLE "invoices" RENAME COLUMN "ppnApplied" TO "ppn_applied";
ALTER TABLE "invoices" RENAME COLUMN "ppnRateBasisPoints" TO "ppn_rate_basis_points";
ALTER TABLE "invoices" RENAME COLUMN "ppnAmount" TO "ppn_amount";
ALTER TABLE "invoices" RENAME COLUMN "netSalesAmount" TO "net_sales_amount";
ALTER TABLE "invoices" RENAME COLUMN "paymentTermType" TO "payment_term_type";
ALTER TABLE "invoices" RENAME COLUMN "creditTermMonths" TO "credit_term_months";
ALTER TABLE "invoices" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "invoices" RENAME COLUMN "updatedAt" TO "updated_at";

ALTER TABLE "payments" RENAME COLUMN "idPayment" TO "id";
ALTER TABLE "payments" RENAME COLUMN "invoiceId" TO "invoice_id";
ALTER TABLE "payments" RENAME COLUMN "paymentDate" TO "payment_date";
ALTER TABLE "payments" RENAME COLUMN "paymentMethod" TO "payment_method";
ALTER TABLE "payments" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "payments" RENAME COLUMN "updatedAt" TO "updated_at";

-- Collection and outreach columns
ALTER TABLE "collection_tasks" RENAME COLUMN "idCollectionTask" TO "id";
ALTER TABLE "collection_tasks" RENAME COLUMN "customerId" TO "customer_id";
ALTER TABLE "collection_tasks" RENAME COLUMN "invoiceId" TO "invoice_id";
ALTER TABLE "collection_tasks" RENAME COLUMN "scheduledDate" TO "scheduled_date";
ALTER TABLE "collection_tasks" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "collection_tasks" RENAME COLUMN "updatedAt" TO "updated_at";

ALTER TABLE "customer_outreach" RENAME COLUMN "idCustomerOutreach" TO "id";
ALTER TABLE "customer_outreach" RENAME COLUMN "customerId" TO "customer_id";
ALTER TABLE "customer_outreach" RENAME COLUMN "contactDate" TO "contact_date";
ALTER TABLE "customer_outreach" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "customer_outreach" RENAME COLUMN "updatedAt" TO "updated_at";

-- Delivery columns
ALTER TABLE "delivery_notes" RENAME COLUMN "idDeliveryNote" TO "id";
ALTER TABLE "delivery_notes" RENAME COLUMN "deliveryNoteNumber" TO "delivery_note_number";
ALTER TABLE "delivery_notes" RENAME COLUMN "invoiceId" TO "invoice_id";
ALTER TABLE "delivery_notes" RENAME COLUMN "salesOrderId" TO "sales_order_id";
ALTER TABLE "delivery_notes" RENAME COLUMN "customerId" TO "customer_id";
ALTER TABLE "delivery_notes" RENAME COLUMN "recipientName" TO "recipient_name";
ALTER TABLE "delivery_notes" RENAME COLUMN "recipientPhone" TO "recipient_phone";
ALTER TABLE "delivery_notes" RENAME COLUMN "recipientAddress" TO "recipient_address";
ALTER TABLE "delivery_notes" RENAME COLUMN "deliveryDate" TO "delivery_date";
ALTER TABLE "delivery_notes" RENAME COLUMN "receiverName" TO "receiver_name";
ALTER TABLE "delivery_notes" RENAME COLUMN "senderName" TO "sender_name";
ALTER TABLE "delivery_notes" RENAME COLUMN "driverName" TO "driver_name";
ALTER TABLE "delivery_notes" RENAME COLUMN "vehiclePlateNumber" TO "vehicle_plate_number";
ALTER TABLE "delivery_notes" RENAME COLUMN "authorizedBy" TO "authorized_by";
ALTER TABLE "delivery_notes" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "delivery_notes" RENAME COLUMN "updatedAt" TO "updated_at";

ALTER TABLE "delivery_note_items" RENAME COLUMN "idDeliveryNoteItem" TO "id";
ALTER TABLE "delivery_note_items" RENAME COLUMN "deliveryNoteId" TO "delivery_note_id";
ALTER TABLE "delivery_note_items" RENAME COLUMN "productCode" TO "product_code";
ALTER TABLE "delivery_note_items" RENAME COLUMN "itemName" TO "item_name";

-- Primary, foreign-key, check, unique, and secondary-index identifiers
ALTER TABLE "users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";
ALTER TABLE "audit_trails" RENAME CONSTRAINT "AuditTrail_pkey" TO "audit_trails_pkey";
ALTER TABLE "customers" RENAME CONSTRAINT "Customer_pkey" TO "customers_pkey";
ALTER TABLE "products" RENAME CONSTRAINT "Product_pkey" TO "products_pkey";
ALTER TABLE "sales_orders" RENAME CONSTRAINT "SalesOrder_pkey" TO "sales_orders_pkey";
ALTER TABLE "customer_inquiries" RENAME CONSTRAINT "CustomerInquiry_pkey" TO "customer_inquiries_pkey";
ALTER TABLE "customer_inquiry_items" RENAME CONSTRAINT "CustomerInquiryItem_pkey" TO "customer_inquiry_items_pkey";
ALTER TABLE "sales_order_items" RENAME CONSTRAINT "SalesOrderItem_pkey" TO "sales_order_items_pkey";
ALTER TABLE "invoices" RENAME CONSTRAINT "Invoice_pkey" TO "invoices_pkey";
ALTER TABLE "payments" RENAME CONSTRAINT "Payment_pkey" TO "payments_pkey";
ALTER TABLE "collection_tasks" RENAME CONSTRAINT "CollectionTask_pkey" TO "collection_tasks_pkey";
ALTER TABLE "customer_outreach" RENAME CONSTRAINT "CustomerOutreach_pkey" TO "customer_outreach_pkey";
ALTER TABLE "delivery_notes" RENAME CONSTRAINT "DeliveryNote_pkey" TO "delivery_notes_pkey";
ALTER TABLE "delivery_note_items" RENAME CONSTRAINT "DeliveryNoteItem_pkey" TO "delivery_note_items_pkey";

ALTER TABLE "sales_orders" RENAME CONSTRAINT "SalesOrder_customerId_fkey" TO "sales_orders_customer_id_fkey";
ALTER TABLE "customer_inquiries" RENAME CONSTRAINT "CustomerInquiry_customerId_fkey" TO "customer_inquiries_customer_id_fkey";
ALTER TABLE "customer_inquiries" RENAME CONSTRAINT "CustomerInquiry_salesOrderId_fkey" TO "customer_inquiries_sales_order_id_fkey";
ALTER TABLE "customer_inquiry_items" RENAME CONSTRAINT "CustomerInquiryItem_customerInquiryId_fkey" TO "customer_inquiry_items_customer_inquiry_id_fkey";
ALTER TABLE "customer_inquiry_items" RENAME CONSTRAINT "CustomerInquiryItem_productId_fkey" TO "customer_inquiry_items_product_id_fkey";
ALTER TABLE "sales_order_items" RENAME CONSTRAINT "SalesOrderItem_salesOrderId_fkey" TO "sales_order_items_sales_order_id_fkey";
ALTER TABLE "sales_order_items" RENAME CONSTRAINT "SalesOrderItem_productId_fkey" TO "sales_order_items_product_id_fkey";
ALTER TABLE "invoices" RENAME CONSTRAINT "Invoice_salesOrderId_fkey" TO "invoices_sales_order_id_fkey";
ALTER TABLE "invoices" RENAME CONSTRAINT "Invoice_customerId_fkey" TO "invoices_customer_id_fkey";
ALTER TABLE "payments" RENAME CONSTRAINT "Payment_invoiceId_fkey" TO "payments_invoice_id_fkey";
ALTER TABLE "collection_tasks" RENAME CONSTRAINT "CollectionTask_customerId_fkey" TO "collection_tasks_customer_id_fkey";
ALTER TABLE "collection_tasks" RENAME CONSTRAINT "CollectionTask_invoiceId_fkey" TO "collection_tasks_invoice_id_fkey";
ALTER TABLE "customer_outreach" RENAME CONSTRAINT "CustomerOutreach_customerId_fkey" TO "customer_outreach_customer_id_fkey";
ALTER TABLE "delivery_notes" RENAME CONSTRAINT "DeliveryNote_invoiceId_fkey" TO "delivery_notes_invoice_id_fkey";
ALTER TABLE "delivery_notes" RENAME CONSTRAINT "DeliveryNote_salesOrderId_fkey" TO "delivery_notes_sales_order_id_fkey";
ALTER TABLE "delivery_notes" RENAME CONSTRAINT "DeliveryNote_customerId_fkey" TO "delivery_notes_customer_id_fkey";
ALTER TABLE "delivery_note_items" RENAME CONSTRAINT "DeliveryNoteItem_deliveryNoteId_fkey" TO "delivery_note_items_delivery_note_id_fkey";

ALTER TABLE "customers" RENAME CONSTRAINT "Customer_npwp_format_check" TO "customers_npwp_format_check";
ALTER TABLE "sales_orders" RENAME CONSTRAINT "SalesOrder_ppnRateBasisPoints_check" TO "sales_orders_ppn_rate_basis_points_check";
ALTER TABLE "sales_orders" RENAME CONSTRAINT "SalesOrder_ppnAmount_check" TO "sales_orders_ppn_amount_check";
ALTER TABLE "sales_orders" RENAME CONSTRAINT "SalesOrder_netSalesAmount_check" TO "sales_orders_net_sales_amount_check";
ALTER TABLE "invoices" RENAME CONSTRAINT "Invoice_ppnRateBasisPoints_check" TO "invoices_ppn_rate_basis_points_check";
ALTER TABLE "invoices" RENAME CONSTRAINT "Invoice_ppnAmount_check" TO "invoices_ppn_amount_check";
ALTER TABLE "invoices" RENAME CONSTRAINT "Invoice_netSalesAmount_check" TO "invoices_net_sales_amount_check";
ALTER TABLE "delivery_notes" RENAME CONSTRAINT "DeliveryNote_driver_vehicle_pair_check" TO "delivery_notes_driver_vehicle_pair_check";

ALTER INDEX "User_username_key" RENAME TO "users_username_key";
ALTER INDEX "Customer_npwp_key" RENAME TO "customers_npwp_key";
ALTER INDEX "SalesOrder_orderNumber_key" RENAME TO "sales_orders_order_number_key";
ALTER INDEX "SalesOrder_customerPoNumber_key" RENAME TO "sales_orders_customer_po_number_key";
ALTER INDEX "CustomerInquiry_inquiryNumber_key" RENAME TO "customer_inquiries_inquiry_number_key";
ALTER INDEX "CustomerInquiry_salesOrderId_key" RENAME TO "customer_inquiries_sales_order_id_key";
ALTER INDEX "Invoice_invoiceNumber_key" RENAME TO "invoices_invoice_number_key";
ALTER INDEX "Invoice_salesOrderId_key" RENAME TO "invoices_sales_order_id_key";
ALTER INDEX "DeliveryNote_deliveryNoteNumber_key" RENAME TO "delivery_notes_delivery_note_number_key";

ALTER INDEX "AuditTrail_createdAt_idx" RENAME TO "audit_trails_created_at_idx";
ALTER INDEX "AuditTrail_moduleName_idx" RENAME TO "audit_trails_module_name_idx";
ALTER INDEX "AuditTrail_actorUsername_idx" RENAME TO "audit_trails_actor_username_idx";
ALTER INDEX "AuditTrail_recordReference_idx" RENAME TO "audit_trails_record_reference_idx";
ALTER INDEX "Product_productName_idx" RENAME TO "products_product_name_idx";
ALTER INDEX "Product_status_idx" RENAME TO "products_status_idx";
ALTER INDEX "SalesOrder_approvalStatus_idx" RENAME TO "sales_orders_approval_status_idx";
ALTER INDEX "SalesOrder_source_idx" RENAME TO "sales_orders_source_idx";
ALTER INDEX "SalesOrder_requiredDate_idx" RENAME TO "sales_orders_required_date_idx";
ALTER INDEX "SalesOrder_customerId_orderDate_idx" RENAME TO "sales_orders_customer_id_order_date_idx";
ALTER INDEX "CustomerInquiry_customerId_idx" RENAME TO "customer_inquiries_customer_id_idx";
ALTER INDEX "CustomerInquiry_status_idx" RENAME TO "customer_inquiries_status_idx";
ALTER INDEX "CustomerInquiry_inquiryDate_idx" RENAME TO "customer_inquiries_inquiry_date_idx";
ALTER INDEX "CustomerInquiryItem_productId_idx" RENAME TO "customer_inquiry_items_product_id_idx";
ALTER INDEX "SalesOrderItem_productId_idx" RENAME TO "sales_order_items_product_id_idx";
ALTER INDEX "Invoice_customerId_idx" RENAME TO "invoices_customer_id_idx";
ALTER INDEX "Payment_invoiceId_idx" RENAME TO "payments_invoice_id_idx";
ALTER INDEX "CollectionTask_customerId_idx" RENAME TO "collection_tasks_customer_id_idx";
ALTER INDEX "CollectionTask_invoiceId_idx" RENAME TO "collection_tasks_invoice_id_idx";
ALTER INDEX "CustomerOutreach_customerId_contactDate_idx" RENAME TO "customer_outreach_customer_id_contact_date_idx";
ALTER INDEX "DeliveryNote_invoiceId_idx" RENAME TO "delivery_notes_invoice_id_idx";
ALTER INDEX "DeliveryNote_salesOrderId_idx" RENAME TO "delivery_notes_sales_order_id_idx";
ALTER INDEX "DeliveryNote_customerId_idx" RENAME TO "delivery_notes_customer_id_idx";
ALTER INDEX "DeliveryNoteItem_deliveryNoteId_idx" RENAME TO "delivery_note_items_delivery_note_id_idx";

COMMIT;
