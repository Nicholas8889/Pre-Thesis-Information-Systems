# Whole Application Regression Test Report

## Production Release Baseline - 13 August 2026

Final result: PASS.

| Release Gate | Result |
| --- | --- |
| Standalone TypeScript | Passed |
| Full ESLint | Passed with zero warnings |
| Automated test files | 28 passed |
| Automated tests | 101 passed |
| Prisma schema/migrations | Valid; 4 applied; up to date |
| Database schema drift | No difference detected |
| Optimized Next.js build | Passed |
| Production login route | HTTP 200 |
| Unauthenticated protected routes | Correct HTTP 307 login redirects |
| Production error log | Empty |

Batch 10 closes the remaining stale test-call compiler error and establishes a successful production-build/runtime baseline for all preceding feature batches. The verification did not reset Supabase demo data and rollback-only integration tests retained no fixtures.

## Current Verification - 12 August 2026

Final feature-batch result: PASS. Batch 10 subsequently removed the remaining stale test type-check call and completed the production release gate.

| Check | Result |
| --- | --- |
| Automated test files | 28 passed |
| Automated tests | 101 passed |
| ESLint | Passed with zero warnings |
| Prisma schema | Valid |
| Supabase migrations | 4 applied; schema up to date |
| Schema drift | No difference detected |
| Authenticated browser smoke | Passed |
| Browser warnings/errors | None |
| Standalone TypeScript | Passed after Batch 10 test-contract cleanup |

The final regression covers optional NPWP, customer payment behaviour/type/risk, current-month Product average sold price, Sales Order and Customer PO insights, server-authoritative tax snapshots, Invoice tax rendering, price naming, and Surat Jalan driver/vehicle assignment. The live Supabase checks use rollback-only fixtures and retained no Batch 9 test data. The destructive demo seed was updated and made self-verifying but was not run against the existing configured database.

## Current Verification - 19 July 2026

Current project state:

- Git branch is synced with `origin/main`.
- Vercel/Supabase deployment fixes are present in the repository: Prisma Client generation runs before Next.js build, and Next.js uses the default `.next` output directory.
- ESLint passed with zero warnings.
- Automated tests: 70 of 72 tests passed locally.
- The 2 failing tests are Supabase-dependent integration tests and failed because the local environment could not reach the configured Supabase database host, not because the tested business assertions failed.

Current interpretation:

- Unit-level business rules are stable.
- Local integration verification requires reachable Supabase database credentials/network.
- Vercel deployment requires all environment variables listed in `docs/DEPLOYMENT_GUIDE.md`.

Date: 20 June 2026

## Final Result

Historical result: PASS - No blocking application defects were found at the time of this report.

## Automated Quality Checks

| Check | Result |
|---|---|
| Unit test files | 8 passed |
| Unit tests | 44 passed |
| ESLint | Passed with zero warnings |
| TypeScript type-check | Passed |
| Production build | Passed |
| Prisma migrations | 8 found; database schema up to date |

The unit suite covers calculations, process statuses, customer intelligence, notifications, product insights, Sales Order approval, role access, and table date/number/text sorting utilities.

## Authenticated Application Route Test

The 11 main authenticated routes were requested for Admin, Sales, and Manager.

- Total checks: 33
- Passed: 33
- Failed: 0

Routes tested:

- Dashboard
- Customers
- Sales Orders
- Invoices
- Payments
- Surat Jalan
- Receivables
- Collections
- Customer Outreach
- Audit Trail
- Settings

## Feature-Specific Regression Checks

| Feature | Result |
|---|---|
| Login page responds successfully | Passed |
| Password initially uses hidden password type | Passed |
| Show Password control and accessible label render | Passed |
| Record Contact link customer parameter loads | Passed |
| Requested customer is selected in Record Customer Contact | Passed |
| Table search enhancer included on non-print application pages | Passed |
| Sort utility handles text, numbers, currency, and dates | Passed |
| Tag filter configuration includes Category, Risk, Status, Invoice, Payment Terms, Method, Role, Module, and similar fields | Passed |
| Date columns receive Start Date and End Date controls | Passed |
| Reset restores original table order and clears filters | Passed |
| Print routes are excluded from table controls | Passed |
| Role-restricted controls remain enforced | Passed |
| Manager approval workflow still compiles and passes rules | Passed |
| Notification rules still pass | Passed |

## Excel Export Check

- HTTP response: 200 OK
- Content type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Download filename: `sales-orders-2026-01-01-2026-12-31.xlsx`

## UI Automation Note

The in-app browser worker could not start under the current Windows process permissions. Live rendered HTML responses were used to verify autofill selection, password controls, authenticated pages, disabled role controls, and server-rendered content. Interactive table behavior is additionally covered by focused utility tests, lint, type-checking, and the production build.
