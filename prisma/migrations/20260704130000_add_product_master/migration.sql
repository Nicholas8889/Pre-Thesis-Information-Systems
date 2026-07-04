-- CreateTable
CREATE TABLE "Product" (
    "idProduct" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "notes" TEXT,
    "basePrice" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Product_productName_idx" ON "Product"("productName");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");
