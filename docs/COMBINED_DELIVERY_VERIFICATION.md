
# Combined Surat Jalan verification

## Scope
- Choose customer, set one shared destination, select fully packed SO/Customer PO orders.
- One document, with source order references on each item; one invoice per order.
- An order/Picking List can belong to only one delivery document, including Cancelled records.
- Delivered completes every linked inquiry atomically and counts each unpaid balance once.
- Old documents remain readable; migration attaches source links to existing valid picking-based documents.

## Deployment requirement
Migration: prisma/migrations/20260913145527_add_combined_delivery_notes/migration.sql.
Adds delivery_note_sources and optional delivery_note_items.source_id, indexes, foreign keys, RLS, restricted API grants, and a backfill for existing valid links.
Applied successfully to the configured Supabase database on 2026-09-13 after explicit user approval. Prisma client regenerated. Existing invoice/payment fingerprints and delivery document/item counts remained unchanged before and after migration and after integration testing.

## Automated checks
- Mocked server actions: role checks, mixed-customer rejection, incomplete packing, changed order items, duplicate/unknown selections, inactive invoices, repeat shipping, transaction failure handling.
- UI rendering: same-customer selection, combined Picking Lists leaving active queue, print references per source.
- Balance projections: Issued/Cancelled do not activate outstanding; Delivered counts every invoice once.
- Real database suite in tests/integration/combined-delivery-database.test.ts passed for Delivered and Cancelled, together with existing fulfillment and customer balance integration tests.

## Manual acceptance checks (pending)
1. Pack one SO and one Customer PO for the same customer.
2. Open Picking & Packing > Create Surat Jalan, choose that customer and one destination, and check both orders.
3. Issue; confirm exactly one SJ, two source references, and both Picking Lists absent from active work.
4. Open each source order and customer records; verify the shared SJ is visible.
5. Print; verify each product/quantity is next to the correct source reference, with no prices.
6. Mark Delivered; verify both inquiries become Done and each invoice remains independently payable.
7. Attempt a repeated selection from a stale browser tab; no second document should be created.
8. Verify a different customer requires another SJ and no partial quantity can be entered.

## Results before database approval
- 188 tests passed in 28 files: all unit tests plus mocked combined-delivery, customer-refresh, and warehouse-render tests.
- TypeScript no-emit check passed.
- Full repository ESLint passed with zero warnings.
- Next.js production build passed.
- Real database integration tests and manual browser acceptance remain pending. No migration was applied.

## Results after approved migration
- Migration 20260913145527_add_combined_delivery_notes applied successfully; database migration status is current.
- 242 tests passed in 46 files across the unit/mocked run and two non-overlapping integration runs (188 + 12 + 42 tests).
- Mixed SO/Customer PO shipping, source-item tracking, independent invoice/payment balances, linked inquiries, repeat-shipping rejection, and legacy fulfillment verified against the real database.
- Invoice (145) and payment (90) fingerprints unchanged; 33 existing delivery notes and 36 existing delivery items preserved. Test data rolled back, leaving zero temporary delivery sources.
- Row-level security enabled on delivery_note_sources; anon and authenticated have no table access.
- TypeScript, lint, and production build passed in the preceding implementation turn; no application code changed during deployment.
- Manual browser acceptance remains pending; form, warehouse, and print rendering were tested automatically.
