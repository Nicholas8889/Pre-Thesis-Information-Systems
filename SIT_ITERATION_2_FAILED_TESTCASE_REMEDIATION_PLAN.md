# SIT Iteration 2 — Failed Testcase Remediation Plan

Dokumen kerja ini membahas seluruh testcase berstatus `Fail` pada tab `SIT`, kondisi sistem yang seharusnya, solusi implementasi yang disarankan, dan definition of done untuk retest fase dua.

Dokumen ini adalah **living document** dan dapat terus diperbarui. Solusi dipilih dengan prinsip mempertahankan functional requirement yang sudah tertulis. Perubahan requirement hanya boleh menjadi opsi terakhir bila ditemukan kontradiksi yang benar-benar tidak dapat diselesaikan lewat implementasi.

Sumber awal: tab `SIT` dan `Defects` pada workbook `Testing_CV_Tajuk_SIT_Enterprise`, dibaca 27 September 2026.

## Ringkasan

- Failed testcase: **30**
- Defect/remediation package: **27**
- Prioritas utama: authorization/portfolio isolation, audit atomicity, database invariants, payload tampering, dan cross-customer relationship.
- Hasil retest nantinya dicatat pada tab `SIT Testing Iterasi ke 2` setelah seluruh definition of done untuk testcase terkait terbukti.

## Prinsip implementasi

1. UI validation meningkatkan UX, tetapi server validation dan database constraints tetap menjadi sumber kebenaran.
2. Authorization harus terjadi sebelum data sensitif dibaca dan sebelum mutation dimulai.
3. Perubahan entity, child rows, notes, nomor dokumen, dan audit yang saling bergantung harus commit atau rollback bersama.
4. Direct request, stale request, duplicate request, concurrency, dan payload tampered harus diuji; tombol yang disembunyikan bukan bukti keamanan.
5. Gunakan fixture sintetis serta database test terisolasi. Jangan mengubah atau menghapus data demo/operasional hanya untuk membuat test lewat.
6. Satu defect dinyatakan done hanya setelah regression test otomatis dan retest behaviour nyata sama-sama lulus.

## Prioritas

- **P0 — Security/Data Integrity:** berpotensi membocorkan data, memalsukan audit, menghubungkan entity lintas customer, atau menyimpan state invalid/parsial.
- **P1 — Core Workflow:** menghambat lifecycle bisnis utama atau membuat hasil transaksi salah.
- **P2 — Consistency/Usability:** search, filter, sort, navigation, dan metadata yang tidak konsisten tetapi tidak langsung mengubah nilai finansial.

---

## Payments

### SIT-DEF-001 — Payment method di luar allowlist diterima

**Testcase terkait:** `PAY-SIT-009`  
**Prioritas:** P0 — Security/Data Integrity

**Kegagalan saat ini**

Payload `paymentMethod=WireTransfer` yang tidak termasuk allowlist diterima oleh server dan disimpan sebagai `BankTransfer`. Payment terbentuk dan saldo invoice berubah.

**Kondisi seharusnya**

- Hanya payment method canonical yang disetujui dapat disimpan.
- Nilai kosong, typo, casing tidak didukung, dan arbitrary string ditolak.
- Server tidak melakukan fallback dari nilai tidak dikenal ke metode default.
- Request invalid tidak membuat payment, tidak mengubah paid/remaining/status, dan tidak menulis audit sukses.

**Solusi yang disarankan**

1. Definisikan allowlist tunggal, misalnya enum/schema `Cash | BankTransfer | ...`, dan gunakan pada UI serta server.
2. Parse raw FormData dengan exact-match validation sebelum transaction; jangan memakai pola `value === 'Cash' ? 'Cash' : 'BankTransfer'`.
3. Jika casing normalization memang diperlukan, lakukan hanya pada mapping yang eksplisit dan tetap tolak nilai di luar mapping.
4. Pertahankan database enum/check constraint sebagai pertahanan terakhir.
5. Jalankan payment creation, invoice balance update, dan audit dalam satu transaction.
6. Tambahkan table-driven tests untuk seluruh nilai valid dan invalid, termasuk `WireTransfer`, whitespace, typo, casing, dan string arbitrary.

**Definition of done**

- Semua method valid tersimpan tanpa berubah arti.
- Semua payload invalid ditolak sebelum transaction.
- Payment count, invoice balance/status, dan audit identik sebelum/sesudah request invalid.
- Regression test direct server action lulus.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (27 September 2026).
- Keputusan canonical: payment method adalah exact-match `Cash | BankTransfer | Other`; nilai kosong, casing berbeda, whitespace tambahan, typo, dan arbitrary string ditolak tanpa fallback.
- `src/lib/payment-method.ts` menjadi allowlist bersama UI/server; `recordPayment` menolak method invalid sebelum transaction, sementara enum PostgreSQL `payment_method` tetap menjadi defense-in-depth.
- Evidence: `tests/unit/batch-two-domain-validation.test.ts` menguji seluruh nilai canonical/invalid; `tests/integration/batch-two-mutation-validation.test.ts` membuktikan request invalid tidak membuka transaction dan tidak menulis audit.
- Regression: focused Batch 2 dan full `npm test` Pass (82 files, 407 tests; 4 files/13 tests skipped); lint/build Pass.

---

## Settings

### SIT-DEF-002 — Akun existing tidak dapat dikelola

**Testcase terkait:** `SET-SIT-003`, `SET-SIT-004`  
**Prioritas:** P1 — Core Workflow

**Kegagalan saat ini**

Settings hanya menyediakan pembuatan akun. Admin tidak dapat mengubah role/status atau melakukan reset/change password untuk akun existing.

**Kondisi seharusnya**

- Admin dapat mengubah role dan status akun existing yang eligible.
- Role/status terbaru berlaku pada login berikutnya dan, untuk perubahan sensitif, session lama dicabut atau menjadi invalid.
- Admin dapat menetapkan password baru tanpa pernah melihat password/hash existing.
- Password lama berhenti berlaku, password baru berhasil, dan plaintext tidak muncul di UI, response, log, atau audit.
- Seluruh aksi memiliki confirmation reason sesuai policy dan audit terpercaya.

**Solusi yang disarankan**

1. Tambahkan action terpisah dan eksplisit: `updateAccountRole`, `setAccountActiveStatus`, dan `resetAccountPassword`.
2. Lindungi seluruh action dengan `requireRole('ADMIN')`, validasi target, dan larangan perubahan yang dapat mengunci satu-satunya Admin bila policy membutuhkannya.
3. Gunakan allowlist role/status dan validasi stale state dengan `version` atau `updatedAt`.
4. Hash password baru hanya di server menggunakan algoritma yang sudah dipakai aplikasi; response hanya mengembalikan metadata aman.
5. Naikkan `sessionVersion` atau revoke session target ketika role, active status, atau password berubah.
6. Simpan perubahan account dan audit dalam transaction yang sama.
7. Buat UI edit account dengan dialog konfirmasi, tetapi tetap uji direct server request.

**Definition of done**

- Role baru berlaku setelah login ulang dan role lama tidak lagi memberi capability lama.
- Akun Inactive tidak dapat membuat atau memakai session.
- Password lama gagal dan password baru berhasil.
- Tidak ada plaintext/hash pada UI, network response, log, export, atau audit.
- Setiap perubahan memiliki satu audit event dengan actor session sebenarnya.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (28 September 2026).
- Settings menyediakan action terpisah untuk role, status, dan password. Setiap mutation Admin memakai allowlist, reason wajib 1–150 karakter, conditional `updatedAt`, transaction-aware audit, dan menaikkan `sessionVersion`; stale session langsung gagal pada resolver session berikutnya.
- Admin tidak dapat menurunkan role sendiri atau menonaktifkan akun sendiri sehingga actor Admin yang sedang aktif tidak dapat mengunci dirinya keluar. Password hanya di-hash di server dan audit menyimpan `[REDACTED]`, tidak pernah plaintext/hash.
- Evidence: `tests/integration/account-management-actions.test.ts` membuktikan role/status/password baru, password lama gagal, akun Inactive tidak dapat autentikasi, session lama invalid, stale write ditolak, dan tepat tiga audit tanpa secret. `tests/unit/session-resolution.test.ts` membuktikan mismatch role/status/session version menolak token.
- Regression: full `npm test` Pass (86 files, 423 tests; 4 files/13 tests skipped); lint/build Pass; 26 migrations up to date.

---

## Customers

### SIT-DEF-003 — NPWP 16 digit tidak dapat dicari

**Testcase terkait:** `CUS-SIT-007`  
**Prioritas:** P2 — Consistency/Usability

**Kegagalan saat ini**

Validasi, penyimpanan canonical, format detail, dan export NPWP sudah benar, tetapi search tidak menemukan NPWP 16 digit dalam bentuk canonical maupun formatted.

**Kondisi seharusnya**

- NPWP 15/16 digit yang valid disimpan dalam bentuk canonical digit-only.
- Search menerima canonical maupun format tampilan dan menghasilkan customer yang sama.
- Normalisasi search tidak mengubah pencarian nama, perusahaan, telepon, atau email.
- Detail dan export tetap memakai format masing-masing yang sudah ditetapkan.

**Solusi yang disarankan**

1. Normalisasi kandidat query NPWP dengan menghapus separator hanya bila query menyerupai NPWP.
2. Cari terhadap kolom canonical `npwp` digit-only; jangan mencari string formatted yang dibentuk saat render.
3. Gabungkan predicate NPWP dengan search field lain menggunakan grouping `OR` yang benar dan tetap berada dalam authorization scope.
4. Tambahkan index pada NPWP canonical bila query plan membutuhkannya.
5. Tambahkan tests untuk 15/16 digit, formatted/unformatted, invalid length, partial query sesuai policy, dan kombinasi dengan pagination.

**Definition of done**

- Empat bentuk valid—15/16 digit canonical dan formatted—menemukan customer yang tepat.
- Query invalid tidak menyebabkan false positive atau error.
- Search, detail, dan export merepresentasikan NPWP yang sama.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual `CUS-SIT-007` pending** (28 September 2026).
- Parser/query builder Customer bersama menormalkan hanya query yang menyerupai NPWP valid 15/16 digit, sehingga bentuk canonical dan formatted masuk ke predicate NPWP tanpa merusak pencarian nama/perusahaan/email/telepon.
- Page dan export memakai database predicate yang sama di dalam portfolio scope. Unit test mencakup NPWP 15/16 digit canonical/formatted serta query non-NPWP; integration test database membuktikan kedua bentuk 16 digit menghasilkan record yang sama.

### SIT-DEF-004 — Filter status Customers hilang saat pagination

**Testcase terkait:** `CUS-SIT-009`  
**Prioritas:** P2 — Consistency/Usability

**Kegagalan saat ini**

Filter `Inactive` bekerja pada page pertama, tetapi query state hilang ketika menekan Next sehingga page berikutnya kembali menampilkan campuran Active/Inactive.

**Kondisi seharusnya**

- Search, status filter, sort, dan page/cursor menggunakan satu query state canonical.
- Filter diterapkan sebelum pagination.
- Next/Previous mempertahankan seluruh parameter yang didukung.
- Count, rows, dan export memakai himpunan/filter yang sama.
- Sort memiliki tie-breaker stabil agar record tidak hilang atau duplikat.

**Solusi yang disarankan**

1. Pusatkan parser search params serta builder `where/orderBy` untuk page dan export.
2. Bangun link pagination dari query allowlist yang sedang aktif, bukan URL dasar baru.
3. Terapkan filter di database sebelum `take/cursor/skip`.
4. Tambahkan stable tie-breaker ID pada sort.
5. Gunakan filter yang sama pada count dan export; bila export sengaja berbeda, UI harus menyatakannya secara eksplisit tanpa mengubah requirement test saat ini.
6. Buat fixture lebih dari dua halaman dengan campuran Active/Inactive dan nilai sort tie.

**Definition of done**

- Semua page dalam filter Inactive hanya memuat Inactive.
- Back/Next/Previous mempertahankan filter dan sort.
- Union IDs seluruh page sama dengan export hasil filter.
- Tidak ada record hilang atau duplikat.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual `CUS-SIT-009` pending** (28 September 2026).
- `q`, `status`, `sort`, dan `direction` diparse melalui allowlist bersama; predicate diterapkan sebelum count/pagination dan link Previous/Next mempertahankan seluruh state yang didukung. Semua urutan memiliki tie-breaker `id`.
- Fixture integration 45 customer Inactive (3 halaman) membuktikan union ordered ID identik dengan database oracle tanpa record hilang/duplikat. Count, rows, dan export menggunakan filter bersama yang sama.

---

## Customer Inquiries

### SIT-DEF-006 — Agreed price kosong tidak memakai fallback

**Testcase terkait:** `INQ-SIT-009`  
**Prioritas:** P1 — Core Workflow

**Kegagalan saat ini**

Agreed Unit Price yang benar-benar kosong memblokir konversi, padahal testcase menetapkan fallback untuk nilai kosong. Nilai nol dan negatif tetap harus dianggap invalid.

**Kondisi seharusnya**

- `null/undefined/blank` dibedakan dari angka `0`.
- Untuk nilai kosong, server memilih fallback harga canonical yang sudah disyaratkan oleh testcase.
- Nilai `0`, negatif, non-numeric, atau produk tidak Active ditolak.
- Harga hasil resolusi disnapshot ke order item dan tidak berubah ketika master price berubah setelah konversi.
- Seluruh conversion tetap atomik.

**Solusi yang disarankan**

1. Parse field tanpa menggunakan truthy/falsy; gunakan pemeriksaan eksplisit terhadap blank versus numeric zero.
2. Buat helper `resolveAgreedUnitPrice` dengan urutan sumber fallback yang terdokumentasi, misalnya agreed → requested/base price sesuai requirement existing.
3. Validasi hasil resolusi positif dan produk masih Active di dalam conversion transaction.
4. Gunakan helper yang sama untuk eligibility UI dan server conversion agar tombol tidak berbeda dengan behaviour backend.
5. Snapshot harga final pada item order hasil konversi.
6. Uji blank, whitespace, zero, negative, valid agreed price, dan perubahan master setelah conversion.

**Definition of done**

- Blank berhasil dikonversi memakai fallback canonical.
- Zero/negative ditolak tanpa order/item/audit parsial.
- Harga valid/fallback berpindah tepat ke order item dan tetap immutable.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (28 September 2026).
- Harga conversion memakai resolver canonical `agreedUnitPrice → requestedUnitPrice → Product.listPrice`. Blank/null memicu fallback; nilai eksplisit nol, negatif, desimal, dan non-numeric ditolak dan tidak pernah diperlakukan sebagai blank.
- Eligibility detail/form dan server memakai helper yang sama. Conversion memeriksa ulang status Active serta harga Product di dalam transaction, membandingkan payload dengan source Inquiry, lalu menyimpan harga final sebagai snapshot `SalesOrderItem`; perubahan master price setelah commit tidak mengubah snapshot.
- Evidence: `tests/unit/customer-inquiry.test.ts` menguji precedence dan seluruh boundary; `tests/integration/inquiry-price-conversion.test.ts` membuktikan direct-action invalid price gagal tanpa order, inactive product gagal, blank fallback berhasil, dan snapshot tetap Rp30.000 setelah list price berubah.
- Regression: full `npm test` Pass (86 files, 423 tests; 4 files/13 tests skipped); lint/build Pass.

---

## Customer Purchase Orders

### SIT-DEF-005 — Redirect legacy mempertahankan URL tetapi tidak menerapkan search

**Testcase terkait:** `PO-SIT-007`  
**Prioritas:** P2 — Consistency/Compatibility

**Kegagalan saat ini**

`/pre-orders?q=...` mengarah ke URL canonical dengan query yang sama, tetapi halaman tidak menginisialisasi search state dari parameter `q`; searchbox kosong dan semua row tetap tampil.

**Kondisi seharusnya**

- Legacy route mengalihkan ke canonical route sambil mempertahankan parameter yang didukung.
- Canonical page benar-benar membaca dan menerapkan `q`, tab, filter, dan sort.
- Parameter invalid dinormalisasi atau diabaikan secara aman tanpa membentuk state ganda.
- Back/Forward mempertahankan state tabel yang sesuai URL.

**Solusi yang disarankan**

1. Gunakan satu parser search params untuk legacy redirect dan canonical page.
2. Inisialisasi search input dari `q` dan terapkan predicate pada query database sebelum pagination.
3. Pertahankan hanya parameter allowlist ketika redirect.
4. Jadikan URL sebagai sumber kebenaran state filter/search; hindari state client default yang menimpa URL setelah render.
5. Tambahkan integration tests untuk direct canonical, legacy bookmark, Back/Forward, invalid tab, dan query dengan karakter encoded.

**Definition of done**

- Bookmark legacy `q=PO-...` menampilkan hanya hasil yang cocok dan searchbox berisi query.
- Canonical direct URL menghasilkan hasil identik.
- Invalid/unknown params tidak merusak state atau membuka filter lain.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual `PO-SIT-007` pending** (28 September 2026).
- Legacy `/pre-orders` hanya meneruskan allowlist `q`, `tab`, dan `paymentTermType`; parameter tak dikenal/cursor lama dibuang. Halaman canonical membaca `q` langsung dari URL, mengikat nilainya ke searchbox, dan menerapkan predicate database yang sama.
- Tab serta pagination mempertahankan query/filter canonical. Unit evidence mencakup legacy allowlist, invalid parameter, dan state URL pada perpindahan tab.

---

## Approvals

### SIT-DEF-007 — Alasan Reject lebih dari 150 karakter dipotong diam-diam

**Testcase terkait:** `APR-SIT-009`  
**Prioritas:** P1 — Data Integrity

**Kegagalan saat ini**

Alasan 151 karakter dapat disubmit. Order berubah menjadi Rejected/Cancelled dan alasan disimpan hanya 150 karakter, sehingga input pengguna dipotong tanpa penolakan.

**Kondisi seharusnya**

- Blank/whitespace ditolak.
- Panjang setelah trim 1–150 karakter diterima utuh.
- Panjang 151+ ditolak sebelum mutation; tidak boleh dipotong diam-diam.
- Alasan valid di-append tanpa menghapus catatan lama dan audit menyimpan nilai yang sama.

**Solusi yang disarankan**

1. Buat validator note bersama yang memeriksa raw trimmed length sebelum normalisasi.
2. Hapus penggunaan `slice(0, 150)` sebagai mekanisme validasi.
3. Terapkan `maxLength=150` dan error UI, tetapi ulangi validasi di server.
4. Jalankan status update, note append, dan audit dalam satu transaction.
5. Tambahkan tests untuk kosong, whitespace, 1, 150, 151, Unicode/multibyte, dan stale submit.

**Definition of done**

- 150 karakter diterima dan tersimpan utuh pada detail serta audit.
- 151 karakter ditolak; status, notes, invoice, dan audit tidak berubah.
- Catatan lama tetap ada dan urutannya benar.

**Implementasi / hasil retest**

- Reject sekarang memakai shared action-note validator sebelum mutation: blank/whitespace dan 151+ ditolak, sedangkan 1–150 (termasuk Unicode) disimpan utuh tanpa `slice`.
- Status update, append ke note lama, decision snapshot, dan audit tetap atomik; alasan 150 karakter yang sama dibuktikan pada decision note, appended note, dan audit. Input 151 karakter dibuktikan tidak memanggil transaction/audit.
- Automated focused dan full regression Pass; manual `APR-SIT-009` masih pending.

---

## Pick & Pack

### SIT-DEF-010 — Reopen reason 151 karakter dipotong diam-diam

**Testcase terkait:** `PICK-SIT-018`  
**Prioritas:** P1 — Data Integrity

**Kegagalan saat ini**

Reopen dengan alasan 151 karakter berhasil, status berubah, dan audit menyimpan hanya 150 karakter.

**Kondisi seharusnya**

- Reopen mewajibkan alasan bermakna 1–150 karakter setelah trim.
- Nilai 151+ ditolak tanpa perubahan state atau audit.
- Reopen valid mengubah Packed menjadi state editable yang tepat, mempertahankan histori, dan complete ulang tidak menggandakan relasi.

**Solusi yang disarankan**

1. Gunakan validator note bersama dengan APR-SIT-009; validasi sebelum normalisasi atau transaction.
2. Hapus truncation `slice(0, 150)` dari jalur penyimpanan.
3. Jalankan state transition dan audit dalam satu transaction dengan current-state guard.
4. Tambahkan boundary tests kosong/whitespace/150/151 serta reopen-complete ulang.

**Definition of done**

- 150 diterima utuh; 151 ditolak tanpa status/audit berubah.
- Reopen dan repack valid menghasilkan lifecycle serta audit tepat satu kali.

**Implementasi / hasil retest**

- Reopen memakai shared required validator 1–150 sebelum transaction, current-state guard, dan audit atomik. Blank, whitespace, serta 151 Unicode ditolak tanpa state/audit berubah.
- Alasan 150 Unicode diteruskan utuh ke audit; reopen mengembalikan record ke `InProgress`, menghapus package count/timestamp completion, dan complete ulang menghasilkan satu lifecycle tanpa relasi duplikat.
- Automated focused dan full regression Pass; manual `PICK-SIT-018` masih pending.

### SIT-DEF-017 — Package count diabaikan oleh UI/server

**Testcase terkait:** `PICK-SIT-013`  
**Prioritas:** P1 — Core Workflow

**Kegagalan saat ini**

Payload packageCount kosong, nol, negatif, desimal, teks, positif, dan besar semuanya diterima tetapi selalu disimpan `null`. Database hanya memberi perlindungan parsial.

**Kondisi seharusnya**

- Saat workflow mewajibkan package count, nilainya harus integer positif.
- Kosong, nol, negatif, desimal, teks, overflow, dan coercion ambigu ditolak.
- Nilai positif yang valid disimpan dan tampil kembali pada detail/print yang relevan.
- UI, server, dan database menerapkan rule yang sama.

**Solusi yang disarankan**

1. Tambahkan/bind field packageCount pada form completion yang tepat.
2. Parse string dengan integer validation ketat; jangan memakai coercion longgar.
3. Validasi kewajiban field berdasarkan state/action di server.
4. Persist packageCount dalam transaction penyelesaian picking.
5. Pertahankan check constraint `package_count > 0` ketika non-null dan tambahkan NOT NULL kondisional lewat application rule atau schema yang cocok.
6. Uji matrix invalid, 1, nilai besar dalam batas, payload tampered, reload, dan print.

**Definition of done**

- Nilai valid tersimpan dan dapat dibaca ulang.
- Seluruh nilai invalid ditolak tanpa mutation/audit parsial.
- UI/server/database menghasilkan keputusan yang sama.

**Implementasi / hasil retest**

- Form completion kini mengirim package count; server mem-parse exact decimal string tanpa coercion dan menerima hanya integer 1–2.147.483.647. Kosong saat complete, nol, negatif, desimal, teks, whitespace, dan overflow ditolak sebelum mutation/audit.
- Nilai valid dipersist, terbaca setelah reload, tampil pada panel, dan tercetak. Reopen mengosongkan count; repack wajib mengisi kembali dan telah diuji sampai batas maksimum.
- Migration menambah invariant `Packed => package_count IS NOT NULL` dan `non-Packed => package_count IS NULL`. Preflight: 9 record, 4 Packed legacy tanpa count, 0 non-Packed invalid. Constraint `NOT VALID` menjaga histori lama tetap terbaca tanpa backfill fiktif sekaligus menolak write baru yang invalid.
- Automated database constraint test, focused test, dan full regression Pass; manual `PICK-SIT-013` masih pending.

### SIT-DEF-018 — Item asing/duplikat pada payload picking diabaikan

**Testcase terkait:** `PICK-SIT-017`  
**Prioritas:** P0 — Security/Data Integrity

**Kegagalan saat ini**

Field item asing, key duplikat, dan ordered quantity yang ditamper diabaikan; request tetap sukses dan perubahan item valid ikut commit.

**Kondisi seharusnya**

- Server menerima exact set item yang dimiliki Picking List.
- Item asing, hilang, duplikat, atau milik picking lain menggagalkan seluruh request.
- Ordered quantity berasal dari database, bukan dipercaya dari client.
- Payload invalid tidak menyimpan progress parsial atau audit sukses.

**Solusi yang disarankan**

1. Gunakan struktur payload eksplisit berisi array item ID dan editable quantity saja.
2. Deteksi duplicate raw keys/IDs sebelum mengubahnya menjadi map yang diam-diam membuang duplikasi.
3. Load canonical items berdasarkan picking ID dan bandingkan exact ID set serta count.
4. Abaikan bukan pilihan untuk field keamanan: reject unknown field/ID dan mismatch.
5. Hitung ordered/available constraints dari state database terbaru di dalam transaction.
6. Tambahkan tests untuk foreign ID, duplicate ID, missing ID, cross-picking ID, tampered ordered quantity, dan kombinasi valid+invalid.

**Definition of done**

- Seluruh payload invalid gagal atomik.
- Quantity/status/timestamp/audit tidak berubah.
- Payload valid tetap menyimpan seluruh item secara konsisten.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (27 September 2026).
- Form Pick & Pack sekarang mengirim exact `itemId` set. `src/lib/picking-item-payload.ts` menolak item asing/cross-picking, duplicate/missing ID, duplicate editable key, foreign item field, dan ordered quantity tampering; ordered quantity selalu berasal dari database.
- `savePickingList` baru meneruskan payload ke mutation setelah exact-set dan quantity/status validation lulus, sehingga kombinasi item valid+invalid tidak menyimpan progress, timestamp, atau audit parsial.
- Evidence: matrix pure validation ada di `tests/unit/batch-two-domain-validation.test.ts`; direct server-action tamper plus before/after status database ada di `tests/integration/picking-fulfillment.test.ts`.
- Regression: focused Batch 2 dan full `npm test` Pass (82 files, 407 tests; 4 files/13 tests skipped); lint/build Pass.

---

## Surat Jalan

### SIT-DEF-008 — Driver dan kendaraan tidak divalidasi sebagai pasangan

**Testcase terkait:** `SJ-SIT-017`  
**Prioritas:** P1 — Data Integrity

**Kegagalan saat ini**

Driver dan plate masing-masing berada dalam allowlist, tetapi kombinasi silang dari dua pasangan canonical tetap diterima.

**Kondisi seharusnya**

- Hanya pasangan driver–vehicle canonical yang lengkap dapat digunakan.
- Cross-pair, nilai arbitrary, field kosong, atau casing/whitespace yang tidak sesuai policy ditolak.
- Draft tidak berubah ketika assignment invalid.

**Solusi yang disarankan**

1. Representasikan assignment sebagai record dengan ID tunggal, bukan dua string independen.
2. UI mengirim `deliveryAssignmentId`; server mengambil driver dan plate canonical dari database/config.
3. Jika kontrak lama masih mengirim dua string, validasi tuple exact terhadap daftar pasangan.
4. Snapshot driver/plate pada Surat Jalan saat Issue.
5. Uji seluruh pair valid, cross-pair, arbitrary, inactive assignment, dan direct tampering.

**Definition of done**

- Pair canonical valid diterima dan disnapshot.
- Cross-pair/arbitrary ditolak tanpa Draft/audit berubah.

**Implementasi / hasil retest**

- UI kini mengirim satu `deliveryAssignmentId`; server mengambil driver dan plate dari registry pasangan canonical lalu menyimpan snapshot keduanya pada Draft/Issue. Exact tuple lama tetap diterima hanya untuk compatibility.
- Seluruh pasangan aktif diuji; cross-pair, inactive ID, arbitrary ID, casing/whitespace berbeda, empty/partial field, serta ID dengan tuple hasil tamper ditolak. Invalid Issue mempertahankan status Draft dan tidak membuat snapshot/audit.
- Automated focused dan full regression Pass; manual `SJ-SIT-017` masih pending.

### SIT-DEF-009 — Referensi order/invoice historis tidak dapat dinavigasi

**Testcase terkait:** `SJ-SIT-021`  
**Prioritas:** P2 — Compatibility/Usability

**Kegagalan saat ini**

Record historis nullable terbaca dan tercetak aman, tetapi nomor Sales Order dan Invoice hanya berupa teks pada detail sehingga referensinya tidak dapat digunakan untuk navigasi.

**Kondisi seharusnya**

- Null historis tidak menghasilkan crash atau `undefined`.
- Jika relation ID masih tersedia dan user berhak, nomor SO/Invoice menjadi link ke route canonical.
- Jika relation benar-benar tidak tersedia, UI menampilkan label jujur tanpa link palsu.
- Print mempertahankan nomor snapshot walaupun tidak clickable.

**Solusi yang disarankan**

1. Return reference object terstruktur: display number, canonical ID/URL bila tersedia, dan availability state.
2. Render link hanya ketika target ID valid; tetap lakukan authorization pada target page.
3. Gunakan snapshot number sebagai fallback untuk relasi nullable.
4. Tambahkan tests untuk relation lengkap, nullable dengan snapshot, target tidak ditemukan, dan cross-scope target.

**Definition of done**

- Referensi valid dapat dibuka ke record canonical yang tepat.
- Null/missing tetap terbaca tanpa link rusak atau data palsu.
- Direct target tetap mematuhi authorization.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual `SJ-SIT-021` pending** (28 September 2026).
- Surat Jalan baru menyimpan snapshot JSON nomor/source order dan invoice dalam transaction yang sama dengan creation. Migrasi melakukan backfill seluruh 37 record; verifikasi pascamigrasi menemukan 0 snapshot order/invoice yang kosong.
- Detail menyediakan link canonical hanya saat relation ID yang di-load masih tersedia (`Sales Order`/`Customer PO` dan Invoice). Ketika relation historis menjadi null, UI/print tetap menampilkan snapshot label tanpa link palsu; integration test membuktikan fallback tersebut setelah relation diputus.

### SIT-DEF-019 — Combined delivery menerima destination berbeda

**Testcase terkait:** `SJ-SIT-011`  
**Prioritas:** P0 — Data Integrity

**Kegagalan saat ini**

Mixed customer sudah ditolak, tetapi dua order customer sama dengan tujuan Jakarta dan Surabaya tetap digabung ke satu Surat Jalan yang hanya memiliki satu alamat header.

**Kondisi seharusnya**

- Seluruh source pada combined delivery harus memiliki customer dan destination canonical yang sama.
- Perbedaan destination sekecil apa pun setelah normalisasi yang sah menyebabkan reject sebelum header/line/audit dibuat.
- Destination yang dipakai harus disnapshot secara jujur dari sources, bukan dipilih arbitrer dari salah satu order.

**Solusi yang disarankan**

1. Pastikan order/PO menyimpan delivery destination terstruktur atau snapshot address canonical.
2. Di dalam transaction, load seluruh source dan bandingkan customer ID serta normalized destination identity.
3. Lebih aman menggunakan `destinationId/addressSnapshotHash` daripada membandingkan display string mentah.
4. Reject bila source kehilangan destination atau kombinasi tidak homogen.
5. Tambahkan database/service invariant dan tests same/similar/different destination, mixed customer, serta stale source update.

**Definition of done**

- Same customer + same destination dapat digabung.
- Mixed customer atau destination ditolak atomik.
- Tidak ada delivery header, lines, nomor, atau audit parsial.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (27 September 2026).
- Keputusan canonical: setiap Sales Order menyimpan immutable `delivery_destination_snapshot`; identity comparison memakai Unicode NFKC, trim, whitespace collapse, dan case-insensitive Indonesian comparison, sedangkan display snapshot asli dipertahankan.
- Migrasi `20260927200000_batch_two_delivery_invariants` menambah/backfill destination snapshot. UI mengelompokkan kandidat berdasarkan customer + destination; server membandingkan seluruh source di dalam transaction dan menolak recipient address yang tidak cocok dengan snapshot canonical pada create maupun edit Draft.
- Nomor Surat Jalan sekarang dialokasikan di transaction yang sama setelah source/destination validation, sehingga rejection tidak meninggalkan header, line, audit, atau sequence parsial.
- Evidence: different destination dan tampered address diuji di `tests/integration/combined-delivery-actions.test.ts`; valid multi-source database path diuji di `tests/integration/combined-delivery-database.test.ts`.
- Regression: focused Batch 2 dan full `npm test` Pass (82 files, 407 tests; 4 files/13 tests skipped); lint/build Pass.

### SIT-DEF-020 — Tanggal delivery invalid dinormalisasi atau bergeser timezone

**Testcase terkait:** `SJ-SIT-016`  
**Prioritas:** P0 — Data Integrity

**Kegagalan saat ini**

`2026-02-30` diterima lalu dinormalisasi menjadi 2 Maret. Timestamp ber-offset +14 juga diterima dan dapat tersimpan sebagai hari sebelumnya dalam UTC.

**Kondisi seharusnya**

- Input delivery date menerima format date-only canonical `YYYY-MM-DD`.
- Tanggal kalender tidak valid, timestamp, timezone offset, format ambigu, dan overflow ditolak.
- Tanggal yang dimaksud pengguna kembali sama pada detail dan print WIB.

**Solusi yang disarankan**

1. Validasi regex format lalu validasi komponen tahun/bulan/hari terhadap kalender; jangan mengandalkan normalisasi `new Date`.
2. Modelkan delivery date sebagai date-only pada database bila waktu tidak memiliki makna bisnis.
3. Jika database memerlukan timestamp, konstruksi dari business timezone melalui helper tunggal dan simpan/format secara konsisten.
4. Tolak payload yang mengandung `T`, offset, atau time component pada endpoint date-only.
5. Uji leap year, Feb 29/30, month 0/13, timezone offsets, dan round-trip WIB.

**Definition of done**

- Hanya tanggal kalender valid diterima.
- Nilai valid tampil sama pada form, detail, database semantics, dan print.
- Nilai invalid tidak membuat atau mengubah delivery/audit.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (27 September 2026).
- Keputusan canonical: input hanya `YYYY-MM-DD`; parser memvalidasi komponen kalender tanpa normalisasi `new Date(raw)`, membangun UTC midnight, dan menolak timestamp/offset/format ambigu.
- `delivery_notes.delivery_date` dimigrasikan menjadi PostgreSQL `DATE` melalui `20260927200000_batch_two_delivery_invariants`; create/edit memakai `src/lib/date-only.ts`, dan display menggunakan business timezone Asia/Jakarta.
- Evidence: invalid calendar date, timestamp, timezone offset, leap-day, dan round-trip diuji di `tests/unit/batch-two-domain-validation.test.ts` serta direct action di `tests/integration/combined-delivery-actions.test.ts`; database round-trip `2026-09-13` diverifikasi di `tests/integration/combined-delivery-database.test.ts`.
- Regression: focused Batch 2 dan full `npm test` Pass (82 files, 407 tests; 4 files/13 tests skipped); lint/build Pass.

### SIT-DEF-021 — Filter/search/sort Surat Jalan tidak diterapkan

**Testcase terkait:** `SJ-SIT-020`  
**Prioritas:** P2 — Consistency/Usability

**Kegagalan saat ini**

Bucket status dan cursor pagination tersedia, tetapi `q`, customer, date range, dan sort tidak dibaca; query yang hanya cocok satu record tetap menampilkan record lain.

**Kondisi seharusnya**

- Search/filter/sort diterapkan sebelum pagination dan count.
- Status bucket, customer, date range, dan q dapat dikombinasikan.
- Pagination mempertahankan query state dan memakai order/tie-break stabil.
- Invalid params ditolak/dinormalisasi aman.

**Solusi yang disarankan**

1. Buat typed parser untuk query params dan satu builder `where/orderBy`.
2. Terapkan predicate ke query database; jangan hanya menyimpan parameter pada URL/UI.
3. Gunakan stable cursor yang menyertakan sort key dan ID.
4. Pertahankan params allowlist pada pagination, detail Back link, dan export bila ada.
5. Tambahkan fixture lintas status/customer/date dan matrix query tests.

**Definition of done**

- Query hanya mengembalikan matching records.
- Kombinasi filter dan pagination stabil tanpa hilang/duplikat.
- Count/page total sama dengan database.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual `SJ-SIT-020` pending** (28 September 2026).
- Typed query builder menerapkan `q`, customer, status, rentang tanggal valid, `sort`, dan `direction` sebagai predicate database sebelum count dan pagination. Tanggal invalid/reversed dinormalisasi aman dan semua sort memiliki tie-breaker `id`.
- State filter dipertahankan pada tab, archive link, pagination, view, dan edit. Unit/integration evidence mencakup kombinasi source/customer/status/date, invalid params, filtered count, dan urutan stabil.

---

## Receivables

### SIT-DEF-011 — Search dan link receivable tidak tersedia

**Testcase terkait:** `AR-SIT-008`  
**Prioritas:** P2 — Consistency/Usability

**Kegagalan saat ini**

Filter status bekerja, tetapi tidak ada search customer/invoice dan row tidak memiliki link langsung ke invoice/customer.

**Kondisi seharusnya**

- User dapat mencari nomor invoice dan nama/customer identifier sesuai requirement.
- Search dapat dikombinasikan dengan status filter dan pagination.
- Row memiliki link canonical ke invoice dan customer yang tepat, selain Sales Order bila relevan.
- Saldo pada list sama dengan sumber invoice/payment.

**Solusi yang disarankan**

1. Tambahkan typed param `q` dan predicate database untuk invoice number/customer fields.
2. Terapkan authorization/scope sebelum search agar query tidak menjadi data oracle.
3. Pertahankan q/status pada pagination.
4. Render link menggunakan entity IDs canonical, bukan nomor sebagai path identifier bila tidak aman.
5. Tambahkan tests kombinasi search+filter, no result, pagination, dan cross-scope direct link.

**Definition of done**

- Search invoice/customer mengembalikan row dan count yang tepat.
- Filter/search bertahan antar halaman.
- Link membuka invoice/customer yang benar dan saldo merekonsiliasi sumber.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual `AR-SIT-008` pending** (28 September 2026).
- Receivables kini memiliki typed `q` yang mencari invoice, customer, dan order di dalam portfolio scope serta dapat dikombinasikan dengan status. Predicate yang sama dipakai untuk count, agregat, rows, dan pagination state.
- Setiap row menyediakan link canonical ke invoice, customer, dan SO/Customer PO sesuai source. Unit/integration tests mencakup kombinasi search/filter, no-result/invalid state, scope, dan saldo dari remaining amount invoice.

### SIT-DEF-012 — UI tidak menyediakan sort amount/due date

**Testcase terkait:** `AR-SIT-011`  
**Prioritas:** P2 — Consistency/Usability

**Kegagalan saat ini**

Database mampu mengurutkan amount secara numerik, tetapi UI/server page hanya memakai urutan tetap dan tidak menyediakan sort amount atau due date.

**Kondisi seharusnya**

- User dapat memilih sort amount dan due date ascending/descending.
- Amount diurutkan sebagai angka dan due date sebagai tanggal, bukan string tampilan.
- Sort dapat dikombinasikan dengan search/filter dan bertahan saat pagination.
- Tie dipecahkan dengan ID canonical agar stabil.

**Solusi yang disarankan**

1. Tambahkan allowlist `sort=amount|dueDate` dan `direction=asc|desc`.
2. Map allowlist ke typed ORM `orderBy`; jangan meneruskan column name mentah dari user.
3. Tambahkan tie-breaker ID dan cursor sesuai composite order.
4. Sinkronkan kontrol UI dengan URL.
5. Uji nilai numerik seperti 2, 10, 100; tanggal; tie; kombinasi filter; dan invalid params.

**Definition of done**

- Urutan asc/desc numerik dan tanggal benar.
- Sort/filter tetap aktif antar halaman.
- Link dan saldo setiap row tetap cocok dengan invoice.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual `AR-SIT-011` pending** (28 September 2026).
- UI dan server mengizinkan hanya `sort=amount|dueDate` serta `direction=asc|desc`; mapping memakai typed ORM order, bukan nama kolom mentah. Amount diurutkan sebagai nilai numerik, due date sebagai tanggal, lalu `id` sebagai tie-breaker stabil.
- Integration test database membuktikan urutan amount `2, 10, 100`; unit evidence mencakup dua arah, invalid params, serta kombinasi dengan search/status dan pagination.

---

## Collections

### SIT-DEF-013 — Lifecycle Collection Task tidak tersedia

**Testcase terkait:** `COLL-SIT-001`, `COLL-SIT-003`  
**Prioritas:** P1 — Core Workflow

**Kegagalan saat ini**

Create Planned dan projection Dashboard bekerja, tetapi tidak ada UI/server action untuk edit jadwal atau transisi Planned menjadi Done/Cancelled beserta audit lifecycle.

**Kondisi seharusnya**

- Task dibuat Planned dengan customer/invoice yang benar.
- User berwenang dapat mengedit field yang masih diperbolehkan dan memindahkan Planned ke Done/Cancelled.
- Terminal task tidak lagi menjadi reminder Planned.
- Setiap transition memiliki reason/audit dan tidak mengubah saldo invoice secara tidak semestinya.

**Solusi yang disarankan**

1. Definisikan transition matrix Collection Task dan editable fields per state.
2. Tambahkan action `updateCollectionTask`/`transitionCollectionTask` dengan role, scope, note, dan current-state validation.
3. Gunakan transaction untuk task, reminder/projection, notes, dan audit.
4. Gunakan version/updatedAt untuk stale-write protection sesuai SIT-DEF-022.
5. Tambahkan UI Edit/Mark Done/Cancel yang memanggil action canonical.
6. Uji create→edit→Done dan create→Cancelled serta refresh Dashboard/Notifications.

**Definition of done**

- Lifecycle lengkap dapat dijalankan dari UI dan direct action aman.
- Planned reminder hilang pada terminal state.
- Relasi invoice/customer, notes, dan audit tetap benar.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (28 September 2026).
- Transition matrix canonical adalah `Planned → Done | Cancelled`; hanya Planned yang dapat diedit, sedangkan terminal state tidak dapat diedit/ditransisikan ulang. UI Collections kini menyediakan edit tanggal/note, Mark Done, dan Cancel dengan reason wajib untuk transition.
- Edit/transition, current-state claim, increment version, dan audit actor terpercaya commit dalam transaction yang sama. Transition tidak menerima field tanggal, note, customer, atau invoice sehingga payload terminal tidak dapat menyelundupkan perubahan jadwal.
- Evidence: `tests/integration/collection-task-lifecycle.test.ts` membuktikan create fixture → edit → Done, create → race Done/Cancelled, stale submit, field tampering, audit atomic, serta task terminal hilang dari Dashboard dan Notifications. `tests/unit/collection-task.test.ts` mengunci transition matrix.
- Regression: full `npm test` Pass (86 files, 423 tests; 4 files/13 tests skipped); lint/build Pass.

### SIT-DEF-014 — Collection menerima invoice lintas customer dan note tampered

**Testcase terkait:** `COLL-SIT-006`  
**Prioritas:** P0 — Security/Data Integrity

**Kegagalan saat ini**

Payload customer A dengan invoice customer B diterima. Task juga dapat dibuat langsung terminal dengan reason invalid/truncated.

**Kondisi seharusnya**

- Invoice harus dimiliki customer yang dipilih dan berada dalam scope user.
- Create hanya menghasilkan initial state yang diizinkan, direkomendasikan Planned.
- Terminal transition dilakukan lewat action khusus dengan reason 1–150 karakter.
- Invalid payload gagal atomik tanpa task, audit, atau projection parsial.

**Solusi yang disarankan**

1. Load invoice di dalam transaction dan validasi `invoice.customerId === customerId` serta authorization scope.
2. Jangan menerima customer identity atau invoice metadata dari client sebagai kebenaran.
3. Batasi create state ke Planned; gunakan transition action untuk Done/Cancelled.
4. Gunakan shared note validator tanpa truncation.
5. Tambahkan composite/index/constraint yang mendukung valid relationship bila model memungkinkan.
6. Uji cross-customer, cross-portfolio, terminal-on-create, kosong/150/151 note, dan stale invoice.

**Definition of done**

- Cross-customer/cross-scope selalu ditolak.
- Invalid note/state tidak membuat task/audit/projection.
- Valid Planned task memiliki relasi dan audit yang tepat.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (27 September 2026).
- Create Collection hanya menerima state canonical `Planned`; UI tidak lagi menawarkan terminal state. Customer dan invoice di-load ulang dengan portfolio predicate serta `invoice.customerId === customerId` di dalam transaction sebelum task/audit dibuat.
- Migrasi `20260927201000_collection_invoice_customer_integrity` menambahkan unique `(invoice.id, customer_id)` dan composite foreign key `(collection_tasks.invoice_id, customer_id)` sebagai database defense-in-depth.
- Evidence: terminal/unknown create state dan cross-customer direct action diuji di `tests/integration/batch-two-mutation-validation.test.ts`; direct Prisma cross-customer write ditolak constraint dan task count tetap nol di `tests/integration/batch-two-commercial-integrity.test.ts`.
- Catatan: reason 1–150 untuk transition terminal tetap berada pada scope lifecycle Batch 3; Batch 2 memastikan terminal state tidak dapat dibuat lewat create.
- Regression: focused Batch 2 dan full `npm test` Pass (82 files, 407 tests; 4 files/13 tests skipped); lint/build Pass.

### SIT-DEF-022 — Update Collection Task bersifat last-write-wins

**Testcase terkait:** `COLL-SIT-005`  
**Prioritas:** P0 — Data Integrity/Concurrency

**Kegagalan saat ini**

Dua sesi stale dapat menulis Done lalu Cancelled beserta due date baru tanpa version guard, transition validation, atau audit/reminder atomik.

**Kondisi seharusnya**

- Transition divalidasi terhadap state terbaru saat commit.
- Terminal state tidak ditimpa oleh stale tab.
- Edit due date tidak dapat ikut masuk melalui payload transition yang tidak mengizinkannya.
- Task, reminder/projection, notes, dan audit commit bersama.

**Solusi yang disarankan**

1. Tambahkan `version` atau gunakan `updatedAt` sebagai optimistic concurrency token.
2. Lakukan conditional `updateMany` terhadap `id + expectedVersion + expectedStatus`; affected row nol berarti conflict.
3. Terapkan transition matrix dan per-action field allowlist.
4. Jalankan update serta audit/reminder dalam satu transaction.
5. UI menampilkan conflict dan meminta refresh, bukan menimpa diam-diam.
6. Uji dua session Done/Cancelled, edit/terminal, dan duplicate submit.

**Definition of done**

- Tepat satu stale race menang.
- Request kalah tidak mengubah task, due date, reminder, notes, atau audit.
- Terminal state terlindungi dan UI menerima conflict yang jelas.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (28 September 2026).
- Migrasi `20260928100000_add_collection_task_version` menambahkan `CollectionTask.version` dengan default/backfill 1 dan check constraint positif. Semua edit/transition memakai conditional `updateMany(id + expectedVersion + Planned)` lalu increment version; affected row nol menghasilkan conflict yang meminta refresh.
- Automatic close karena pembayaran lunas dan cancellation invoice juga menaikkan version sehingga form Collection yang sudah terbuka menjadi stale. Request kalah tidak menulis audit atau mengubah due date/note/reminder.
- Preflight `prisma/verify-batch-three-lifecycle-preflight.ts` Pass pada 51 task existing: 0 timestamp concurrency kosong dan 0 unknown state. Migration deploy/status Pass; 26 migrations up to date.
- Evidence: `tests/integration/collection-task-lifecycle.test.ts` membuktikan tepat satu pemenang pada race Done/Cancelled, terminal tidak dapat ditimpa, stale edit/transition tidak menghasilkan mutation/audit, dan transition payload tidak dapat mengubah tanggal. Unit parser/version policy ada di `tests/unit/collection-task.test.ts`.
- Regression: full `npm test` Pass (86 files, 423 tests; 4 files/13 tests skipped); lint/build Pass.

---

## Customer Outreach

### SIT-DEF-015 — Search tidak mencakup outreach notes Unicode

**Testcase terkait:** `OUT-SIT-003`  
**Prioritas:** P2 — Consistency/Usability

**Kegagalan saat ini**

Urutan, latest contact, tie timestamp, dan Unicode display sudah benar. Search hanya memeriksa customer fields sehingga note seperti `東京` tidak ditemukan.

**Kondisi seharusnya**

- Search mencakup customer identity dan outreach notes sesuai testcase.
- Unicode disimpan, dicari, dan ditampilkan tanpa rusak.
- Latest-contact selection tetap deterministik dan search tidak mengubah urutan histori.
- Scope portfolio tetap diterapkan sebelum search.

**Solusi yang disarankan**

1. Tambahkan relational predicate `outreachActivities.some(notes contains q)` dengan kemampuan Unicode database yang sesuai.
2. Gabungkan predicate dalam grouping OR yang tetap berada di dalam portfolio scope.
3. Pertahankan order `contactDate desc, createdAt desc, id desc` untuk tie stabil.
4. Evaluasi index/full-text strategy setelah query plan nyata, bukan mengorbankan correctness.
5. Uji Latin, Unicode, case behaviour, note tie, dan cross-portfolio query.

**Definition of done**

- Query notes Unicode menemukan customer/event yang tepat.
- Urutan latest/history tetap stabil.
- Search tidak membocorkan portfolio lain.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual `OUT-SIT-003` pending** (28 September 2026).
- Search Outreach kini mencakup customer identity dan note secara case-insensitive/Unicode dalam grouping yang tetap berada di portfolio scope. Latest/history memakai urutan `contactDate desc, createdAt desc, id desc` agar tie deterministik.
- Integration test database dengan note `東京` membuktikan hasil tetap scoped dan tie memilih ID terbaru secara deterministik; unit test memverifikasi bentuk predicate serta ordering.

### SIT-DEF-016 — Outreach membocorkan customer lintas portfolio

**Testcase terkait:** `OUT-SIT-004`  
**Prioritas:** P0 — Security/BOLA

**Kegagalan saat ini**

Sales A dapat melihat, mencari, dan mem-prefill customer Sales B melalui halaman/direct `customerId`, walaupun Dashboard sudah membatasi portfolio.

**Kondisi seharusnya**

- Sales hanya dapat list/search/read/create outreach untuk customer dalam portfolio sendiri.
- Direct ID, dropdown, prefill, dan server action memakai scope yang sama.
- Manager/Admin mengikuti company scope yang disetujui.
- Cross-portfolio request gagal sebelum data customer/outreach dibaca atau ditulis.

**Solusi yang disarankan**

1. Pusatkan ownership pada helper `buildPortfolioScope(currentUser)` atau assignment table canonical.
2. Gunakan scope langsung dalam query list/search/dropdown/direct ID.
3. Pada create action, query customer dengan `id + scope`; jangan percaya `customerId` dari client.
4. Panggil `requireCurrentUser` dan role/scope guard pada page serta action.
5. Return `404/403` aman tanpa mengungkap keberadaan customer asing.
6. Uji Sales A/B, Manager, direct URL, search, dropdown, dan tampered create payload.

**Definition of done**

- Sales A tidak dapat mengetahui atau memodifikasi data portfolio B melalui jalur mana pun.
- Manager/Admin behaviour sesuai policy.
- Valid outreach tetap tercatat dengan actor dan audit yang benar.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI retest pending** (27 September 2026).
- `buildPortfolioScope(currentUser)` diterapkan pada dropdown, prefill, list/search query, dan direct create action Customer Outreach. Sales query memakai `portfolioOwnerUserId` sebelum customer/outreach dibaca.
- Mutation Outreach sekarang membuat row dan audit dalam satu Prisma transaction dengan actor dari authenticated server context.
- Evidence: `tests/unit/outreach-portfolio-scope.test.ts`, `tests/integration/batch-one-trust-boundary.test.ts`, dan `tests/unit/portfolio-scope.test.ts` membuktikan Sales A tidak dapat melihat/membuat Outreach untuk customer Sales B.
- Regression: focused Batch 1 12 files/32 tests Pass; full `npm test` 80 files/369 tests Pass, 4 files/13 tests skipped sesuai konfigurasi existing.

---

## Notifications

### SIT-DEF-023 — Notification Sales membocorkan portfolio lain

**Testcase terkait:** `NOTIF-SIT-005`  
**Prioritas:** P0 — Security/BOLA

**Kegagalan saat ini**

Deduplication dengan deterministic event ID sudah benar, tetapi resolver hanya menerima role. Dua Sales berbeda menerima daftar outreach notification yang sama untuk customer Portfolio A dan B.

**Kondisi seharusnya**

- Resolver menerima current user identity, role, dan scope; role saja tidak cukup.
- Sales hanya menerima notification untuk portfolio sendiri.
- Manager/Admin menerima company-wide notification hanya sesuai policy.
- Event aktif yang sama tidak terduplikasi.
- Deep link stale atau cross-scope gagal aman atau menuju state terbaru yang masih diizinkan.

**Solusi yang disarankan**

1. Ubah kontrak resolver dari `getRoleNotifications(role)` menjadi context terautentikasi yang memuat `userId`, role, dan scope.
2. Gunakan helper portfolio yang sama dengan Dashboard, Outreach, Documents, dan server actions.
3. Terapkan scope pada query sumber sebelum event dibentuk; jangan memfilter setelah customer data sudah dibaca.
4. Pertahankan deterministic event ID untuk dedup, tetapi sertakan source/event identity yang stabil—bukan user-controlled text.
5. Validasi authorization lagi ketika deep link dibuka.
6. Tambahkan matrix tests Sales A/B, Manager/Admin, duplicate evaluation, terminal source, source berpindah state, dan direct deep link.

**Definition of done**

- Sales A/B menerima event yang berbeda sesuai portfolio.
- Tidak ada customer ID/name asing pada payload atau link.
- Evaluasi berulang tidak menggandakan event.
- Stale/cross-scope deep link gagal aman.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI retest pending** (27 September 2026).
- Notification resolver menerima user identity + role dan membangun scope database melalui helper portfolio yang sama. Customer PO dan inactivity source untuk Sales difilter sebelum event dibentuk.
- Event ID memakai pasangan type/source yang deterministik dan deep link menuju route yang mengulang authorization scope.
- Evidence: `tests/integration/notification-queries.test.ts` memverifikasi predicate `createdByUserId/portfolioOwnerUserId`, deterministic IDs, evaluasi ulang tanpa duplikasi, dan stale source removal.
- Regression: full `npm test` Pass (80 files/369 tests; 13 test existing skipped).

---

## Audit Trail

### SIT-DEF-024 — Business state commit walaupun audit wajib gagal

**Testcase terkait:** `AUD-SIT-001`, `AUD-SIT-004`, sebagian `DATA-SIT-003`  
**Prioritas:** P0 — Data Integrity/Traceability

**Kegagalan saat ini**

Fault injection pada Reject approval dan update Customer menunjukkan perubahan bisnis/notes tetap commit ketika insert audit gagal. Helper audit non-transactional menangkap error sehingga caller menganggap action sukses.

**Kondisi seharusnya**

- Untuk aksi yang mewajibkan audit, perubahan bisnis, notes, child rows, dan audit commit bersama.
- Kegagalan audit memicu rollback penuh dan error action.
- Retry setelah fault dihilangkan aman dan tidak menggandakan event.
- Catatan lama tidak tertimpa; note baru hanya muncul jika audit dan business mutation sukses.

**Solusi yang disarankan**

1. Tambahkan overload/helper audit yang wajib menerima Prisma transaction client.
2. Pindahkan call audit ke transaction yang sama dengan entity/status/notes.
3. Hapus `catch-and-log` yang menelan kegagalan audit wajib; secondary telemetry boleh best-effort, business audit tidak.
4. Pastikan actor/context dibentuk server-side sebelum transaction.
5. Untuk aksi yang tersebar, buat service transaction per use case, bukan action memanggil helper audit global di akhir.
6. Tambahkan fault injection pada audit untuk approval, customer update, payment, collection, picking, dan delivery representative.
7. Verifikasi entity, children, notes, sequence/counter, serta audit sebelum/sesudah fault dan retry.

**Definition of done**

- Fault audit menghasilkan rollback penuh pada seluruh use case yang diuji.
- Jalur sukses menghasilkan tepat satu audit terpercaya.
- Retry tidak menggandakan entity, note, atau audit.
- `AUD-SIT-001`, `AUD-SIT-004`, dan bagian atomicity `DATA-SIT-003` lulus.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI retest pending** (27 September 2026).
- Audit writer tidak lagi menelan error. Kegagalan insert audit wajib diteruskan ke caller sehingga Prisma transaction melakukan rollback.
- Customer, Product, Customer Inquiry, Collection, Customer Outreach, Picking, account management, approval, invoice/payment/receivable, dan Surat Jalan menulis perubahan bisnis serta audit dalam transaction yang sama.
- Evidence fault injection: `tests/integration/batch-one-trust-boundary.test.ts` membuktikan Customer update/notes rollback saat audit gagal dan retry menghasilkan tepat satu audit; `tests/integration/batch-three-approval-atomicity.test.ts` membuktikan order, invoice, sequence, collection, dan audit rollback; `tests/integration/delivery-note-atomic-audit.test.ts` membuktikan multi-entry audit ikut rollback.
- Focused regression Pass 12 files/32 tests. Full `npm test`, lint, build, dan `prisma migrate status` Pass; database melaporkan 23 migration dan schema up to date.

### SIT-DEF-025 — Audit manual menerima spoofed actor dan event arbitrary

**Testcase terkait:** `AUD-SIT-005`  
**Prioritas:** P0 — Security/Traceability

**Kegagalan saat ini**

`createAuditTrailLog` dapat dipanggil dengan actor Victim Admin serta module/action/reference arbitrary dan menyimpan event tanpa memverifikasi actor session.

**Kondisi seharusnya**

- Audit hanya dapat dibuat oleh trusted server use case.
- Actor selalu berasal dari session/context server yang telah diverifikasi, bukan payload client.
- Module/action/reference berasal dari event type yang diizinkan dan entity aktual.
- Client/Sales tidak dapat membuat event audit manual atau menyamar sebagai user lain.

**Solusi yang disarankan**

1. Jadikan audit writer internal/server-only; jangan ekspor sebagai callable server action dari module ber-`use server`.
2. Pisahkan public action boundary dari internal audit repository.
3. Turunkan actor ID/name/role dari authenticated context dan abaikan/tolak actor field dari payload.
4. Gunakan typed event constructors per use case, bukan object bebas module/action/reference.
5. Validasi entity reference dari record yang sedang diubah dalam transaction.
6. Tambahkan lint/import boundary bila tersedia agar client/action layer tidak dapat memanggil low-level audit writer sembarangan.
7. Uji manual call, actor spoof, module/action/reference tampering, tanpa session, serta valid business action.

**Definition of done**

- Semua manual/spoof request ditolak dan audit count tidak berubah.
- Valid action menghasilkan satu event dengan actor session sebenarnya dan reference benar.
- Tidak ada public callable path menuju raw audit insert.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI retest pending** (27 September 2026).
- `src/lib/audit.ts` diubah dari callable `use server` module menjadi internal `server-only` repository.
- Jalur non-transactional menolak actor yang diberikan caller dan mewajibkan authenticated session yang masih Active serta cocok username/role/sessionVersion. Jalur transaction hanya menerima actor yang sudah diperoleh oleh trusted server use case.
- Audit storage error sekarang dipropagasikan; tidak ada fallback menjadi event System atau sukses semu.
- Evidence: `tests/unit/naming-audit-actions.test.ts` membuktikan actor spoof ditolak, audit count tidak berubah, authenticated actor dipakai, dan storage failure diteruskan. Valid transaction evidence terdapat pada test account/approval/customer/delivery.
- Regression: full `npm test`, lint, dan build Pass.

---

## Documents & Exports

### SIT-DEF-026 — Sales dapat mengekspor atau mencetak data portfolio lain

**Testcase terkait:** `DOC-SIT-002`  
**Prioritas:** P0 — Security/IDOR

**Kegagalan saat ini**

Unauthenticated print sudah diarahkan ke login, tetapi Sales aktif dapat mengekspor seluruh customer company-wide dan membuka invoice print milik Sales lain melalui direct ID.

**Kondisi seharusnya**

- Authentication saja tidak cukup; setiap export/print/document route menerapkan role dan portfolio scope.
- Sales hanya menerima data portfolionya, termasuk count, workbook rows, filename metadata, dan direct print ID.
- Manager/Admin mengikuti scope yang disetujui.
- Unauthorized request ditolak sebelum data/file dibaca atau dibentuk.
- Error tidak membocorkan keberadaan, customer name, invoice number, atau file metadata asing.

**Solusi yang disarankan**

1. Buat authorization service tunggal untuk entity/document access dan gunakan pada export, print, API document, canonical serta legacy routes.
2. Untuk Sales export, masukkan portfolio predicate langsung ke query sumber; jangan generate company-wide lalu memfilter workbook.
3. Untuk direct invoice ID, query `id + scope` dengan `findFirst`; return `404/403` aman sebelum render.
4. Terapkan policy pada seluruh output variant: HTML print, PDF/document, XLSX/CSV, preview, dan download.
5. Jangan mengandalkan `src/proxy.ts` sebagai satu-satunya proteksi karena user terautentikasi tetap bisa melakukan IDOR.
6. Tambahkan matrix tests tanpa session, inactive user, Sales A/B, Manager/Admin, canonical/legacy route, guessed ID, dan export filter.
7. Verifikasi workbook row IDs/count serta absence of foreign identifiers.

**Definition of done**

- Sales export hanya memuat portfolio sendiri.
- Direct print/document lintas portfolio gagal sebelum konten terbentuk.
- Manager/Admin behaviour sesuai policy.
- Tidak ada metadata sensitif pada response unauthorized.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated evidence Pass; manual SIT UI/HTTP retest pending** (27 September 2026).
- Customer XLSX export menambahkan portfolio predicate langsung pada query database sebelum workbook dibentuk.
- Invoice print, Surat Jalan print, Pick & Pack print, Customer PO document download, dan business list/detail routes memakai `id + buildPortfolioScope(currentUser)` atau entity scope ekuivalen; foreign direct ID menghasilkan not-found/unauthorized sebelum konten dibentuk.
- Evidence: `tests/unit/customer-export.test.ts` memverifikasi Sales export memakai `portfolioOwnerUserId`; `tests/unit/invoice-print-authorization.test.ts` memverifikasi direct invoice ID memakai `salesOrder.createdByUserId`; notification/deep-link dan portfolio helper diuji pada regression terkait.
- Regression: focused Batch 1 dan full `npm test` Pass; lint/build Pass.

---

## Data Integrity & Transactions

### SIT-DEF-027 — Database menerima quantity dan amount Sales Order negatif

**Testcase terkait:** sebagian `DATA-SIT-003`  
**Prioritas:** P0 — Database Integrity

**Kegagalan saat ini**

Nested create langsung melalui Prisma menerima `sales_order_items.quantity = -1` beserta subtotal/total negatif. Application validation dapat dilewati dan database tetap meng-commit state invalid.

**Kondisi seharusnya**

- Quantity item harus positif.
- Base/final unit price, subtotal, total, net, tax, dan amount lain tidak boleh negatif sesuai invariant domain.
- Header dan line totals harus konsisten sesuai formula canonical.
- Direct ORM/SQL invalid ditolak database, bukan hanya UI/server action.
- Transaction gagal rollback utuh tanpa header/item orphan.

**Solusi yang disarankan**

1. Inventarisasi invariant moneter/quantity pada Sales Order dan item.
2. Sebelum migration, audit dan perbaiki data existing yang melanggar; migration tidak boleh diam-diam menghapus data.
3. Tambahkan database `CHECK` constraints, minimal quantity `> 0` dan monetary fields `>= 0`.
4. Jika subtotal consistency dapat diekspresikan aman pada database, tambahkan constraint/generated value; bila tidak, pertahankan server calculation serta integration test.
5. Jangan menerima subtotal/total client sebagai sumber kebenaran; hitung ulang di server dengan arithmetic canonical.
6. Tambahkan negative direct-database tests untuk standalone dan nested create/update, plus transaction rollback.
7. Jalankan migration validation terhadap dataset representatif dan pastikan constraint memiliki nama yang jelas untuk diagnosis.

**Definition of done**

- Direct Prisma/SQL dengan quantity/amount invalid gagal pada database.
- Nested transaction rollback tanpa header/item/audit parsial.
- Valid order tetap tersimpan dan total merekonsiliasi items.
- `DATA-SIT-003` baru dapat Pass setelah SIT-DEF-027 dan SIT-DEF-024 sama-sama selesai.

**Implementasi / hasil retest**

- Status implementasi: **Implemented; automated database evidence Pass; manual SIT/SQL retest pending** (27 September 2026).
- `prisma/verify-batch-two-preflight.ts` memeriksa invalid product/inquiry/order quantity dan amount sebelum migration. Preflight final: seluruh blocking check `0`; lima customer/order source lama beralamat kosong dicatat sebagai non-blocking dan tidak dapat dipakai untuk combined delivery sampai destination valid tersedia.
- Migrasi `20260927130000_batch_two_commercial_integrity` menambahkan named `CHECK` constraints untuk item quantity `> 0`, item/header monetary fields `>= 0`, percentage bounds, dan related order invariants.
- Evidence: `tests/integration/batch-two-commercial-integrity.test.ts` membuktikan zero/negative quantity, negative item amount, dan negative header amount ditolak langsung PostgreSQL; nested header/line tidak tersisa setelah failure.
- Migration verification: 25 migrations terdeteksi dan database schema up to date setelah dua migration lanjutan Batch 2 diterapkan.
- Regression: full `npm test` Pass (82 files, 407 tests; 4 files/13 tests skipped); lint/build Pass. Bagian database integrity `DATA-SIT-003` memiliki automated evidence untuk constraint ini dan atomic audit Batch 1, tetapi status SIT manual tetap pending.

---

## Urutan implementasi yang disarankan

1. **Authorization dan scope:** SIT-DEF-016, SIT-DEF-023, SIT-DEF-026, lalu samakan portfolio helper di seluruh modul.
2. **Audit dan transaction safety:** SIT-DEF-024, SIT-DEF-025, SIT-DEF-027.
3. **Payload/invariant security:** SIT-DEF-001, SIT-DEF-014, SIT-DEF-018, SIT-DEF-019, SIT-DEF-020.
4. **Concurrency dan lifecycle:** SIT-DEF-022, SIT-DEF-013, lalu stale-state tests terkait.
5. **Boundary validation:** SIT-DEF-007, SIT-DEF-010, SIT-DEF-017, SIT-DEF-008.
6. **Workflow/consistency:** SIT-DEF-002, SIT-DEF-006, SIT-DEF-003, SIT-DEF-004, SIT-DEF-005, SIT-DEF-009, SIT-DEF-011, SIT-DEF-012, SIT-DEF-015, SIT-DEF-021.

## Aturan update hasil fase dua

Sebelum mengubah testcase menjadi `Pass` pada tab `SIT Testing Iterasi ke 2`:

1. Implementasi memenuhi seluruh definition of done.
2. Automated regression test yang relevan lulus.
3. Direct/tampered/stale/concurrent path diuji sesuai tipe kasus.
4. Database dan audit dibandingkan sebelum/sesudah untuk mutation case.
5. Evidence mencantumkan test file/command, fixture, dan hasil cleanup.
6. Jika muncul kegagalan baru, catat defect baru; jangan mengubah expected result hanya untuk menyesuaikan implementation bug.

## Catatan lanjutan

- Kolom `Implementasi / hasil retest` pada setiap paket sengaja dibiarkan terbuka agar dapat diisi selama perbaikan.
- Satu paket dapat menutup beberapa testcase, tetapi masing-masing testcase tetap harus memiliki evidence retest sendiri.
