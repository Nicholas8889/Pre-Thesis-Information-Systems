import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [references] = await prisma.$queryRaw<Array<{
    deliveryNotes: bigint;
    missingOrderSnapshot: bigint;
    missingInvoiceSnapshot: bigint;
  }>>`
    SELECT
      COUNT(*)::bigint AS "deliveryNotes",
      COUNT(*) FILTER (
        WHERE note.order_references_snapshot::jsonb = '[]'::jsonb
          AND (
            note.sales_order_id IS NOT NULL
            OR note.invoice_id IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM delivery_note_sources source
              WHERE source.delivery_note_id = note.id
            )
          )
      )::bigint AS "missingOrderSnapshot",
      COUNT(*) FILTER (
        WHERE note.invoice_references_snapshot::jsonb = '[]'::jsonb
          AND (
            note.invoice_id IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM delivery_note_sources source
              WHERE source.delivery_note_id = note.id
            )
          )
      )::bigint AS "missingInvoiceSnapshot"
    FROM delivery_notes note
  `;
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'invoices_status_due_date_id_idx',
        'invoices_status_remaining_amount_id_idx',
        'delivery_notes_status_date_id_idx'
      )
    ORDER BY indexname
  `;

  console.log(JSON.stringify({
    deliveryNotes: Number(references.deliveryNotes),
    missingOrderSnapshot: Number(references.missingOrderSnapshot),
    missingInvoiceSnapshot: Number(references.missingInvoiceSnapshot),
    indexes: indexes.map(index => index.indexname),
  }, null, 2));

  if (references.missingOrderSnapshot || references.missingInvoiceSnapshot || indexes.length !== 3) {
    throw new Error("Batch 5 read-model verification failed");
  }
}

main()
  .finally(() => prisma.$disconnect());
