# Vercel Preview Deployment Report

Date: 16 August 2026

Environment: Supabase non-production + Vercel Preview

Verdict: **Ready for production: Yes**

## Release baseline and scope

- GitHub repository: `Nicholas8889/Pre-Thesis-Information-Systems`
- Default branch baseline: `main` at `4aae715` (`Speed up dashboard login`)
- Release branch: `codex/naming-refactor-deploy`
- Preview source commit: `b3be3475d9b25daf0c113c06704c1e5574064b99`
- Commit subject: `feat: standardize business naming end to end`
- Release commit inventory: 152 files, 12,011 insertions, and 2,331 deletions.
- Included: application source, Prisma schema and seven migrations, tests, documentation, diagrams, and the checked-in Next.js type declaration.
- Excluded from the release: `.env*`, `.codex/`, `.vercel/`, `*.tsbuildinfo`, `/output/`, `/outputs/`, and `/tmp/`. No credential, database dump, Vercel metadata, or generated build output was staged.

## Supabase integrity

- Expected project URL/ref: `https://czlmqftvvwgzkmicdvsx.supabase.co` / `czlmqftvvwgzkmicdvsx`.
- Local connection target checks matched the expected project ref without printing credentials.
- `prisma migrate status`: seven migrations found; database schema is up to date.
- `prisma migrate deploy`: no pending migrations.
- Schema drift check: no difference between the configured datasource and `prisma/schema.prisma`.
- Naming migrations recorded as applied:
  - `20260813194143_standardize_business_naming`
  - `20260813202500_standardize_existing_record_labels`
  - `20260813215000_standardize_postgresql_identifiers`
- Before/after no-op migration evidence retained equivalent row counts, stable business checksums, payment-term distributions, schema objects, RLS state, grants, and orphan checks.
- Post-test verification retained the same counts/checksums, proving integration-test rollback left no residue.
- Preview QA intentionally added one disposable customer and one audit record:
  - customer: `PREVIEW-QA-20260816`, active, segment `QA`
  - audit: action `CREATED`, Record Reference `PREVIEW-QA-20260816`, actor `sales`
  - resulting counts: 106 customers and 168 audit records
- All 14 application tables have RLS enabled; renamed relation orphan counts are zero.

## Validation results

- Prisma schema validation: passed.
- Prisma Client generation: passed; generated-client legacy identifier scan returned no unexpected hits.
- TypeScript (`tsc --noEmit`): passed.
- ESLint (`--max-warnings=0`): passed with zero warnings.
- Vitest: 34 test files passed; 121 tests passed.
- Production build: passed with Next.js 16.2.9; all canonical and compatibility routes compiled.
- Staged diff whitespace check: passed.
- Staged path and credential scan: no forbidden path or potential secret file staged.

## Vercel Preview

- Team/project: `pre-thesis/pre-thesis-information-systems-84dh`
- Project ID: `prj_5pj3TzAesUKm2KoNXHxaGZGrI8lG`
- Deployment ID: `dpl_Cbe4qzMFJDrZv6LAr1JatLNbC9eC`
- Deployment URL: `https://pre-thesis-information-systems-84dh-4tt1nbbfj-pre-thesis.vercel.app`
- Branch alias: `https://pre-thesis-information-systems-84dh-git-codex-b420ef-pre-thesis.vercel.app`
- Target/status: Preview / Ready.
- Build metadata matched branch `codex/naming-refactor-deploy` and commit `b3be347`.

Configured Preview environment variable names:

- `AUTH_SECRET`
- `DATABASE_URL`
- `DIRECT_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PRE_ORDER_BUCKET` (compatibility fallback)
- `SUPABASE_CUSTOMER_PO_BUCKET`
- `PPN_RATE_BASIS_POINTS`

Sensitive values remain opaque in Vercel CLI output. Runtime login, Supabase-backed dashboard values, Customer PO document download, and the cross-checked QA customer/audit record prove the Preview is connected to the intended non-production data set.

## Browser UAT

- Vercel Authentication and application session: passed.
- Admin login/dashboard and operational navigation: passed.
- Manager login/dashboard and approval-queue visibility: passed.
- Sales login/dashboard and customer-create capability: passed.
- Canonical pages passed without visible server errors or console errors:
  - `/customer-purchase-orders`
  - `/collections`
  - `/customer-outreach`
  - `/sales-orders`
  - `/invoices`
  - `/payments`
  - `/receivables`
  - `/audit-trail`
- Audit Trail displayed the canonical `Record Reference` label.
- Compatibility redirects passed:
  - `/pre-orders` to `/customer-purchase-orders`
  - `/follow-ups` to `/customer-outreach`
  - `/billing` to `/collections`
- Invoice `Cetak` opened the correct printable invoice route and rendered invoice/customer/payment-term details.
- Customer PO `Unduh` retrieved the stored document through the canonical document API.
- Customer PO `Ekspor Excel` opened the date-range dialog and completed the export action without page/console errors; automated workbook coverage also passed.
- Disposable create/read flow passed: Sales created `PREVIEW-QA-20260816`, the success state appeared, the record was readable in the customer table, and Supabase/audit queries matched it.

## Defects fixed during release preparation

- Stopped only the stale workspace Next.js processes that were locking the Prisma query-engine binary; Prisma generate then passed.
- Hardened `.gitignore` for Codex/Vercel metadata, environment files, temporary output, and TypeScript build information.
- Added canonical Preview variables `SUPABASE_CUSTOMER_PO_BUCKET` and `PPN_RATE_BASIS_POINTS` while retaining the legacy bucket variable as a compatibility fallback.
- Fixed documentation whitespace detected by the staged diff check.

## Remaining non-blocking risks

- Two existing foreign-key lookup indexes are absent: `customer_inquiry_items.customer_inquiry_id` and `sales_order_items.sales_order_id`. Current data volume and tests show no release blocker, but they should be added before material scale-up.
- A true snapshot from before the first business-label migration was not available; release verification instead used migration history, post-migration schema checks, no-op before/after evidence, and stable checksums.
- Lock-contention and restore-from-backup drills remain operational follow-up work.
- Authentication is intentionally demo-oriented; production-grade identity/session hardening remains outside this thesis MVP release.

All required Preview gates passed, and the branch is suitable for a normal, non-force merge to the default branch.
