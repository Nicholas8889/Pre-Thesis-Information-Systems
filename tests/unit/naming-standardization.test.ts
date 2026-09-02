import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { withSearchParams } from "../../src/lib/legacy-route";

const projectFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical business naming", () => {
  it("uses canonical Prisma model, enum, and field names", () => {
    const schema = projectFile("prisma/schema.prisma");

    expect(schema).toContain("enum SalesOrderSource");
    expect(schema).toContain("DIRECT");
    expect(schema).toContain("CUSTOMER_PO");
    expect(schema).toContain("customerPoNumber");
    expect(schema).toContain("customerPoDocumentStoredName");
    expect(schema).toContain("model CollectionTask");
    expect(schema).toContain("scheduledDate");
    expect(schema).toContain("model CustomerOutreach");
    expect(schema).toContain("recordReference");
    expect(schema).toContain("IMMEDIATE");
    expect(schema).toContain("customerSegment");
    expect(schema).toContain("listPrice");
    expect(schema).toContain("baseUnitPrice");
    expect(schema).toContain("finalUnitPrice");
    expect(schema).toContain("requestedUnitPrice");
    expect(schema).toContain("agreedUnitPrice");

    expect(schema).not.toContain("enum TransactionType");
    expect(schema).not.toContain("model FollowUp");
    expect(schema).not.toContain("model CustomerProductFollowUp");
    expect(schema).not.toContain("transactionCode");
  });

  it("keeps canonical and compatibility routes explicit", () => {
    expect(projectFile("src/app/customer-purchase-orders/page.tsx")).toContain(
      'source: "CUSTOMER_PO"'
    );
    expect(projectFile("src/app/pre-orders/page.tsx")).toContain(
      '"/customer-purchase-orders"'
    );
    expect(projectFile("src/app/billing/page.tsx")).toContain('"/collections"');
    expect(projectFile("src/app/follow-ups/page.tsx")).toContain(
      '"/customer-outreach"'
    );
    expect(projectFile("src/app/api/pre-orders/[salesOrderId]/document/route.ts")).toContain(
      "getCustomerPoDocument"
    );
    expect(projectFile("src/app/collections/page.tsx")).toContain(
      '"@/app/customer-activity-pages"'
    );
    expect(projectFile("src/app/customer-outreach/page.tsx")).toContain(
      '"@/app/customer-activity-pages"'
    );
    expect(projectFile("src/app/collections/page.tsx")).not.toContain(
      "@/app/follow-ups/page"
    );
    expect(projectFile("src/app/customer-outreach/page.tsx")).not.toContain(
      "@/app/follow-ups/page"
    );
  });

  it("preserves legacy query parameters during compatibility redirects", () => {
    expect(
      withSearchParams("/collections", {
        customerId: "customer-1",
        invoiceId: ["invoice-1", "invoice-2"]
      })
    ).toBe(
      "/collections?customerId=customer-1&invoiceId=invoice-1&invoiceId=invoice-2"
    );
  });

  it("ships non-destructive PostgreSQL renames and targeted legacy-data cleanup", () => {
    const namingMigration = projectFile(
      "prisma/migrations/20260813194143_standardize_business_naming/migration.sql"
    );
    const cleanupMigration = projectFile(
      "prisma/migrations/20260813202500_standardize_existing_record_labels/migration.sql"
    );
    const identifierMigration = projectFile(
      "prisma/migrations/20260813215000_standardize_postgresql_identifiers/migration.sql"
    );

    expect(namingMigration).toContain(
      'ALTER TYPE "TransactionType" RENAME TO "SalesOrderSource"'
    );
    expect(namingMigration).toContain(
      'ALTER TABLE "FollowUp" RENAME TO "CollectionTask"'
    );
    expect(namingMigration).toContain(
      'ALTER TABLE "AuditTrail" RENAME COLUMN "transactionCode" TO "recordReference"'
    );
    expect(namingMigration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);

    expect(cleanupMigration).toContain("WHERE \"moduleName\" = 'Billing'");
    expect(cleanupMigration).toContain("WHERE \"entityType\" = 'FOLLOW_UP'");
    expect(cleanupMigration).toContain(
      "WHERE \"entityType\" = 'CUSTOMER_PRODUCT_FOLLOW_UP'"
    );

    expect(identifierMigration).toContain(
      'ALTER TABLE "SalesOrder" RENAME TO "sales_orders"'
    );
    expect(identifierMigration).toContain(
      'ALTER TABLE "sales_order_items" RENAME COLUMN "unitPrice" TO "final_unit_price"'
    );
    expect(identifierMigration).not.toMatch(
      /DROP\s+(TABLE|COLUMN|TYPE)|TRUNCATE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+/i
    );
  });

  it("maps every physical database identifier to lowercase snake_case", () => {
    const schema = projectFile("prisma/schema.prisma");
    const mappedIdentifiers = [
      ...schema.matchAll(/@@map\("([^"]+)"\)/g),
      ...schema.matchAll(/@map\("([^"]+)"\)/g),
      ...schema.matchAll(/\bmap:\s*"([^"]+)"/g)
    ].map((match) => match[1]);

    expect(mappedIdentifiers.length).toBeGreaterThan(100);
    expect(
      mappedIdentifiers.filter((identifier) => !/^[a-z][a-z0-9_]*$/.test(identifier))
    ).toEqual([]);
    expect(schema.match(/@@map\("/g)).toHaveLength(27);
  });

  it("uses action labels and contextual UI names that match behavior", () => {
    const exportDialog = projectFile("src/components/sales-order-export-dialog.tsx");
    const processTabs = projectFile("src/components/process-tabs.tsx");
    const printButton = projectFile("src/components/print-button.tsx");
    const deliveryNotePrint = projectFile(
      "src/app/surat-jalan/[deliveryNoteId]/print/page.tsx"
    );
    const salesOrderForm = projectFile("src/components/sales-order-form.tsx");
    const customerForm = projectFile("src/app/customers/page.tsx");
    const inquiryForm = projectFile("src/components/customer-inquiry-form.tsx");
    const customerPoDocumentRoute = projectFile(
      "src/app/api/customer-purchase-orders/[salesOrderId]/document/route.ts"
    );
    const salesOrderDetail = projectFile(
      "src/app/sales-orders/[salesOrderId]/page.tsx"
    );
    const salesOrderList = projectFile("src/app/sales-orders/page.tsx");
    const paymentsPage = projectFile("src/app/payments/page.tsx");
    const paymentForm = projectFile("src/components/payment-form.tsx");
    const productBrandingFiles = [
      projectFile("src/components/app-shell.tsx"),
      projectFile("src/app/layout.tsx"),
      projectFile("src/components/page-help-button.tsx"),
      salesOrderForm,
      projectFile("src/app/invoices/[invoiceId]/print/page.tsx"),
      deliveryNotePrint,
      projectFile("src/app/api/sales-orders/export/route.ts"),
      projectFile("package.json")
    ];

    expect(exportDialog).toContain("Ekspor Excel");
    expect(exportDialog).not.toContain("Mencetak");
    expect(processTabs).toContain('label: "Open"');
    expect(processTabs).toContain('label: "Completed"');
    expect(processTabs).not.toContain("Ongoing Process");
    expect(processTabs).not.toContain("Done Process");
    expect(printButton).toContain('label = "Cetak"');
    expect(deliveryNotePrint).toContain("SURAT JALAN / Delivery Note");
    expect(salesOrderForm).toContain("Base Unit Price");
    expect(salesOrderForm).toContain("Final Unit Price");
    expect(salesOrderForm).toContain("Purchase Frequency Category");
    expect(customerForm).toContain('label="Contact Person"');
    expect(customerForm).toContain('label="Customer Segment"');
    expect(inquiryForm).toContain("Requested Unit Price");
    expect(inquiryForm).toContain("Agreed Unit Price");
    expect(customerPoDocumentRoute).toContain('"Content-Disposition": `attachment;');
    expect(salesOrderDetail).toContain("Unduh Customer PO Document");
    expect(salesOrderList).toContain("Direct Sales Order");
    expect(salesOrderList).not.toContain("Normal Sales Order");
    expect(paymentsPage).toContain("getPaymentTermLabel");
    expect(paymentsPage).not.toContain("Payment Required");
    expect(paymentsPage).toContain("Payment Method");
    expect(paymentForm).toContain("Payment Method");
    expect(salesOrderDetail).toContain("Collection Type");
    expect(salesOrderDetail).not.toContain("Type / Method");
    expect(productBrandingFiles.join("\n")).not.toMatch(/\bMVP\b/i);
    expect(projectFile("src/app/layout.tsx")).toContain(
      "CV Tajuk Revenue Cycle Information System"
    );
  });
});
