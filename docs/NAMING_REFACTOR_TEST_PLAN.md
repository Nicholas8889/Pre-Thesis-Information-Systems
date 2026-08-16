# Naming Refactor Test Plan

Status dokumen: **Executed on authorized Supabase development database — 58 passed, 20 fixed and passed, 11 blocked, 0 failed**

Tanggal audit dan eksekusi: 2026-08-13 sampai 2026-08-14

Workspace: `D:\Pre Thesis MVP Iterative Development`

## 1. Scope dan guardrail

Dokumen ini mengaudit working tree setelah naming refactor dan mencatat hasil eksekusi. Setelah otorisasi eksplisit, pending physical-name migration diterapkan pada Supabase development database saat ini. Snapshot sebelum dan sesudah migration, seluruh integration/full suite, production build, serta authenticated Manager/Admin/Sales UAT telah dijalankan tanpa reset, truncate, atau reseed.

Ringkasan evidence dan rincian defect tersedia di `docs/NAMING_REFACTOR_TEST_REPORT.md`. Status `Fixed and Passed` dihitung terpisah dari `Passed`. Sebelas kasus tetap `Blocked` karena membutuhkan state sebelum ketiga migration, deliberate lock/recovery drill pada clone disposable, dua index FK yang terbukti pre-existing, atau bukti UAT non-naming yang tidak diselesaikan (master-data CRUD, keyboard-only audit, dan PDF hasil print yang benar-benar disimpan).

Guardrail eksekusi:

- Jangan menjalankan `npm run prisma:seed`, `npm run db:reset`, atau `prisma migrate reset` pada shared/remote database.
- Deliberate lock conflict, rollback/recovery drill, reset, dan reseed hanya boleh dijalankan pada clone disposable; tidak dijalankan pada development database ini.
- Simpan `git status`, transcript terminal, output JSON pemeriksaan database, screenshot browser, file `.xlsx`, dan PDF/print preview sebagai evidence.
- Jangan menganggap istilah lama selalu defect. Cocokkan setiap temuan dengan daftar allowed exceptions pada bagian 5.
- Jangan commit atau stage hasil test tanpa instruksi terpisah.

## 2. Snapshot audit working tree

- Tidak ada perubahan staged.
- Baseline eksekusi memiliki **127 status entries** pada `git status --short`, tanpa file staged. Inventory audit sebelumnya mencatat 155 file modified/untracked ketika direktori untracked diekspansi per file.
- Enam migration setelah PostgreSQL baseline masih untracked, termasuk tiga migration naming. Ini adalah release-packaging risk walaupun SQL-nya tersedia di working tree.
- PostgreSQL baseline `20260718203500_postgresql_baseline` tidak memiliki tracked diff pada saat audit.
- Generated Prisma client yang saat ini berada di `node_modules/.prisma/client/index.d.ts` hanya menampilkan canonical model/enum names pada scan awal; ini harus dibuktikan ulang setelah `prisma generate`.
- Test commands yang tersedia: `npm test`, `npm run test:watch`, `npm run lint`, `npm run build`, `npm run prisma:generate`, `npm run prisma:migrate`, dan `npm run prisma:deploy`.
- Runtime yang terdeteksi: Node 24.16.0, npm 11.13.0, Prisma 6.19.3, Vitest 2.1.9. `psql` tidak terdeteksi.

### Changed-file inventory by scope

| Scope | Files yang wajib tercakup |
|---|---|
| Schema/migration/config | `prisma/schema.prisma`, `prisma.config.ts`, enam migration untracked, `prisma/seed.ts`, `prisma/seed-demo-users.ts`, `prisma/verify-batch-one-foundation.ts`, `.env.example` |
| Canonical routes | `/customer-purchase-orders`, `/collections`, `/customer-outreach`, canonical Customer PO document API |
| Compatibility routes | `/pre-orders`, `/billing`, `/follow-ups`, legacy Customer PO document API, `src/lib/pre-order-storage.ts`, legacy bucket/env fallback |
| UI/action/helper | Semua 58 file di `src/`, terutama navigation, order forms/details, collections/outreach, receivables, audit trail, notifications, print/export/download, actions, calculations, workflow, status helpers |
| Automated tests | Semua 19 changed/untracked files di `tests/` dan unchanged unit regression tests yang dipanggil oleh plan ini |
| Docs/generated | README, ERD, flows, UAT, testing matrix, demo, design/analysis docs, Mermaid/PlantUML/draw.io/SVG/PNG, output PDF/XLSX |

## 3. Canonical mapping under test

| Legacy | Canonical | Compatibility expectation |
|---|---|---|
| Pre Order | Customer PO / Customer Purchase Orders | Tidak tampil sebagai business term; hanya boleh pada immutable history atau compatibility identifiers |
| `TransactionType` / `transactionType` | `SalesOrderSource` / `source` | Generated client hanya canonical |
| `SALES_ORDER` / `PRE_ORDER` | `DIRECT` / `CUSTOMER_PO` | Nilai lama dipertahankan melalui enum rename, bukan data recreation |
| `poNumber` | `customerPoNumber` | Unik dan nullable tetap sama |
| PO document metadata | `customerPoDocumentName`, `customerPoDocumentStoredName`, `customerPoDocumentMimeType` | Bucket fisik lama tetap dapat dibaca |
| Billing / `FollowUp` | Collections / `CollectionTask` | `/billing` redirect ke `/collections` |
| `FollowUpStatus` / `followUpDate` | `CollectionTaskStatus` / `scheduledDate` | Nilai/status dan relasi tetap |
| Product Follow Up / `CustomerProductFollowUp` | Customer Outreach / `CustomerOutreach` | `/follow-ups` redirect ke `/customer-outreach` |
| `DEBIT` | `IMMEDIATE` | Due-date dan delivery eligibility tidak berubah |
| Transaction Code / `transactionCode` | Record Reference / `recordReference` | Dapat berisi nomor dokumen, company, product, atau username |
| Generic Price / Unit Price | List Price / Base Unit Price / Final Unit Price sesuai konteks | Nilai dan calculation tidak berubah |
| Ongoing Process / Done Process | Open / Completed | Query compatibility `tab=ongoing|done` boleh tetap internal |
| Export action | Ekspor Excel | Harus menghasilkan `.xlsx`; bukan print |
| Print action | Cetak | Hanya membuka print behavior |
| File retrieval | Unduh | Harus mengunduh/membuka file sesuai label |
| Surat Jalan | Surat Jalan / Delivery Note | Printable heading harus `SURAT JALAN / Delivery Note` |

## 4. Observed pre-test risks and resolution

1. **Resolved:** Excel actions now use `Ekspor Excel`; workbook and HTTP response regression tests verify valid `.xlsx`, MIME, filename, and canonical headers.
2. **Resolved for the pending physical migration:** six migrations remain untracked as a release-packaging risk, but the authorized pending migration applied successfully; row counts, stable checksums, payment distributions, constraints, catalog counts, RLS, grants, and orphan counts were preserved.
3. **Resolved:** UI and Prisma API now use contextual customer/pricing names and Open/Completed display labels.
4. **Resolved:** canonical Collections and Customer Outreach pages own shared canonical implementation; legacy routes are redirect-only wrappers.
5. **Resolved for current text and diagrams:** active docs and generated current PNG diagrams are canonical. `docs/ERD.mmd` was rendered with Mermaid CLI 11.15.0; missing tax/delivery fields and invalid `FK, UK` syntax were fixed and field parity against Prisma is exact.
6. **Resolved:** printable route heading is `SURAT JALAN / Delivery Note`.
7. **Resolved:** notification separator, canonical copy, and canonical links were verified while authenticated as Manager, Admin, and Sales; browser console remained clean.
8. **Verified:** NPWP, tax snapshot, delivery assignment, and revenue-cycle behavior pass the full database-backed suite. Two pre-existing missing FK lookup indexes remain explicitly classified under MG-08.

## 5. Allowed exceptions dan alasannya

| Exception | Lokasi/contoh | Alasan | Batas lulus |
|---|---|---|---|
| Immutable historical migrations | PostgreSQL baseline dan `prisma/sqlite-migrations-backup/**` | Migration history tidak boleh diedit setelah pernah dipakai | Istilah lama hanya menjelaskan state lama; checksum/history unchanged |
| Rename migration source identifiers | Tiga migration naming | SQL rename dan cleanup harus menyebut identifier/value lama agar dapat ditemukan | Hanya pada source side `ALTER ... RENAME` atau predicate cleanup yang targetnya sempit |
| Compatibility routes/API | `/pre-orders`, `/billing`, `/follow-ups`, legacy document API | Bookmark/client lama harus tetap bekerja | File hanya wrapper/redirect/delegator; tidak menjadi owner implementasi canonical |
| Compatibility storage | `SUPABASE_PRE_ORDER_BUCKET`, `pre-order-documents`, `src/lib/pre-order-storage.ts` | Existing deployed bucket/object path tidak boleh putus | Canonical env/module diprioritaskan; fallback terdokumentasi dan dites |
| Prisma transaction API | `prisma.$transaction`, `Prisma.TransactionClient` | Ini nama API teknis untuk atomic database transaction | Tidak tampil sebagai business UI/domain label |
| DOM/browser events | `event`, click/change/submit events | Event UI bukan business transaction | Tidak dilabel sebagai Sales Event/Transaction di UI |
| Negative/compatibility assertions in tests | `tests/unit/naming-standardization.test.ts` | Test perlu menyebut istilah lama untuk memastikan absence/migration mapping | Hanya fixture/assertion, bukan exported domain API |
| Historical documents | `AGENT.md` atau dokumen arsip | Boleh merekam original scope | Harus diberi label historical/legacy; current-feature docs tidak boleh mengadopsinya |

## 6. Preconditions dan evidence convention

| Code | Prerequisite |
|---|---|
| P0 | Jalankan dari root project; dependency lokal tersedia; jangan stage/commit |
| P1 | Buat folder evidence lokal yang di-ignore, misalnya `.codex/evidence/naming-refactor`; jalankan `Start-Transcript` sebelum test |
| P2 | Sediakan clone PostgreSQL disposable bernama jelas `naming_refactor_test`, pada state tepat sebelum migration naming; URL tidak sama dengan shared/dev/prod |
| P3 | Sediakan tiga akun aktif Manager, Admin, Sales dan fixture yang mempunyai Direct SO, Customer PO, immediate/credit invoice, partial/full payment, delivery note, collection task, outreach, dan audit records |
| P4 | App production build dapat dijalankan pada port test terpisah; browser mempunyai sesi login dan download folder evidence |
| P5 | Focused automation tersedia: `naming-revenue-cycle.test.ts`, `naming-audit-actions.test.ts`, dan `naming-endpoints.test.ts`. Dua suite database-free lulus; revenue-cycle suite transaction-rollback menunggu P2. |

Evidence naming: `<ID>-terminal.txt`, `<ID>-before.json`, `<ID>-after.json`, `<ID>-browser.png`, `<ID>-console.txt`, `<ID>-network.har`, `<ID>-download.xlsx`, atau `<ID>-print.pdf`.

## 7. Test cases

### 7.1 Static terminology audit

| ID | Area | Risk/requirement | Preconditions | Exact command atau browser steps | Expected result | Evidence | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| ST-01 | Static / scope | Seluruh changed file diketahui sebelum test | P0, P1 | `git status --short` lalu `git ls-files --modified --others --exclude-standard` | Inventory sama atau perubahan baru dijelaskan; tidak ada staged file tak disengaja | `ST-01-terminal.txt` | High | Passed |
| ST-02 | Static / Customer PO | Tidak ada Pre Order sebagai current business term | P0, P1 | `rg -n -i -e "Pre Order" -e "Pre-Order" -e "preorder" -e "pre-order" -e "PRE_ORDER" src prisma tests docs README.md AGENT.md .env.example` | Semua hit termasuk allowed exception atau defect tercatat; tidak ada current UI/domain hit | `ST-02-terminal.txt` | Critical | Passed |
| ST-03 | Static / order source | `TransactionType` dan `transactionType` hilang dari canonical code | P0, P1 | `rg -n -e "TransactionType" -e "transactionType" src prisma tests docs README.md` | Hit hanya historical migration, rename SQL, atau negative assertion | `ST-03-terminal.txt` | Critical | Passed |
| ST-04 | Static / collections/outreach | Billing dan generic Follow Up tidak bocor ke current modules | P0, P1 | `rg -n -i -e "Billing" -e "Follow Up" -e "Follow-up" -e "FollowUp" -e "followUp" -e "FOLLOW_UP" -e "CustomerProductFollowUp" src prisma tests docs README.md AGENT.md` | Hit hanya cleanup/history/compatibility/test assertions; Collections dan Customer Outreach terpisah | `ST-04-terminal.txt` | Critical | Passed |
| ST-05 | Static / payment term | `DEBIT`/Debit tidak tersedia sebagai current enum/label | P0, P1 | `rg -n -e "DEBIT" -e "Debit" src prisma tests docs README.md` | Hit hanya historical migration atau rename source; current code memakai `IMMEDIATE`/Immediate Payment | `ST-05-terminal.txt` | Critical | Passed |
| ST-06 | Static / audit | Transaction Code tidak tersisa sebagai current field/label | P0, P1 | `rg -n -i -e "Transaction Code" -e "transactionCode" src prisma tests docs README.md` | Hit hanya history/rename/negative assertion; audit UI/search memakai record | `ST-06-terminal.txt` | Critical | Passed |
| ST-07 | Static / customer/reference labels | Misleading ID, Customer Name, dan Customer Type/customerType diidentifikasi | P0, P1 | `rg -n -e "Pre Order ID" -e "PO ID" -e "Sales Order ID" -e "Customer ID" -e "Customer Name" -e "Customer Type" -e "customerType" src prisma tests docs` | Business UI memakai Number/Reference, Contact Person, dan Customer Segment; domain exception harus diputuskan/didokumentasi | `ST-07-terminal.txt` | High | Fixed and Passed |
| ST-08 | Static / pricing | `price`/`unitPrice` tidak ambigu | P0, P1 | `rg -n -e "Price" -e "price" -e "Unit Price" -e "unitPrice" src prisma tests docs` | Setiap context dapat dipetakan ke List Price, Base Unit Price, Final Unit Price, Requested Unit Price, atau Agreed Unit Price; ambiguous hits gagal | `ST-08-terminal.txt` | High | Fixed and Passed |
| ST-09 | Static / process tabs | Generic Ongoing/Done wording tidak tampil | P0, P1 | `rg -n -e "Ongoing Process" -e "Done Process" src docs tests` | Display label Open/Completed; internal query values `ongoing`/`done` boleh tetap untuk compatibility | `ST-09-terminal.txt` | High | Fixed and Passed |
| ST-10 | Static / actions | Label Cetak/Ekspor/Unduh sesuai behavior | P0, P1 | `rg -n -i -e "Export" -e "Mencetak" -e "Cetak" -e "Ekspor" -e "Download" -e "Unduh" -e "Print" src docs` | Cetak hanya memanggil print; Ekspor Excel menghasilkan xlsx; Unduh mengambil file; current `Mencetak Excel` harus tercatat sebagai failure | `ST-10-terminal.txt` | Critical | Fixed and Passed |
| ST-11 | Static / delivery | Surat Jalan/Delivery Note konsisten | P0, P1 | `rg -n -i -e "Surat Jalan" -e "Delivery Note" -e "SURAT JALAN" src docs` | Module dapat memakai Surat Jalan, technical model DeliveryNote, dan print heading tepat `SURAT JALAN / Delivery Note`; campuran lain dijelaskan | `ST-11-terminal.txt` | High | Fixed and Passed |
| ST-12 | Static / compatibility architecture | Canonical modules tidak bergantung pada legacy implementation owner | P0, P1 | `rg -n -e "@/app/follow-ups/page" -e "@/app/pre-orders" -e "@/app/billing" src/app src/lib` | Legacy wrapper mengimpor canonical/shared implementation; canonical route tidak mengimpor implementation dari legacy route | `ST-12-terminal.txt` | High | Fixed and Passed |
| ST-13 | Static / technical exceptions & encoding | `$transaction`, DOM events, dan mojibake diklasifikasi benar | P0, P1 | `rg -n -e "transaction" -e "Transaction" -e "Â" src prisma tests docs` | Prisma transaction/API hits allowed; generic domain helper harus diadjudikasi; tidak ada mojibake pada user-facing strings | `ST-13-terminal.txt` | Medium | Fixed and Passed |

### 7.2 Prisma/schema validation

| ID | Area | Risk/requirement | Preconditions | Exact command atau browser steps | Expected result | Evidence | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| PR-01 | Prisma formatting | Schema valid secara format tanpa perubahan tak terduga | P0, P1 | Simpan `git diff -- prisma/schema.prisma`, jalankan `& '.\node_modules\.bin\prisma.cmd' format`, lalu ulangi diff | Command sukses; hanya formatting yang dapat dijelaskan atau diff tetap sama | `PR-01-terminal.txt` + before/after diff | High | Passed |
| PR-02 | Prisma validation | Schema, relation, enum, map, dan datasource valid | P0, P1 | `& '.\node_modules\.bin\prisma.cmd' validate` | Exit 0 tanpa warning schema error | `PR-02-terminal.txt` | Critical | Passed |
| PR-03 | Prisma generation | Generated client hanya menyediakan canonical API | P0, P1 | `npm.cmd run prisma:generate`; lalu `rg -n -e "TransactionType" -e "FollowUp" -e "CustomerProductFollowUp" -e "transactionCode" -e "transactionType" -e "DEBIT" node_modules/.prisma/client/index.d.ts` | Generate exit 0; stale-name scan exit 1/no hits | `PR-03-terminal.txt` | Critical | Passed |
| PR-04 | Prisma models/relations/maps | Model/field/relation canonical lengkap | P0, P1 | Inspect `prisma/schema.prisma` dan jalankan `rg -n -e "model CollectionTask" -e "model CustomerOutreach" -e "collectionTasks" -e "outreachActivities" -e "customerPoNumber" -e "recordReference" prisma/schema.prisma` | Canonical models/relations ada; mapped PK names tepat; tidak ada orphan relation | `PR-04-terminal.txt` | Critical | Fixed and Passed |
| PR-05 | Prisma enums/defaults | Enum rename dan defaults benar | P0, P1 | `rg -n -C 4 -e "enum SalesOrderSource" -e "enum PaymentTermType" -e "enum CollectionTaskStatus" -e "@default(DIRECT)" -e "@default(IMMEDIATE)" prisma/schema.prisma` | Hanya DIRECT/CUSTOMER_PO, IMMEDIATE/CREDIT, Planned/Done/Cancelled; defaults canonical | `PR-05-terminal.txt` | Critical | Passed |
| PR-06 | Prisma constraints/indexes/FKs | Unique, FK, dan lookup indexes tidak hilang saat rename | P0, P1 | Review schema dan migration; bandingkan `@@index`, `@unique`, `@relation` dengan SQL migration | Customer PO number tetap unique; FK actions sama; seluruh FK penting indexed; constraint names canonical | `PR-06-terminal.txt` | Critical | Fixed and Passed |
| PR-07 | Prisma drift/status | Schema declarative identik dengan test database pasca-migration | P2, P1 | Setelah MG-05: `& '.\node_modules\.bin\prisma.cmd' migrate status`; lalu `& '.\node_modules\.bin\prisma.cmd' migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` | Migration up to date dan no difference detected | `PR-07-terminal.txt` | Critical | Passed |

### 7.3 Migration safety on disposable test database

| ID | Area | Risk/requirement | Preconditions | Exact command atau browser steps | Expected result | Evidence | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| MG-01 | Migration history | Historical migration tidak berubah dan semua new migrations masuk release scope | P0, P1 | `git diff --exit-code -- prisma/migrations/20260718203500_postgresql_baseline prisma/migrations/migration_lock.toml`; lalu `git status --short -- prisma/migrations` | Baseline/lock unchanged; enam untracked migration secara eksplisit dicatat sebagai release prerequisite | `MG-01-terminal.txt` | Critical | Passed |
| MG-02 | Migration destructive scan | Tidak ada drop/reset/truncate/delete | P0, P1 | `rg -n -i -e "DROP TABLE" -e "DROP COLUMN" -e "DROP TYPE" -e "TRUNCATE" -e "DELETE FROM" -e "migrate reset" prisma/migrations/20260813194143_standardize_business_naming prisma/migrations/20260813202500_standardize_existing_record_labels prisma/migrations/20260813215000_standardize_postgresql_identifiers` | No hits; rename migrations hanya ALTER RENAME, cleanup hanya targeted UPDATE | `MG-02-terminal.txt` | Critical | Fixed and Passed |
| MG-03 | Migration preflight | Clone benar-benar berada pada legacy state yang diharapkan | P2, P1 | Set `$env:NAMING_SNAPSHOT_PHASE='before'`, lalu jalankan exact read-only snapshot block pada §9.4 | Semua source objects (`TransactionType`, `FollowUp`, old columns/indexes) ada tepat satu; canonical targets belum ada | `db-before.json` | Critical | Blocked |
| MG-04 | Migration data baseline | Row count dan identifying checksums tersedia sebelum migration | P2, P1 | Gunakan output `counts`, `stableChecksums`, `paymentTermDistribution`, dan `cleanupCandidates` dari exact §9.4 snapshot block | Snapshot semua model lengkap dan timestamped; tidak ada query write | `db-before.json` | Critical | Blocked |
| MG-05 | Migration apply | Rename dan cleanup dapat diterapkan sekali secara atomik | P2, P1 | Guard URL test, set `DATABASE_URL`/`DIRECT_URL` ke clone, lalu `npm.cmd run prisma:deploy` | Tiga naming migrations applied; tidak ada lock timeout/partial state | `MG-05-terminal.txt` | Critical | Passed |
| MG-06 | Migration row preservation | Rename tidak kehilangan/menambah row | P2, P1 | Set `$env:NAMING_SNAPSHOT_PHASE='after'`, ulangi exact §9.4 snapshot block, lalu compare `db-before.json` dan `db-after.json` | Semua counts dan stable checksums identik; hanya table/column/value names berubah | before/after JSON + comparison | Critical | Passed |
| MG-07 | Migration enum/default/nullability | Enum labels berubah tanpa behavioral drift | P2, P1 | Bandingkan `enums`, `columns`, dan `paymentTermDistribution` dalam kedua §9.4 snapshots | SALES_ORDER→DIRECT, PRE_ORDER→CUSTOMER_PO, DEBIT→IMMEDIATE; counts per mapped value sama; nullability/defaults canonical | before/after JSON | Critical | Blocked |
| MG-08 | Migration unique/index/FK integrity | Constraint/index/FK rename dan additions benar | P2, P1 | Review `constraints`, `indexes`, `missingFkIndexes`, dan `renamedRelationOrphans` dalam `db-after.json`; lakukan duplicate Customer PO insert dalam rolled-back focused integration test | PK/FK/unique targets canonical; duplicate ditolak; orphan count 0; FK lookup columns indexed | `db-after.json` + test output | Critical | Blocked |
| MG-09 | Cleanup rewrite scope | Existing user text tidak ikut direwrite secara tak sengaja | P2, P1 | Bandingkan `cleanupCandidates` dari kedua §9.4 snapshots dengan exact predicates migration; verify non-candidate checksums dari clone backup | Hanya exact prefix/equality matches berubah; arbitrary user notes/audit text tetap byte-identical; row count tetap | before/after JSON | High | Passed |
| MG-10 | Migration lock behavior | Metadata locks bounded dan tidak meninggalkan half-applied state | P2, P1 | Pada clone kedua, tahan conflicting lock singkat; jalankan deploy; lepaskan lock; inspect `_prisma_migrations` dan schema | `lock_timeout=5s` menghasilkan controlled failure/rollback, lalu retry sukses; tidak ada partial rename | `MG-10-terminal.txt` | High | Blocked |
| MG-11 | Migration repeat/no-op/drift | Deploy kedua aman dan tidak mengulang cleanup | P2, P1 | Jalankan `npm.cmd run prisma:deploy` kedua kali, lalu PR-07 dan checksum MG-06 | “No pending migrations”; counts/checksums unchanged; no drift | `MG-11-terminal.txt` | High | Passed |
| MG-12 | Recovery/rollback drill | Ada recovery yang terbukti karena Prisma tidak menyediakan down migration otomatis | P2, P1 | Restore pre-migration snapshot ke clone ketiga atau recreate clone; verifikasi legacy counts/checksums; jangan reverse-migrate shared DB | Recovery menghasilkan state legacy identik; RTO/steps dicatat; original test clone tetap tersedia untuk comparison | `MG-12-terminal.txt` + recovery notes | High | Blocked |

### 7.4 Unit tests

| ID | Area | Risk/requirement | Preconditions | Exact command atau browser steps | Expected result | Evidence | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| UT-01 | Unit / immediate payment | DEBIT→IMMEDIATE tidak mengubah due date | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\calculations.test.ts -t "immediate payment" --maxWorkers=1 --minWorkers=1` | Due date sama dengan issue date; label Immediate Payment; invalid credit month tidak digunakan | `UT-01-terminal.txt` | Critical | Passed |
| UT-02 | Unit / credit payment | Credit N bulan dan label tetap benar | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\calculations.test.ts -t "credit" --maxWorkers=1 --minWorkers=1` | Due date mengikuti logic existing; label `Credit – N Month(s)`; CREDIT tetap tersedia | `UT-02-terminal.txt` | Critical | Passed |
| UT-03 | Unit / order source | DIRECT/CUSTOMER_PO dan compatibility mapping tepat | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\naming-standardization.test.ts --maxWorkers=1 --minWorkers=1` | Schema names, canonical routes, query preservation, dan non-destructive SQL assertions lulus | `UT-03-terminal.txt` | Critical | Passed |
| UT-04 | Unit / pricing | Rename field tidak mengubah markup/discount/subtotal/total | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\order-item-pricing.test.ts tests\unit\calculations.test.ts --maxWorkers=1 --minWorkers=1` | Base/final price calculations dan integer validation sama; labels diuji terpisah oleh ST/UI | `UT-04-terminal.txt` | Critical | Passed |
| UT-05 | Unit / purchase frequency | Customer purchase-frequency category tidak berubah | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\customer-intelligence.test.ts --maxWorkers=1 --minWorkers=1` | New/Loyal/Normal/Occasional serta payment behavior boundaries lulus | `UT-05-terminal.txt` | High | Passed |
| UT-06 | Unit / tabs/status | Normalisasi query tab dan status helper tetap memisahkan records | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\process-status.test.ts --maxWorkers=1 --minWorkers=1`; lalu unit browser/component check untuk `normalizeProcessTab` | `tab=done` memilih completed dataset; missing/invalid memilih open; helper Collections canonical | `UT-06-terminal.txt` | High | Passed |
| UT-07 | Unit / audit reference | Audit helper selalu menyimpan canonical recordReference | P0, P1, P5 | `if (-not (Test-Path 'tests\unit\naming-audit-actions.test.ts')) { throw 'Missing focused audit naming test' }; & '.\node_modules\.bin\vitest.cmd' run tests\unit\naming-audit-actions.test.ts --maxWorkers=1 --minWorkers=1` | Explicit reference disimpan; blank reference fallback ke entityId; no transactionCode API | `UT-07-terminal.txt` | High | Fixed and Passed |
| UT-08 | Unit / numbering & compatibility | Nomor dokumen tidak berubah dan query redirect aman | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\document-numbering.test.ts tests\unit\naming-standardization.test.ts --maxWorkers=1 --minWorkers=1` | SO/PO/INV sequence tidak reuse; repeated query keys di-encode/preserve | `UT-08-terminal.txt` | High | Passed |
| UT-09 | Unit / notifications | Notification IDs, labels, rules, href canonical | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\notifications.test.ts --maxWorkers=1 --minWorkers=1` | Customer PO, Collections, Customer Outreach notifications memakai canonical title/id/href dan deadline logic existing | `UT-09-terminal.txt` | High | Passed |
| UT-10 | Unit / workflow regression | Delivery eligibility, invoice/payment, deletion, approval tidak berubah | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\sales-order-deletion.test.ts tests\unit\sales-order-approval.test.ts tests\unit\calculations.test.ts --maxWorkers=1 --minWorkers=1` | Immediate/credit eligibility, protected records, approval, payment status tetap sama | `UT-10-terminal.txt` | Critical | Passed |

### 7.5 Integration tests

Integration tests harus menunjuk ke disposable test database. Test yang menggunakan rollback marker harus membuktikan rollback terjadi; jangan menjalankan fixture yang meninggalkan data pada shared database.

| ID | Area | Risk/requirement | Preconditions | Exact command atau browser steps | Expected result | Evidence | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| IT-01 | Integration / inquiry→direct | Customer Inquiry dikonversi ke Direct Sales Order | P2, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\customer-inquiry-lifecycle.test.ts --maxWorkers=1 --minWorkers=1` plus focused assertion in P5 suite | Inquiry links one SO with source DIRECT, status ConvertedToSO, items/prices unchanged | `IT-01-terminal.txt` | Critical | Passed |
| IT-02 | Integration / inquiry→Customer PO | Customer Inquiry dikonversi ke Customer PO-backed Sales Order | P2, P1, P5 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-revenue-cycle.test.ts -t "inquiry to customer PO" --maxWorkers=1 --minWorkers=1` | source CUSTOMER_PO; customerPoNumber generated; status ConvertedToCustomerPO; Customer PO metadata valid | `IT-02-terminal.txt` | Critical | Passed |
| IT-03 | Integration / full Customer PO chain | Customer PO→Invoice→Payment→Delivery Note→Receivable→Collection Task | P2, P1, P5 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-revenue-cycle.test.ts -t "customer PO revenue cycle" --maxWorkers=1 --minWorkers=1` | Seluruh canonical models terhubung; calculations/permissions unchanged; no legacy entity values | `IT-03-terminal.txt` | Critical | Passed |
| IT-04 | Integration / immediate workflow | IMMEDIATE workflow tetap menuntut payment sebelum delivery | P2, P1, P5 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-revenue-cycle.test.ts -t "immediate payment workflow" --maxWorkers=1 --minWorkers=1` | dueDate=issueDate; unpaid delivery blocked; full payment enables delivery; no automatic CollectionTask | `IT-04-terminal.txt` | Critical | Passed |
| IT-05 | Integration / credit workflow | CREDIT workflow/due-date/collection behavior tetap | P2, P1, P5 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-revenue-cycle.test.ts -t "credit workflow" --maxWorkers=1 --minWorkers=1` | Credit N months preserved; CollectionTask scheduled at due date; delivery eligibility unchanged | `IT-05-terminal.txt` | Critical | Passed |
| IT-06 | Integration / Collections | Collection Task creation dan completion tidak bercampur dengan outreach | P2, P1, P5 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-revenue-cycle.test.ts -t "collection task" --maxWorkers=1 --minWorkers=1` | createCollectionTask persists scheduledDate/status; completion path results Done; audit entity COLLECTION_TASK | `IT-06-terminal.txt` | Critical | Passed |
| IT-07 | Integration / Customer Outreach | Customer product contact tersimpan sebagai CustomerOutreach | P2, P1, P5 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-revenue-cycle.test.ts -t "customer outreach" --maxWorkers=1 --minWorkers=1` | recordCustomerOutreach stores contactDate/notes; no invoice link required; audit CUSTOMER_OUTREACH | `IT-07-terminal.txt` | High | Passed |
| IT-08 | Integration / audit | Record references dan entity types benar untuk semua renamed flows | P2, P1, P5 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-audit-actions.test.ts --maxWorkers=1 --minWorkers=1` | SO/Invoice number, company, product, username allowed; no FOLLOW_UP or CUSTOMER_PRODUCT_FOLLOW_UP new records | `IT-08-terminal.txt` | Critical | Fixed and Passed |
| IT-09 | Integration / redirects | Old routes dan old query params kompatibel | P4, P1 | Jalankan app; request authenticated `/pre-orders?tab=done&view=X`, `/billing?tab=done&invoiceId=X`, `/follow-ups?customerId=X`; inspect final URL/status | Redirect ke canonical path, values/repeated keys preserved, tidak loop, access control sama | `IT-09-network.har` + screenshots | High | Passed |
| IT-10 | Integration / Excel endpoint | Direct dan Customer PO export benar-benar `.xlsx` | P2, P3, P4, P5 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-endpoints.test.ts -t "Excel" --maxWorkers=1 --minWorkers=1`; verify browser download | 200, spreadsheet MIME, attachment filename canonical, correct source rows, canonical headers/payment terms | terminal + `IT-10-download.xlsx` | Critical | Fixed and Passed |
| IT-11 | Integration / document endpoints | Canonical dan legacy Customer PO document APIs ekuivalen dan aman | P2, P3, P4, P5 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-endpoints.test.ts -t "Customer PO document" --maxWorkers=1 --minWorkers=1` | Active user gets same bytes/headers; unauthorized 401; wrong source/missing file 404; unsafe path 400 | `IT-11-terminal.txt` + hashes | Critical | Fixed and Passed |
| IT-12 | Integration / seed/fixtures | Seed dan fixtures compile dengan canonical Prisma API tanpa destructive execution | P0, P1 | `& '.\node_modules\.bin\tsc.cmd' --noEmit`; lalu `rg -n -e "prisma.followUp" -e "prisma.customerProductFollowUp" -e "transactionType" -e "DEBIT" prisma tests` | Typecheck succeeds; legacy client calls absent; seed command tidak dijalankan | `IT-12-terminal.txt` | High | Passed |

### 7.6 UI/browser tests

Untuk setiap browser case: simpan screenshot, final URL, console log, dan network failures. Gunakan production build/server untuk final UAT; dev server boleh dipakai hanya untuk diagnosis.

| ID | Area | Risk/requirement | Preconditions | Exact command atau browser steps | Expected result | Evidence | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| UI-01 | Browser / roles | Login Manager, Admin, Sales tetap valid | P3, P4, P1 | Logout; login bergantian sebagai Manager, Admin, Sales; buka `/`; catat role badge dan console | Semua akun aktif login; role badge benar; tidak ada auth loop/console error | 3 screenshots + console | Critical | Passed |
| UI-02 | Browser / navigation | Desktop/mobile navigation canonical | P3, P4, P1 | Untuk tiap role dan viewport desktop/mobile, klik Customer Purchase Orders, Collections, Customer Outreach, Receivables, Surat Jalan | Label dan destination canonical; active state benar; tidak ada legacy nav item | screenshots + final URLs | Critical | Passed |
| UI-03 | Browser / page copy | Headers/descriptions current dan tidak misleading | P3, P4 | Buka semua changed routes dan inspect title, description, empty state, help content | Customer PO/Collections/Outreach/Audit terminology konsisten; no legacy current copy | screenshot set | High | Fixed and Passed |
| UI-04 | Browser / order source chooser | Choose Order Source benar | P3, P4, Sales/Manager | Buka `/sales-orders?mode=choose`; inspect/click kedua pilihan | Heading `Choose Order Source`; Direct Sales Order dan Customer PO jelas; no Transaction Type | `UI-04-browser.png` | High | Fixed and Passed |
| UI-05 | Browser / Customer PO create | Form memakai numbers/source/document canonical | P3, P4, Sales/Manager | Buka `/customer-purchase-orders?mode=create`; pilih customer/items/terms; upload valid Customer PO document; submit pada disposable data | Labels Customer PO Number/Sales Order Number/Order Source/Customer PO Document; record tersimpan tanpa behavior drift | screenshots + created references | Critical | Passed |
| UI-06 | Browser / Customer PO detail & file | Detail dan document link canonical | P3, P4 | Buka Customer PO list/detail; click document action; coba legacy detail URL | Canonical URL/detail, document opens/downloads sesuai label, legacy detail redirects safely | screenshot + network/file hash | High | Passed |
| UI-07 | Browser / payment terms | Payment Terms terpisah dari Payment Method | P3, P4 | Create/view Direct dan Customer PO; pilih Immediate lalu Credit N; buka invoice/payment views | Payment Terms hanya Immediate/Credit; Payment Method hanya Cash/Bank Transfer/Other; label `Credit – N Months` | screenshots | Critical | Fixed and Passed |
| UI-08 | Browser / Collections | Payment collection module tidak disebut Billing/Follow Up | P3, P4 | Buka `/collections`; add planned and done Collection Task linked/unlinked invoice; inspect list/help/notification | Collection Task singular, scheduled date, payment collection wording; no outreach copy | screenshots + audit row | Critical | Passed |
| UI-09 | Browser / Customer Outreach | Product-contact module terpisah dari Collections | P3, P4 | Buka `/customer-outreach`; search customer; record contact; inspect latest contact and notification | Customer Outreach/Customer Contact wording; no invoice collection fields or generic Follow Up | screenshots + audit row | High | Passed |
| UI-10 | Browser / Receivables | Accounts Receivable wording dan collection links benar | P3, P4 | Buka `/receivables` open/completed; inspect remaining balance, payment terms, create collection action | Receivable values/status unchanged; collection action routes `/collections` with preselection | screenshots + URL | High | Passed |
| UI-11 | Browser / tabs | Display labels Open/Completed dengan query compatibility | P3, P4 | Pada Sales Orders, Customer PO, Invoice, Receivable, Collections, Surat Jalan: click kedua tabs; langsung buka `?tab=done` | UI shows Open/Completed; URL may retain `ongoing/done`; correct records/counts and no lost filters | screenshot matrix | High | Passed |
| UI-12 | Browser / customer labels | Person/company/segment/category tidak tertukar | P3, P4 | Add/edit/view customer; open sales-order insights/detail and customer intelligence table | `Contact Person`, `Company Name`, `Customer Segment`, dan computed `Purchase Frequency Category` jelas; no ambiguous Customer Name/Type | screenshots | High | Blocked |
| UI-13 | Browser / price labels | Price meaning eksplisit di form/detail/export | P3, P4 | Open Products, Inquiry, SO/Customer PO form/detail, invoice, export workbook | Product List Price; order Base Unit Price dan Final Unit Price; requested/agreed unit prices explicit; calculations unchanged | screenshots + workbook cells | Critical | Passed |
| UI-14 | Browser / delivery operations | Surat Jalan wording operasional konsisten | P3, P4, Admin/Manager | Create/view/edit status Surat Jalan from eligible invoice/SO/Customer PO; inspect driver/plate restrictions | Module says Surat Jalan with Delivery Note explanation where useful; permissions/rules/assignments unchanged | screenshots + audit row | High | Passed |
| UI-15 | Browser / print | Printable document bilingual dan layout stabil | P3, P4 | Open Invoice print and Surat Jalan print; click Cetak; inspect print preview at A4 and save PDF | Cetak opens print only; heading exactly `SURAT JALAN / Delivery Note`; identifiers, payment terms, driver/plate, signatures not clipped | `UI-15-print.pdf` + screenshots | Critical | Blocked |
| UI-16 | Browser / export/download semantics | Tidak ada action label yang berbohong | P3, P4 | Click order Excel action and Customer PO document action; inspect network/Content-Disposition and file result | `Ekspor Excel` downloads `.xlsx`; `Unduh` downloads file; `Cetak` never downloads; `Mencetak Excel` is failure | HAR + downloaded files | Critical | Passed |
| UI-17 | Browser / accessibility | Accessible names, tooltips, disabled explanation | P3, P4 | Keyboard-only navigate renamed buttons/forms/dialogs; inspect accessibility tree; focus disabled/restricted controls; close dialogs with keyboard | Unique accessible names match action; focus visible; tooltip/restriction text explains disabled state; dialog labelled and closable | screenshots + accessibility snapshot | High | Blocked |
| UI-18 | Browser / notifications | Notification copy/link canonical dan encoding bersih | P3, P4 | Untuk tiap role open notifications containing Customer PO, collection deadline, outreach, approval; click each | Correct role/copy/href; no Pre Order/Billing/Follow Up; no `Â·` or other mojibake | screenshots + final URLs | High | Passed |
| UI-19 | Browser / Audit Trail | Record Reference UI/search/entity names canonical | P3, P4 | Create representative customer/product/order/invoice/payment/collection/outreach/user actions; search by each reference; inspect details | Column/search use Record Reference/record; entity types COLLECTION_TASK/CUSTOMER_OUTREACH; no Transaction Code | screenshots + record IDs | Critical | Passed |

### 7.7 Regression tests

| ID | Area | Risk/requirement | Preconditions | Exact command atau browser steps | Expected result | Evidence | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| RG-01 | Regression / auth & roles | Authentication dan role permissions tidak berubah | P0, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\session-token.test.ts tests\unit\role-access.test.ts --maxWorkers=1 --minWorkers=1`; cocokkan dengan UI-01/UI-02 | Token valid/invalid dan Manager/Admin/Sales capability matrix lulus | `RG-01-terminal.txt` | Critical | Passed |
| RG-02 | Regression / master CRUD | Customer dan Product CRUD tetap berfungsi | P3, P4 | Sebagai role berizin: create/view/edit/status-toggle Customer dan Product; sebagai role tak berizin cek restriction | Data tersimpan, searchable, audit references benar, no naming-induced validation error | screenshots + audit IDs | High | Blocked |
| RG-03 | Regression / approval | Risk-based Manager approval tetap sama | P0, P1, P2 | `& '.\node_modules\.bin\vitest.cmd' run tests\unit\sales-order-approval.test.ts tests\integration\order-form-insights.test.ts --maxWorkers=1 --minWorkers=1` | Risky Sales order/Customer PO pending; Manager approve/reject; invoice blocked sebelum approve | `RG-03-terminal.txt` | Critical | Passed |
| RG-04 | Regression / invoice | Invoice generation satu-per-order dan snapshot benar | P0, P1, P2 | Jalankan focused revenue-cycle integration IT-03/04/05 dan `tests/unit/calculations.test.ts` invoice cases | One-to-one invariant, total/payment terms/tax/order reference copied unchanged | terminal + DB assertions | Critical | Passed |
| RG-05 | Regression / payment & receivable | Partial/full payment dan remaining balance tetap | P0, P1, P2 | Run focused revenue-cycle integration; record partial lalu remaining full payment via browser | Status Partial→Paid, amounts reconcile, active receivable closes only when fully paid | terminal + screenshots | Critical | Passed |
| RG-06 | Regression / tax & totals | Tax snapshots, net sales, totals tidak terpengaruh rename | P2, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\order-tax-snapshot.test.ts tests\unit\batch-one-foundation.test.ts --maxWorkers=1 --minWorkers=1` | Net Sales + PPN = Total; NPWP snapshot immutable; invoice equals order snapshot | `RG-06-terminal.txt` | Critical | Passed |
| RG-07 | Regression / delivery | Delivery eligibility, assignment, lifecycle tetap | P2, P1 | `& '.\node_modules\.bin\vitest.cmd' run tests\integration\delivery-assignment-snapshot.test.ts tests\integration\customer-inquiry-lifecycle.test.ts --maxWorkers=1 --minWorkers=1` | Driver/plate pair constraint, immediate/credit rules, Delivered completes linked inquiry | `RG-07-terminal.txt` | Critical | Passed |
| RG-08 | Regression / dashboard, notifications, audit | KPI dan reminders memakai canonical data tanpa count drift | P3, P4 | Catat DB fixture counts; buka dashboard/notifications/audit sebagai tiap role; compare displayed counts and links | KPI/order/invoice/receivable/delivery/collection counts akurat; renamed records tidak hilang | comparison JSON + screenshots | High | Passed |
| RG-09 | Regression / existing artifacts | Workbook contents dan print layout tetap lengkap | P3, P4 | Generate Direct/Customer PO workbook; inspect sheets/cells/formats; save Invoice and Surat Jalan print as PDF | Existing fields/amounts preserved, canonical headers added, no clipping or blank relationships | `.xlsx`, PDFs, screenshots | High | Blocked |
| RG-10 | Regression / quality gate | Lint, typecheck, build, dan full suite lulus setelah targeted checks | P0, P1, P2 | `npm.cmd run lint`; `npm.cmd exec tsc -- --noEmit`; `npm.cmd run build`; terakhir `npm.cmd test -- --maxWorkers=1 --minWorkers=1` | Semua exit 0; no warning treated as error; production route manifest memuat canonical dan legacy routes | `RG-10-terminal.txt` | Critical | Passed |

### 7.8 Documentation consistency

| ID | Area | Risk/requirement | Preconditions | Exact command atau browser steps | Expected result | Evidence | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| DOC-01 | Docs / README | Setup/current routes/env canonical dan compatibility jelas | P0, P1 | Inspect README; `rg -n -i -e "Pre Order" -e "Billing" -e "Follow Up" -e "DEBIT" -e "Transaction Code" README.md` | Legacy hits hanya compatibility explanation; canonical env/route/API/payment/audit terms benar | `DOC-01-terminal.txt` | High | Passed |
| DOC-02 | Docs / ERD | ERD schema identik dengan Prisma | P0, P1 | Bandingkan `docs/ERD.md`, `docs/ERD.mmd`, `docs/ERD_NOTES.md` dengan `prisma/schema.prisma`; render Mermaid | Model/enum/field/cardinality/optional/FK names canonical; diagram render tanpa error | rendered ERD + checklist | High | Fixed and Passed |
| DOC-03 | Docs / flows & test evidence | User flows, UAT, testing matrix, demo tidak memakai current legacy terms | P0, P1 | Scan `docs/USER_FLOWS.md`, `UAT_SCENARIOS.md`, `TESTING_MATRIX.md`, `DEMO_SCRIPT.md`, test reports | Steps/routes/roles/action labels match app; no stale pass claim untuk test yang belum dijalankan | `DOC-03-terminal.txt` | High | Fixed and Passed |
| DOC-04 | Docs / current feature & design | Current-feature docs dan file references valid | P0, P1 | Scan all current `.md/.mmd/.puml`; extract backticked `src/`/`prisma/` paths dan run `Test-Path` | Tidak ada path rusak seperti `src/lib/customer PO-storage.ts`; current terminology canonical | `DOC-04-terminal.txt` | High | Passed |
| DOC-05 | Docs / historical material | Legacy terms pada historical docs ditandai, bukan tersamar sebagai current truth | P0, P1 | Inspect `AGENT.md`, baseline docs, archived reports; verify visible Historical/Legacy note and immutable history rationale | Pembaca dapat membedakan original requirement dari current system; history tidak diedit secara misleading | screenshots/diff notes | Medium | Passed |
| DOC-06 | Docs / generated artifacts | draw.io/SVG/PNG/PDF/XLSX sinkron dengan source terbaru | P0, P1 | Scan text-based draw.io/SVG; visually inspect every changed PNG/PDF/XLSX listed by ST-01; compare source diagram | Tidak ada Pre Order/Billing/Follow-Up/Debit/stale Export pada current diagrams; generated output matches source | visual QA contact sheet + scan | High | Fixed and Passed |

## 8. Execution order dan stop conditions

1. **Static/read-only checks:** ST-01–ST-13 dan DOC scans. Stop bila ada file baru tak dikenal atau compatibility exception belum dapat dijelaskan.
2. **Prisma validation:** PR-01–PR-06. Stop bila format/validate/generate gagal atau generated client masih expose legacy names.
3. **Unit tests:** UT-01–UT-10. Stop pada calculation, source mapping, audit, atau permission failure.
4. **Migration checks pada test database:** MG-01–MG-12 dan PR-07. Stop bila URL guard gagal, test clone bukan legacy state, row counts tidak cocok, atau migration menyentuh shared database.
5. **Integration tests:** IT-01–IT-12 dan targeted RG integration. Stop bila rollback marker/cleanup tidak bekerja atau test meninggalkan fixture.
6. **Build/lint/type-check:** bagian awal RG-10. Stop bila ada error sebelum membuka production UAT.
7. **Browser/UAT regression:** UI-01–UI-19 dan RG-02/RG-08/RG-09.
8. **Final stale-term scan:** ulangi ST-02–ST-13, DOC-01–DOC-06, `git diff --check`, lalu jalankan full suite sebagai final consolidated evidence bila seluruh blocker sudah ditutup.

## 9. Exact recommended command sequence for prompt berikutnya

Jalankan per blok dan review output sebelum lanjut. Command migration di bawah sengaja memerlukan environment variable test khusus.

### 9.1 Evidence dan baseline

```powershell
Set-Location 'D:\Pre Thesis MVP Iterative Development'
New-Item -ItemType Directory -Force -Path '.codex\evidence\naming-refactor' | Out-Null
Start-Transcript -Path '.codex\evidence\naming-refactor\full-transcript.txt' -Force
git status --short
git diff --check
git ls-files --modified --others --exclude-standard
```

### 9.2 Static scans

```powershell
rg -n -i -e 'Pre Order' -e 'Pre-Order' -e 'preorder' -e 'pre-order' -e 'PRE_ORDER' src prisma tests docs README.md AGENT.md .env.example
rg -n -e 'TransactionType' -e 'transactionType' -e 'Transaction Code' -e 'transactionCode' src prisma tests docs README.md
rg -n -i -e 'Billing' -e 'Follow Up' -e 'Follow-up' -e 'FollowUp' -e 'followUp' -e 'FOLLOW_UP' -e 'CustomerProductFollowUp' src prisma tests docs README.md AGENT.md
rg -n -e 'DEBIT' -e 'Debit' -e 'Ongoing Process' -e 'Done Process' src prisma tests docs README.md
rg -n -e 'Customer Name' -e 'Customer Type' -e 'customerType' -e 'Price' -e 'Unit Price' -e 'unitPrice' src prisma tests docs
rg -n -i -e 'Export' -e 'Mencetak' -e 'Cetak' -e 'Ekspor' -e 'Download' -e 'Unduh' -e 'Print' src docs
rg -n -e '@/app/follow-ups/page' -e '@/app/pre-orders' -e '@/app/billing' -e 'Â' src docs
```

### 9.3 Prisma and unit gate

```powershell
& '.\node_modules\.bin\prisma.cmd' format
& '.\node_modules\.bin\prisma.cmd' validate
& '.\node_modules\.bin\prisma.cmd' generate
rg -n -e 'TransactionType' -e 'FollowUp' -e 'CustomerProductFollowUp' -e 'transactionCode' -e 'transactionType' -e 'DEBIT' node_modules\.prisma\client\index.d.ts
& '.\node_modules\.bin\vitest.cmd' run tests\unit\naming-standardization.test.ts tests\unit\calculations.test.ts tests\unit\order-item-pricing.test.ts tests\unit\customer-intelligence.test.ts tests\unit\process-status.test.ts tests\unit\document-numbering.test.ts tests\unit\notifications.test.ts tests\unit\sales-order-approval.test.ts tests\unit\sales-order-deletion.test.ts --maxWorkers=1 --minWorkers=1
```

Catatan: stale-client `rg` diharapkan exit 1 karena tidak menemukan hit; jangan salah menganggapnya failure product.

### 9.4 Disposable database guard dan migration

Verifier `prisma/verify-naming-refactor.cjs` hanya menjalankan `SELECT`, menolak URL yang nama databasenya tidak memuat marker `naming_refactor_test`, dan memahami legacy mixed-case physical schema serta target lowercase snake_case schema.

```powershell
$namingTestDatabaseUrl = $env:NAMING_TEST_DATABASE_URL
$namingTestDirectUrl = $env:NAMING_TEST_DIRECT_URL
if (-not $namingTestDatabaseUrl -or -not $namingTestDirectUrl) {
  throw 'Set NAMING_TEST_DATABASE_URL and NAMING_TEST_DIRECT_URL first.'
}
$databaseName = ([uri]$namingTestDirectUrl).AbsolutePath.Trim('/')
if ($databaseName -notmatch 'naming[_-]refactor[_-]test') {
  throw 'Refusing a database whose name lacks the naming_refactor_test marker.'
}
if ($namingTestDatabaseUrl -eq $env:DATABASE_URL -or $namingTestDirectUrl -eq $env:DIRECT_URL) {
  throw 'Test URL equals the currently configured shared database URL.'
}
```

Ambil snapshot legacy read-only dan review evidence sebelum deploy:

```powershell
node.exe prisma/verify-naming-refactor.cjs before
```

Setelah snapshot disetujui, arahkan Prisma ke clone yang sama dan terapkan tiga migration naming. Jangan menjalankan block ini bila guard gagal:

```powershell
$env:DATABASE_URL = $namingTestDatabaseUrl
$env:DIRECT_URL = $namingTestDirectUrl
npm.cmd run prisma:deploy
& '.\node_modules\.bin\prisma.cmd' migrate status
& '.\node_modules\.bin\prisma.cmd' migrate diff --from-schema-datasource prisma\schema.prisma --to-schema-datamodel prisma\schema.prisma --exit-code
node.exe prisma/verify-naming-refactor.cjs after
```

Bandingkan invariant data. Targeted cleanup text boleh berubah, tetapi count, stable checksum, dan distribusi payment term harus identik:

```powershell
$before = Get-Content '.codex/evidence/naming-refactor/db-before.json' -Raw | ConvertFrom-Json
$after = Get-Content '.codex/evidence/naming-refactor/db-after.json' -Raw | ConvertFrom-Json
foreach ($property in 'counts','stableChecksums','paymentTermDistribution') {
  $left = $before.$property | ConvertTo-Json -Depth 20 -Compress
  $right = $after.$property | ConvertTo-Json -Depth 20 -Compress
  if ($left -ne $right) { throw "Naming migration changed invariant: $property" }
}
$orphans = $after.renamedRelationOrphans.PSObject.Properties.Value
if ($orphans | Where-Object { [int64]$_ -ne 0 }) { throw 'Renamed relation orphan detected.' }
```

Untuk MG-10, ulangi deploy pada clone kedua sambil menahan conflicting metadata lock; pastikan `lock_timeout=5s` menghasilkan rollback terkontrol. Untuk MG-12, restore snapshot ke clone ketiga dan cocokkan `db-before.json`. Jangan melakukan recovery drill pada shared database.

### 9.5 Integration and consolidated automated checks

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests\integration\customer-inquiry-lifecycle.test.ts tests\integration\customer-npwp.test.ts tests\integration\customer-payment-behaviour.test.ts tests\integration\delivery-assignment-snapshot.test.ts tests\integration\order-form-insights.test.ts tests\integration\order-tax-snapshot.test.ts tests\integration\product-average-sold-price.test.ts tests\integration\sales-order-deletion.test.ts --maxWorkers=1 --minWorkers=1
if (-not (Test-Path 'tests\integration\naming-revenue-cycle.test.ts')) { throw 'Missing P5 naming revenue-cycle coverage.' }
if (-not (Test-Path 'tests\integration\naming-audit-actions.test.ts')) { throw 'Missing P5 naming audit coverage.' }
if (-not (Test-Path 'tests\integration\naming-endpoints.test.ts')) { throw 'Missing P5 naming endpoint coverage.' }
& '.\node_modules\.bin\vitest.cmd' run tests\integration\naming-revenue-cycle.test.ts tests\integration\naming-audit-actions.test.ts tests\integration\naming-endpoints.test.ts --maxWorkers=1 --minWorkers=1
npm.cmd run lint
& '.\node_modules\.bin\tsc.cmd' --noEmit
npm.cmd run build
npm.cmd test -- --maxWorkers=1 --minWorkers=1
```

### 9.6 Browser/UAT and final scan

```powershell
$namingServer = Start-Process -FilePath 'npm.cmd' -ArgumentList @('start','--','-p','3100') -WorkingDirectory (Get-Location) -RedirectStandardOutput '.codex\evidence\naming-refactor\server.log' -RedirectStandardError '.codex\evidence\naming-refactor\server-error.log' -WindowStyle Hidden -PassThru
```

Jalankan UI-01–UI-19 pada `http://localhost:3100`. Setelah evidence selesai, hentikan hanya process tree server yang PID-nya berasal dari `$namingServer`; jangan menghentikan seluruh process Node di mesin.

```powershell
rg -n -i -e 'Pre Order' -e 'TransactionType' -e 'transactionType' -e 'Billing' -e 'Follow Up' -e 'FollowUp' -e 'CustomerProductFollowUp' -e 'DEBIT' -e 'Transaction Code' -e 'transactionCode' -e 'Ongoing Process' -e 'Done Process' src prisma tests docs README.md AGENT.md
git diff --check
git status --short
Stop-Transcript
```

## 10. Residual blockers setelah authorized execution

1. **Tidak ada snapshot dari state sebelum ketiga naming migration.** Development database sudah berada pada state `mid` (dua migration naming pertama telah applied) ketika otorisasi diberikan. Karena itu MG-03, MG-04, dan MG-07 tidak dapat membuktikan legacy-to-canonical enum/data mapping untuk dua migration pertama. Evidence `db-mid.json` ke `db-after.json` tetap membuktikan final physical rename tidak mengubah row count/checksum.
2. **Dua index FK lookup terbukti pre-existing missing.** MG-08 tetap Blocked untuk acceptance criterion “seluruh FK lookup columns indexed”: `customer_inquiry_items.customer_inquiry_id` dan `sales_order_items.sales_order_id` belum memiliki index terpisah. FKs, uniques, constraints, orphan counts, dan duplicate rejection sendiri lulus; issue ini tidak disebabkan naming migration.
3. **Deliberate failure/recovery drill tidak dijalankan pada development database.** MG-10 dan MG-12 membutuhkan clone disposable untuk conflicting-lock rollback dan restore/recovery proof. Static `lock_timeout = '5s'`, atomic transaction, successful deploy, retry/no-op, dan zero drift telah dibuktikan, tetapi itu bukan pengganti kedua drill tersebut.
4. **UAT non-naming yang belum menghasilkan full artifact.** UI-12/RG-02 (Customer/Product create-edit-toggle), UI-15/RG-09 (PDF print yang benar-benar disimpan), dan UI-17 (keyboard-only pass lengkap) tetap Blocked. Naming copy, print page/layout screenshot, accessible names, disabled controls, workbook, document download, dan role restrictions tetap terverifikasi.

## 11. Test case totals

| Category | Count |
|---|---:|
| Static terminology audit | 13 |
| Prisma/schema validation | 7 |
| Migration safety | 12 |
| Unit tests | 10 |
| Integration tests | 12 |
| UI/browser tests | 19 |
| Regression tests | 10 |
| Documentation consistency | 6 |
| **Total** | **89** |

| Priority | Count |
|---|---:|
| Critical | 50 |
| High | 37 |
| Medium | 2 |
| Low | 0 |
| **Total** | **89** |

## 12. Completion criteria

- Semua test cases mempunyai evidence dan status akhir Passed/Failed/Blocked dengan defect link.
- Semua Critical cases Passed; High failures mendapat explicit owner/waiver.
- Migration pre/post row counts, enum distributions, relationship checksums, constraints, indexes, dan FK integrity identik kecuali rename/targeted cleanup yang disetujui.
- Full test, lint, typecheck, production build, browser UAT, final stale-term scan, and `git diff --check` selesai.
- Allowed exceptions terdokumentasi per hit; tidak ada blanket allowlist berdasarkan folder saja.
- Tidak ada shared database reset/seed, tidak ada commit/stage otomatis, dan evidence tidak membocorkan secrets.
