# SIT Iteration 2 — Batch Repair Prompts

Dokumen ini berisi empat prompt yang dapat dijalankan berurutan. Pembagian batch mengikuti dependency teknis: fondasi keamanan lebih dahulu, kemudian alur input komersial, approval-to-cash, dan terakhir operasional/E2E.

Gunakan satu prompt per sesi kerja. Jangan menjalankan batch berikutnya sebelum exit criteria batch sebelumnya terpenuhi atau blocker-nya sudah dicatat secara eksplisit.

## Aturan bersama untuk seluruh batch

- Baca `AGENT.md`, `README.md`, `SIT_ITERATION_2_RETEST_PLAN.md`, `package.json`, `prisma/schema.prisma`, migration aktif, dan test yang relevan sebelum mengubah kode.
- Perlakukan `SIT_ITERATION_2_RETEST_PLAN.md` sebagai sumber acceptance criteria. Jangan hanya membuat test hijau dengan menurunkan ekspektasi.
- Audit implementasi yang sudah ada sebelum menambah abstraction baru. Gunakan kembali helper/domain service canonical dan hindari kalkulasi atau authorization yang terduplikasi.
- Pertahankan perubahan user yang tidak terkait. Jangan memakai `git reset --hard`, menghapus data demo/shared, atau mereset database bersama.
- Semua destructive/concurrency/fault-injection test harus menggunakan fixture/database test terisolasi dan cleanup yang terverifikasi.
- Untuk perubahan schema, ikuti workflow Prisma/PostgreSQL yang sudah dipakai repo dan buat migration baru yang dapat direview. Jangan memakai `db push` sebagai pengganti migration dan jangan mengubah migration lama yang sudah diterapkan.
- Bila menyentuh kemampuan Supabase secara langsung, periksa changelog dan dokumentasi Supabase terbaru. Jangan mengekspos service-role key, jangan memperlemah RLS, dan jangan memakai metadata user-editable untuk authorization.
- Authorization wajib ditegakkan di server sebelum parsing mahal, alokasi nomor, file I/O, atau business mutation. UI hanya merefleksikan policy.
- Business mutation, child records, snapshot, dan audit wajib commit atau rollback bersama. Jangan menelan error audit sebagai sukses parsial.
- Gunakan integer Rupiah dan arithmetic integer/decimal-safe; jangan memakai binary floating point untuk uang.
- Tambahkan unit/integration tests yang membuktikan positive path, negative path, direct/tampered request, stale/concurrent request, rollback, dan tidak adanya perubahan parsial.
- Setelah implementasi, jalankan minimal test terfokus, `npm test`, `npm run lint`, dan `npm run build`. Jika ada kegagalan yang benar-benar tidak terkait, buktikan dan catat secara spesifik.
- Perbarui bagian `Keputusan / implementasi` dan `Hasil retest fase dua` pada setiap testcase yang dikerjakan. Isi hasil dengan evidence nyata; jangan menulis `Pass` bila acceptance criteria belum dibuktikan.
- Di akhir batch, laporkan: keputusan yang dikunci, file/migration yang berubah, test yang dijalankan, hasilnya, testcase Pass/Blocked, evidence, dan risiko tersisa.

---

## Batch 1 — Test Foundation, Authentication, Authorization, and Account Safety

```text
Kerjakan Batch 1 SIT Iteration 2 pada repo ini sampai exit criteria tercapai.

Sumber utama:
- SIT_ITERATION_2_RETEST_PLAN.md
- Bagian Fondasi bersama yang disarankan
- AUTH-SIT-003, AUTH-SIT-006, AUTH-SIT-007, AUTH-SIT-008, AUTH-SIT-009
- SET-SIT-001, SET-SIT-002, SET-SIT-005, SET-SIT-006

Tujuan batch:
Membangun test harness aman dan menutup celah authentication/authorization/account lifecycle sebelum modul bisnis lain disentuh.

Langkah kerja:
1. Audit session model, cookie/token validation, role checks, active-user checks, portfolio scoping, user creation/update/deactivation, password hashing, audit trail, dan seluruh server action/route terkait.
2. Buat fixture/factory SIT yang deterministik dan aman dibersihkan, minimal:
   - dua Admin independen;
   - satu Manager;
   - Sales A dan Sales B dengan portfolio berbeda;
   - satu akun Active yang boleh dinonaktifkan;
   - satu akun Inactive dengan kredensial test;
   - cookie jar/browser context independen;
   - marker/prefix SIT dan cleanup terverifikasi.
   Fixture tidak boleh menjadi akses persisten pada database shared/demo.
3. Pusatkan guard server-only untuk current session, active user, role, dan portfolio scope. Terapkan guard pada page loader, server action, route handler, lookup direct ID, export, print, dashboard, dan notification resolver yang relevan.
4. Pastikan invalid/expired/random session menghasilkan 401 atau redirect login dan valid user dengan role/scope salah menghasilkan 403/404 yang konsisten, tanpa stack trace atau metadata sensitif.
5. Pastikan akun Inactive tidak pernah memperoleh session. Validasi user masih Active pada setiap protected request, bukan hanya saat login.
6. Implementasikan revocation yang cocok dengan model session repo. Gunakan sessionVersion/credentialsVersion atau server-side session invalidation agar disable, password reset, dan perubahan role memutus akses lama pada request berikutnya.
7. Terapkan portfolio scope langsung pada query database (`id + scope`), bukan mengambil global record lalu menyembunyikannya di UI.
8. Standarkan urutan write handler: session -> active user -> role/scope -> payload validation -> transaction. Auth failure tidak boleh mengonsumsi nomor, membuat row/file, atau menulis audit bisnis sukses.
9. Hardening account creation:
   - canonicalize username secara eksplisit (trim + lowercase bila policy existing case-insensitive);
   - pertahankan unique constraint database sebagai sumber kebenaran;
   - hash password hanya di server;
   - jangan pernah mengembalikan password/passwordHash pada DTO, UI, log, export, atau audit;
   - create user, credential, dan audit berada dalam satu transaction;
   - dua submit username canonical yang sama menghasilkan tepat satu akun.
10. Buat validator action note bersama: policy optional/required, trim, 1-150 karakter untuk required action, 151 ditolak tanpa truncation, dan audit event append-only. Aksi sensitif seperti deactivate, role change, dan password reset wajib reason.
11. Tambahkan test untuk login Active sebagai kontrol, login Inactive, invalid session, direct cross-role request, cross-portfolio list/detail/export/mutation, disable saat session aktif, auth failure tanpa mutation, duplicate username casing/spasi, concurrent account creation, dan note boundary 0/whitespace/1/150/151.
12. Perbarui sembilan testcase terkait pada living document dengan implementasi dan evidence aktual.

Keputusan default batch ini:
- Username diperlakukan case-insensitive setelah trim, kecuali schema dan requirement canonical repo membuktikan sebaliknya.
- Reason wajib untuk deactivate, role change, dan password reset.
- Penolakan login eksternal menggunakan pesan generik; alasan rinci hanya boleh masuk observability yang aman.

Exit criteria:
- Fixture SIT dapat dibuat dan dibersihkan berulang tanpa menyentuh data non-SIT.
- Semua guard server-side memiliki test direct request.
- Session user yang dinonaktifkan tidak dapat read/write lagi pada request berikutnya.
- Cross-role dan cross-portfolio access gagal tanpa kebocoran atau mutation.
- Concurrent duplicate username menghasilkan tepat satu akun lengkap.
- Test terfokus, full Vitest, lint, dan build lulus.
- AUTH-SIT-003/006/007/008/009 dan SET-SIT-001/002/005/006 sudah diperbarui dengan evidence nyata.
```

---

## Batch 2 — Commercial Intake, Product History, Inquiry, Orders, and Customer PO

```text
Kerjakan Batch 2 SIT Iteration 2 pada repo ini. Asumsikan Batch 1 sudah selesai dan gunakan fixture/guard/transaction conventions yang dihasilkannya.

Sumber utama:
- SIT_ITERATION_2_RETEST_PLAN.md
- PROD-SIT-004, PROD-SIT-005, PROD-SIT-006
- INQ-SIT-007, INQ-SIT-008, INQ-SIT-010, INQ-SIT-011
- ORD-SIT-002, ORD-SIT-004, ORD-SIT-006, ORD-SIT-007, ORD-SIT-010, ORD-SIT-011, ORD-SIT-012, ORD-SIT-013
- PRICE-SIT-001
- DOC-SIT-001
- PO-SIT-001, PO-SIT-003, PO-SIT-005, PO-SIT-006

Tujuan batch:
Membuat alur Product/Inquiry/Sales Order/Customer PO konsisten, immutable secara historis, aman terhadap payload tampered, dan tahan duplicate/concurrent submission.

Langkah kerja:
1. Audit domain service, server action, route, schema, numbering, upload/download, export, snapshot, dan test yang sudah ada. Jangan membuat service kedua bila sudah ada sumber canonical.
2. Product intelligence:
   - definisikan transaksi/item eligible satu kali;
   - top product hanya menghitung quantity > 0, maksimal lima hasil, dengan tie-break stabil;
   - average sold price harus weighted bila metric berbasis unit;
   - kembalikan state structured untuk below/equal/above/unavailable;
   - gunakan precision/rounding yang sama pada form, detail, dan snapshot;
   - histori memakai product name/SKU/price snapshot dan tetap terbaca saat master berubah, Inactive, atau relation null;
   - transaksi baru menolak product Inactive/null di server.
3. Inquiry conversion:
   - conversion kedua sequential maupun concurrent tidak boleh membuat order kedua;
   - gunakan current-state/version guard, transaction, unique invariant, dan idempotency yang sesuai;
   - combined delivery mengubah delivery + seluruh inquiry sumber + audit secara atomik;
   - fault pada inquiry kedua/audit harus rollback penuh;
   - inquiry dengan product Inactive/null tetap terbaca sebagai histori tetapi conversion baru ditolak sebelum artifact dibuat;
   - jika remapping memang sudah menjadi fitur, simpan mapping eksplisit dan audit; jangan menambah fitur remapping baru tanpa requirement.
4. Sales Order validation dan calculation:
   - quantity integer positif; tolak 0, negatif, pecahan unsupported, teks, NaN, dan overflow;
   - monetary values non-negative;
   - satu item invalid menggagalkan header, seluruh items, nomor, snapshot, dan audit;
   - payment term adalah discriminated union `Immediate | CreditWeeks | CreditMonths`;
   - Immediate membersihkan duration; week+month atau type/value mismatch ditolak di server;
   - CreditWeeks hanya 1-4 dan due date = business date WIB + weeks*7;
   - client preview bukan sumber kebenaran.
5. Pricing:
   - pertahankan formula canonical yang dibuktikan evidence sekarang: `base * (1 + markup - discount)`;
   - representasikan persentase sebagai integer basis points;
   - server menghitung ulang final price, subtotal, dan total;
   - tolak angka negatif/non-numeric/di luar batas atau hasil final negatif;
   - gunakan existing business limit bila ada. Jika tidak ada, dokumentasikan batas yang dipilih dan alasannya sebelum implementasi.
6. Lifecycle deletion:
   - hard delete hanya boleh untuk Draft yang belum memiliki downstream evidence dan memang diizinkan policy;
   - setelah ada invoice/payment/picking/delivery/history, gunakan cancel/archive atau tolak;
   - direct delete request selalu diperiksa server-side dan tidak boleh membuat orphan;
   - dokumentasikan matrix delete/cancel/archive pada living document/test.
7. Numbering dan concurrency:
   - gunakan allocator/counter concurrency-safe per document type dan tahun sesuai format existing;
   - jangan memakai parsing `MAX(string)+1` sebagai allocator;
   - malformed/prefix/tahun lain tidak memengaruhi sequence;
   - nomor yang pernah dialokasikan tidak digunakan ulang; gap valid;
   - dua order paralel mendapat nomor berbeda dan row lengkap;
   - retry dengan idempotency key sama tidak membuat order kedua.
8. Process tabs/filter/pagination/export:
   - bucket mutually exclusive;
   - search/filter/sort diterapkan sebelum pagination;
   - stable tie-breaker;
   - query state bertahan pada Next/Previous;
   - export memakai predicate dan scope yang sama dengan tabel;
   - gabungan ordered IDs semua page sama dengan IDs export.
9. Customer PO model:
   - pertahankan model existing: nomor internal aplikasi dibuat otomatis oleh server;
   - jangan menambah field nomor eksternal hanya demi memaksa testcase lama, kecuali requirement canonical lain membuktikannya;
   - revisi expected result PO-SIT-001/005 agar menguji nomor internal non-empty, unik, dan concurrency-safe;
   - required date dan document divalidasi UI + server;
   - field Draft memiliki update allowlist dan optimistic concurrency;
   - tentukan lock/snapshot point field saat Confirmed atau downstream document terbentuk;
   - downstream detail/print memakai snapshot yang konsisten.
10. Document security:
   - validasi extension, MIME, signature/magic bytes, size, dan empty file;
   - display filename tidak boleh menentukan storage path/key;
   - canonical dan legacy route memakai authorization helper yang sama;
   - uji tanpa session, cross-portfolio, invalid ID, encoded traversal, fake MIME, oversized, dan non-PDF;
   - compare downloaded bytes/hash/headers melalui HTTP integration test;
   - kegagalan storage/database tidak boleh meninggalkan orphan metadata/object atau business row.
11. Tambahkan fixture lebih dari satu page, tujuh+ product, tie values, product inactive/null, dua inquiry/order request paralel, malformed numbering, PO upload valid/invalid, dan stale Draft edit.
12. Perbarui seluruh testcase batch ini pada living document dengan keputusan, commit/evidence, serta hasil retest aktual.

Keputusan default batch ini:
- Number sequence dipisahkan per document type dan tahun mengikuti format nomor existing; tidak reuse.
- Customer PO Number pada testcase berarti nomor internal otomatis selama tidak ada requirement canonical lain.
- Hard delete dibatasi pada Draft disposable tanpa downstream relation.
- Formula price mengikuti evidence `base * (1 + markup - discount)`; arithmetic menggunakan integer/basis points.

Exit criteria:
- Histori product/inquiry/order/PO tetap terbaca setelah master berubah atau relation nullable.
- Duplicate/concurrent conversion dan order creation tidak menghasilkan artifact kedua/parsial.
- Tampered quantity, price, term, number, file, dan route ditolak server-side.
- Number allocator unik, tidak reuse, dan tahan concurrency.
- Table/page/export menghasilkan himpunan dan urutan yang dapat direkonsiliasi.
- Test terfokus, full Vitest, lint, dan build lulus.
- Semua testcase yang disebut pada batch ini telah diperbarui dengan evidence nyata.
```

---

## Batch 3 — Customer Intelligence, Approvals, Invoices, Payments, and Receivables

```text
Kerjakan Batch 3 SIT Iteration 2 pada repo ini. Asumsikan convention Batch 1-2 sudah tersedia dan jangan menduplikasi guard, Clock, allocator, transaction, atau fixture helper.

Sumber utama:
- SIT_ITERATION_2_RETEST_PLAN.md
- AR-SIT-006, CUS-SIT-010
- APR-SIT-005, APR-SIT-006, APR-SIT-007, APR-SIT-008
- AR-SIT-001
- INV-SIT-002, INV-SIT-003, INV-SIT-004, INV-SIT-006, INV-SIT-007, INV-SIT-008, INV-SIT-009, INV-SIT-010
- PAY-SIT-007
- AR-SIT-009

Tujuan batch:
Menjamin approval-to-cash berjalan dengan state terbaru, transaksi atomik, snapshot immutable, kalkulasi uang tepat, dan effective status konsisten pada semua consumer.

Langkah kerja:
1. Audit kalkulasi customer outstanding/payment behaviour, approval state machine, invoice generation/status/tax snapshot, payment recording, receivable projections, dashboard consumer, print/export, dan test existing.
2. Bangun/integrasikan `Clock` atau `nowProvider` serta `businessDateWib()` yang dapat diinjeksi. Semua due-date/effective-status test harus freeze clock; jangan mengubah clock host.
3. Customer outstanding dan payment behaviour:
   - invoice hanya eligible bila memiliki related Delivered evidence canonical;
   - unrelated delivery tidak boleh memengaruhi outstanding;
   - reverse satu dari dua related delivery tetap menghitung invoice; reverse terakhir mengeluarkannya;
   - definisikan satu service untuk eligible invoices, on-time/late, denominator, lookback, minimum sample, dan threshold;
   - gunakan integer comparison untuk threshold 59/60/61;
   - zero/limited history menghasilkan state limited, bukan persentase menyesatkan;
   - Customer Detail dan Order Form memakai service/result yang sama.
4. Approval:
   - hanya Manager Active yang dapat Approve/Reject di server;
   - dua keputusan sequential/concurrent/stale menghasilkan satu pemenang;
   - baca ulang order, customer, outstanding, eligibility, dan version di dalam transaction;
   - dokumentasikan dependency yang membuat approval stale (minimal total, term, customer/risk/outstanding, order state/version);
   - decision, status, invoice, note, number, dan audit commit bersama;
   - fault injection pada invoice insert dan audit insert harus rollback order ke Pending tanpa artifact parsial;
   - retry setelah fault menghasilkan tepat satu keputusan/invoice.
5. Invoice eligibility dan idempotency:
   - hanya order state canonical yang eligible;
   - Draft/Pending/Rejected/Cancelled direct request ditolak;
   - satu order maksimal satu invoice melalui unique constraint + transactional check;
   - sequential dan parallel duplicate generation tidak menambah invoice/number/audit;
   - invoice allocator menggunakan counter concurrency-safe per tahun, tidak reuse, dan mengabaikan nomor malformed/prefix lain.
6. Effective invoice status:
   - terminal Paid/Cancelled memiliki precedence atas due-date status;
   - Overdue adalah derived status saat remaining > 0 dan business date WIB > due date;
   - due today belum Overdue;
   - list/detail GET tidak boleh memutasi stored status, updatedAt, audit, atau notification;
   - Invoice, Receivables, Customer, Dashboard, Notifications, print, dan export memakai helper/predicate yang sama.
7. Cancellation policy untuk scope thesis:
   - implementasikan cancellation hanya untuk invoice Unpaid yang belum memiliki payment, oleh role berwenang, dengan reason wajib;
   - Partial/Paid cancellation ditolak sampai workflow reversal/refund/credit-note benar-benar tersedia;
   - Cancelled keluar dari active receivables/outstanding/dashboard/notification/collection eligibility;
   - payment baru terhadap Cancelled ditolak;
   - cancellation + note + audit + projection update atomik;
   - dokumentasikan kebijakan ini pada INV-SIT-010 dan AR-SIT-001.
8. Tax and immutable snapshot:
   - pertahankan integer Rupiah dan rate basis points;
   - gunakan explicit default 1100 bps untuk config kosong hanya jika behaviour existing memang canonical; typed config loader harus mendokumentasikannya dan config invalid lain ditolak sebelum transaction;
   - snapshot rate ketika Sales Order dibentuk, lalu Invoice menyalin snapshot order secara immutable dan tidak membaca ulang config global;
   - pertahankan titik rounding existing yang sudah dipakai seluruh consumer; bila belum tunggal, pilih satu policy dan tambahkan reconciliation tests sebelum migrasi data;
   - `net + tax = gross` tepat dan seluruh detail/print/receivable/payment/dashboard/export membaca snapshot sama;
   - snapshot invoice mencakup customer/tax identity, address, product/SKU/description, quantity, price, term, due date, gross/net/rate/tax;
   - perubahan master/order setelah issuance tidak mengubah invoice lama dan relation inactive/null tidak mematahkan histori.
9. Payment:
   - gunakan integer Rupiah di seluruh order/invoice/payment/receivable/dashboard/export;
   - payment harus positif dan <= remaining berdasarkan state terbaru di dalam transaction;
   - beberapa partial + exact final menghasilkan remaining tepat nol dan Paid;
   - overpayment Rp1 ditolak tanpa row/audit parsial;
   - dua payment paralel tidak boleh membuat remaining negatif;
   - jangan memakai binary floating point.
10. Buat fixture untuk dua related delivery + unrelated control, threshold 59/60/61, short/zero history, two Manager sessions, stale approval dependencies, invoice future/today/overdue/Paid/Cancelled, tax fractional multi-line, master mutation, partial/full/concurrent payment, dan fault injection.
11. Perbarui seluruh testcase batch ini dengan keputusan canonical, implementasi, evidence database/UI/test, serta hasil retest aktual.

Keputusan default batch ini:
- Money = integer Rupiah; smallest supported unit Rp1.
- Due today belum Overdue; Overdue jika business date WIB > due date.
- Empty PPN config menggunakan explicit default 1100 bps hanya bila sesuai behaviour canonical existing; invalid non-empty config tetap gagal sebelum mutation.
- Invoice memakai snapshot tax dari order dan tidak menghitung ulang dari config global.
- Cancel hanya untuk Unpaid tanpa payment; Partial/Paid ditolak sampai ada workflow reversal formal.

Exit criteria:
- Approval race/stale/fault selalu menghasilkan satu state final atau rollback penuh.
- Invoice generation idempotent dan numbering concurrency-safe.
- Effective status konsisten tanpa read-side mutation pada semua consumer.
- Tax dan payment merekonsiliasi tepat hingga Rp1 tanpa drift.
- Invoice lama immutable setelah perubahan master/order.
- Test terfokus, full Vitest, lint, dan build lulus.
- Semua testcase yang disebut pada batch ini telah diperbarui dengan evidence nyata.
```

---

## Batch 4 — Operational Lists, Notifications, Performance, and Full Revenue-Cycle Retest

```text
Kerjakan Batch 4/final SIT Iteration 2 pada repo ini. Fokus pada konsistensi seluruh consumer dan bukti end-to-end; jangan menutupi defect batch sebelumnya dengan workaround UI.

Sumber utama:
- SIT_ITERATION_2_RETEST_PLAN.md
- PICK-SIT-012
- NOTIF-SIT-001, NOTIF-SIT-002, NOTIF-SIT-003
- DATA-SIT-004
- E2E-SIT-002
- Seluruh testcase batch 1-3 sebagai regression scope

Tujuan batch:
Memastikan filter/pagination/notification bekerja pada boundary yang benar, sistem stabil pada volume representatif, dan alur Credit mingguan lolos end-to-end dengan evidence yang dapat direkonsiliasi.

Langkah kerja:
1. Audit shared Clock/business date, portfolio scope, active-status predicates, query builders, pagination, notification ID/read-state/deep-link, dashboard aggregation, export, dan benchmark tooling.
2. Pick & Pack Completed list:
   - search/filter diterapkan sebelum pagination;
   - kombinasi Picking PIC, Packing PIC, condition, date, dan Surat Jalan status memakai satu query builder;
   - stable composite sort dengan ID tie-breaker;
   - Next/Previous mempertahankan query allowlist;
   - filtered count/page total sesuai fixture;
   - gabungan IDs seluruh page tidak memiliki duplicate/hilang.
3. Notifications:
   - gunakan Clock/business date WIB yang sama dengan Receivables;
   - Collection Planned eligible dari overdue sampai +7 hari inklusif; +8 dan Done/Cancelled tidak tampil;
   - customer inactivity didefinisikan sebagai calendar-month subtraction, muncul bila `lastEligibleOrderDate <= businessDate.minusMonths(3)`;
   - Customer PO reminder aktif dari overdue sampai +7 inklusif; +8 dan terminal tidak tampil;
   - dokumentasikan daftar status Customer PO aktif dari lifecycle canonical existing;
   - scope seluruh query berdasarkan current user/portfolio di database;
   - notification ID deterministik dari type + source ID sehingga refresh tidak menggandakan event;
   - source status/date/order baru menghapus signal stale sesuai refresh policy;
   - deep link membuka canonical entity dan mengulang authorization, termasuk cross-portfolio rejection.
4. Collection setelah invoice lunas:
   - jangan menghapus histori Collection;
   - hilangkan dari active reminder segera setelah invoice Paid;
   - bila state machine existing mendukung auto-complete secara aman, tandai Done dengan actor/system reason dan audit dalam transaction payment; bila tidak, pertahankan task historis tetapi exclude dari active eligibility dan dokumentasikan bahwa closure manual tetap diperlukan.
5. Deterministic volume generator:
   - hasilkan ratusan customer dan ribuan order/invoice/payment/picking/delivery lintas status dan portfolio;
   - seed hanya ke performance-test database dengan marker dan cleanup/reset aman;
   - sertakan tie values dan dataset lebih dari dua page;
   - jangan memakai database shared/demo.
6. Tetapkan dan dokumentasikan performance baseline berdasarkan environment test yang nyata: p50/p95, query count, memory/heap bila tersedia, export row/size/time, dan timeout budget. Jangan mengarang target absolut tanpa measurement; laporkan baseline dan regresi relatif.
7. Pastikan list memakai server-side pagination, export lengkap/batched atau streaming sesuai kebutuhan, query plan/index ditinjau sebelum menambah index, dan tidak ada N+1 yang bertumbuh terhadap jumlah row.
8. Rekonsiliasi:
   - union IDs seluruh page vs query oracle;
   - export rows vs filtered/scope query;
   - Dashboard totals vs source transactions;
   - ulangi sesudah satu concurrent insert dan jelaskan consistency model pagination yang dipakai.
9. Jalankan E2E Credit Weeks dengan scenario builder:
   - customer -> Credit Weeks order -> approval bila diperlukan -> invoice -> picking -> delivery -> receivable -> collection -> partial payment -> full payment;
   - freeze clock sebelum due date, tepat due date, dan sesudah due date;
   - 1 week = +7 dan 4 weeks = +28;
   - Overdue/reminder hanya setelah business date melewati due date;
   - partial/full payment mengubah paid/remaining tepat satu kali;
   - full payment menutup active receivable dan reminder sesuai policy Collection;
   - canonical dan legacy compatibility routes menunjuk entity yang sama;
   - snapshot IDs, amounts, statuses, dates, audit, notifications, dan dashboard pada setiap tahap.
10. Jalankan regression penuh untuk seluruh 53 testcase. Jangan otomatis menandai Pass dari unit test saja bila acceptance criteria meminta UI, HTTP header/file hash, database snapshot, concurrency, atau boundary waktu.
11. Perbarui living document:
   - setiap testcase memiliki keputusan/implementasi yang final;
   - hasil retest berisi Pass/Fail/Blocked, tanggal, environment, command/test, evidence, dan defect tersisa;
   - hapus status Blocked hanya bila prasyarat dan bukti minimum benar-benar terpenuhi.

Keputusan default batch ini:
- Window notification deadline sampai +7 hari bersifat inklusif.
- Tiga bulan berarti calendar months dan boundary tepat tiga bulan bersifat inklusif.
- Histori Collection tidak dihapus setelah invoice lunas; active reminder harus hilang.
- Performance gate ditetapkan dari baseline terukur pada environment yang didokumentasikan, bukan angka asumsi.

Exit criteria:
- Completed list/filter/pagination stabil tanpa missing/duplicate.
- Notification boundary, dedup, scope, stale removal, dan deep link terbukti.
- Dataset volume representatif memenuhi budget yang disepakati dan seluruh agregat/export dapat direkonsiliasi.
- Revenue-cycle E2E lolos sebelum/pada/sesudah due-date boundary dan setelah partial/full payment.
- Full regression, lint, dan build lulus atau setiap kegagalan tersisa memiliki defect/blocker yang spesifik.
- Living document menyediakan status dan evidence final untuk seluruh 53 testcase.
```

## Coverage per batch

- Batch 1: 9 testcase
- Batch 2: 21 testcase
- Batch 3: 17 testcase
- Batch 4: 6 testcase utama + regression seluruh 53 testcase

Total testcase unik: 53.
