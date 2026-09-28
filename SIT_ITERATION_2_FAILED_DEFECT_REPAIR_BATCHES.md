# SIT Iteration 2 — Five-Batch Failed Defect Repair Plan

Dokumen ini adalah companion plan untuk `SIT_ITERATION_2_FAILED_TESTCASE_REMEDIATION_PLAN.md`.
Scope-nya hanya **27 defect package yang mencakup 30 failed testcase** pada SIT Iteration 2.

Dokumen `SIT_ITERATION_2_REPAIR_BATCH_PROMPTS.md` yang sudah ada memiliki scope berbeda: empat batch untuk retest plan yang lebih luas (53 testcase). Jangan memakai coverage count dokumen tersebut untuk menilai penyelesaian 27 defect di dokumen ini.

## Hasil review remediation plan

### Kesimpulan

Remediation plan sudah kuat dan layak menjadi sumber acceptance criteria implementasi. Setiap defect umumnya sudah memiliki:

- current failure yang spesifik;
- expected behaviour yang membedakan UI, server, dan database;
- negative/tampered/concurrent path;
- solusi teknis yang masuk akal;
- definition of done yang dapat diuji.

Kekuatan paling pentingnya adalah penekanan pada server-side authorization, atomic transaction, database invariant, dan bukti bahwa invalid request tidak meninggalkan perubahan parsial.

### Hal yang perlu dikunci sebelum implementasi

1. **Pisahkan severity dari defect type.** Label seperti `P1 — Data Integrity` dapat membingungkan karena ringkasan mendefinisikan P0 sebagai Security/Data Integrity. Pertahankan P0/P1/P2 sebagai severity, lalu gunakan field terpisah seperti `Type: Security | Integrity | Workflow | Usability`.
2. **Kunci daftar payment method canonical.** Jangan mengambil contoh allowlist di remediation sebagai requirement final. Rekonsiliasikan enum/schema, UI, data existing, dan requirement historis sebelum SIT-DEF-001 dikerjakan.
3. **Kunci model date-only.** Untuk SIT-DEF-020, tentukan apakah kolom database benar-benar `date` atau timestamp yang dikonversi oleh satu helper business timezone. Keputusan harus dibuat sebelum migration dan test round-trip.
4. **Kunci identitas destination dan driver–vehicle assignment.** Tentukan apakah menggunakan ID relasi, snapshot hash, atau tuple canonical. Jangan membandingkan display string tanpa policy normalisasi yang eksplisit.
5. **Pisahkan status implementasi dan hasil retest.** Bagian `Implementasi / hasil retest` sebaiknya diisi minimal dengan status, file/migration, test command, hasil, evidence, dan remaining risk agar implementasi selesai tidak otomatis dianggap SIT Pass.
6. **Schema change wajib memiliki preflight.** Audit data existing, rencana backfill, migration baru, verifikasi constraint, dan rollback/forward-fix harus dicatat untuk SIT-DEF-017, SIT-DEF-019, SIT-DEF-020, SIT-DEF-022, dan SIT-DEF-027.
7. **Jangan membuat shared helper terlalu generik.** Portfolio scope, audit writer, note validator, date parser, dan typed query parser memang reusable; query builder domain Customers, Receivables, dan Surat Jalan tetap sebaiknya terpisah agar rule bisnis tidak tercampur.

## Prinsip pembagian batch

Urutan batch mengikuti dependency berikut:

```text
trusted identity/scope + trusted audit
    -> database dan mutation invariants
        -> lifecycle dan concurrency
            -> boundary/domain validation
                -> read-model consistency + full retest
```

Setiap batch harus:

- memakai fixture sintetis dan database test terisolasi;
- menguji UI path dan direct server/action/route path yang relevan;
- membuktikan invalid request tidak mengubah entity, child rows, numbering, notes, projection, atau audit;
- menjalankan focused test terlebih dahulu, lalu full Vitest, lint, dan build;
- memperbarui evidence per testcase, bukan hanya per defect package;
- tidak menurunkan expected result untuk membuat test hijau.

Untuk perubahan PostgreSQL/Supabase, konfirmasi versi Postgres target dan workflow migration project terlebih dahulu. Per 27 September 2026 terdapat perubahan minor Postgres 15/17 dan perubahan platform Supabase yang perlu diperiksa relevansinya sebelum deployment migration. Project ini memakai Prisma migrations; jangan memakai `db push` untuk menggantikan migration yang dapat direview.

## Ringkasan lima batch

| Batch | Fokus | Defect | Jumlah |
| --- | --- | --- | ---: |
| 1 | Trust boundary, portfolio isolation, dan audit | 016, 023, 024, 025, 026 | 5 |
| 2 | Database dan mutation invariants | 001, 014, 018, 019, 020, 027 | 6 |
| 3 | Core lifecycle dan optimistic concurrency | 002, 006, 013, 022 | 4 |
| 4 | Boundary dan domain validation | 007, 008, 010, 017 | 4 |
| 5 | Search/filter/sort/navigation dan full retest | 003, 004, 005, 009, 011, 012, 015, 021 | 8 |
| **Total** |  |  | **27** |

---

## Batch 1 — Trust Boundary, Portfolio Isolation, and Audit

**Defect:** SIT-DEF-016, SIT-DEF-023, SIT-DEF-024, SIT-DEF-025, SIT-DEF-026  
**Testcase:** OUT-SIT-004, NOTIF-SIT-005, AUD-SIT-001, AUD-SIT-004, AUD-SIT-005, DOC-SIT-002, dan bagian atomicity DATA-SIT-003  
**Risk/size:** Tinggi / Large

### Tujuan

Membangun fondasi actor, authorization scope, dan audit yang terpercaya sebelum mutation lain diperbaiki. Setelah batch ini, modul berikutnya tidak boleh membuat implementasi portfolio guard atau audit writer versi kedua.

### Urutan kerja

1. Pusatkan authenticated context: actor ID, role, active status, dan portfolio/company scope.
2. Jadikan raw audit insert internal/server-only dan gunakan typed event constructor; actor tidak boleh berasal dari payload client (SIT-DEF-025).
3. Buat audit writer transaction-aware dan hilangkan catch-and-log untuk audit bisnis wajib (SIT-DEF-024).
4. Terapkan portfolio predicate langsung pada query Outreach list/search/prefill/create (SIT-DEF-016).
5. Terapkan identity + scope yang sama pada notification resolver dan deep link (SIT-DEF-023).
6. Terapkan scope pada customer export serta invoice/document/print direct-ID sebelum data atau file dibentuk (SIT-DEF-026).

### Bukti minimum

- Matrix tanpa session, inactive user, Sales A, Sales B, Manager, dan Admin.
- List, search, dropdown/prefill, direct ID, export, print, dan deep link diuji.
- Actor spoof, arbitrary event type/reference, dan public raw audit call ditolak.
- Fault injection audit me-rollback business row, notes, children, counter/number, dan projection.
- Retry setelah fault menghasilkan tepat satu business mutation dan satu audit event.

### Exit gate

- Tidak ada public/callable path ke raw audit insert.
- Semua authorization query memakai scope sebelum row sensitif dibaca.
- Audit wajib dan business mutation commit/rollback bersama pada representative use cases.
- Seluruh focused test Batch 1, `npm test`, `npm run lint`, dan `npm run build` lulus.

---

## Batch 2 — Database and Mutation Invariants

**Defect:** SIT-DEF-001, SIT-DEF-014, SIT-DEF-018, SIT-DEF-019, SIT-DEF-020, SIT-DEF-027  
**Testcase:** PAY-SIT-009, COLL-SIT-006, PICK-SIT-017, SJ-SIT-011, SJ-SIT-016, dan bagian database integrity DATA-SIT-003  
**Risk/size:** Tinggi / Large

### Tujuan

Menutup jalur payload tampering dan state invalid pada mutation berisiko tinggi, dengan database constraint sebagai pertahanan terakhir ketika invariant dapat dinyatakan di PostgreSQL.

### Urutan kerja

1. Jalankan data-quality preflight sebelum menambah constraint; catat row invalid dan strategi koreksinya.
2. Tambahkan constraint quantity/amount Sales Order dan pastikan nested invalid write rollback utuh (SIT-DEF-027).
3. Kunci payment-method allowlist di schema/domain/server dan hilangkan fallback nilai asing (SIT-DEF-001).
4. Validasi Collection invoice terhadap customer dan scope aktual; create hanya menerima initial state canonical (SIT-DEF-014).
5. Terapkan exact-set validation pada item picking: foreign, duplicate, missing, dan cross-picking item harus menggagalkan request (SIT-DEF-018).
6. Validasi seluruh source combined delivery memiliki customer dan destination identity yang sama di dalam transaction (SIT-DEF-019).
7. Terapkan strict date-only parser dan storage/round-trip policy yang sudah dikunci (SIT-DEF-020).

### Bukti minimum

- Direct server request serta direct Prisma/SQL negative test.
- Invalid value matrix: unknown enum, empty/duplicate/foreign IDs, cross-customer relation, negative/zero/decimal/overflow, invalid calendar date, timestamp, dan timezone offset.
- Before/after snapshot membuktikan tidak ada header, lines, payment, balance, status, number, projection, atau audit parsial.
- Migration diuji pada dataset representatif dan status migration diverifikasi.

### Exit gate

- Semua P0 mutation pada batch gagal atomik untuk payload invalid.
- Constraint database menolak quantity/amount invalid tanpa orphan.
- Valid request tetap tersimpan dengan semantic value yang sama dan dapat dibaca ulang.
- Focused test, migration verification, full Vitest, lint, dan build lulus.

---

## Batch 3 — Core Lifecycle and Optimistic Concurrency

**Defect:** SIT-DEF-002, SIT-DEF-006, SIT-DEF-013, SIT-DEF-022  
**Testcase:** SET-SIT-003, SET-SIT-004, INQ-SIT-009, COLL-SIT-001, COLL-SIT-003, COLL-SIT-005  
**Risk/size:** Tinggi / Large

### Tujuan

Melengkapi lifecycle bisnis utama dan mencegah stale request menimpa state terbaru. Batch ini harus memakai authenticated context dan transaction-aware audit dari Batch 1.

### Urutan kerja

1. Definisikan Collection transition matrix, initial/terminal state, editable fields per state, dan reminder/projection behaviour (SIT-DEF-013).
2. Tambahkan version/updatedAt guard dan conditional update untuk edit/transition Collection; satu stale race saja yang boleh menang (SIT-DEF-022).
3. Tambahkan account role/status/password actions yang eksplisit, session revocation/versioning, dan perlindungan agar admin tidak terkunci sesuai policy (SIT-DEF-002).
4. Implementasikan agreed-price resolver yang membedakan blank dari zero, memvalidasi product aktif, dan menulis immutable order-item snapshot (SIT-DEF-006).

### Bukti minimum

- Collection create -> edit -> Done dan create -> Cancelled, termasuk refresh Dashboard/Notifications.
- Dua sesi melakukan Done/Cancelled dan edit/terminal race; request kalah tidak mengubah due date, note, reminder, atau audit.
- Role/status/password baru berlaku sesuai policy dan session lama kehilangan capability.
- Inquiry blank memakai fallback canonical; zero/negative/non-numeric ditolak; perubahan master setelah conversion tidak mengubah snapshot.

### Exit gate

- Collection lifecycle lengkap tersedia dan terminal state tidak dapat ditimpa stale tab.
- Account management tidak mengekspos password/hash dan revocation terbukti.
- Inquiry conversion atomik serta snapshot price immutable.
- Focused test, full Vitest, lint, dan build lulus.

---

## Batch 4 — Boundary and Domain Validation

**Defect:** SIT-DEF-007, SIT-DEF-008, SIT-DEF-010, SIT-DEF-017  
**Testcase:** APR-SIT-009, SJ-SIT-017, PICK-SIT-018, PICK-SIT-013  
**Risk/size:** Menengah / Medium

### Tujuan

Menyamakan keputusan UI, server, dan database pada boundary input serta menghapus silent truncation/coercion.

### Urutan kerja

1. Buat shared action-note validator untuk trim + required + panjang 1–150 tanpa truncation.
2. Terapkan validator pada Reject approval dan Reopen picking; state, notes, dan audit tetap satu transaction (SIT-DEF-007 dan SIT-DEF-010).
3. Bind, parse, validasi, dan persist package count sebagai integer positif sesuai state/action; database tetap menjadi defense-in-depth (SIT-DEF-017).
4. Ubah assignment menjadi ID canonical atau validasi exact tuple driver–vehicle; snapshot nilai saat Issue (SIT-DEF-008).

### Bukti minimum

- Boundary note: empty, whitespace, 1, 150, 151, dan Unicode/multibyte.
- Package count: empty, zero, negative, decimal, text, valid 1, nilai besar dalam batas, overflow, reload, dan print.
- Seluruh pair driver–vehicle valid, cross-pair, inactive, arbitrary, whitespace/casing sesuai policy, dan direct tampering.
- Nilai invalid tidak mengubah state, note, snapshot, atau audit.

### Exit gate

- Tidak ada silent truncation atau loose numeric coercion.
- UI, server, dan database memberi keputusan konsisten.
- Reopen/repack dan issue yang valid menghasilkan lifecycle serta audit tepat satu kali.
- Focused test, full Vitest, lint, dan build lulus.

### Implementasi / hasil retest — 28 September 2026

- `normalizeActionNote` menjadi boundary bersama Reject dan Reopen: trim, required, panjang 1–150 karakter, tanpa truncation. Reject mempertahankan note lama dan memakai alasan identik untuk decision snapshot serta audit; Reopen melakukan transition dan audit dalam transaction dengan current-state guard.
- Package count menggunakan parser string ketat (integer positif 1–2.147.483.647), dipersist saat complete, dikosongkan saat reopen, dibaca ulang pada panel, dan dicetak. Constraint database baru mengikat `Packed` dengan count non-null serta state non-Packed dengan count null.
- Preflight menemukan 9 picking list: 4 record Packed legacy tanpa count dan 0 record non-Packed dengan count. Constraint dipasang `NOT VALID` agar histori tidak diberi nilai fiktif, namun database tetap menolak insert/update baru yang tidak konsisten.
- Assignment delivery menggunakan ID pasangan canonical tunggal. Server juga mempertahankan compatibility untuk exact tuple lama, tetapi menolak cross-pair, inactive, arbitrary, casing/whitespace berbeda, field parsial, dan tuple yang tidak cocok dengan ID. Driver serta plate canonical disnapshot saat Issue.
- Evidence otomatis mencakup empty/whitespace/1/150/151/Unicode note; matrix package count termasuk overflow, persistence, reopen/repack, reload dan print binding; seluruh pair aktif plus inactive/cross-pair/tampering; serta invariant database langsung.
- Verifikasi: focused tests Pass; migration status Pass (27 migration, schema up to date); lint Pass; production build Pass; full Vitest Pass (88 files, 447 tests; 4 files/13 tests skipped).
- Manual SIT untuk `APR-SIT-009`, `SJ-SIT-017`, `PICK-SIT-018`, dan `PICK-SIT-013` masih perlu dijalankan oleh tester pada environment SIT.

---

## Batch 5 — Read-Model Consistency, Navigation, and Full Retest

**Defect:** SIT-DEF-003, SIT-DEF-004, SIT-DEF-005, SIT-DEF-009, SIT-DEF-011, SIT-DEF-012, SIT-DEF-015, SIT-DEF-021  
**Testcase:** CUS-SIT-007, CUS-SIT-009, PO-SIT-007, SJ-SIT-021, AR-SIT-008, AR-SIT-011, OUT-SIT-003, SJ-SIT-020  
**Risk/size:** Menengah / Large karena regression surface luas

### Tujuan

Menyatukan URL/query state, database predicates, stable pagination, navigation, dan export/list reconciliation setelah write-model serta authorization stabil.

### Urutan kerja

1. Perbaiki NPWP canonical/formatted search tanpa merusak field search lain (SIT-DEF-003).
2. Pertahankan customer status/search/sort pada pagination dan samakan predicate count/export (SIT-DEF-004).
3. Jadikan URL sumber kebenaran untuk legacy Customer PO redirect dan canonical `q` state (SIT-DEF-005).
4. Render link historis Sales Order/Invoice hanya bila canonical target ID tersedia dan authorized; gunakan snapshot label saat relation null (SIT-DEF-009).
5. Tambahkan Receivables search/link dan amount/due-date sort dengan allowlist serta stable ID tie-breaker (SIT-DEF-011 dan SIT-DEF-012).
6. Tambahkan Unicode note predicate di dalam portfolio scope untuk Outreach dan pertahankan deterministic latest/history order (SIT-DEF-015).
7. Terapkan typed `q/customer/date/status/sort` query builder Surat Jalan sebelum count dan pagination (SIT-DEF-021).
8. Jalankan full retest untuk seluruh 30 failed testcase dan regression suite lintas modul.

### Bukti minimum

- Fixture lebih dari dua halaman dengan tie values dan kombinasi status/customer/date.
- Search canonical/formatted/Unicode, invalid params, no result, Back/Forward, legacy bookmark, dan direct canonical URL.
- Union ordered IDs seluruh page direkonsiliasi dengan database oracle dan export bila tersedia.
- Link authorized membuka entity yang benar; relation null atau cross-scope tidak menghasilkan link palsu/kebocoran.
- Full 30-testcase evidence mencatat UI/HTTP/database/concurrency path sesuai definition of done masing-masing.

### Exit gate

- Filter/search/sort diterapkan sebelum count/pagination dan query state bertahan antarhalaman.
- Tidak ada record hilang/duplikat pada pagination stabil.
- Semua 27 defect memiliki implementation evidence; seluruh 30 testcase memiliki hasil retest individual.
- `npm test`, `npm run lint`, dan `npm run build` lulus, atau kegagalan yang benar-benar tidak terkait didokumentasikan dengan evidence dan defect baru.

### Implementasi / hasil retest — 28 September 2026

- Customer, Receivables, Surat Jalan, dan Outreach memakai typed query builder per domain: filter/search diterapkan di database sebelum count/pagination dan setiap sort memiliki `id` tie-breaker. Pagination/tab/navigation hanya mempertahankan parameter allowlist.
- Customer page/export berbagi predicate NPWP canonical/formatted serta status/search; fixture 45 customer Inactive menghasilkan 3 halaman dengan union ID identik terhadap database oracle tanpa duplikat atau record hilang.
- Redirect Customer PO legacy menerapkan state URL canonical. Receivables menambahkan scoped search, link entity, dan numeric/date sort. Outreach mencakup note Unicode dalam portfolio scope. Surat Jalan menerapkan kombinasi `q/customer/date/status/sort` dan state-preserving navigation.
- Surat Jalan menyimpan immutable order/invoice reference snapshots. Preflight menemukan 37 record tanpa kehilangan canonical reference; backfill pascamigrasi menghasilkan 0 missing snapshot. Link hanya dirender untuk relation ID yang tersedia, sedangkan relation historis null memakai snapshot-only fallback.
- Migrasi `20260928130000_batch_five_read_models` diterapkan; 28 migration terdeteksi dan schema up to date. Index read-model baru untuk invoice status/due date/remaining amount dan delivery status/date/id terverifikasi.
- Automated evidence: focused Batch 5 unit Pass (17), focused integration Pass (2), lint Pass, production build Pass, dan full Vitest Pass (90 files, 466 tests; 4 files/13 tests skipped).
- Manual SIT untuk `CUS-SIT-007`, `CUS-SIT-009`, `PO-SIT-007`, `SJ-SIT-021`, `AR-SIT-008`, `AR-SIT-011`, `OUT-SIT-003`, dan `SJ-SIT-020` masih pending. Full manual retest 30 testcase tetap harus dicatat tester sebelum status SIT final diubah menjadi Pass.

## Traceability matrix

| Defect | Batch | Testcase |
| --- | ---: | --- |
| SIT-DEF-001 | 2 | PAY-SIT-009 |
| SIT-DEF-002 | 3 | SET-SIT-003, SET-SIT-004 |
| SIT-DEF-003 | 5 | CUS-SIT-007 |
| SIT-DEF-004 | 5 | CUS-SIT-009 |
| SIT-DEF-005 | 5 | PO-SIT-007 |
| SIT-DEF-006 | 3 | INQ-SIT-009 |
| SIT-DEF-007 | 4 | APR-SIT-009 |
| SIT-DEF-008 | 4 | SJ-SIT-017 |
| SIT-DEF-009 | 5 | SJ-SIT-021 |
| SIT-DEF-010 | 4 | PICK-SIT-018 |
| SIT-DEF-011 | 5 | AR-SIT-008 |
| SIT-DEF-012 | 5 | AR-SIT-011 |
| SIT-DEF-013 | 3 | COLL-SIT-001, COLL-SIT-003 |
| SIT-DEF-014 | 2 | COLL-SIT-006 |
| SIT-DEF-015 | 5 | OUT-SIT-003 |
| SIT-DEF-016 | 1 | OUT-SIT-004 |
| SIT-DEF-017 | 4 | PICK-SIT-013 |
| SIT-DEF-018 | 2 | PICK-SIT-017 |
| SIT-DEF-019 | 2 | SJ-SIT-011 |
| SIT-DEF-020 | 2 | SJ-SIT-016 |
| SIT-DEF-021 | 5 | SJ-SIT-020 |
| SIT-DEF-022 | 3 | COLL-SIT-005 |
| SIT-DEF-023 | 1 | NOTIF-SIT-005 |
| SIT-DEF-024 | 1 | AUD-SIT-001, AUD-SIT-004, sebagian DATA-SIT-003 |
| SIT-DEF-025 | 1 | AUD-SIT-005 |
| SIT-DEF-026 | 1 | DOC-SIT-002 |
| SIT-DEF-027 | 2 | sebagian DATA-SIT-003 |

## Template evidence per defect

Gunakan format berikut ketika mengisi remediation plan:

```text
Status implementasi:
Keputusan canonical:
File/migration yang berubah:
Focused test command dan hasil:
Negative/tampered/concurrent/fault path:
Before/after database evidence:
UI/HTTP retest evidence:
Regression command dan hasil:
Status testcase: Pass | Fail | Blocked
Remaining risk / defect baru:
```

## Rekomendasi eksekusi

- Kerjakan batch secara berurutan. Batch 1 dan 2 adalah release blocker untuk retest mutation lain.
- Satu batch boleh terdiri dari beberapa commit/PR kecil, tetapi exit gate dinilai pada hasil gabungan batch.
- Jangan menandai batch selesai hanya karena unit test hijau; beberapa testcase memerlukan direct request, database snapshot, concurrency/fault injection, atau UI/HTTP evidence.
- Setelah Batch 5, perbarui `SIT_ITERATION_2_FAILED_TESTCASE_REMEDIATION_PLAN.md` sebagai sumber status dan evidence final. Companion plan ini tetap menjadi dokumen urutan kerja, bukan pengganti acceptance criteria per defect.
