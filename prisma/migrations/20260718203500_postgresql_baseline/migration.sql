-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALES_ORDER', 'PRE_ORDER');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('Draft', 'Confirmed', 'Shipped', 'Invoiced', 'Cancelled');

-- CreateEnum
CREATE TYPE "SalesOrderApprovalStatus" AS ENUM ('NotRequired', 'Pending', 'Approved', 'Rejected');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('Unpaid', 'Partial', 'Paid', 'Overdue', 'Cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('Cash', 'BankTransfer', 'Other');

-- CreateEnum
CREATE TYPE "PaymentTermType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('Planned', 'Done', 'Cancelled');

-- CreateEnum
CREATE TYPE "CustomerInquiryStatus" AS ENUM ('Open', 'Closed', 'Cancelled', 'ConvertedToPO', 'ConvertedToSO', 'Done');

-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('Draft', 'Issued', 'Delivered', 'Cancelled');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SALES', 'MANAGER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('Active', 'Inactive');

-- CreateTable
CREATE TABLE "User" (
    "idUser" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SALES',
    "status" "UserStatus" NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("idUser")
);

-- CreateTable
CREATE TABLE "AuditTrail" (
    "idAuditTrail" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorUsername" TEXT NOT NULL,
    "actorDisplayName" TEXT,
    "actorRole" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "transactionCode" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "actionNote" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditTrail_pkey" PRIMARY KEY ("idAuditTrail")
);

-- CreateTable
CREATE TABLE "Customer" (
    "idCustomer" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'Active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("idCustomer")
);

-- CreateTable
CREATE TABLE "Product" (
    "idProduct" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "notes" TEXT,
    "basePrice" INTEGER NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("idProduct")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "idSalesOrder" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "poNumber" TEXT,
    "transactionType" "TransactionType" NOT NULL DEFAULT 'SALES_ORDER',
    "requiredDate" TIMESTAMP(3),
    "poDocumentName" TEXT,
    "poDocumentStoredName" TEXT,
    "poDocumentMimeType" TEXT,
    "customerId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'Draft',
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "paymentTermType" "PaymentTermType" NOT NULL DEFAULT 'DEBIT',
    "creditTermMonths" INTEGER,
    "notes" TEXT,
    "approvalStatus" "SalesOrderApprovalStatus" NOT NULL DEFAULT 'NotRequired',
    "approvalRisk" TEXT,
    "approvalDecisionNote" TEXT,
    "approvalDecidedAt" TIMESTAMP(3),
    "approvalDecidedById" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("idSalesOrder")
);

-- CreateTable
CREATE TABLE "CustomerInquiry" (
    "idCustomerInquiry" TEXT NOT NULL,
    "inquiryNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "inquiryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "neededBy" TIMESTAMP(3),
    "status" "CustomerInquiryStatus" NOT NULL DEFAULT 'Open',
    "notes" TEXT,
    "statusNote" TEXT,
    "salesOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerInquiry_pkey" PRIMARY KEY ("idCustomerInquiry")
);

-- CreateTable
CREATE TABLE "CustomerInquiryItem" (
    "idCustomerInquiryItem" TEXT NOT NULL,
    "customerInquiryId" TEXT NOT NULL,
    "productId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requestedPrice" INTEGER,
    "agreedPrice" INTEGER,
    "notes" TEXT,

    CONSTRAINT "CustomerInquiryItem_pkey" PRIMARY KEY ("idCustomerInquiryItem")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "idSalesOrderItem" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "basePrice" INTEGER NOT NULL DEFAULT 0,
    "markupPercent" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("idSalesOrderItem")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "idInvoice" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "remainingAmount" INTEGER NOT NULL,
    "paymentTermType" "PaymentTermType" NOT NULL DEFAULT 'DEBIT',
    "creditTermMonths" INTEGER,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'Unpaid',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("idInvoice")
);

-- CreateTable
CREATE TABLE "Payment" (
    "idPayment" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("idPayment")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "idFollowUp" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "followUpDate" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'Planned',
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("idFollowUp")
);

-- CreateTable
CREATE TABLE "CustomerProductFollowUp" (
    "idCustomerProductFollowUp" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contactDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProductFollowUp_pkey" PRIMARY KEY ("idCustomerProductFollowUp")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "idDeliveryNote" TEXT NOT NULL,
    "deliveryNoteNumber" TEXT NOT NULL,
    "invoiceId" TEXT,
    "salesOrderId" TEXT,
    "customerId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "receiverName" TEXT,
    "senderName" TEXT,
    "authorizedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("idDeliveryNote")
);

-- CreateTable
CREATE TABLE "DeliveryNoteItem" (
    "idDeliveryNoteItem" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "productCode" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "description" TEXT,

    CONSTRAINT "DeliveryNoteItem_pkey" PRIMARY KEY ("idDeliveryNoteItem")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "AuditTrail_createdAt_idx" ON "AuditTrail"("createdAt");

-- CreateIndex
CREATE INDEX "AuditTrail_moduleName_idx" ON "AuditTrail"("moduleName");

-- CreateIndex
CREATE INDEX "AuditTrail_actorUsername_idx" ON "AuditTrail"("actorUsername");

-- CreateIndex
CREATE INDEX "AuditTrail_transactionCode_idx" ON "AuditTrail"("transactionCode");

-- CreateIndex
CREATE INDEX "Product_productName_idx" ON "Product"("productName");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_poNumber_key" ON "SalesOrder"("poNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_approvalStatus_idx" ON "SalesOrder"("approvalStatus");

-- CreateIndex
CREATE INDEX "SalesOrder_transactionType_idx" ON "SalesOrder"("transactionType");

-- CreateIndex
CREATE INDEX "SalesOrder_requiredDate_idx" ON "SalesOrder"("requiredDate");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInquiry_inquiryNumber_key" ON "CustomerInquiry"("inquiryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInquiry_salesOrderId_key" ON "CustomerInquiry"("salesOrderId");

-- CreateIndex
CREATE INDEX "CustomerInquiry_customerId_idx" ON "CustomerInquiry"("customerId");

-- CreateIndex
CREATE INDEX "CustomerInquiry_status_idx" ON "CustomerInquiry"("status");

-- CreateIndex
CREATE INDEX "CustomerInquiry_inquiryDate_idx" ON "CustomerInquiry"("inquiryDate");

-- CreateIndex
CREATE INDEX "CustomerInquiryItem_productId_idx" ON "CustomerInquiryItem"("productId");

-- CreateIndex
CREATE INDEX "SalesOrderItem_productId_idx" ON "SalesOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_salesOrderId_key" ON "Invoice"("salesOrderId");

-- CreateIndex
CREATE INDEX "CustomerProductFollowUp_customerId_contactDate_idx" ON "CustomerProductFollowUp"("customerId", "contactDate");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_deliveryNoteNumber_key" ON "DeliveryNote"("deliveryNoteNumber");

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("idCustomer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerInquiry" ADD CONSTRAINT "CustomerInquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("idCustomer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerInquiry" ADD CONSTRAINT "CustomerInquiry_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("idSalesOrder") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerInquiryItem" ADD CONSTRAINT "CustomerInquiryItem_customerInquiryId_fkey" FOREIGN KEY ("customerInquiryId") REFERENCES "CustomerInquiry"("idCustomerInquiry") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerInquiryItem" ADD CONSTRAINT "CustomerInquiryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("idProduct") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("idSalesOrder") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("idProduct") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("idSalesOrder") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("idCustomer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("idInvoice") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("idCustomer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("idInvoice") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductFollowUp" ADD CONSTRAINT "CustomerProductFollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("idCustomer") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("idInvoice") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("idSalesOrder") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("idCustomer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("idDeliveryNote") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase hardening: the app uses server-side Prisma access, so keep public schema tables protected from Data API access.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditTrail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalesOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerInquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerInquiryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalesOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerProductFollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryNoteItem" ENABLE ROW LEVEL SECURITY;

