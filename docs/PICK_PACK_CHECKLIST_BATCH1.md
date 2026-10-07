# Pick & Pack checklist — batch 1

## Behavior

- Create a sheet with one required **PIC Pick & Pack**.
- **Pick** (`Pending`) shows customer, SO/PO, required date, products and ordered quantities. No item quantity inputs or checkboxes. **Lanjut ke Pack** moves the sheet to Pack.
- **Pack** (`InProgress`) has a checkbox per item, the same PIC and optional internal notes. **Save Progress** persists checked and unchecked items.
- **Selesaikan Pick & Pack** requires a nonblank PIC and every item checked. Neither quantity comparisons, a second PIC, package count nor shortage notes are completion inputs.
- Completion moves the sheet to Completed (`Packed`) and makes it read-only.
- Admin/Manager may reopen an unlinked completed sheet with a required reason. Reopening clears every check and returns it to Pack. A link to any Surat Jalan, including Draft, prevents reopening.
- Sales can review sheets but cannot change them.

## Persistence and compatibility

Migration `20261004100000_add_pick_pack_checklist` adds `picking_lists.uses_checklist` and `picking_list_items.is_checked`. Existing completed rows and quantity/PIC snapshots are not backfilled or rewritten. The package-count lifecycle constraint permits checklist completion without inventing a physical package count.

New sheets use the checklist mode. Existing active sheets enter it when continued/saved; existing completed sheets retain their historical view until explicitly reopened. Reopen and later completion preserve old values in the audit trail.

The existing Surat Jalan interface still reads quantity snapshots. Checklist completion supplies available/packed quantities automatically from each stored ordered quantity and mirrors the one PIC into the legacy packer field. No quantity is accepted from the client. Surat Jalan creation, Draft editing and Issue behavior are unchanged in this batch.

## Deferred to batch 2

These items are now completed; see [batch 2 implementation and verification](PICK_PACK_CHECKLIST_BATCH2.md). The following list records the original batch boundary.

- New checklist print layout. New checklist sheets do not offer the old quantity-based Print action; historical sheets still do.
- Consolidation of Completed list columns and filters, which still support historical Picking/Packing PIC and shortage data.
- Bulk transition of existing active sheets and broader delivery/read-model cleanup.

## Verification

- `pack-checklist.test.ts`: exact row inventory, partial checks, duplicate/unknown rows and checks, rejected old quantity/second-PIC submissions.
- `pack-checklist-actions.test.ts`: stage rules, partial saves, completion without quantities/package count, concurrency, locks, reopen and Sales access.
- `warehouse-page.test.tsx`: plain Pick view, Pack-only checkboxes, completion button state, read-only completed/Sales views, historical display.
- `picking-fulfillment.test.ts`: real rollback transactions for SO/Customer PO and Immediate/Credit invoices, completion, reopen, Draft creation, Issue and Delivered.

The focused suites passed 68 tests (62 unit/render tests and 6 real-database rollback scenarios). ESLint passed for the changed implementation and tests. Source/tests TypeScript checking passed with generated Next caches excluded. The application compiled successfully; the full Next build's type-check phase is blocked by the pre-existing `OrdersBySourcePage` export in `src/app/sales-orders/page.tsx`, flagged by `.next/dev/types/app/sales-orders/page.ts`.
