import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [result] = await prisma.$queryRaw<Array<{
    deliveryNotes: bigint;
    withCombinedSources: bigint;
    withDirectOrder: bigint;
    withDirectInvoice: bigint;
    withoutCanonicalReference: bigint;
  }>>`
    SELECT
      COUNT(*)::bigint AS "deliveryNotes",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM delivery_note_sources source
        WHERE source.delivery_note_id = note.id
      ))::bigint AS "withCombinedSources",
      COUNT(*) FILTER (WHERE note.sales_order_id IS NOT NULL)::bigint AS "withDirectOrder",
      COUNT(*) FILTER (WHERE note.invoice_id IS NOT NULL)::bigint AS "withDirectInvoice",
      COUNT(*) FILTER (
        WHERE note.sales_order_id IS NULL
          AND note.invoice_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM delivery_note_sources source
            WHERE source.delivery_note_id = note.id
          )
      )::bigint AS "withoutCanonicalReference"
    FROM delivery_notes note
  `;

  console.log(JSON.stringify({
    deliveryNotes: Number(result.deliveryNotes),
    withCombinedSources: Number(result.withCombinedSources),
    withDirectOrder: Number(result.withDirectOrder),
    withDirectInvoice: Number(result.withDirectInvoice),
    withoutCanonicalReference: Number(result.withoutCanonicalReference),
  }, null, 2));
}

main()
  .finally(() => prisma.$disconnect());
