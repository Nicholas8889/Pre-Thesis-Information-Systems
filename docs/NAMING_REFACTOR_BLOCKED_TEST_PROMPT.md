# Prompt Lanjutan: Selesaikan Hanya Naming Tests yang Masih Blocked

Lanjutkan pengujian naming refactor berdasarkan:

- `docs/NAMING_REFACTOR_TEST_PLAN.md`
- `docs/NAMING_REFACTOR_TEST_REPORT.md`
- `prisma/verify-naming-refactor.cjs`

Jangan mengulang 40 test-plan cases yang sudah berstatus Passed/Fixed and Passed kecuali rerun kategori diperlukan setelah suatu fix. Fokus hanya pada 49 kasus berstatus Blocked.

Gunakan skill Supabase untuk Prisma/PostgreSQL dan browser skill untuk UAT. Periksa `AGENT.md`, git status, report, dan current diff sebelum bertindak. Pertahankan semua perubahan pengguna; jangan commit, stage, atau push.

Prerequisite wajib sebelum mulai:

1. `NAMING_TEST_DATABASE_URL` dan `NAMING_TEST_DIRECT_URL` menunjuk ke PostgreSQL clone disposable yang nama databasenya mengandung `naming_refactor_test`.
2. Clone berada pada state tepat sebelum tiga migration naming:
   - `20260813194143_standardize_business_naming`
   - `20260813202500_standardize_existing_record_labels`
   - `20260813215000_standardize_postgresql_identifiers`
3. URL clone tidak sama dengan shared/dev/prod database.
4. Tersedia disposable fixture dan akun aktif Manager, Admin, dan Sales.
5. Bila prerequisite tidak tersedia, jangan memakai shared database sebagai pengganti. Laporkan exact missing prerequisite dan berhenti tanpa mengubah status Blocked.

Urutan kerja:

1. Jalankan guarded snapshot before:

```powershell
node.exe prisma/verify-naming-refactor.cjs before
```

2. Review `db-before.json`; pastikan legacy objects ada, snake_case targets belum ada, dan counts/checksums lengkap.
3. Arahkan `DATABASE_URL`/`DIRECT_URL` ke clone, deploy tiga migration naming, lalu jalankan status/diff dan snapshot after:

```powershell
$env:DATABASE_URL = $env:NAMING_TEST_DATABASE_URL
$env:DIRECT_URL = $env:NAMING_TEST_DIRECT_URL
npm.cmd run prisma:deploy
& '.\node_modules\.bin\prisma.cmd' migrate status
& '.\node_modules\.bin\prisma.cmd' migrate diff --from-schema-datasource prisma\schema.prisma --to-schema-datamodel prisma\schema.prisma --exit-code
node.exe prisma/verify-naming-refactor.cjs after
```

4. Bandingkan counts, stable checksums, payment-term distributions, enum meanings/defaults/nullability, FKs, uniques, indexes, and orphan counts. Jalankan lock-timeout/retry/no-op/recovery checks MG-10–MG-12 hanya pada clone disposable.
5. Jalankan seluruh integration suite dan full suite pada clone:

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests\integration --maxWorkers=1 --minWorkers=1
npm.cmd test -- --maxWorkers=1 --minWorkers=1
```

6. Perbaiki hanya defect naming-refactor atau safe regression defect. Jangan melemahkan assertion, menghapus test, atau mengubah business behavior agar lulus. Rerun failed test, kategori terkait, lalu full suite.
7. Jalankan app production build dengan clone yang sudah dimigrasikan. Gunakan browser skill untuk semua UI-01–UI-19 dan role-dependent RG cases pada Manager, Admin, dan Sales:
   - canonical navigation/routes dan legacy redirects;
   - Direct Sales Order, Customer PO, dan Customer Inquiry conversion;
   - Immediate/Credit payment terms, invoice/payment/receivable/Collection Task;
   - Customer Outreach dan Audit Trail Record Reference;
   - Open/Completed tabs;
   - `Cetak`, `Ekspor Excel`, dan `Unduh` semantics/files;
   - Surat Jalan print preview/PDF;
   - role restrictions, disabled controls, notifications, KPIs, and audit rows.
8. Render `docs/ERD.mmd` dengan Mermaid renderer dan verify against Prisma schema.
9. Jalankan final stale-term scan dan classify setiap occurrence. Historical migrations, compatibility wrappers/storage, negative assertions, Prisma `$transaction`, and DOM events are allowed only with explicit classification.
10. Update 49 Blocked rows in the test plan and append actual evidence to the report. Jangan menandai selesai bila ada required test yang gagal atau masih Blocked.

Final response harus berisi overall result; jumlah passed/fixed/blocked/failed; defect/fix; command/browser evidence; migration row-count/integrity evidence; allowed old terms; path plan/report; dan residual risk.
