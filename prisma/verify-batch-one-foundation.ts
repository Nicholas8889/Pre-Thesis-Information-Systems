import { PrismaClient } from "@prisma/client";

type FoundationVerification = {
  productCount: number;
  productPriceSum: string;
  orderItemCount: number;
  orderItemPriceSum: string;
  invalidOrderBackfills: number;
  invalidInvoiceBackfills: number;
  legacyPriceColumns: number;
  foundationConstraintCount: number;
};

const prisma = new PrismaClient();

async function main() {
  const [verification] = await prisma.$queryRaw<FoundationVerification[]>`
    SELECT
      (SELECT COUNT(*) FROM "Product")::int AS "productCount",
      COALESCE((SELECT SUM("price") FROM "Product"), 0)::text AS "productPriceSum",
      (SELECT COUNT(*) FROM "SalesOrderItem")::int AS "orderItemCount",
      COALESCE((SELECT SUM("price") FROM "SalesOrderItem"), 0)::text AS "orderItemPriceSum",
      (
        SELECT COUNT(*)
        FROM "SalesOrder"
        WHERE "netSalesAmount" <> "total"
          OR "ppnApplied"
          OR "ppnRateBasisPoints" <> 0
          OR "ppnAmount" <> 0
      )::int AS "invalidOrderBackfills",
      (
        SELECT COUNT(*)
        FROM "Invoice"
        WHERE "netSalesAmount" <> "totalAmount"
          OR "ppnApplied"
          OR "ppnRateBasisPoints" <> 0
          OR "ppnAmount" <> 0
      )::int AS "invalidInvoiceBackfills",
      (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'basePrice'
      )::int AS "legacyPriceColumns",
      (
        SELECT COUNT(*)
        FROM pg_constraint
        WHERE conname IN (
          'Customer_npwp_format_check',
          'SalesOrder_ppnRateBasisPoints_check',
          'SalesOrder_ppnAmount_check',
          'SalesOrder_netSalesAmount_check',
          'Invoice_ppnRateBasisPoints_check',
          'Invoice_ppnAmount_check',
          'Invoice_netSalesAmount_check',
          'DeliveryNote_driver_vehicle_pair_check'
        )
      )::int AS "foundationConstraintCount"
  `;

  if (!verification) {
    throw new Error("Batch 1 verification returned no result");
  }

  if (
    verification.invalidOrderBackfills !== 0 ||
    verification.invalidInvoiceBackfills !== 0 ||
    verification.legacyPriceColumns !== 0 ||
    verification.foundationConstraintCount !== 8
  ) {
    throw new Error(`Batch 1 verification failed: ${JSON.stringify(verification)}`);
  }

  console.log(JSON.stringify(verification, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
