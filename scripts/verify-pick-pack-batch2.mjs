import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PrismaClient();
const snapshotPath = "tmp/pick-pack-batch2-before.json";
try {
  const [snapshot] = await db.$queryRaw`
    SELECT
      (SELECT count(*)::int FROM picking_lists p WHERE NOT p.uses_checklist AND p.status IN ('Pending', 'InProgress')
        AND NOT EXISTS (SELECT 1 FROM delivery_notes d WHERE d.picking_list_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM delivery_note_sources s WHERE s.picking_list_id = p.id)) AS eligible,
      (SELECT count(*)::int FROM audit_trails WHERE action = 'CHECKLIST_MIGRATED') AS audits,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text, '[]')) FROM picking_lists p WHERE p.status = 'Packed') AS completed,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text, '[]')) FROM picking_list_items i JOIN picking_lists p ON p.id = i.picking_list_id WHERE p.status = 'Packed') AS completed_items,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id)::text, '[]')) FROM delivery_notes d) AS deliveries,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text, '[]')) FROM delivery_note_items i) AS delivery_items
  `;
  if (process.argv.includes("--verify")) {
    const before = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(snapshot.eligible, 0, "Unlinked active legacy sheets remain");
    assert.equal(snapshot.audits - before.audits, before.eligible, "Transition audit count mismatch");
    for (const key of ["completed", "completed_items", "deliveries", "delivery_items"]) {
      assert.equal(snapshot[key], before[key], `Historical ${key} changed`);
    }
    console.log(JSON.stringify({ migratedSheets: before.eligible, auditEntries: snapshot.audits - before.audits, historicalSheetsAndDeliveriesUnchanged: true }));
  } else {
    mkdirSync("tmp", { recursive: true });
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
    console.log(JSON.stringify({ eligibleActiveLegacySheets: snapshot.eligible, historicalChecksumsSaved: true }));
  }
} finally {
  await db.$disconnect();
}
