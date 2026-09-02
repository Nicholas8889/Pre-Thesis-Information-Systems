# Production Deployment Report

Date: 16 August 2026

Overall result: **Successful**

## GitHub release

- Repository: `Nicholas8889/Pre-Thesis-Information-Systems`
- Release branch: `codex/naming-refactor-deploy`
- Default branch: `main`
- Application release commit: `bf4390fd980dcd675819c3cb7b92db10f5db3980`
- Merge method: normal fast-forward from the validated release branch; no force-push and no history rewrite.
- Preview gate: `docs/DEPLOYMENT_PREVIEW_REPORT.md` records `Ready for production: Yes`.
- Environment files, credentials, `.vercel/`, `.codex/`, build outputs, temporary files, and TypeScript build information were excluded from commits.

## Supabase

- Target project URL/ref: `https://czlmqftvvwgzkmicdvsx.supabase.co` / `czlmqftvvwgzkmicdvsx`.
- Prisma migration status: seven migrations found; schema is up to date.
- Pending migrations: none; no migration was re-applied.
- Schema drift: none detected.
- All three naming migrations are recorded as successfully applied.
- Integrity after live smoke testing:
  - 107 customers and 169 audit records
  - 120 Sales Orders, 109 invoices, and 50 payments
  - canonical collection, outreach, and Sales Order checksums remained stable
  - payment-term distributions remained unchanged
  - renamed relation orphan checks remained zero
  - RLS remains enabled on all 14 application tables
- Intentional QA data retained for traceability:
  - `PREVIEW-QA-20260816` with a matching Sales-created audit record
  - `LIVE-QA-20260816` with a matching Sales-created audit record

## Validation

- Prisma validate and Prisma Client generation: passed.
- TypeScript type-check: passed.
- ESLint with zero-warning gate: passed.
- Vitest: 34 test files passed; 121 tests passed.
- Local production build: passed with Next.js 16.2.9.
- Vercel Production build: passed; Prisma generation, TypeScript, static generation, canonical routes, and compatibility routes all completed successfully.

## Vercel Production

- Team/project: `pre-thesis/pre-thesis-information-systems-84dh`
- Application deployment ID: `dpl_HfQMqqDRHehFJ7HwUZtEhy9r2Fv9`
- Immutable deployment URL: `https://pre-thesis-information-systems-84dh-1j35o8uqx-pre-thesis.vercel.app`
- Stable live URL: `https://pre-thesis-information-systems-84dh-pre-thesis.vercel.app`
- Additional project alias: `https://pre-thesis-information-systems-84dh-swart.vercel.app`
- Target/status: Production / Ready.
- Build metadata matched branch `main` and commit `bf4390f`.
- Required Production environment variable names are present. The release added:
  - `SUPABASE_CUSTOMER_PO_BUCKET`
  - `PPN_RATE_BASIS_POINTS`
- Existing database/auth/storage variables were preserved; no secret value was printed or committed.

## Live browser smoke test

- Public production alias opened the application login page without a Vercel or server error.
- Admin, Manager, and Sales logins all reached their role-specific dashboards.
- Main navigation and these live routes passed without page or console errors:
  - Customer Purchase Orders
  - Collections
  - Customer Outreach
  - Sales Orders
  - Invoices
  - Payments
  - Receivables
  - Audit Trail
- Audit Trail displayed `Record Reference` and showed the Preview QA audit event.
- Legacy redirects passed: `/pre-orders`, `/follow-ups`, and `/billing` resolved to their canonical routes.
- `Cetak` rendered the live invoice print view.
- `Ekspor Excel` opened and completed the Customer PO export flow.
- `Unduh` retrieved the Customer PO document from the canonical document endpoint.
- Live create/read flow passed for `LIVE-QA-20260816`; the page showed success, the record was readable, and a direct Supabase query confirmed both the customer and matching audit event.

## Defects and configuration changes

- No new application-source defect was found during Production deployment.
- Production initially lacked the canonical Customer PO bucket and PPN-rate variable names; both were added before deployment.
- The Vercel CLI exposes sensitive Production values as opaque. Correct runtime database targeting was verified by matching the unique browser-created QA records and audit events against the configured Supabase database.

## Remaining risks

- Existing lookup indexes are still absent for `customer_inquiry_items.customer_inquiry_id` and `sales_order_items.sales_order_id`; this is non-blocking at the current system data volume.
- Demo authentication/session handling requires hardening before use as a high-risk production system.
- Formal backup-restore and lock-contention drills remain operational follow-up work.
- The two clearly labeled QA customer records are intentionally retained and should only be removed later through an approved data-cleanup process.
