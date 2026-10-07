# Small UMKM demo dataset

The `umkm-textile-v1` fixture represents CV Tajuk's B2B textile revenue cycle with fictional customers and documents. It is deliberately small and reproducible. All contact details are synthetic; the PO PDFs explicitly identify themselves as demo documents. This fixture is for demonstrations, not business forecasting or evidence of actual customers.

## Contents

| Record | Baseline |
| --- | ---: |
| Customers / textile products | 15 / 10 |
| Product cost history entries | 20 |
| Direct Sales Orders / Customer POs | 22 / 8 |
| Order items | 60 |
| Invoices | 24 |
| Paid / partial / unpaid / overdue invoices | 14 / 4 / 3 / 3 |
| Payments | 22 |
| Picking lists / Surat Jalan | 20 / 17 |
| Customer inquiries / outreach / collections | 8 / 12 / 6 |
| Pending manager approvals | 2 |

Orders cover the anchor month and the preceding five calendar months. Default dates follow today's date in Jakarta; use `--date YYYY-MM-DD` for repeatable results. The initial live replacement uses `2026-10-04`. At that anchor, invoice totals are Rp171,528,750, paid amounts Rp114,362,500, and outstanding amounts Rp57,166,250. Dashboard sales may use a different business definition than invoice gross totals; do not compare these as interchangeable metrics.

## Preview and validation

```powershell
npm.cmd run demo:preview -- --date 2026-10-04
npm.cmd run demo:validate -- --target YOUR_PROJECT_REF --date 2026-10-04
```

Preview has no database access. Validation requires the configured PostgreSQL connection and Supabase server-side Storage credentials. It archives all public table rows (including users and migration history) and all files in the configured private PO bucket. SHA-256 checks verify database and attachment archives. Restore and replacement are tested inside a randomly named private schema that is removed afterward; public application rows remain unchanged during validation.

The scratch schema uses copied enum types, indexes, checks, and foreign keys, and runs the real order-form insight and payment-reliability queries. Existing legacy `NOT VALID` constraints remain compatible with archive restoration. Unknown public tables cause replacement to stop rather than guess ownership.

## Replace the demo data

Install/use Python with ReportLab available, then supply its executable:

```powershell
npm.cmd run demo:replace -- --target YOUR_PROJECT_REF --date 2026-10-04 --python 'C:/path/to/python.exe'
```

An existing verified backup may be reused with `--backup 'output/demo-backups/RUN_DIRECTORY'`. The command repeats isolated validation, generates eight PO PDFs, uploads and downloads them to verify their checksums, then locks application writes briefly. A database fingerprint must still match the backup; if a user or scheduled refresh has changed rows meanwhile, replacement aborts without deleting business records. Run again without `--backup` to take a fresh snapshot.

All business records are replaced in one transaction. The command verifies totals, document relationships, preserved accounts and migration history, and refreshes dashboard analysis successfully before commit. Failed database replacement rolls back and removes its staged attachments. After commit, old PO files are removed only if their contents still match the archived checksum. A changed or missing file is listed in the result instead of silently deleted.

Ordinary accounts retain their IDs, passwords, session versions, roles, and status. Only usernames identified as SIT fixtures (`sit_...` or `sit2_...`) are removed. Missing standard demo accounts are created only on an empty/new setup. Existing standard accounts with unexpected roles/status cause the command to stop. Public schema, RLS policies, migrations, Auth settings, and deployment environment are not changed.

## Backup and recovery

Archives live in ignored `output/demo-backups/<run>/` directories:

- `database.json`: all public rows from a consistent snapshot.
- `manifest.json`: checksums, column/check/FK metadata, original Storage paths and attachment checksums.
- `storage/*.bin`: original private attachment bytes.
- `validation.json`: successful restore and fixture validation.
- `result.json`: committed replacement status, summary and Storage cleanup results.

The initial pre-replacement archive is `output/demo-backups/2026-10-04T08-03-01-718Z-07d5ac0d`. It contains 124 customers, 14 products, 176 orders, 160 invoices, eight accounts, and 32 PO bucket files.

These files contain sensitive account password hashes and private documents. Keep them local or in a protected backup location; do not commit or upload them publicly. This is an application-data backup, not a full Supabase project backup: it does not recreate database functions, RLS, configuration, or infrastructure. Those remain in place during this operation.

Recovery is a separate, deliberate operation: stop app writes; verify the manifest and all file hashes; restore original attachments to their original private paths; restore public application rows in parent-first order (following `DEMO_TABLE_ORDER`) with unchanged schema; verify counts and financial relationships; refresh dashboard analysis. Archive hashes were verified by a real round-trip restore in the scratch schema before replacement. A destructive automatic restore command is intentionally not bundled with the routine reset.

## Suggested demonstration flow

1. Sign in as Sales and inspect assigned customers and the ten products with 30-day production-cost guidance.
2. Use existing SO/PO examples to show prices, optional NPWP-based PPN snapshots, payment terms, and private PO downloads.
3. Show paid, partial, unpaid, and overdue invoices with consistent payment histories; use customer behaviour labels as supporting examples.
4. Sign in as Manager to inspect two pending order approvals for customers with delivered outstanding balances.
5. Show picking and a combined Surat Jalan linked to two orders from the same customer.
6. Show receivables, six collection tasks, and the six-month dashboard trend.

Demo actions add/change rows, so rerun replacement with a fresh backup when a clean baseline is needed. Document sequences are initialized to the fixture maxima so future SO/PO/invoice numbers continue without collisions.

The earlier large volume fixture remains accessible only for a local database with `DEMO_PROFILE=volume` and `ALLOW_VOLUME_RESET=yes`. Routine `prisma:seed` now previews the small fixture and does not delete database records. For a future fully local demo, point both PostgreSQL and Supabase Storage settings at the local Supabase stack and use `--target localhost` (or the matching `127.0.0.1` endpoint); merely running Next.js locally still uses whichever database is configured.

## Initial live replacement verification

Applied successfully on 4 October 2026. All 32 old private PO files were archived and removed after commit; all eight replacement attachments passed download/checksum verification. Four ordinary accounts (`admin`, `sales`, `manager`, `ayam`) retained their complete original rows, including credentials and session versions. Four SIT test accounts were removed. The 30 migration records and all public check/FK definitions remained identical; application-table RLS remained enabled and no scratch schemas were left behind. Dashboard refresh completed with `SUCCEEDED`.

Live browser verification showed the new dashboard totals, PO tabs totaling eight, the 15-customer/10-product PO form, outstanding-balance approval insight, and working tax/pricing calculations without submitting another order. Evidence is saved in ignored `output/demo-evidence/`, and the operation result lives beside the original backup.

Validation includes a real archive restore and replacement in an isolated schema; application order-form queries; 15 focused fixture, payment-reliability, and tax-policy tests; scoped ESLint; and a successful TypeScript check of the seed and its imports. Full-project TypeScript checking encounters the pre-existing generated Next.js type error for the extra `OrdersBySourcePage` export in the Sales Orders page. This reset does not modify that route or publish a new application build.
