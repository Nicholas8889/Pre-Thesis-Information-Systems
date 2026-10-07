import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PrismaClient();
const file = "tmp/order-item-edit-foundation-before.json";
try {
  const [snapshot] = await db.$queryRaw`
    SELECT
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) - 'revision_number' - 'pack_started_at' - 'version' - 'updated_at' ORDER BY s.id)::text, '[]')) FROM sales_orders s) AS orders,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text, '[]')) FROM sales_order_items i) AS order_items,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(i) - 'revision_number' ORDER BY i.id)::text, '[]')) FROM invoices i) AS invoices,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text, '[]')) FROM payments p) AS payments,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text, '[]')) FROM picking_lists p) AS sheets,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text, '[]')) FROM picking_list_items i) AS sheet_items,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id)::text, '[]')) FROM delivery_notes d) AS deliveries,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text, '[]')) FROM delivery_note_items i) AS delivery_items,
      (SELECT count(*)::int FROM sales_orders s WHERE to_jsonb(s)->>'pack_started_at' IS NOT NULL) AS marked_orders
  `;
  if (process.argv.includes("--verify")) {
    const before = JSON.parse(readFileSync(file, "utf8"));
    for (const key of ["orders", "order_items", "invoices", "payments", "sheets", "sheet_items", "deliveries", "delivery_items"]) assert.equal(snapshot[key], before[key], `${key} changed`);
    const revisions = await db.salesOrderItemRevision.count();
    assert.equal(revisions, 0, "Stage 1 must not fabricate item revisions");
    const unexpected = await db.salesOrder.count({ where: { revisionNumber: { not: 1 } } });
    const unexpectedInvoices = await db.invoice.count({ where: { revisionNumber: { not: 1 } } });
    assert.equal(unexpected + unexpectedInvoices, 0, "Initial document revisions must remain at one");
    const [unmarked] = await db.$queryRaw`
      SELECT count(*)::int AS count FROM picking_lists p JOIN sales_orders s ON s.id = p.sales_order_id
      WHERE p.status IN ('InProgress', 'Packed') AND s.pack_started_at IS NULL
    `;
    assert.equal(unmarked.count, 0, "Existing Pack/Completed sheets must have a permanent boundary");
    console.log(JSON.stringify({ permanentPackBoundaries: snapshot.marked_orders, itemRevisionRecords: revisions, existingItemsInvoicesPaymentsAndDeliveriesUnchanged: true }));
  } else {
    mkdirSync("tmp", { recursive: true }); writeFileSync(file, JSON.stringify(snapshot));
    console.log(JSON.stringify({ existingPackBoundaries: snapshot.marked_orders, businessDataChecksumsSaved: true }));
  }
} finally { await db.$disconnect(); }
