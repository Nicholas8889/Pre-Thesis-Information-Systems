import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CountRow = { count: bigint };

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql);
  return Number(rows[0]?.count ?? BigInt(0));
}

async function main() {
  const checks = {
    invalidProducts: await count("SELECT count(*) FROM products WHERE list_price < 0"),
    invalidInquiryItems: await count(`
      SELECT count(*) FROM customer_inquiry_items
      WHERE quantity <= 0 OR requested_unit_price < 0 OR agreed_unit_price < 0
    `),
    invalidOrderItems: await count(`
      SELECT count(*) FROM sales_order_items
      WHERE quantity <= 0 OR base_unit_price < 0 OR final_unit_price < 0 OR subtotal < 0
         OR markup_percent NOT BETWEEN 0 AND 100 OR discount_percent NOT BETWEEN 0 AND 100
    `),
    invalidOrderAmounts: await count(`
      SELECT count(*) FROM sales_orders
      WHERE subtotal < 0 OR total < 0 OR ppn_rate_basis_points < 0 OR ppn_amount < 0 OR net_sales_amount < 0
    `),
    ambiguousTerms: await count(`
      SELECT count(*) FROM sales_orders
      WHERE NOT (
        (payment_term_type = 'IMMEDIATE' AND credit_term_weeks IS NULL AND credit_term_months IS NULL) OR
        (payment_term_type = 'CREDIT' AND (
          (credit_term_weeks BETWEEN 1 AND 4 AND credit_term_months IS NULL) OR
          (credit_term_months BETWEEN 1 AND 12 AND credit_term_weeks IS NULL)
        ))
      )
    `),
    invalidDirectMetadata: await count(`
      SELECT count(*) FROM sales_orders
      WHERE source = 'DIRECT' AND (
        customer_po_number IS NOT NULL OR required_date IS NOT NULL OR
        customer_po_document_name IS NOT NULL OR customer_po_document_stored_name IS NOT NULL OR
        customer_po_document_mime_type IS NOT NULL
      )
    `),
    missingCustomerPoMetadata: await count(`
      SELECT count(*) FROM sales_orders
      WHERE source = 'CUSTOMER_PO' AND (
        customer_po_number IS NULL OR required_date IS NULL OR customer_po_document_name IS NULL OR
        customer_po_document_stored_name IS NULL OR customer_po_document_mime_type IS NULL
      )
    `),
    ordersWithoutDestinationSource: await count(`
      SELECT count(*)
      FROM sales_orders sales_order
      JOIN customers customer ON customer.id = sales_order.customer_id
      WHERE btrim(customer.address) = ''
    `),
    deliveryDatesWithTimeComponent: await count(`
      SELECT count(*) FROM delivery_notes
      WHERE delivery_date <> date_trunc('day', delivery_date)
    `),
    crossCustomerCollectionInvoices: await count(`
      SELECT count(*)
      FROM collection_tasks task
      JOIN invoices invoice ON invoice.id = task.invoice_id
      WHERE task.customer_id <> invoice.customer_id
    `)
  };

  console.log(JSON.stringify(checks, null, 2));
  const blockingChecks = Object.entries(checks)
    .filter(([name]) => name !== "ordersWithoutDestinationSource" && name !== "deliveryDatesWithTimeComponent")
    .filter(([, value]) => value !== 0);
  if (blockingChecks.length > 0) {
    throw new Error("Batch 2 migration preflight failed");
  }
}

main()
  .finally(() => prisma.$disconnect());
