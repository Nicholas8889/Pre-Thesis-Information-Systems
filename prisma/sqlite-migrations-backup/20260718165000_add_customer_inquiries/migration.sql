-- CreateTable
CREATE TABLE "CustomerInquiry" (
    "idCustomerInquiry" TEXT NOT NULL PRIMARY KEY,
    "inquiryNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "inquiryDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "neededBy" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "notes" TEXT,
    "statusNote" TEXT,
    "salesOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerInquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("idCustomer") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerInquiry_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder" ("idSalesOrder") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerInquiryItem" (
    "idCustomerInquiryItem" TEXT NOT NULL PRIMARY KEY,
    "customerInquiryId" TEXT NOT NULL,
    "productId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requestedPrice" INTEGER,
    "agreedPrice" INTEGER,
    "notes" TEXT,
    CONSTRAINT "CustomerInquiryItem_customerInquiryId_fkey" FOREIGN KEY ("customerInquiryId") REFERENCES "CustomerInquiry" ("idCustomerInquiry") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerInquiryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("idProduct") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInquiry_inquiryNumber_key" ON "CustomerInquiry"("inquiryNumber");
CREATE UNIQUE INDEX "CustomerInquiry_salesOrderId_key" ON "CustomerInquiry"("salesOrderId");
CREATE INDEX "CustomerInquiry_customerId_idx" ON "CustomerInquiry"("customerId");
CREATE INDEX "CustomerInquiry_status_idx" ON "CustomerInquiry"("status");
CREATE INDEX "CustomerInquiry_inquiryDate_idx" ON "CustomerInquiry"("inquiryDate");
CREATE INDEX "CustomerInquiryItem_productId_idx" ON "CustomerInquiryItem"("productId");
