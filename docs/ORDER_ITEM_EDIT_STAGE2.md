# SO / Customer PO item editing — stage 2 engine

## Scope

This stage provides the backend engine and authenticated preview/save server actions. [Stage 3](ORDER_ITEM_EDIT_STAGE3.md) now connects them to the inline editor, confirmation modal and revision badges. No schema migration or live business-data revision is needed for this stage.

## Pricing and preview

- Existing rows with the same product keep their stored name, SKU, base price, markup, discount and final unit price. Quantity changes never refresh these values from today's product master, including legacy product-less rows.
- Replacing a product matches the existing form's `selectProduct` default: use the active product's current `listPrice` as base and carry the original row's markup/discount. Newly added rows use the same current base with 0 markup and 0 discount. `listPrice` currently represents the production-cost reference in this project; no new pricing policy or automatic margin is introduced here.
- No price, tax, document-header, actor or revision fields are accepted from the client. Added/replacement products must be active; retained products use their transaction snapshots.
- Subtotals and total must fit PostgreSQL integer rupiah columns. Tax amounts use the stored order/invoice PPN configuration separately, without refreshing NPWP or configured tax rates from current master data.
- Preview is read-only and returns item changes, totals, affected references and a SHA-256 quote fingerprint. Save rebuilds the plan under locks and requires that fingerprint to match. Price or relevant document/approval changes require a fresh preview.

## Atomic save

`applyOrderItemEdit` is called within one transaction:

1. Authenticate in the server action, parse the item-only payload and required reason.
2. Lock canonical order -> invoice -> Pick sheet -> required product defaults. Recheck stage-1 role/ownership/payment/Pack/delivery boundaries and the expected version.
3. Claim one order version/revision, update retained rows in a scoped parameterized batch, delete omitted rows, and insert added rows.
4. Synchronize the same Pending Pick sheet. Preserve its identity, PIC and overall notes; preserve retained row IDs, remove deleted rows, add new rows, and reset operational row fields to Unchecked/0/false. The sheet timestamp advances to invalidate old warehouse forms.
5. Update the same invoice's item snapshot, subtotal-derived total, PPN/net sales and remaining balance. Preserve invoice number, issue/due dates, payment terms, customer snapshots and tax configuration. Advance invoice revision/version once.
6. Append immutable full before/after revision history and Audit Trail entries for SO/PO, invoice, receivable and sheet. Any failure rolls every change back.

Customer Inquiry source rows and the original Customer PO attachment are not rewritten. An edited Draft is no longer disposable: deletion checks revision history before attempting to delete it. Legacy Surat Jalan links through a picking item also block revision, even when old document header/source links are absent.

## Approval and balances

- Pre-invoice Pending approval stays Pending on the latest version. An old Approved pre-invoice version returns to Draft/Pending, with its previous decision preserved in history. Sales edits re-evaluate current customer outstanding status using the existing approval rule.
- Invoiced Approved transactions still require Manager. The edit confirmation records the Manager's decision for the new version without creating another approval queue.
- Unpaid/Overdue invoice status is recomputed using the unchanged due date. A revised zero-total invoice becomes settled without inventing a payment; only Planned collection tasks are marked Done, preserving their notes and recording the reason in Audit Trail.
- Normal positive-balance collections retain their schedules/notes and invoice reference. Dashboard/receivable numeric queries read the updated canonical values; the existing manual AI-analysis refresh lifecycle is unchanged.

## Integration contracts

- `previewSalesOrderItemChanges({ id, expectedVersion, items })` returns `{ ok, preview }` or a structured policy/conflict error.
- `saveSalesOrderItemChanges(FormData)` accepts exactly `id`, `version`, JSON `items`, `quoteHash`, and `confirmationNote` (plus framework action fields). It derives actor/source/financial values from the server and returns the canonical detail href.
- Cache invalidation runs only after a successful commit, including SO/PO detail, invoice/Pick print, dashboard, payments, receivables, collections and audit views.
- The quote fingerprint guards freshness; authorization always comes from the authenticated session and canonical stage-1 policy.

## Verification

Unit tests cover stored/default pricing, PPN, overflow, approval refresh, quote changes, forged inputs, authentication, cache invalidation and snapshot contracts. Database rollback tests cover SO and PO synchronization, stable row IDs, frozen headers, source preservation, payment/Pack conflicts, zero balances, a failed Audit Trail write, competing prepared writers and the full 1,000-row bound. Existing foundation, deletion, warehouse and delivery action suites are included as regressions.

**160 focused tests passed** (132 unit/action tests, 9 engine database scenarios, and 19 foundation/deletion/warehouse regressions). Source/tests/scripts TypeScript and targeted ESLint passed. Next compilation and route collection passed in `--experimental-build-mode compile`; the prior full-build generated-type issue remains outside this change. Database checksum verification confirmed that existing business data and all 20 permanent Pack boundaries remain unchanged, with no live item revision records created by the tests.
