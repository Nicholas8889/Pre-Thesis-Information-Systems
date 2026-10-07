# SO / Customer PO item editing — stage 1 foundation

## Activation boundary

This stage provides policy, input contracts, locking and revision storage only. There is no Edit Items button, browser write action, item update endpoint or automatic order/invoice/sheet synchronization yet. Those belong to stages 2 and 3.

Stage 2 supplies the backend engine and server actions; see [stage 2 implementation](ORDER_ITEM_EDIT_STAGE2.md). Stage 3 activates the inline editor; see [stage 3 implementation](ORDER_ITEM_EDIT_STAGE3.md). This document records the original stage-1 boundary.

## Edit policy

`getOrderItemEditEligibility` is the shared contextual gate:

- Sales may edit their own pre-invoice Draft/Confirmed transactions, following the current SO/PO `createdByUserId` portfolio scope.
- Admin/Manager may revise an active unpaid invoice while its sheet remains in Pick.
- An invoiced order with `Approved` approval requires Manager for revision. Pre-invoice Pending approval remains reviewable against the latest order version.
- Cancelled/Rejected/Shipped orders, cancelled invoices and inactive customers are rejected.
- Any payment record blocks editing, even if `paidAmount` is zero. Positive paid amount or Partial/Paid status also blocks editing.
- Any direct, invoice-level, sheet-level or combined Surat Jalan link blocks editing, including Draft and Cancelled documents.
- Pack history, current InProgress/Packed status, a completion timestamp or recorded item checks block editing. Resetting checks or Reopen never clears the permanent boundary.
- Missing orders, unknown roles and inconsistent invoiced states fail closed.

Input rows accept only `itemId`, `productId`, and integer `quantity` (1–1,000,000). At least one row is required, with at most 1,000 rows. Existing IDs must be unique. A legacy existing row may retain a null product reference; new rows require a product. Stage 2 must resolve row/product ownership and preserve canonical prices; this parser accepts no header, price, actor, approval, revision or lock values.

## Persistence

Migration `20261005090000_order_item_edit_foundation` adds:

- `sales_orders.revision_number` and `invoices.revision_number`, initialized to 1 and distinct from optimistic `version` counters.
- `sales_orders.pack_started_at`, an irreversible item-edit boundary.
- `sales_order_item_revisions`: per-order unique revision numbers, actor identity snapshots, required reason, full before/after order/invoice/Pick snapshots, and creation time. Initial revision 1 is implicit; no historical edits are fabricated.

Existing Pack/Completed sheets and historical Pack/Reopen audit evidence backfill the lock marker. Historical timestamps represent recorded evidence, not an invented exact physical start time. The order's optimistic version is advanced to invalidate pre-migration forms; item, amount, invoice and delivery data are preserved.

Database triggers remember the first Pack transition (including direct imports), prevent clearing/changing the marker, reject decreasing order/invoice revision numbers, and prohibit update/delete of revision history. History has RLS enabled and no anon/authenticated table access; the authenticated server workflow supplies the actor. Functions use invoker rights and an empty search path with qualified tables.

`buildOrderItemRevisionData` requires a reason, actual item changes, unchanged document/customer/date/term/tax identity, and exactly one increment of each affected document revision and optimistic version. `persistOrderItemRevision` appends both immutable history and the existing Audit Trail entry within the caller's transaction. It does not perform domain edits.

## Concurrency contract for stage 2

`lockOrderItemEditContext` locks the canonical order, invoice and sheet, then loads current state and verifies both eligibility and the expected version. Callers must use the authenticated session actor and keep item/invoice/sheet changes and revision persistence in that transaction.

Warehouse saves/Reopen now acquire the parent order lock first. Picking List creation checks the current order version after locking, so an old item snapshot cannot silently produce a sheet after a concurrent revision. Combined Surat Jalan creation uses sorted order -> invoice -> sheet locks as well, avoiding opposite lock ordering with revisions/Reopen.

Stage 2 still implements price calculation, item replacement, invoice/Pick synchronization, approval refresh and revision counter increments. Stage 3 supplies the existing-detail-page edit UI and confirmation modal.

## Verification

- Policy/payload/history contract tests cover role/ownership, payment/link locks, permanent Pack history, protected fields, revision counters and forged inputs.
- The real-database rollback test verifies migration, historical audit backfill, the first-Pack trigger, reset immunity, invoice snapshots, append-only history, duplicate revision prevention and RLS protection.
- Regression tests cover existing Pick/Pack completion, Reopen, combined shipment and warehouse rendering.
- Before/after database checksums confirm existing order item data, invoices, payments, sheets and deliveries are unchanged. Deployment initialized **20 permanent Pack boundaries** and **0 fabricated item revision records**.
- **138 focused tests passed** across policy/payload/snapshot contracts, database invariants and existing fulfillment/warehouse regressions. Targeted ESLint and source/tests/scripts TypeScript checks passed.
