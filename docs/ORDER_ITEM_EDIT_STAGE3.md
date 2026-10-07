# SO / Customer PO item editing — stage 3 UI

## User flow

The existing SO and Customer PO detail item card now has **Edit Barang**. The initial table, customer information, document headers and related sections retain their existing layout.

1. Open a detail page and choose Edit Barang. Product and quantity become editable in the same table; prices, markup and discount remain informational.
2. Change a product or quantity, add a row with Tambah Barang, or remove a row. At least one item must remain. Retained legacy or unavailable products keep their stored option.
3. Choose Simpan Perubahan. The server checks eligibility and builds an authoritative preview. The existing confirmation modal lists additions, removals, product/quantity changes, total before/after and affected invoice/Pick references.
4. Enter the required reason and submit. One atomic save updates the order, same invoice and same Pending Pick sheet and appends revision history/Audit Trail.
5. The table returns to its read view, displays success and refreshes related data. Revised SO/PO and invoice detail headers show Revisi N; invoice list and print also show it. Revision 1 adds no badge.

Batal restores the read view without saving. Cancelling the confirmation modal retains the draft so it can be adjusted. Failed preview/save retains edits and shows the server error. A changed product price requires another preview and confirmation; stale document versions or operational cutoffs offer Muat Ulang before further editing.

## Restrictions

The Edit Barang button remains visible when blocked and explains the reason. The server rechecks the same policy under locks at preview and save, including changes made while confirmation is open.

- Sales: own pre-invoice orders only. Invoiced orders: Admin or Manager; invoiced Approved orders: Manager only.
- Any recorded payment or settled invoice blocks editing.
- Entering Pack permanently blocks editing, including after Reopen.
- Any existing Surat Jalan, including Draft or Cancelled and legacy item-only links, blocks editing.
- Cancelled/rejected/shipped orders and inactive customers are blocked.

Only product selection and quantities are accepted. Existing product rows keep their transaction prices; replacements/additions follow the stage-2 defaults. Customer, dates, payment terms, tax configuration, PO number and source attachment stay as recorded.

## Implementation and testing

`OrderItemEditor` uses the existing preview/save actions and global confirmation dialog. The modal summary can scroll for large orders. The item card contains horizontal table scrolling on smaller screens. Edit mode opts out of the global table enhancer, preventing search/filter/sort controls from mutating editable rows; read mode retains those controls. Contextual Page Help describes editing and its cutoff.

The shared SO/PO list implementation lives in `src/components/orders-by-source-page.tsx`; route modules expose only their supported default page export. This also removes the previously unsupported named route export that prevented the full Next build.

Run focused browser tests with:

```powershell
node scripts/run-order-edit-ui-e2e.mjs
```

The runner generates SQL offline from the current Prisma model, creates a uniquely named private schema, and installs that structure plus revision/Pack triggers in one atomic setup. It enables RLS and revokes client-role access. It launches a separate local server with an independent session secret, seeds only test-schema fixtures, then removes that schema and restores Next-generated config files. It verifies checksums of public orders, invoice/item records, Pick sheets and revision history before/after. Tests must never be run directly against the public schema.

Browser scenarios cover SO and PO save/synchronization/print, cancelling, roles/portfolio/payment/draft-delivery restrictions, changed-price confirmation, Pack starting during confirmation, and desktop/mobile containment. No new production migration is required for stage 3.

Verified on 7 October 2026: **118 focused unit/regression tests and all 7 browser scenarios passed**. Source/tests/scripts TypeScript and targeted ESLint passed. The full production Next build passed compilation, generated route typing and static page generation. Desktop/mobile editor and confirmation screenshots were reviewed. All temporary test schemas were removed, and the final before/after public business-data checksums matched.
