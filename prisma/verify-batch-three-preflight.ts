import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function count(query: TemplateStringsArray) {
  const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>(query);
  return Number(row?.count ?? 0);
}

async function main() {
  const result = {
    invalidOrderTax: await count`
      SELECT COUNT(*) AS count FROM sales_orders
      WHERE ppn_rate_basis_points NOT BETWEEN 0 AND 10000
         OR ppn_amount < 0 OR net_sales_amount < 0
         OR ppn_amount + net_sales_amount <> total
    `,
    invalidInvoiceAmounts: await count`
      SELECT COUNT(*) AS count FROM invoices
      WHERE total_amount < 0 OR paid_amount < 0 OR remaining_amount < 0
         OR paid_amount > total_amount OR remaining_amount <> total_amount - paid_amount
    `,
    invalidInvoiceTax: await count`
      SELECT COUNT(*) AS count FROM invoices
      WHERE ppn_rate_basis_points NOT BETWEEN 0 AND 10000
         OR ppn_amount < 0 OR net_sales_amount < 0
         OR ppn_amount + net_sales_amount <> total_amount
    `,
    invalidInvoiceTerms: await count`
      SELECT COUNT(*) AS count FROM invoices
      WHERE NOT (
        (payment_term_type = 'IMMEDIATE' AND credit_term_weeks IS NULL AND credit_term_months IS NULL) OR
        (payment_term_type = 'CREDIT' AND (
          (credit_term_weeks BETWEEN 1 AND 4 AND credit_term_months IS NULL) OR
          (credit_term_months BETWEEN 1 AND 12 AND credit_term_weeks IS NULL)
        ))
      )
    `,
    invalidPayments: await count`
      SELECT COUNT(*) AS count FROM payments WHERE amount <= 0
    `,
    unreconciledPaymentTotals: await count`
      SELECT COUNT(*) AS count
      FROM invoices i
      LEFT JOIN (
        SELECT invoice_id, COALESCE(SUM(amount), 0)::integer AS paid
        FROM payments GROUP BY invoice_id
      ) p ON p.invoice_id = i.id
      WHERE i.status <> 'Cancelled' AND i.paid_amount <> COALESCE(p.paid, 0)
    `
  };
  console.log(JSON.stringify(result, null, 2));
  if (Object.values(result).some(value => value !== 0)) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
