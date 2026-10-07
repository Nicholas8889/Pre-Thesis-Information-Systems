# Pick & Pack checklist — batch 2

## Delivered behavior

- Completed has one **PIC Pick & Pack** column/filter, check counts and Surat Jalan status. Availability/shortage filters and duplicate PIC columns are removed. Historical rows remain accessible through detail/print; the PIC filter can also match their original Packing PIC. Old PIC bookmarks normalize to the new `pic` parameter, while obsolete fulfillment filters no longer hide sheets.
- Print works for every sheet. New Pick sheets print item/ordered data only; Pack and Completed print stored checks with one PIC signature. Completed historical sheets retain the original quantity and personnel layout.
- Surat Jalan eligibility checks completed status, one PIC and every stored item check for checklist sheets. Ready quantities come directly from ordered snapshots. Legacy completed sheets still require their historical personnel and validated packed quantities.
- Draft creation and its form share the same quantity source. Ready quantities remain immutable delivery snapshots; selected send quantities can be reduced, unselected items remain at zero, and Draft save/Issue bounds continue to apply. Existing Surat Jalan documents are unchanged.
- Delivery forms now describe **Ready to ship** quantities. Historical preparation differences remain visible for historical delivery snapshots; new sheets have no Pick & Pack shortage input or indicator.

## Active legacy migration

`20261005010000_transition_active_pick_pack_checklists` only updates unlinked Pending/InProgress legacy sheets. Existing checklist progress, completed sheets and delivery-linked sheets are excluded.

The migration locks candidate sheets, rechecks delivery links, clears item checks, chooses the existing Picking PIC (or existing Packing PIC when Picking PIC was blank), clears the second PIC and invalidates old form versions. Quantity/notes history is captured in a `CHECKLIST_MIGRATED` Audit Trail entry before the active view changes. No person is invented when both original PICs are absent: that sheet can continue into Pack for PIC assignment, but completion still requires a PIC.

Project-database verification found **1 eligible active sheet**, migrated it with **1 audit entry**, and confirmed by before/after database checksums that completed sheets/items and all existing Surat Jalan headers/items were unchanged.

## Verification

- 104 unit/render/action tests passed for eligibility, filters, print layout, checklist rules and historical delivery behavior.
- 8 real-database rollback scenarios passed for SO/Customer PO completion and mixed checklist/historical combined deliveries through Delivered/Cancelled.
- 1 real-database migration rollback test passed, including exclusions and before/after audit snapshots.
- Print QA in headless Chrome passed for Pick, Pack and Completed at A4 content width, including a long product name: no page overflow or clipped table cells. Screenshots are in ignored `tmp/pick-pack-batch2-*.png`.
- Source/tests TypeScript and targeted ESLint passed. Next compilation/route collection passed in `--experimental-build-mode compile`; this skips the full-build type-check phase, whose pre-existing Sales Orders route-export error was reported in batch 1.

Reproducible data verification: `node scripts/verify-pick-pack-batch2.mjs` before migration, then the same command with `--verify` afterward. Print QA: build `tmp/pick-pack-batch2.css` with Tailwind CLI, then run `npx tsx scripts/verify-pick-pack-print.tsx`.
