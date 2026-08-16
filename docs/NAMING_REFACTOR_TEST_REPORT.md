# Naming Refactor Test Report

Date: 2026-08-13 to 2026-08-14
Branch: `main`
Database: authorized Supabase development database
Commit/stage/push performed: **No**

## Overall result

**Required runnable naming-refactor checks are stable, but the whole 89-case plan is not fully complete.** The pending physical PostgreSQL naming migration applied successfully, migration invariants were preserved, all automated tests and the production build pass, and authenticated UAT was completed for Manager, Admin, and Sales. Eleven strict cases remain Blocked; no runnable case is Failed.

| Result | Cases | Meaning |
|---|---:|---|
| Passed | 58 | Passed without a defect found in that case |
| Fixed and Passed | 20 | A defect or coverage/documentation gap was fixed and retested |
| Blocked | 11 | Exact prerequisite or strict artifact is still unavailable |
| Failed | 0 | Runnable case still failing |
| **Total** | **89** | All plan rows have a final status |

## Scope control

- Initial working tree: 127 `git status --short` entries, 0 staged; existing user changes were preserved.
- No reset, truncate, reseed, commit, stage, or push was performed.
- Only the pending migration `20260813215000_standardize_postgresql_identifiers` was applied. The first two naming migrations were already recorded as applied.
- Browser-created QA records are clearly marked with `NAMING-QA-*`; no existing rows were deleted or overwritten.
- Historical migrations were not edited.

## Defects found and fixed

1. `prisma/verify-naming-refactor.cjs` could not safely inspect the authorized current development database and contained an invalid `string_agg` delimiter expression. It now has an explicit `--allow-current-dev` opt-in, supports `before|mid|after`, redacts connection evidence, and captures catalog/data invariants correctly.
2. The order-source dialog said **Normal Sales Order**. It now says **Direct Sales Order** and has a regression assertion.
3. The Payments queue rendered IMMEDIATE terms as **Payment Required**. It now uses **Immediate Payment** / **Credit – N Months** through the canonical payment-term formatter.
4. Ambiguous UI labels were clarified: **Method** became **Payment Method** where Cash/Bank Transfer/Other is meant, and **Type / Method** became **Collection Type**.
5. Remaining “normal Sales Order” help/PRD wording became **Direct Sales Order**.
6. `docs/ERD.mmd` did not render because `FK UK` was invalid Mermaid syntax, and it omitted tax snapshot plus driver/plate fields. It now renders as SVG/PNG and has exact scalar-field parity with Prisma.
7. `docs/UAT_EXECUTION_TEMPLATE.md` conflated Customer Outreach with invoice Collections. The scenario now records a customer product contact without invoice/payment fields.

## Database and migration evidence

Evidence files:

- `.codex/evidence/naming-refactor/db-mid.json`
- `.codex/evidence/naming-refactor/db-after.json`
- `.codex/evidence/naming-refactor/db-after-qa.json`

The database was at the `mid` state before execution: the first two naming migrations were applied and the final physical snake_case migration was pending. The final migration was audited as one transaction with `lock_timeout = '5s'` and 230 rename operations; it contains no table/column/type drop, delete, truncate, reset, or data recreation.

Pre-migration `mid` and immediate post-migration values are identical:

| Invariant | Result |
|---|---|
| Row counts | Identical across all 14 captured tables |
| Stable checksums | Collection Task, Customer Outreach, Sales Order naming, and Audit Reference all identical |
| Payment-term distribution | Invoice CREDIT 46 / IMMEDIATE 62; Sales Order CREDIT 53 / IMMEDIATE 65, unchanged |
| Orphan counts | 0 for Collection→Customer, Collection→Invoice, and Outreach→Customer |
| Catalog | 167 columns, 43 enum values, 40 constraints, 48 indexes, unchanged |
| Security/catalog | RLS 14/14 enabled, 0 policies, 392 table grants, unchanged |
| Cleanup candidates | 0 old collection-note rows and 0 old audit-label rows |

Stable checksum values before and after:

```text
collectionTask    eeae83d4a0c9608ac9126b8e790e3527
customerOutreach  47d3298266f2f3b31c9a7ad43a8cc895
salesOrderNaming  79f8887889e004e489c3a54211e75db3
auditReference    db39d2889f8726e2b39d3dcdbb77ec74
```

Final database checks:

- `prisma migrate status`: **Database schema is up to date**.
- `prisma migrate diff ... --exit-code`: **No difference detected**.
- Second `prisma migrate deploy`: **No pending migrations to apply**.
- Post-QA snapshot changes are exactly explained by the marked fixtures: +2 Sales Orders, +1 inquiry/item, +2 Sales Order items, +1 invoice, +1 payment, +2 Collection Tasks, +1 Customer Outreach, +1 Surat Jalan/item, and +12 audit rows. Orphans remain 0.

Verified pre-existing database issue: separate indexes are missing for `customer_inquiry_items.customer_inquiry_id` and `sales_order_items.sales_order_id`. Their foreign keys remain valid and this was not introduced by the naming migration; MG-08 stays Blocked rather than hiding the gap.

## Automated commands and results

```text
node prisma/verify-naming-refactor.cjs mid --allow-current-dev
prisma migrate deploy
prisma migrate status
prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --exit-code
node prisma/verify-naming-refactor.cjs after --allow-current-dev
vitest run tests/integration --maxWorkers=1 --minWorkers=1
npm test -- --maxWorkers=1 --minWorkers=1
npm exec tsc -- --noEmit
npm run lint
npm run build
npx @mermaid-js/mermaid-cli@11.15.0 ... docs/ERD.mmd
```

Results:

- Integration category: 12 files / 22 tests passed.
- Unit category: 22 files / 99 tests passed.
- Final consolidated suite: **34 files / 121 tests passed**.
- TypeScript: exit 0.
- ESLint: exit 0, zero warnings.
- Production build: exit 0; canonical and compatibility routes are in the route manifest.
- ERD: SVG and PNG render successfully; automated model-field comparison reports no missing or extra scalar fields.

The first integration attempt inside the network sandbox failed to reach Supabase. A focused out-of-sandbox retry passed, proving an environment-network classification; the full integration and consolidated suites then passed with explicit network access.

## Browser/UAT evidence

Authenticated UAT was run against the migrated production build with active Manager, Admin, and Sales accounts. Browser console warnings/errors: **0**.

Verified flows:

- Canonical desktop navigation for all roles and responsive/mobile navigation.
- Canonical routes and legacy redirects, including query preservation:
  - `/pre-orders?tab=done&view=qa` → `/customer-purchase-orders?tab=done&view=qa`
  - `/billing?tab=done&invoiceId=qa` → `/collections?tab=done&invoiceId=qa`
  - `/follow-ups?customerId=qa` → `/customer-outreach?customerId=qa`
- Direct Sales Order and Customer PO source chooser.
- Customer PO creation with document upload: `SO-2026-119`, `PO-2026-001`, `INV-2026-119`.
- Customer Inquiry `INQ-2026-001` converted to Direct Sales Order `SO-2026-120`; Prisma confirms `source = DIRECT`, `customerPoNumber = null`, IMMEDIATE terms, and unchanged Rp100,000 total.
- Full payment for `INV-2026-119`, receivable closure, and Surat Jalan `SJ-2026-103`.
- Planned and completed Collection Tasks with `NAMING-QA-COLLECTION-*` markers.
- Customer Outreach plus canonical audit row with `NAMING-QA-OUTREACH-20260814`.
- Open/Completed tabs across Sales Orders, Customer POs, Invoices, Receivables, Collections, and Surat Jalan.
- Manager/Admin/Sales notification panels use Customer PO, Collections, Customer Outreach, and approval links with no legacy copy or mojibake.
- Sales financial/admin controls are disabled according to the role capability matrix.
- Audit Trail uses **Record Reference** and canonical `COLLECTION_TASK` / `CUSTOMER_OUTREACH` entities.
- Invoice and Surat Jalan print pages render correctly; Surat Jalan heading is exactly `SURAT JALAN / Delivery Note`.
- `Ekspor Excel` produced a valid 10,558-byte `.xlsx` with `Sales Orders` and `Sales Order Items` sheets (SHA-256 `CC3AB250CF0CF162087F8B15F87D952BAD77E3D5860A94FC9E5134C620FF12A9`); `Unduh` retrieved the Customer PO document; `Cetak` stayed a print action.

Selected evidence:

- `.codex/evidence/naming-refactor/UI-01-admin.png`
- `.codex/evidence/naming-refactor/UI-01-manager.png`
- `.codex/evidence/naming-refactor/UI-01-sales.png`
- `.codex/evidence/naming-refactor/UI-02-mobile-sales.png`
- `.codex/evidence/naming-refactor/UI-04-order-source-final.png`
- `.codex/evidence/naming-refactor/UI-08-collections-completed.png`
- `.codex/evidence/naming-refactor/UI-09-payments-final.png`
- `.codex/evidence/naming-refactor/UI-15-invoice-print.png`
- `.codex/evidence/naming-refactor/UI-15-surat-jalan-print.png`
- `.codex/evidence/naming-refactor/UI-18-manager-notifications.png`
- `.codex/evidence/naming-refactor/UI-19-audit-record-reference.png`
- `.codex/evidence/naming-refactor/UI-16-sales-orders.xlsx`
- `.codex/evidence/naming-refactor/ERD.svg`
- `.codex/evidence/naming-refactor/ERD.png`

## Final stale-term classification

The final current-source scan has one legacy-content hit: `src/lib/customer-po-storage.ts` retains `pre-order-documents` as `LEGACY_DEFAULT_BUCKET`. This is an intentional storage compatibility fallback for already deployed objects.

Other allowed occurrences are limited to:

| Class | Examples | Reason |
|---|---|---|
| Immutable history | PostgreSQL history and `prisma/sqlite-migrations-backup/**` | Records the schema migrations must upgrade |
| Rename/cleanup source side | Old identifiers/values in naming SQL and verifier legacy queries | Required to locate and validate the old state |
| Compatibility routes/API | `/pre-orders`, `/billing`, `/follow-ups`, legacy document route | Preserves old bookmarks and clients |
| Compatibility storage | `SUPABASE_PRE_ORDER_BUCKET`, `pre-order-documents`, legacy module wrapper | Preserves deployed storage objects |
| Negative assertions | Naming tests mentioning old identifiers/labels | Proves canonical source does not expose them |
| Technical terminology | Prisma `$transaction` and DOM events | Technical API/event terms, not business labels |
| Test-plan scan strings | Legacy terms and mojibake probes | Detection data, not current product copy |

There is no unexplained legacy business term in current user-facing source or the generated Prisma client.

## Remaining Blocked cases and residual risk

| Cases | Exact blocker |
|---|---|
| MG-03, MG-04, MG-07 | No snapshot from the state before all three naming migrations; the authorized DB was already at `mid` |
| MG-08 | Two pre-existing FK lookup indexes are missing |
| MG-10, MG-12 | Conflicting-lock rollback and restore/recovery drills require a disposable clone |
| UI-12, RG-02 | Full Customer/Product create-edit-status-toggle role matrix was not executed |
| UI-15, RG-09 | Print pages/screenshots passed, but actual saved PDF artifacts were not produced |
| UI-17 | Full keyboard-only navigation/focus/Escape audit was not completed |

Exact next safe action for MG-03/MG-04/MG-07/MG-10/MG-12 is to provision a disposable PostgreSQL clone at the state before `20260813194143_standardize_business_naming`, then run the guarded `before` snapshot, three-migration deploy, integrity comparison, lock conflict, and restore drill. Do not use the development database for those deliberate failure/recovery tests.

## Final conclusion

The naming refactor, pending development migration, canonical routes, database mappings, integration behavior, full build, and principal three-role UAT are stable. Release readiness is **not declared fully complete** because the 11 cases above remain Blocked. There are no Failed runnable tests and no unexplained stale UI term.
