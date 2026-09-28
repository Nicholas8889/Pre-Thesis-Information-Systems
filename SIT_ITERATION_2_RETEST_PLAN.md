# SIT Iteration 2 — Retest and Improvement Plan

Dokumen kerja ini menampung analisis testcase SIT yang masih `Blocked`, kondisi sistem yang seharusnya, usulan perbaikan, dan hasil retest fase dua. Dokumen ini sengaja dibuat sebagai **living document**: bagian dan testcase baru dapat terus ditambahkan, sedangkan keputusan implementasi serta hasil retest dapat diperbarui selama proses perbaikan.

Sumber awal: tab `SIT` pada workbook `Testing_CV_Tajuk_SIT_Enterprise`.

## Ringkasan status — 27 September 2026

- Total testcase terdokumentasi: **53**.
- Implementasi dan retest otomatis lulus: **52**.
- Masih Blocked karena environment: **1** (`DATA-SIT-004`), menunggu database performance terisolasi untuk seed ribuan transaksi dan pengukuran p50/p95/query count/memory/export aktual.
- Tidak ada testcase yang masih memakai placeholder hasil/implementasi atau keputusan policy yang belum ditegaskan.

## Cara menggunakan dokumen

- `Kondisi seharusnya` adalah acceptance behaviour yang harus terlihat dari UI dan tetap dipaksakan di server.
- `Kondisi saat ini` menjelaskan alasan testcase masih Blocked, bukan otomatis berarti defect sudah terbukti.
- `Usulan perbaikan` memisahkan perubahan produk dari kebutuhan fixture atau test harness.
- `Kriteria lulus retest` adalah bukti minimum sebelum hasil pada tab `SIT Testing Iterasi ke 2` diubah menjadi `Pass`.
- Tambahkan catatan implementasi, commit, evidence, defect baru, atau hasil retest langsung pada subsection testcase terkait.

## Fondasi bersama yang disarankan

Sebagian besar testcase pada tiga modul ini membutuhkan lingkungan uji terisolasi. Siapkan seed atau fixture yang aman dibersihkan, minimal berisi:

- dua Admin independen;
- satu Manager;
- dua Sales dengan portfolio berbeda;
- satu akun aktif yang boleh dinonaktifkan;
- satu akun Inactive dengan kredensial uji;
- invoice dan delivery sintetis untuk pengujian customer outstanding;
- histori invoice/payment sintetis untuk boundary payment behaviour;
- dua browser context atau cookie jar independen;
- snapshot database dan audit sebelum/sesudah request;
- cleanup otomatis setelah test agar akun atau data uji tidak menjadi akses persisten.

Semua fixture harus memiliki prefix atau marker khusus SIT sehingga dapat dibedakan dari data demo/operasional.

---

## Authentication & Access

### AUTH-SIT-003 — Login ditolak untuk akun nonaktif

**Kondisi saat ini**

Test belum dijalankan karena tidak tersedia akun Inactive sintetis dengan kredensial valid. Akun demo tidak boleh dinonaktifkan hanya untuk kebutuhan pengujian.

**Kondisi seharusnya**

- Kredensial benar milik akun Inactive tetap tidak boleh menghasilkan session.
- Pengguna tetap berada di halaman login dan menerima pesan yang aman.
- Pesan tidak boleh mengungkap apakah username ada, akun inactive, atau password salah.
- Direct request ke halaman dan action terproteksi tetap ditolak.
- Tidak ada perubahan `lastLogin`, session record, business record, atau audit sukses login.

**Usulan perbaikan / test enablement**

1. Buat fixture akun `SIT_INACTIVE_*` di database test dengan password yang hanya dipakai oleh test.
2. Pada proses login, validasi password dan status akun sebelum session diterbitkan.
3. Gunakan respons eksternal generik, misalnya `Invalid username or password`, tetapi simpan reason internal yang aman untuk observability bila diperlukan.
4. Pastikan semua protected page dan server action memeriksa user dari session masih ada dan masih aktif.
5. Hapus fixture dan seluruh session terkait setelah retest.

**Kriteria lulus retest**

- Login akun Active berhasil sebagai kontrol.
- Login akun Inactive ditolak tanpa session/cookie autentikasi.
- Direct protected request setelah percobaan login tetap mengarah ke login atau menghasilkan `401`.
- Snapshot database membuktikan tidak ada perubahan bisnis atau audit sukses login.

**Keputusan / implementasi**

- Username sekarang dinormalisasi dengan `trim + lowercase` dan kegagalan login selalu memakai pesan eksternal generik.
- Session hanya diterbitkan setelah password valid dan status user `Active`.
- Setiap resolusi session terproteksi membaca ulang user dari database serta memvalidasi status, role, username, dan `sessionVersion`.
- Fixture aman `sit_auth_*` menyediakan akun Active dan Inactive dengan password test yang di-hash; cleanup menolak target di luar prefix fixture.

**Hasil retest fase dua**

- Status: implementasi selesai dan retest otomatis lulus pada 27 September 2026.
- Bukti: unit test policy/login dan session resolution, ditambah integration test akun Inactive dengan kredensial valid yang tetap tidak memperoleh user terautentikasi.
- Verifikasi browser untuk cookie/network dan direct URL tetap disarankan saat eksekusi SIT manual; belum dicatat sebagai bukti manual di dokumen ini.

### AUTH-SIT-006 — Sesi tidak valid dan aksi tanpa role ditolak di server

**Kondisi saat ini**

Cookie rusak/kedaluwarsa dan direct request lintas role belum diuji. UI normal saja tidak cukup untuk membuktikan server authorization.

**Kondisi seharusnya**

- Session kosong, rusak, tidak dikenal, atau expired ditolak sebelum business logic berjalan.
- Sales tidak dapat menjalankan action khusus Admin/Manager meskipun request dibuat manual.
- Page request dapat diarahkan ke login; API/server action mengembalikan error autentikasi/otorisasi yang konsisten.
- Tidak ada data sensitif pada error response.
- Tidak ada entity, nomor dokumen, child record, atau audit sukses yang terbentuk.

**Usulan perbaikan / test enablement**

1. Pusatkan pemeriksaan pada helper server-only seperti `requireCurrentUser`, `requireActiveUser`, dan `requireRole`.
2. Panggil guard tersebut pada setiap server action, route handler, export, print, dan lookup direct ID; middleware atau tombol tersembunyi tidak cukup.
3. Jalankan authorization sebelum parsing yang mahal, alokasi nomor dokumen, atau transaksi bisnis.
4. Bedakan `401` untuk session tidak valid dan `403` untuk user valid yang tidak memiliki role/scope.
5. Buat integration test dengan tanpa cookie, cookie acak, cookie expired, Sales cookie, dan Manager/Admin cookie sebagai kontrol.

**Kriteria lulus retest**

- Semua invalid-session request ditolak.
- Direct Admin/Manager action sebagai Sales ditolak server-side.
- Perbandingan entity dan audit sebelum/sesudah identik.
- Respons tidak membocorkan stack trace, hash, internal ID yang tidak perlu, atau detail validasi bisnis setelah authorization gagal.

**Keputusan / implementasi**

- Token session bertanda tangan sekarang wajib memiliki expiry dan `sessionVersion` yang valid; token rusak, expired, atau payload lama ditolak.
- Guard server membaca ulang user aktif dan memvalidasi semua claim sebelum page, action, export, print, atau lookup meneruskan query bisnis.
- Pembuatan akun dibatasi ke Admin di server; scope portfolio diterapkan langsung pada query database, bukan hanya pada visibilitas UI.

**Hasil retest fase dua**

- Status: implementasi selesai dan retest otomatis lulus untuk token invalid/expired, session stale, role account-management, dan portfolio scope.
- Full test suite dan production build digunakan sebagai regression gate. Matrix HTTP manual tanpa cookie/cookie acak untuk setiap endpoint tetap menjadi langkah SIT manual lanjutan.

### AUTH-SIT-007 — Akun yang dinonaktifkan kehilangan akses pada sesi aktif

**Kondisi saat ini**

Belum tersedia akun target sintetis yang sedang login dan Admin kedua untuk melakukan penonaktifan.

**Kondisi seharusnya**

- Setelah akun dinonaktifkan, request berikutnya dari session lama ditolak.
- Tab lama mungkin masih menampilkan HTML yang sudah termuat, tetapi refresh, navigasi, read, dan write berikutnya tidak boleh berhasil.
- Penonaktifan tidak memengaruhi session pengguna lain.
- Perubahan status dan audit penonaktifan commit secara atomik.

**Usulan perbaikan / test enablement**

1. Validasi `isActive` pada setiap protected request, bukan hanya ketika login.
2. Tambahkan `sessionVersion` atau `credentialsVersion` pada user dan session. Naikkan version saat akun dinonaktifkan, password di-reset, atau role berubah.
3. Bila session disimpan server-side, revoke seluruh session milik user di transaksi penonaktifan yang sama.
4. Gunakan dua browser context: target user dan Admin kedua.
5. Setelah disable, uji page refresh, direct URL, read request, dan satu write action dari session lama.

**Kriteria lulus retest**

- Request sebelum disable berhasil sebagai kontrol.
- Seluruh request setelah disable ditolak dan session tidak dapat dipakai kembali.
- Tidak ada business mutation dari tab lama.
- Session Admin dan user lain tetap normal.

**Keputusan / implementasi**

- Kolom `User.sessionVersion` ditambahkan dengan default `1` dan constraint nilai positif.
- Perubahan status, role, dan reset password menaikkan `sessionVersion`; perubahan akun dan audit tersimpan dalam transaksi yang sama.
- Request berikutnya dari session lama ditolak karena user harus tetap Active dan versi session pada token harus sama dengan database.
- Admin tidak dapat menonaktifkan dirinya sendiri atau mengubah role sendiri melalui action Settings.

**Hasil retest fase dua**

- Status: implementasi selesai dan retest otomatis lulus.
- Integration test membuktikan session fixture valid sebelum status/version berubah dan menjadi invalid sesudahnya, tanpa memengaruhi fixture user lain.
- Skenario dua browser dengan tab lama belum direkam sebagai bukti manual dan tetap perlu dijalankan pada sesi SIT interaktif.

### AUTH-SIT-008 — Sesi paralel antar pengguna tidak saling membocorkan scope

**Kondisi saat ini**

Belum tersedia dua akun Sales dengan portfolio berbeda dalam browser context independen. Isolasi list, detail, search, export, dan Dashboard belum dapat dibandingkan.

**Kondisi seharusnya**

- Sales A hanya dapat membaca atau mengubah data dalam portfolio A; Sales B hanya portfolio B.
- Scope yang sama berlaku pada list, search, detail, direct ID, dropdown/prefill, server action, export, print, Dashboard, dan notification.
- Manager/Admin melihat scope company-wide hanya sesuai policy yang disetujui.
- Logout satu session tidak menukar identitas, menghapus, atau memperluas scope session lain.

**Usulan perbaikan / test enablement**

1. Tetapkan sumber ownership portfolio yang canonical. Untuk jangka panjang, pertimbangkan relasi assignment eksplisit dan jangan hanya menyimpulkan ownership dari transaksi historis.
2. Buat helper query seperti `buildPortfolioScope(currentUser)` dan gunakan langsung di `where` database.
3. Untuk direct ID, query dengan kombinasi `id + scope`; jangan mengambil entity secara global lalu hanya menyembunyikannya di UI.
4. Terapkan helper yang sama pada export, print, notification resolver, dan server action.
5. Buat matrix integration test A ke A, A ke B, B ke A, serta Manager ke A/B dengan cookie jar terpisah.

**Kriteria lulus retest**

- Cross-portfolio list/search tidak menampilkan record asing.
- Direct ID, export, print, dan mutation lintas portfolio menghasilkan `403/404` tanpa kebocoran metadata.
- Dashboard dan notification setiap Sales hanya memakai portfolio masing-masing.
- Logout Sales A tidak mengubah session atau hasil Sales B.

**Keputusan / implementasi**

- Ownership portfolio dibuat eksplisit melalui `Customer.portfolioOwnerUserId`; data lama di-backfill dari pembuat sales order paling awal dan seed menetapkan owner pada customer Sales.
- Helper scope terpusat menghasilkan filter Prisma untuk customer, order, invoice, payment, inquiry, collection, outreach, picking, dan delivery.
- Scope diterapkan pada list, search, detail/direct ID, dropdown/prefill, mutation, export, print, receivables, Dashboard-related insights, dan notification. Manager/Admin tetap company-wide.

**Hasil retest fase dua**

- Status: implementasi selesai dan retest otomatis lulus untuk isolasi Sales A/Sales B serta akses company-wide Manager/Admin.
- Fixture transaksi membuktikan masing-masing Sales hanya memperoleh customer miliknya; unit test memverifikasi filter seluruh model yang dicakup.
- Isolasi logout pada dua browser terpisah belum direkam sebagai bukti manual dan tetap menjadi langkah SIT interaktif.

### AUTH-SIT-009 — Kegagalan autentikasi tidak meninggalkan perubahan bisnis

**Kondisi saat ini**

Request tanpa cookie, cookie invalid, dan role salah belum dikirim terhadap endpoint tulis sambil membandingkan state database dan audit.

**Kondisi seharusnya**

- Authentication dan authorization gagal sebelum transaksi bisnis dimulai.
- Tidak ada nomor dokumen yang dikonsumsi, entity/child record yang terbentuk, status yang berubah, file yang tersimpan, atau audit sukses.
- Kegagalan authorization sendiri dapat dicatat pada security log terpisah, tetapi tidak boleh terlihat sebagai audit aksi bisnis sukses.

**Usulan perbaikan / test enablement**

1. Standarkan urutan handler: session → active user → role/scope → payload validation → transaction.
2. Pastikan helper pembentuk nomor dokumen dan upload file hanya dipanggil setelah authorization berhasil.
3. Gunakan transaction untuk mutation dan audit bisnis yang memang lolos authorization.
4. Siapkan satu payload bisnis valid agar kegagalan benar-benar berasal dari auth, bukan dari validasi input.
5. Snapshot seluruh tabel yang relevan, sequence/counter, storage object, dan audit sebelum/sesudah request.

**Kriteria lulus retest**

- Tanpa cookie, cookie rusak/expired, dan role salah semuanya ditolak.
- Entity count, child rows, status, counter/nomor, storage, serta audit bisnis tidak berubah.
- Request dengan role valid berhasil sebagai kontrol.

**Keputusan / implementasi**

- Guard session/role/scope ditempatkan sebelum mutation pada jalur Batch 1, sedangkan perubahan akun dan audit dibungkus dalam satu transaksi.
- Konflik username dan session stale gagal sebelum menghasilkan akun atau audit sukses parsial.
- Route API yang tercakup menggunakan respons autentikasi/otorisasi sebelum menjalankan query atau mutation bisnis.

**Hasil retest fase dua**

- Status: fondasi Batch 1 lulus pada retest otomatis.
- Integration test membandingkan jumlah user/audit pada kegagalan duplicate dan stale-session; tidak ada perubahan parsial.
- Snapshot lengkap nomor dokumen, storage, dan seluruh endpoint tulis lintas modul masih termasuk cakupan SIT manual/iteration berikutnya, bukan klaim yang sudah dibuktikan oleh Batch 1.

---

## Settings

### SET-SIT-001 — Admin membuat akun dan kredensial tidak terekspos

**Kondisi saat ini**

Pembuatan akun belum diuji karena menghasilkan akses persisten dan belum tersedia fixture account lifecycle yang aman dibersihkan.

**Kondisi seharusnya**

- Hanya Admin yang dapat membuat akun.
- Username, display name, role, dan status tersimpan sesuai input yang tervalidasi.
- Password disimpan sebagai hash yang kuat dan tidak pernah dikembalikan ke UI, list, API response, log, export, atau audit.
- Akun Active dapat login; akun Inactive tidak dapat login.
- Create account dan audit commit bersama atau rollback bersama.

**Usulan perbaikan / test enablement**

1. Buat account factory dengan prefix `SIT_USER_*` dan cleanup terverifikasi.
2. Hash password hanya di server menggunakan algoritma yang disetujui; jangan log raw password.
3. Gunakan DTO/select eksplisit untuk response user dan jangan pernah menyertakan `passwordHash`.
4. Validasi role/status melalui allowlist server-side.
5. Masukkan create user dan audit ke transaksi yang sama.

**Kriteria lulus retest**

- Admin dapat membuat Active dan Inactive test account.
- Role/status benar setelah reload.
- Active login berhasil dan Inactive login ditolak.
- Password maupun hash tidak muncul pada UI, network response, export, atau audit.
- Fixture dan session dibersihkan setelah test.

**Keputusan / implementasi**

- Action create-account sekarang Admin-only, memvalidasi allowlist role/status serta username/display name/password, dan menyimpan user + audit secara atomik.
- Password di-hash dengan bcrypt di server; response dan audit hanya memakai field aman dan tidak membawa password maupun hash.
- Settings page hanya dapat diakses Admin. Akun Active dapat diautentikasi, sedangkan akun Inactive tetap ditolak walaupun password benar.

**Hasil retest fase dua**

- Status: implementasi selesai dan retest otomatis lulus.
- Test server action membuktikan create-account menghasilkan tepat satu audit, hash dapat memverifikasi password pemenang, dan serialized response/audit tidak mengandung password atau hash.
- Fixture berprefix aman dibersihkan setelah test; inspeksi network/UI manual tetap disarankan sebagai bukti SIT tambahan.

### SET-SIT-002 — Username duplikat ditolak tanpa akun parsial

**Kondisi saat ini**

Submit username existing belum dilakukan karena belum tersedia lifecycle fixture untuk create-account testing.

**Kondisi seharusnya**

- Username canonical yang sama ditolak, termasuk variasi spasi dan casing bila username memang case-insensitive.
- Tidak ada profile, credential/hash, session, atau audit sukses parsial.
- Pengguna mendapat conflict message yang jelas tanpa membocorkan informasi sensitif.

**Usulan perbaikan / test enablement**

1. Definisikan canonicalization username secara eksplisit, misalnya trim dan lowercase.
2. Simpan nilai canonical atau gunakan index unik case-insensitive di database.
3. Anggap unique constraint database sebagai sumber kebenaran; pre-check hanya untuk UX.
4. Tangani unique-conflict menjadi respons domain yang konsisten.
5. Bungkus profile, credential, dan audit dalam satu transaksi.

**Kriteria lulus retest**

- Username persis sama, beda casing, dan spasi luar ditangani sesuai policy canonical.
- Hanya akun awal yang tetap ada.
- Tidak ada hash/profile/audit sukses tambahan.
- Login akun awal tetap normal.

**Keputusan / implementasi**

- Policy canonical username ditetapkan sebagai `trim + lowercase`, panjang 3–64 karakter.
- Database memiliki unique functional index pada `lower(trim(username))` serta check constraint canonical/length sebagai sumber kebenaran.
- Error unique constraint diterjemahkan menjadi conflict message domain; pembuatan user dan audit tetap satu transaksi.

**Hasil retest fase dua**

- Status: implementasi selesai dan retest otomatis lulus.
- Unit test mencakup canonicalization dan validation. Integration test membuktikan variasi casing/spasi hanya menyisakan satu user dan satu audit tanpa row parsial.

### SET-SIT-005 — Catatan konfirmasi optional, wajib, append, dan batas panjang

**Kondisi saat ini**

Belum tersedia akun sintetis yang aman diedit dan dinonaktifkan. Pengujian note pada modul Approval tidak membuktikan behaviour Settings.

**Kondisi seharusnya**

- Aksi non-destruktif dapat mengikuti policy note optional yang disepakati.
- Aksi sensitif/destruktif seperti deactivate, role change, atau password reset mewajibkan alasan non-whitespace.
- Nilai setelah trim sepanjang 1–150 karakter diterima untuk aksi yang wajib note.
- Panjang 151 karakter ditolak; teks tidak boleh dipotong diam-diam.
- Note baru di-append sebagai event/history baru dan tidak menimpa catatan lama.
- Actor, timestamp, action, target, dan note dapat ditelusuri.

**Usulan perbaikan / test enablement**

1. Buat validator note bersama yang menerima policy `optional|required` dan batas panjang.
2. Validasi raw trimmed input sebelum normalisasi; jangan menggunakan `slice(0, 150)` sebagai validasi.
3. Terapkan validator yang sama pada UI dan server, dengan server sebagai sumber kebenaran.
4. Simpan note sebagai audit event append-only dalam transaksi perubahan akun.
5. Uji matrix kosong, whitespace, 1, 150, dan 151 karakter untuk tiap jenis aksi Settings.

**Kriteria lulus retest**

- Optional action tanpa note mengikuti policy.
- Required action dengan kosong/whitespace ditolak tanpa perubahan.
- Panjang 150 diterima utuh; 151 ditolak tanpa truncation atau mutation.
- Note kedua menambah histori dan tidak mengganti note pertama.

**Keputusan / implementasi**

- Validator note bersama sekarang mendukung policy `optional|required`, melakukan trim, menerima maksimum 150 karakter, dan menolak 151 karakter tanpa truncation.
- Deactivate/activate, role change, dan password reset mewajibkan alasan; create-account memakai note optional.
- Setiap perubahan menyimpan event audit baru berisi actor, target, action, timestamp, dan note dalam transaksi yang sama dengan mutation.

**Hasil retest fase dua**

- Status: implementasi selesai dan retest otomatis lulus untuk matrix kosong, whitespace, 1, 150, dan 151 karakter.
- Test memastikan input 151 karakter ditolak, note tidak dipotong, dan event audit ditambahkan sebagai row baru; walkthrough UI manual masih dapat dipakai untuk bukti visual.

### SET-SIT-006 — Pembuatan username sama secara bersamaan hanya menghasilkan satu akun

**Kondisi saat ini**

Belum tersedia dua sesi Admin dan username fixture yang boleh dipakai untuk concurrent submit.

**Kondisi seharusnya**

- Dua request untuk username canonical yang sama menghasilkan tepat satu akun.
- Satu request sukses dan request lain menerima conflict yang jelas.
- Tidak ada profile, password hash, audit sukses, atau session parsial dari request yang kalah.
- Akun pemenang dapat login dengan credential yang benar.

**Usulan perbaikan / test enablement**

1. Gunakan unique constraint pada username canonical; jangan mengandalkan pola `find-then-create` tanpa constraint.
2. Lakukan user, credential, dan audit creation dalam satu transaksi.
3. Tangani race unique constraint sebagai conflict domain, bukan generic server error.
4. Jalankan dua create request secara paralel menggunakan dua Admin cookie jar.
5. Ulangi dengan variasi casing/spasi sesuai aturan canonicalization.

**Kriteria lulus retest**

- Tepat satu akun canonical terbentuk pada setiap race.
- Request kalah tidak meninggalkan row atau audit sukses parsial.
- Akun pemenang dapat login; credential dari request kalah tidak berlaku.

**Keputusan / implementasi**

- Race diselesaikan oleh unique functional index canonical di database, bukan pola pre-check sebagai sumber kebenaran.
- Setiap request membuat user dan audit dalam transaksi; request yang kalah menerima conflict domain setelah error unique constraint.
- Integration test memanggil dua server action create-account secara paralel dengan variasi whitespace/casing.

**Hasil retest fase dua**

- Status: implementasi selesai dan retest otomatis lulus.
- Hasil paralel tepat satu sukses dan satu conflict, dengan satu user canonical dan satu audit. Password request pemenang berlaku; password request yang kalah tidak berlaku.

---

## Customers

### AR-SIT-006 — Reversal delivery memperbarui outstanding secara tepat

**Kondisi saat ini**

Belum tersedia invoice unpaid dengan dua delivery terkait dan satu delivery unrelated sebagai kontrol. Reversal/cancel delivery belum diuji terhadap proyeksi outstanding.

**Kondisi seharusnya**

- Invoice unpaid masuk outstanding hanya ketika memiliki evidence delivery eligible sesuai aturan bisnis.
- Jika satu delivery terkait direverse tetapi masih ada delivery terkait lain berstatus Delivered, invoice tetap dihitung.
- Jika seluruh evidence delivery terkait tidak lagi Delivered, invoice keluar dari outstanding.
- Delivery milik order/invoice/customer lain tidak pernah membuat invoice menjadi eligible.
- Customers, Receivables, dan Dashboard memberikan hasil yang sama setelah refresh.

**Usulan perbaikan / test enablement**

1. Definisikan satu query/helper canonical untuk `hasEligibleDeliveredEvidence(invoice)`.
2. Relasi harus dibuktikan melalui source/order/invoice yang benar, bukan hanya kesamaan customer atau status delivery.
3. Hindari menyimpan projection yang mudah stale; jika memakai snapshot/cache, refresh secara atomik pada perubahan delivery.
4. Buat fixture: invoice A unpaid, delivery A1 dan A2 terkait, serta delivery B unrelated.
5. Uji baseline, reverse A1, reverse A2, dan perubahan B. Cocokkan Customers, Receivables, Dashboard, serta nilai database.

**Kriteria lulus retest**

- Baseline dua related Delivered memasukkan invoice ke outstanding.
- Reverse satu related delivery tidak menghapus invoice selama related delivery lain masih Delivered.
- Reverse related delivery terakhir menghapus invoice dari proyeksi aktif.
- Delivery unrelated tidak memengaruhi hasil pada tahap mana pun.

**Keputusan / implementasi**

- Eligibility outstanding dipusatkan pada `customerInvoiceBalanceSelect` dan `getCustomerPaymentSummary`: hanya Surat Jalan `Delivered` yang benar-benar terhubung melalui invoice, delivery source, atau unique sales order yang dihitung. Projection dihitung saat baca, sehingga reversal delivery langsung tercermin tanpa cache stale; invoice Cancelled selalu dikecualikan.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026, Supabase PostgreSQL test schema.** `tests/unit/customer-intelligence.test.ts` dan `tests/integration/customer-payment-status.test.ts` membuktikan related-delivery OR semantics, unrelated control, reversal terakhir, payment, dan cancellation.

### CUS-SIT-010 — Klasifikasi payment behaviour tepat pada threshold dan histori terbatas

**Kondisi saat ini**

Dataset yang menghasilkan rasio tepat 59%, 60%, dan 61%, serta variasi histori pendek/panjang/campuran, belum tersedia.

**Kondisi seharusnya**

- Definisi invoice eligible, pembayaran on-time, pembayaran late, denominator, minimum sample, dan lookback period harus tunggal dan terdokumentasi.
- Threshold 59%, 60%, dan 61% menghasilkan label yang deterministik tanpa perbedaan antara Customer Detail dan Order Form.
- Histori yang belum memenuhi minimum sample diberi label limited/insufficient history, bukan dipaksa masuk klasifikasi normal.
- Invoice cancelled, tidak eligible, belum delivered, atau record lain di luar policy tidak masuk evidence.
- UI menampilkan jumlah sampel atau evidence yang cukup agar label dapat dijelaskan.

**Usulan perbaikan / test enablement**

1. Pusatkan kalkulasi pada pure function/domain service, bukan duplikasi di halaman berbeda.
2. Tetapkan konfigurasi eksplisit untuk threshold, minimum sample, lookback, dan rounding.
3. Gunakan pembanding integer bila memungkinkan, misalnya `onTimeCount * 100` terhadap `eligibleCount * threshold`, agar tidak ada floating-point drift.
4. Kembalikan hasil terstruktur: label, ratio, eligible count, on-time count, late count, dan reason untuk limited history.
5. Buat table-driven tests untuk 59/60/61%, zero history, short history, mixed history, serta invoice ineligible.
6. Gunakan service yang sama pada Customer Detail, Order Form insight, dan downstream consumer lain.

**Kriteria lulus retest**

- Fixture 59%, 60%, dan 61% cocok dengan policy boundary yang disepakati.
- Zero/limited history tidak menghasilkan persentase atau label yang menyesatkan.
- Invoice ineligible tidak memengaruhi numerator maupun denominator.
- Customer Detail dan Order Form menunjukkan label, ratio, dan evidence count yang sama.

**Keputusan / implementasi**

- Service canonical `getCustomerPaymentReliability` memakai settled + Delivered invoices dalam trailing 12 bulan, minimum sample 3, threshold 60%, dan pembanding integer. Zero history dan sample <3 memiliki label eksplisit tanpa persentase. Customer Detail, Order Form, dan export memakai service yang sama; indikator lama dipertegas sebagai `Order Term Preference`.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** `tests/unit/customer-payment-reliability.test.ts` (59/60/61, zero, limited, ineligible) serta focused UI/query regression lulus.

---

## Products

### PROD-SIT-004 — Top product mengabaikan quantity tidak valid dan membatasi lima hasil

**Kondisi saat ini**

Fixture yang memuat lebih dari lima produk, tie quantity, nama kosong, serta quantity nol/negatif belum tersedia. Filter transaksi eligible, batas lima hasil, dan tie-break belum dapat diverifikasi.

**Kondisi seharusnya**

- Hanya transaksi dan item yang memenuhi definisi eligible yang masuk agregasi.
- Item tanpa product reference atau tanpa nama snapshot yang dapat ditampilkan mengikuti fallback yang eksplisit; tidak boleh menghasilkan label kosong yang menyesatkan.
- Quantity nol atau negatif tidak menambah maupun mengurangi agregat top product.
- Hasil dibatasi maksimal lima produk.
- Urutan deterministik: total quantity menurun, lalu tie-break canonical yang stabil seperti product name dan product ID.
- Dashboard dan insight produk menggunakan sumber kalkulasi yang sama.

**Usulan perbaikan / test enablement**

1. Pusatkan agregasi top product pada satu query/domain service dengan predicate transaksi eligible yang terdokumentasi.
2. Filter quantity menggunakan `quantity > 0` di server/database, bukan setelah hasil ditampilkan.
3. Terapkan `orderBy` tambahan yang deterministik setelah total quantity agar pagination atau refresh tidak menukar urutan tie.
4. Tetapkan kebijakan untuk product reference nullable: gunakan snapshot name yang sah atau kelompokkan sebagai `Unknown Product`; jangan silently menggabungkan record berbeda.
5. Buat fixture minimal tujuh produk: dua tie, satu nama kosong/null, satu quantity 0, satu quantity negatif, serta transaksi eligible dan ineligible.
6. Bandingkan hasil query sumber dengan Dashboard/insight yang dirender.

**Kriteria lulus retest**

- Hanya quantity positif dari transaksi eligible yang dihitung.
- Record nol/negatif dan transaksi ineligible tidak mengubah hasil.
- Tepat maksimal lima hasil tampil.
- Tie menghasilkan urutan yang sama pada reload berulang.
- Total dan urutan Dashboard sama dengan perhitungan fixture.

**Keputusan / implementasi**

- Agregasi canonical berada di `src/lib/product-insights.ts`: hanya quantity positif yang dihitung, hasil dibatasi lima, identitas produk tidak digabung hanya karena nama sama, dan tie-break memakai total quantity, nama, lalu product ID.
- Record tanpa nama snapshot memakai fallback `Unknown Product`; source transaction tetap mengikuti predicate eligible existing.

**Hasil retest fase dua**

- **Pass (automated domain test).** `tests/unit/product-insights.test.ts` membuktikan filter quantity, maksimum lima, identitas produk, dan tie-break stabil. Rekonsiliasi visual Dashboard dengan fixture tujuh produk tetap menjadi langkah SIT manual.

### PROD-SIT-005 — Proposed price dibandingkan dengan average sold price pada seluruh kondisi

**Kondisi saat ini**

Kondisi harga di bawah average sudah terlihat benar pada satu produk. Harga sama, harga di atas average, dan produk tanpa histori eligible belum diuji pada form dan order yang tersimpan.

**Kondisi seharusnya**

- Proposed price di bawah average menampilkan selisih nominal dan persentase negatif dengan label yang benar.
- Proposed price sama dengan average menampilkan selisih nol tanpa misleading positive/negative signal.
- Proposed price di atas average menampilkan selisih nominal dan persentase positif.
- Produk tanpa histori eligible menampilkan `Average sold price unavailable` atau padanan yang jelas; sistem tidak boleh mengarang nilai nol atau persentase.
- Average, delta, dan persentase menggunakan precision serta rounding yang sama pada form, detail order, dan snapshot/evidence yang disimpan.

**Usulan perbaikan / test enablement**

1. Definisikan transaksi eligible, periode average, pembobotan berdasarkan unit, dan aturan rounding dalam satu service.
2. Gunakan kalkulasi `weighted average sold price` bila metric memang berbasis unit, bukan rata-rata sederhana antar-line.
3. Kembalikan state terstruktur: `available`, `average`, `delta`, `percentage`, dan `comparison` (`below|equal|above`).
4. Hindari pembagian dengan nol dan jangan mengubah `no evidence` menjadi average `0`.
5. Gunakan service yang sama untuk form insight dan evidence/snapshot order.
6. Buat fixture untuk nilai below, exact equal, above, no history, serta average yang menghasilkan pembulatan pecahan.

**Kriteria lulus retest**

- Empat cabang below/equal/above/unavailable tampil benar.
- Nominal delta dan percentage sesuai perhitungan canonical.
- Nilai setelah order disimpan konsisten dengan insight sebelum submit.
- Produk tanpa evidence tidak menampilkan persentase atau pembanding palsu.

**Keputusan / implementasi**

- Average sold price dihitung weighted berdasarkan subtotal/quantity dari item eligible, lalu dikembalikan sebagai state terstruktur `available`, `averageSoldPrice`, `absoluteDifference`, `percentageDifference`, dan `comparison`.
- Persentase dibulatkan satu desimal. Form menampilkan below/equal/above dan teks eksplisit `Average sold price unavailable` ketika tidak ada evidence.

**Hasil retest fase dua**

- **Pass (automated).** `tests/unit/product-insights.test.ts`, `tests/unit/sales-order-form-pricing.test.tsx`, dan `tests/integration/product-average-sold-price.test.ts` lulus untuk below/equal/above/unavailable, rendering, serta weighted average dari database.

### PROD-SIT-006 — Perubahan atau putusnya relasi produk tidak merusak item historis

**Kondisi saat ini**

Histori dengan produk Inactive masih dapat dibaca, tetapi relasi `SetNull` belum diuji pada fixture terisolasi. Keterbacaan seluruh dokumen historis dan penolakan transaksi baru belum terbukti lengkap.

**Kondisi seharusnya**

- Inquiry, order, invoice, picking, delivery, dan print lama tetap dapat dibuka setelah nama/harga master berubah, produk dinonaktifkan, atau relasi master menjadi null.
- Dokumen historis memakai snapshot saat transaksi, bukan nilai master terbaru.
- Product ID nullable tidak menyebabkan page crash, broken print, atau item hilang.
- Produk Inactive atau relasi null tidak dapat dipilih untuk transaksi baru.
- Bila pemetaan ulang diperbolehkan, perubahan harus eksplisit, terotorisasi, dan tidak mengubah snapshot dokumen yang sudah final.

**Usulan perbaikan / test enablement**

1. Pastikan line item menyimpan snapshot minimal product name/SKU, quantity, unit price, dan atribut dokumen lain yang dibutuhkan.
2. Semua renderer historis menggunakan snapshot lebih dahulu dan hanya memakai master sebagai enrichment opsional.
3. Buat komponen fallback untuk `productId = null` agar detail dan print tetap aman.
4. Filter pilihan transaksi baru ke produk Active pada UI dan validasi ulang di server saat submit.
5. Gunakan database fixture terisolasi untuk rangkaian: create transaksi → ubah master → inactive → putus relasi sesuai FK policy → buka seluruh histori/print.
6. Jangan menghapus produk hanya untuk test bila kebijakan data melarang delete; gunakan transaction rollback atau schema/database test.

**Kriteria lulus retest**

- Semua histori dan print tetap memuat item serta nilai snapshot yang sama.
- Tidak ada crash atau item hilang ketika relasi master null.
- Produk Inactive/null ditolak untuk transaksi baru tanpa record parsial.
- Master terbaru hanya berlaku pada transaksi baru yang memakai produk Active.

**Keputusan / implementasi**

- Product memiliki SKU canonical opsional; inquiry item dan order item menyimpan `itemName` serta `productSkuSnapshot`. Renderer historis tetap memakai snapshot walaupun relation nullable.
- Pembuatan inquiry/order mengambil ulang produk Active di server dan menolak payload yang mereferensikan produk inactive/hilang sebelum business row dibuat.

**Hasil retest fase dua**

- **Partial.** `tests/integration/batch-two-commercial-integrity.test.ts` membuktikan snapshot tetap terbaca setelah relation produk dibuat null, dan constraint/server guard telah aktif. Retest UI seluruh detail/print invoice, picking, dan delivery setelah master berubah masih perlu dijalankan manual.

---

## Customer Inquiries

### INQ-SIT-007 — Konversi ulang inquiry tidak membuat order duplikat

**Kondisi saat ini**

UI sudah menyembunyikan tombol Convert setelah inquiry berubah menjadi Converted dan linked order hanya satu. Direct request konversi kedua dan verifikasi database/audit belum dilakukan.

**Kondisi seharusnya**

- Inquiry hanya dapat dikonversi satu kali ke satu target order canonical.
- Menyembunyikan tombol di UI bukan pengaman utama; direct request kedua harus ditolak atau mengembalikan hasil konversi yang sama secara idempotent.
- Tidak ada order, item, nomor dokumen, relasi, atau audit sukses tambahan.
- Inquiry tetap menunjuk order pertama dan statusnya tidak mundur.

**Usulan perbaikan / test enablement**

1. Jalankan konversi dalam transaksi dan baca ulang status inquiry di dalam transaksi.
2. Gunakan state predicate seperti `status = Open/Ready` saat update; bila affected rows nol, perlakukan sebagai stale/already converted.
3. Tambahkan unique constraint atau relation invariant yang mencegah lebih dari satu order turunan canonical untuk inquiry yang sama.
4. Jika memakai idempotency key, request ulang dengan key yang sama mengembalikan hasil pertama; request berbeda setelah Converted tetap tidak boleh membuat order baru.
5. Kirim direct server request kedua dan bandingkan count order, items, relationship, sequence, serta audit sebelum/sesudah.

**Kriteria lulus retest**

- Konversi pertama menghasilkan tepat satu order lengkap.
- Direct conversion kedua tidak membuat perubahan baru.
- Inquiry tetap memiliki satu linked order dan status Converted.
- Tidak ada nomor dokumen atau audit sukses tambahan dari request kedua.

**Keputusan / implementasi**

- Konversi memakai conditional claim `id + Open + salesOrderId null + expectedUpdatedAt` di dalam transaksi yang sama dengan order, items, relation, dan audit.
- Inquiry yang sudah berubah menghasilkan domain conflict; order dari request kalah ikut rollback. Nomor yang sempat dialokasikan boleh menjadi gap dan tidak dipakai ulang.

**Hasil retest fase dua**

- **Pass (automated database concurrency).** `tests/integration/batch-two-commercial-integrity.test.ts` membuktikan hanya satu conversion commit dan inquiry tetap menunjuk satu order.

### INQ-SIT-008 — Combined delivery menyelesaikan seluruh inquiry secara atomik

**Kondisi saat ini**

Belum ada combined Surat Jalan yang menautkan beberapa inquiry sumber beserta fault injection untuk memaksa salah satu update inquiry gagal.

**Kondisi seharusnya**

- Saat combined delivery ditandai Delivered, seluruh inquiry sumber yang eligible menjadi Done dalam commit yang sama.
- Delivery tidak boleh berstatus Delivered bila hanya sebagian inquiry berhasil diperbarui.
- Jika satu update inquiry gagal, status delivery, semua inquiry, downstream projection, dan audit kembali ke state awal.
- Retry setelah penyebab kegagalan diperbaiki dapat dilakukan tanpa duplikasi event.

**Usulan perbaikan / test enablement**

1. Pindahkan update delivery, seluruh inquiry sumber, downstream refresh, dan audit ke satu database transaction.
2. Turunkan daftar inquiry dari relasi source yang canonical; jangan memperbarui berdasarkan customer atau nomor teks saja.
3. Validasi seluruh inquiry dan affected row count sebelum commit.
4. Jangan menangkap error audit/update lalu melanjutkan commit business state.
5. Tambahkan fault-injection seam khusus test pada update inquiry kedua atau audit akhir.
6. Buat fixture minimal dua inquiry yang bergabung pada satu delivery dan snapshot seluruh tabel sebelum/sesudah.

**Kriteria lulus retest**

- Jalur normal mengubah delivery dan seluruh inquiry tepat satu kali.
- Fault pada salah satu inquiry menghasilkan rollback penuh.
- Tidak ada inquiry Done parsial, audit sukses palsu, atau projection stale.
- Retry normal setelah fault menghasilkan satu hasil final yang konsisten.

**Keputusan / implementasi**

- Update delivery, seluruh inquiry sumber, dan audit menggunakan satu Prisma transaction. Daftar inquiry diturunkan dari source Sales Order canonical dan affected-row failure diteruskan sebagai rollback.

**Hasil retest fase dua**

- **Pass (automated).** `tests/integration/combined-delivery-actions.test.ts`, `tests/integration/combined-delivery-database.test.ts`, dan `tests/integration/delivery-note-atomic-audit.test.ts` lulus untuk jalur normal, multi-source, serta rollback saat item/inquiry/audit gagal.

### INQ-SIT-010 — Dua konversi bersamaan tetap idempotent

**Kondisi saat ini**

Dua sesi independen belum melakukan submit hampir bersamaan terhadap inquiry yang sama, baik dengan target sama maupun target berbeda dari tab stale.

**Kondisi seharusnya**

- Dari dua conversion request bersamaan, tepat satu request menjadi pemenang.
- Inquiry menunjuk satu order dan satu tipe target final.
- Nomor dokumen tetap unik dan tidak ada order/item/audit parsial dari request kalah.
- Request kalah menerima hasil conflict/already converted yang jelas, bukan generic error yang mendorong retry berbahaya.

**Usulan perbaikan / test enablement**

1. Gunakan optimistic concurrency dengan predicate `id + status + version/updatedAt`, atau row lock bila memang diperlukan.
2. Buat order, items, inquiry link, status, dan audit dalam satu transaksi.
3. Tambahkan unique constraint pada hubungan inquiry-ke-order dan gunakan allocator nomor yang concurrency-safe.
4. Tangani unique/stale conflict sebagai domain response yang konsisten.
5. Jalankan dua request paralel dengan cookie jar independen: target sama, lalu target berbeda.
6. Verifikasi sequence/nomor, orders, items, inquiry relation, dan audit setelah kedua promise selesai.

**Kriteria lulus retest**

- Setiap race menghasilkan tepat satu order final.
- Inquiry selalu menunjuk pemenang tunggal.
- Request kalah tidak meninggalkan order, child item, nomor, atau audit parsial.
- Behaviour stabil pada target sama maupun target berbeda.

**Keputusan / implementasi**

- Optimistic claim pada inquiry menjadi titik serialisasi. Semua child order dan audit berada dalam transaction; unique/idempotency guard pada order menjadi pertahanan tambahan.

**Hasil retest fase dua**

- **Pass (automated database race).** Dua conversion paralel pada `tests/integration/batch-two-commercial-integrity.test.ts` menghasilkan tepat satu order lengkap; request kalah tidak meninggalkan header/item/audit parsial.

### INQ-SIT-011 — Inquiry dengan produk tidak lagi tersedia gagal konversi secara aman

**Kondisi saat ini**

Inquiry historis dengan produk yang kini Inactive masih dapat dibaca, tetapi record tersebut sudah Converted. Belum ada inquiry belum Converted yang mereferensikan produk Inactive atau relasi null untuk menguji penolakan dan remapping.

**Kondisi seharusnya**

- Inquiry historis tetap dapat dibaca menggunakan snapshot meskipun produk master Inactive atau relasinya null.
- Konversi baru dengan source product yang tidak valid ditolak sebelum order, item, nomor, atau audit sukses dibuat.
- Error menjelaskan item mana yang perlu diperbaiki tanpa membocorkan detail internal.
- Jika remapping didukung, Sales dapat memilih produk Active pengganti secara eksplisit; inquiry asal dan histori perubahan tetap terlacak.
- Produk pengganti tidak boleh diam-diam mengubah snapshot inquiry lama.

**Usulan perbaikan / test enablement**

1. Pada conversion boundary, validasi ulang seluruh source item terhadap produk Active di server.
2. Pisahkan snapshot histori (`productName`, requested/agreed price, quantity) dari current product reference.
3. Tolak keseluruhan transaksi bila satu item invalid; jangan membuat order parsial.
4. Bila remapping adalah requirement, simpan mapping eksplisit per item beserta actor, timestamp, dan audit reason.
5. Buat dua fixture inquiry belum Converted: satu product Inactive dan satu `productId = null`, lalu uji reject dan remap ke produk Active.
6. Bandingkan inquiry asal sebelum/sesudah serta count order/item/audit.

**Kriteria lulus retest**

- Histori inquiry tetap terbaca lengkap pada relasi Inactive/null.
- Direct conversion dengan source invalid ditolak tanpa perubahan parsial.
- Remapping valid, jika didukung, menghasilkan satu order dengan produk Active yang dipilih.
- Inquiry asal dan snapshot historis tidak berubah diam-diam.

**Keputusan / implementasi**

- Snapshot inquiry dipisahkan dari current product reference. Conversion membaca ulang seluruh source product dan mensyaratkan relation non-null, status Active, agreed price tersedia, serta signature product/quantity/base price sama dengan source.
- Remapping diam-diam tidak didukung; perubahan produk harus dilakukan sebagai workflow terpisah bila nanti menjadi requirement.

**Hasil retest fase dua**

- **Partial.** Histori relation-null sudah terbukti pada integration test dan server guard sudah diterapkan. Direct action test khusus inquiry Open dengan produk Inactive/null serta verifikasi pesan per-item masih perlu ditambahkan/dijalankan.

---

## Sales Orders

### ORD-SIT-002 — Kuantitas atau harga tidak valid ditolak

**Kondisi saat ini**

Quantity `0` sudah ditolak oleh form, tetapi quantity negatif dan harga negatif belum disubmit sampai pemeriksaan database. Jaminan bahwa payload tampered tidak membuat order parsial belum terbukti.

**Kondisi seharusnya**

- Quantity harus berupa integer positif sesuai satuan bisnis; `0`, negatif, desimal yang tidak didukung, teks, `NaN`, dan overflow ditolak.
- Base/final unit price serta nilai moneter lain tidak boleh negatif.
- UI memberikan validasi cepat, tetapi server tetap memvalidasi ulang seluruh item.
- Satu item invalid menggagalkan seluruh order; tidak boleh ada header, item lain, nomor dokumen, tax snapshot, atau audit sukses parsial.
- Database menjadi pertahanan terakhir melalui check constraint yang sesuai.

**Usulan perbaikan / test enablement**

1. Gunakan schema validation server-side untuk quantity integer positif dan monetary value non-negative.
2. Jangan mengandalkan atribut HTML `min`; kirim payload tampered langsung ke server action/route.
3. Buat order header, items, snapshot pajak, dan audit dalam satu transaksi.
4. Tambahkan database check constraint seperti `quantity > 0` dan amount/price `>= 0` pada tabel yang relevan.
5. Buat table-driven tests untuk `0`, `-1`, desimal, string, nilai sangat besar, dan payload dengan satu item valid plus satu invalid.

**Kriteria lulus retest**

- Seluruh nilai invalid ditolak UI dan server sesuai tipe kasus.
- Tidak ada perubahan jumlah order, item, sequence, snapshot, atau audit setelah request invalid.
- Nilai batas valid tersimpan utuh dan menghasilkan total yang benar.

**Keputusan / implementasi**

- Seluruh item divalidasi sebagai satu payload: quantity integer 1–1.000.000, base unit price integer non-negative maksimal Rp1.000.000.000, serta adjustment dalam batas canonical. Satu line invalid menggagalkan seluruh payload, bukan dibuang diam-diam.
- Server menghitung ulang final price/subtotal/total. Migration `20260927130000_batch_two_commercial_integrity` menambah check constraint quantity dan amount sebagai pertahanan database.

**Hasil retest fase dua**

- **Pass (automated).** `tests/unit/order-item-pricing.test.ts` mencakup zero/negatif/pecahan/teks/overflow dan mixed valid-invalid; `tests/integration/batch-two-commercial-integrity.test.ts` membuktikan constraint database menolak quantity nol.

### ORD-SIT-004 — Credit weekly menghitung jatuh tempo

**Kondisi saat ini**

Credit 1 Week sudah menghasilkan due date +7 hari. Batas 4 Weeks dan konsistensi setelah reload/snapshot invoice belum diuji.

**Kondisi seharusnya**

- Credit Weekly hanya menerima durasi canonical 1–4 minggu.
- Due date dihitung dari issue/business date ditambah `weeks × 7` hari kalender sesuai timezone bisnis WIB.
- Nilai 1 dan 4 minggu menghasilkan +7 dan +28 hari tanpa pergeseran akibat UTC atau daylight conversion.
- Term dan due date yang disimpan pada snapshot invoice tetap sama setelah reload.
- Nilai di luar rentang, desimal, kosong, atau tipe term yang tidak cocok ditolak.

**Usulan perbaikan / test enablement**

1. Pusatkan perhitungan pada helper date-only seperti `calculateDueDate(issueDate, paymentTerm)`.
2. Hindari parsing bebas dengan `new Date(string)`; validasi tanggal dan term secara eksplisit.
3. Simpan term canonical beserta unit dan duration, lalu snapshot due date ketika invoice dibuat.
4. Gunakan controlled clock dan business timezone `Asia/Jakarta` pada integration test.
5. Uji 1, 2, 3, 4 minggu serta 0, 5, desimal, dan payload yang membawa unit term lain.

**Kriteria lulus retest**

- 1 Week = +7 hari dan 4 Weeks = +28 hari pada detail order dan invoice.
- Hasil tetap sama setelah reload, print, dan query database.
- Nilai di luar 1–4 ditolak tanpa order/invoice parsial.

**Keputusan / implementasi**

- Credit Weeks hanya menerima integer 1–4. Due date dihitung dengan penambahan fixed `weeks × 7` hari dari issue date sehingga tidak bergeser oleh DST; nomor/tahun bisnis menggunakan timezone Asia/Jakarta.
- Order dan invoice menyimpan term canonical serta due date snapshot.

**Hasil retest fase dua**

- **Pass (automated).** `tests/integration/weekly-credit-term-actions.test.ts` menjalankan 14 skenario DIRECT/Customer PO/approval untuk 1–4 minggu dan memastikan snapshot term bertahan; unit validation menolak term di luar rentang/ambigu.

### ORD-SIT-006 — Penghapusan proses aktif dan terminal mengikuti aturan

**Kondisi saat ini**

Test belum dijalankan karena kebijakan pemilik data melarang penghapusan record, termasuk data sintetis pada instance bersama. Keberadaan atau ketiadaan tombol saja tidak membuktikan proteksi server dan relasi.

**Kondisi seharusnya**

- Matriks lifecycle harus menentukan dengan jelas status mana yang boleh hard delete, cancel, archive, atau sama sekali tidak boleh diubah.
- Order yang sudah memiliki invoice, payment, picking, delivery, atau evidence historis tidak boleh menghasilkan orphan atau kehilangan audit trail.
- Terminal record harus tetap tersedia untuk histori, reconciliation, print, dan audit sesuai retention policy.
- Direct delete request terhadap status terlarang ditolak server-side.
- Jika Draft tertentu boleh dihapus, seluruh child yang memang disposable dan audit penghapusan diproses atomik sesuai policy.

**Usulan perbaikan / test enablement**

1. Tetapkan transition/delete matrix sebagai policy server tunggal; jangan menyebarkan kondisi status di banyak UI.
2. Pertimbangkan `Cancel` atau `Archive` sebagai default setelah order memiliki downstream document; batasi hard delete pada Draft sintetis yang belum memiliki relasi.
3. Gunakan foreign key `Restrict/Cascade/SetNull` berdasarkan retention requirement, bukan cleanup manual yang rawan orphan.
4. Selalu periksa eligibility delete di transaksi dan tulis audit dengan actor/reason.
5. Jalankan destructive test hanya di database/schema terisolasi dengan rollback otomatis; jangan menghapus data demo.
6. Uji direct request untuk setiap status, bukan hanya tombol UI.

**Kriteria lulus retest**

- Behaviour setiap Draft/Unpaid/Partial/Overdue/Completed/Cancelled cocok dengan matrix yang disepakati.
- Status terlarang ditolak tanpa perubahan pada order, relasi, atau audit sukses palsu.
- Status yang diizinkan diproses atomik dan tidak meninggalkan orphan.
- Histori terminal tetap dapat dibaca sesuai retention policy.

**Keputusan / implementasi**

- Hard delete hanya diizinkan untuk Sales Order `Draft` disposable tanpa invoice, picking list, inquiry link, direct/combined delivery. Seluruh state lain ditolak dan histori dipertahankan; cancel/archive tetap workflow terpisah.
- Eligibility dicek ulang di dalam transaction; delete dan audit commit/rollback bersama.

**Hasil retest fase dua**

- **Pass (automated isolated fixture).** `tests/unit/sales-order-deletion.test.ts` membuktikan matrix policy dan `tests/integration/sales-order-deletion.test.ts` membuktikan Draft disposable terhapus tanpa orphan sementara order ber-invoice tetap ada setelah direct delete request.

### ORD-SIT-007 — Insight customer dan produk pada form order konsisten

**Kondisi saat ini**

Satu customer Clean/Rp0 dan satu produk dengan average sold price sudah diamati. Customer dengan outstanding dan produk dengan histori berbeda belum direkonsiliasi terhadap sumber invoice, payment, dan order.

**Kondisi seharusnya**

- Customer insight pada form menunjukkan outstanding, payment behaviour, dan status lain dari scope serta periode canonical.
- Product insight memakai average sold price, jumlah unit, dan evidence eligibility yang sama dengan halaman sumber.
- Pergantian customer/product memperbarui insight dan tidak meninggalkan state pilihan sebelumnya.
- Record tanpa evidence menampilkan kondisi unavailable/limited, bukan angka buatan.
- Nilai insight yang relevan untuk keputusan order dapat ditelusuri atau disnapshot sesuai requirement.

**Usulan perbaikan / test enablement**

1. Gunakan domain service yang sama untuk Customer Detail, Product Insight, dan form Sales Order.
2. Hindari kalkulasi ulang yang berbeda di client; client hanya merender structured result dari server.
3. Pastikan request insight mengikuti authorization/portfolio scope current user.
4. Tambahkan cache key yang mencakup customer/product dan invalidasi setelah payment, delivery, atau order baru.
5. Siapkan fixture customer Clean, Unpaid, Partial/Overdue, limited history serta produk dengan high/low/no history.
6. Cocokkan nilai form dengan query sumber dan nilai sesudah pergantian pilihan berulang.

**Kriteria lulus retest**

- Seluruh customer/product fixture menampilkan nilai yang cocok dengan sumber.
- Tidak ada insight stale setelah mengganti pilihan atau setelah transaksi sumber berubah.
- Record tanpa histori menampilkan unavailable/limited dengan benar.
- Sales tidak dapat memperoleh insight portfolio lain melalui direct request.

**Keputusan / implementasi**

- Product insight memakai service weighted-average terstruktur yang sama dengan form. Customer insight memakai query payment-behaviour/outstanding canonical dan seluruh lookup mengikuti portfolio scope dari Batch 1.
- State tanpa histori dirender sebagai unavailable/limited, bukan angka pembanding palsu.

**Hasil retest fase dua**

- **Pass (automated).** `tests/integration/order-form-insights.test.ts`, `tests/integration/customer-payment-behaviour.test.ts`, `tests/integration/product-average-sold-price.test.ts`, serta `tests/unit/sales-order-form-pricing.test.tsx` lulus.

### ORD-SIT-010 — Kombinasi termin ambigu ditolak dan Immediate membersihkan durasi

**Kondisi saat ini**

Perpindahan Credit 4 Weeks ke Immediate sudah membersihkan durasi pada UI dan menghasilkan invoice dengan issue date sama dengan due date. Payload tampered yang mengirim durasi minggu dan bulan sekaligus belum diuji.

**Kondisi seharusnya**

- Payment term merupakan tagged union: `Immediate`, `CreditWeeks`, atau `CreditMonths` dengan field yang hanya relevan untuk tipe tersebut.
- Payload yang membawa week dan month sekaligus, duration tersembunyi pada Immediate, atau kombinasi tipe/value lain yang ambigu ditolak.
- Saat user mengganti Credit menjadi Immediate, seluruh duration lama dibersihkan di client dan server.
- Snapshot order/invoice hanya menyimpan term canonical; field tersembunyi tidak memengaruhi due date.

**Usulan perbaikan / test enablement**

1. Gunakan discriminated-union validation pada server berdasarkan `paymentTermType`.
2. Untuk Immediate, abaikan hanya field yang benar-benar tidak dikirim oleh form normal; payload eksplisit yang kontradiktif sebaiknya ditolak agar tampering terlihat.
3. Normalisasi object yang akan disimpan: Immediate memiliki duration `null`, Credit Weeks hanya weeks, dan Credit Months hanya months.
4. Tambahkan database constraint yang mencegah kombinasi field term invalid bila schema menyimpan field terpisah.
5. Kirim matrix payload tampered langsung ke action dan bandingkan order/invoice sebelum-sesudah.

**Kriteria lulus retest**

- Credit → Immediate menghasilkan duration null dan due date sama dengan issue date.
- Week + month, Immediate + duration, dan unit/value mismatch ditolak server-side.
- Tidak ada order, invoice, atau audit sukses parsial dari payload ambigu.

**Keputusan / implementasi**

- Parser server menerapkan discriminated union: Immediate harus tanpa duration; Credit harus membawa tepat satu representasi weeks atau months. Weeks dibatasi 1–4 dan months 1–12.
- Migration menambah check constraint bentuk payment term pada Sales Order; snapshot invoice dibuat dari nilai canonical.

**Hasil retest fase dua**

- **Pass (automated).** `tests/unit/order-item-pricing.test.ts` menguji Immediate+duration, week+month, mismatch, dan boundary; `tests/integration/weekly-credit-term-actions.test.ts` membuktikan nilai valid bertahan pada order/invoice.

### ORD-SIT-011 — Penomoran order memilih sequence tertinggi tanpa menggunakan ulang nomor

**Kondisi saat ini**

Nomor sintetis tahun 2026 terlihat berurutan pada alur normal. Nomor malformed, prefix/tahun lain, gap, non-reuse, dan pergantian tahun belum diuji. Membuat gap dengan menghapus data pada instance bersama tidak diperbolehkan.

**Kondisi seharusnya**

- Nomor order unik dalam scope prefix/tahun yang ditentukan.
- Nomor malformed dan prefix/tahun lain tidak memengaruhi sequence canonical.
- Nomor yang sudah pernah dialokasikan tidak digunakan ulang meskipun order dibatalkan atau record test dihapus pada lingkungan terisolasi.
- Pergantian tahun mengikuti policy reset/continuation yang eksplisit.
- Allocation aman terhadap retry dan concurrency.

**Usulan perbaikan / test enablement**

1. Gunakan tabel counter/sequence khusus per document type dan tahun, bukan `MAX(number) + 1` dari string dokumen.
2. Alokasikan nomor dalam transaksi dengan row lock, atomic increment, atau mekanisme database sequence yang setara.
3. Simpan unique constraint pada nomor final sebagai pertahanan terakhir.
4. Jangan menurunkan counter ketika order dihapus/cancel; gap diperbolehkan dan nomor tidak dipakai ulang.
5. Pisahkan parser nomor legacy/malformed dari allocator baru.
6. Uji fixture malformed, prefix/tahun lain, gap, rollover tahun, dan retry hanya pada database terisolasi atau transaction rollback.

**Kriteria lulus retest**

- Nomor baru mengikuti allocator canonical dan tidak dipengaruhi malformed/prefix lain.
- Gap tidak digunakan ulang.
- Rollover tahun sesuai policy yang disepakati.
- Semua nomor tetap unik pada reload dan database.

**Keputusan / implementasi**

- Nomor memakai tabel `document_sequences` dengan key `(document_type, year)` dan atomic upsert/increment. Sequence terpisah untuk SO/PO/INV/INQ/SJ, reset per tahun kalender Asia/Jakarta, tidak pernah diturunkan, dan gap diperbolehkan.
- Migration menginisialisasi counter dari nomor legacy canonical dan mengabaikan nomor malformed/prefix/tahun lain.

**Hasil retest fase dua**

- **Pass (automated database).** `tests/integration/batch-two-commercial-integrity.test.ts` membuktikan allocation paralel unik serta gap tidak digunakan ulang; `tests/unit/document-numbering.test.ts` membuktikan parsing legacy, prefix/tahun, dan rollover WIB.

### ORD-SIT-012 — Pembuatan order paralel menghasilkan nomor unik dan transaksi lengkap

**Kondisi saat ini**

Belum ada dua sesi Sales independen yang menyimpan order pada waktu hampir bersamaan. Keunikan nomor dan rollback konflik belum dibuktikan.

**Kondisi seharusnya**

- Dua request valid yang bersamaan dapat sama-sama sukses dengan nomor berbeda, atau satu gagal/retry secara aman sesuai policy.
- Setiap order yang sukses memiliki header, seluruh item, total, tax snapshot, ownership, dan audit yang lengkap.
- Tidak ada header tanpa item, item yatim, nomor duplikat, sequence rollback yang digunakan ulang, atau audit parsial.
- Client menerima hasil conflict/retry yang jelas dan tidak melakukan duplicate submit tanpa idempotency.

**Usulan perbaikan / test enablement**

1. Gunakan allocator nomor concurrency-safe seperti pada ORD-SIT-011.
2. Bungkus allocation, header, items, totals/tax snapshot, inquiry/PO relation, dan audit dalam satu transaksi.
3. Tambahkan idempotency key atau duplicate-submit token per form submission.
4. Pertahankan unique constraint nomor dan mapping idempotency key.
5. Tangani serialization/unique conflict dengan retry terbatas hanya untuk allocation yang aman.
6. Jalankan parallel integration test dengan dua Sales cookie jar dan inspeksi seluruh child table.

**Kriteria lulus retest**

- Dua submit paralel tidak pernah menghasilkan nomor sama.
- Setiap order sukses lengkap dan dapat dibuka ulang.
- Request yang kalah/retry tidak meninggalkan header, item, sequence reuse, atau audit parsial.
- Mengirim ulang request dengan idempotency key yang sama tidak membuat order kedua.

**Keputusan / implementasi**

- Form mengirim idempotency key unik; database memberi unique constraint dan action mengembalikan order existing hanya untuk actor/source yang sama. Nomor dialokasikan atomik dan business row/items/snapshot/audit dibuat dalam satu transaction.
- Allocation dapat meninggalkan gap bila transaksi bisnis gagal; nomor tidak dipakai ulang. Unique conflict idempotency diarahkan ke hasil pertama.

**Hasil retest fase dua**

- **Partial.** Concurrency allocator dan transactional conversion sudah lulus di `tests/integration/batch-two-commercial-integrity.test.ts`; action integration DIRECT/Customer PO juga lulus. Race dua request `createSalesOrder` penuh dengan cookie jar independen dan retry key identik masih perlu dijalankan sebagai SIT HTTP/E2E.

### ORD-SIT-013 — Process tabs, filter, pagination, dan export tetap selaras

**Kondisi saat ini**

Empat export bucket menunjukkan 41 nomor SO unik tanpa tumpang tindih. Kombinasi search, filter, sort, pagination, serta export hasil terfilter belum diuji end-to-end.

**Kondisi seharusnya**

- Setiap order masuk tepat satu process bucket canonical sesuai source dan lifecycle state.
- Search, filter, dan sort berlaku sebelum pagination.
- Next/Previous mempertahankan seluruh query state dan menggunakan order/tie-break stabil agar record tidak hilang atau duplikat.
- Export memakai predicate dan scope yang sama dengan tabel terfilter, bukan seluruh dataset diam-diam.
- Count/agregat UI, row export, dan query sumber merekonsiliasi.

**Usulan perbaikan / test enablement**

1. Pusatkan parser query dan pembentuk `where/orderBy` untuk table serta export.
2. Definisikan bucket dengan predicate yang mutually exclusive dan tested.
3. Tambahkan stable tie-breaker ID pada setiap sort; untuk cursor pagination, sertakan seluruh sort key yang diperlukan.
4. Pertahankan parameter search/filter/sort pada link pagination dan export.
5. Terapkan authorization/portfolio scope sebelum count, list, dan export.
6. Buat dataset lebih dari satu halaman yang mencakup seluruh bucket, term, customer, tanggal, dan nilai tie.
7. Jalankan matrix kombinasi dan bandingkan ordered IDs pada semua page dengan IDs pada export.

**Kriteria lulus retest**

- Tidak ada order yang hilang atau muncul di dua bucket.
- Filter/sort tetap sama setelah pindah halaman dan kembali.
- Gabungan IDs seluruh page sama dengan IDs export terfilter.
- Count/agregat cocok dengan database dan scope role.

**Keputusan / implementasi**

- List, count, dan export memakai `src/lib/sales-order-query.ts` yang sama untuk source, portfolio scope, process bucket, search, payment term, dan date range.
- Bucket approval/ongoing/done mutually exclusive; ordering stabil memakai `createdAt desc, id desc`. Pagination dan export meneruskan query allowlist yang sama.

**Hasil retest fase dua**

- **Partial.** `tests/unit/sales-order-query.test.ts` dan `tests/unit/sales-order-export.test.ts` membuktikan predicate/bucket shared dan filter export. Rekonsiliasi ordered IDs lintas lebih dari satu page terhadap file XLSX masih perlu SIT dataset-volume/E2E.

### PRICE-SIT-001 — Markup dan discount membentuk Final Unit Price

**Kondisi saat ini**

Contoh valid Base Rp1.200.000, markup 10%, dan discount 5% menghasilkan Final Unit Price Rp1.260.000 serta subtotal dua unit Rp2.520.000. Nilai persentase negatif dan di luar batas belum diuji.

**Kondisi seharusnya**

- Formula canonical harus terdokumentasi dan sama di UI, server, database snapshot, detail, invoice, serta print.
- Berdasarkan evidence saat ini, formula yang dipakai adalah `base × (1 + markup% - discount%)`; perubahan formula harus menjadi keputusan bisnis eksplisit.
- Persentase negatif, non-numeric, di luar batas, atau kombinasi yang menghasilkan harga akhir negatif ditolak.
- Perhitungan uang menggunakan integer Rupiah atau decimal-safe arithmetic dengan aturan rounding yang jelas.
- Client preview tidak menjadi sumber kebenaran; server menghitung ulang dari input canonical.

**Usulan perbaikan / test enablement**

1. Pusatkan kalkulasi pada pure function, misalnya `calculateFinalUnitPrice(base, markupBps, discountBps)`.
2. Representasikan persentase sebagai basis points/integer untuk menghindari floating-point drift.
3. Tetapkan rentang markup dan discount serta apakah discount boleh melampaui markup/base.
4. Hitung ulang subtotal dan order total di server; jangan menerima final price/subtotal dari client tanpa verifikasi.
5. Validasi dengan database constraints untuk amount non-negative.
6. Uji 0%, batas maksimum, negatif, lebih dari batas, pecahan yang membutuhkan rounding, dan payload tampered.

**Kriteria lulus retest**

- Contoh valid menghasilkan Rp1.260.000 dan subtotal Rp2.520.000 secara konsisten setelah reload.
- Semua consumer menampilkan nilai dan rounding yang sama.
- Input invalid ditolak tanpa order/item/audit parsial.
- Payload final price/subtotal yang ditamper tidak mengubah hasil server.

**Keputusan / implementasi**

- Formula dikunci mengikuti evidence: `base × (1 + markup - discount)`. Markup/discount diproses sebagai integer basis points dengan rentang 0–10.000 bps (0–100%); final price dibulatkan ke integer Rupiah dan tidak boleh negatif/overflow.
- Client `finalUnitPrice` diabaikan sebagai sumber kebenaran; server menghitung ulang final unit price, subtotal, dan total. Kolom legacy bernama `markupPercent`/`discountPercent` tetap menyimpan whole-percent untuk kompatibilitas schema existing.

**Hasil retest fase dua**

- **Pass (automated).** `tests/unit/order-item-pricing.test.ts` membuktikan contoh Rp1.200.000 +10% −5% = Rp1.260.000, subtotal dua unit Rp2.520.000, tampered final diabaikan, serta negative/out-of-range/overflow ditolak.

---

## Customer Purchase Orders

### DOC-SIT-001 — Upload dan download dokumen PO aman

**Kondisi saat ini**

Upload PDF sintetis berhasil dan detail menampilkan tautan canonical. Download diblokir oleh browser test dengan `ERR_BLOCKED_BY_CLIENT`, sehingga isi attachment, endpoint legacy, akses tanpa login, serta request/path tidak aman belum terverifikasi.

**Kondisi seharusnya**

- File yang memenuhi allowlist tipe, ukuran, dan signature dapat diunggah oleh user yang berhak.
- Nama file untuk display dipisahkan dari storage key; input pengguna tidak boleh menentukan filesystem/storage path.
- Download canonical dan legacy menerapkan authentication, role, dan portfolio scope yang sama.
- Request tanpa session, lintas portfolio, ID tidak dikenal, path traversal, dan storage key tampered ditolak tanpa membocorkan lokasi internal.
- Respons download mengirim attachment yang benar dengan `Content-Type`, `Content-Length`, dan `Content-Disposition` yang aman.
- Endpoint legacy, bila masih didukung, mengarah ke resource canonical yang sama dan tidak menjadi jalan bypass authorization.

**Usulan perbaikan / test enablement**

1. Validasi extension, MIME, magic bytes/signature, ukuran maksimum, dan empty file pada server.
2. Buat storage key dari ID acak/server-generated; sanitize display filename dan jangan menggabungkan input nama file ke path lokal.
3. Simpan metadata file dan relasi PO dalam transaksi atau workflow kompensasi agar kegagalan upload/database tidak meninggalkan orphan.
4. Pusatkan authorization dokumen pada helper yang memeriksa current user dan scope PO sebelum membaca object.
5. Implementasikan legacy endpoint sebagai redirect atau thin wrapper menuju handler canonical yang sama.
6. Retest download melalui HTTP client/integration test, bukan browser yang memblokir attachment; bandingkan status, headers, byte length, dan hash file.
7. Uji tanpa cookie, role salah, cross-portfolio ID, `../`, encoded traversal, content-type palsu, oversized file, dan file non-PDF.

**Kriteria lulus retest**

- PDF valid dapat diunggah dan hash hasil download sama dengan file sumber.
- Canonical dan legacy menghasilkan file/authorization yang identik atau legacy melakukan redirect aman ke canonical.
- Seluruh request unauthorized/tampered ditolak tanpa byte file atau path internal bocor.
- Upload invalid tidak meninggalkan metadata, object storage, PO, order, atau audit sukses parsial.

**Keputusan / implementasi**

- Upload dibatasi PDF non-empty maksimal 8 MiB dan wajib lolos extension, MIME, serta magic bytes `%PDF-`. Nama display disanitasi; storage key selalu `customer-purchase-orders/{UUID}.pdf` dan tidak berasal dari input user.
- Metadata menyimpan size dan SHA-256. Route canonical memeriksa session/portfolio, pola key, size/hash object, lalu mengirim header attachment aman; route legacy hanya menjadi thin wrapper handler canonical. Upload yang sudah terjadi dikompensasi dengan delete bila transaksi database gagal.

**Hasil retest fase dua**

- **Partial.** `tests/unit/customer-po-document.test.ts` lulus untuk valid/fake/empty/oversized PDF; `tests/integration/naming-endpoints.test.ts` lulus untuk handler canonical/legacy dan header termasuk `Content-Length`. Round-trip HTTP terhadap Supabase Storage nyata, cross-portfolio request, serta perbandingan hash sumber-download masih perlu SIT terpisah.

### PO-SIT-001 — Metadata wajib Customer PO divalidasi

**Kondisi saat ini**

Required date kosong dan dokumen kosong sudah ditolak oleh UI. Cabang Customer PO Number kosong tidak dapat diuji karena aplikasi membuat nomor tersebut secara otomatis dan form tidak menyediakan input nomor.

**Kondisi seharusnya**

- Product required date dan dokumen yang diwajibkan harus divalidasi di UI dan server.
- Required date harus berupa tanggal valid sesuai policy bisnis dan tidak boleh dinormalisasi diam-diam dari tanggal kalender yang tidak ada.
- Dokumen harus lolos policy upload pada DOC-SIT-001.
- Nomor internal yang dibuat aplikasi harus selalu terisi, unik, dan tidak dapat dimanipulasi client.
- Jika bisnis membutuhkan nomor PO eksternal milik customer, field tersebut harus dipisahkan secara semantik dari nomor internal aplikasi dan memiliki aturan wajib/unik yang tersendiri.
- Satu field invalid menggagalkan seluruh PO/order, item, file metadata, nomor, dan audit.

**Usulan perbaikan / test enablement**

1. Putuskan model nomor terlebih dahulu:
   - **Opsi A — nomor internal otomatis:** revisi testcase agar tidak menguji input nomor kosong; uji allocator menghasilkan nomor non-empty dan unik.
   - **Opsi B — nomor PO customer:** tambahkan field `customerPoNumber` terpisah, tampilkan pada form/detail/print, lalu validasi required dan canonical uniqueness sesuai requirement.
2. Gunakan schema validation server-side untuk required date, document metadata, serta field nomor yang dipilih.
3. Jangan menerima internal PO number dari client bila nomor adalah server-generated.
4. Bungkus alokasi nomor, order/PO, items, file metadata, dan audit dalam transaksi/workflow atomik.
5. Tambahkan direct-request tests yang melewati HTML `required` agar server validation terbukti.

**Kriteria lulus retest**

- Required date dan dokumen kosong/invalid ditolak UI dan server tanpa record parsial.
- Nomor internal selalu dibuat server-side dan tidak kosong.
- Bila customer PO number dipilih sebagai requirement, kosong/whitespace ditolak dan nilai valid bertahan setelah reload.
- Expected result Sheet diperbarui agar sesuai keputusan model nomor.

**Keputusan / implementasi**

- Model dikunci ke **nomor internal otomatis**; `customerPoNumber` dibuat server-side oleh counter PO dan tidak diterima dari client. Tidak ada field nomor eksternal baru karena belum ada requirement canonical.
- Required date harus lolos parser tanggal, dokumen harus lolos policy DOC-SIT-001, dan kegagalan salah satu field menghentikan pembuatan business row. Object yang telanjur di-upload dibersihkan jika database gagal.

**Hasil retest fase dua**

- **Partial.** Jalur Customer PO valid lulus di `tests/integration/weekly-credit-term-actions.test.ts`; file validator dan allocator lulus pada unit/database test. Direct action matrix untuk required date kosong/kalender invalid dan storage compensation fault masih perlu ditambah sebagai test khusus.

### PO-SIT-003 — Route canonical dan legacy membuka Customer PO yang sama

**Kondisi saat ini**

Route `/pre-orders` sudah mengarah ke `/customer-purchase-orders` dan mempertahankan query. Dokumen dari endpoint canonical dan legacy belum dibandingkan pada tingkat byte, header, dan authorization.

**Kondisi seharusnya**

- Bookmark/list/detail legacy mengarah ke resource canonical yang sama tanpa kehilangan ID dan query parameter yang didukung.
- Redirect menggunakan status yang sesuai dan tidak membuat loop.
- Endpoint dokumen legacy tidak memiliki policy authorization yang lebih lemah daripada canonical.
- Kedua jalur memberikan attachment yang sama, atau legacy melakukan redirect langsung ke endpoint canonical.
- Error untuk unauthenticated, unauthorized, not found, dan invalid ID konsisten serta tidak membocorkan metadata resource.

**Usulan perbaikan / test enablement**

1. Definisikan satu mapping legacy-to-canonical dan gunakan helper redirect bersama.
2. Pertahankan hanya query allowlist; jangan meneruskan parameter arbitrer yang dapat mengubah target atau header.
3. Hindari duplikasi implementasi download. Legacy endpoint sebaiknya memanggil handler/service canonical atau melakukan redirect aman.
4. Gunakan authorization helper yang sama sebelum file metadata/object dibaca.
5. Buat integration test untuk list, detail, query, document download, tanpa session, dan cross-portfolio access.
6. Bandingkan final URL, status, headers, size, dan hash attachment canonical versus legacy.

**Kriteria lulus retest**

- Legacy list/detail sampai pada PO canonical yang sama dan mempertahankan query yang didukung.
- Dokumen canonical/legacy identik atau redirect legacy menuju canonical secara aman.
- Authorization dan error behaviour sama pada kedua jalur.
- Tidak ada open redirect, route loop, atau bypass melalui parameter legacy.

**Keputusan / implementasi**

- Compatibility route `/pre-orders` tetap mengarah ke resource Customer PO canonical. Endpoint dokumen legacy memanggil handler canonical yang sama, sehingga authentication, portfolio scope, validasi key, verifikasi integrity, dan headers tidak memiliki implementasi kedua.

**Hasil retest fase dua**

- **Pass (automated route layer).** `tests/integration/naming-endpoints.test.ts` membuktikan redirect/list compatibility serta canonical dan legacy document handler memakai resource/header yang sama. Download browser manual tetap opsional karena test memakai handler HTTP langsung.

### PO-SIT-005 — Customer PO Number duplikat ditolak termasuk saat submit paralel

**Kondisi saat ini**

Testcase meminta dua sesi mengirim Customer PO Number canonical yang sama, tetapi nomor saat ini dibuat otomatis dan tidak dapat ditentukan melalui form. Race duplikat dan rollback order/file/audit belum dapat diuji sesuai langkah yang tertulis.

**Kondisi seharusnya**

- Nomor internal aplikasi selalu unik pada concurrent creation.
- Jika terdapat nomor PO eksternal customer, aturan uniqueness harus memiliki scope yang jelas, misalnya global atau per customer, serta canonicalization yang terdokumentasi.
- Dari dua request yang bersaing pada key unik yang sama, maksimal satu commit.
- Request kalah tidak meninggalkan order, items, nomor, file/object, metadata, atau audit sukses parsial.
- Conflict dikembalikan sebagai domain error yang jelas dan aman untuk retry.

**Usulan perbaikan / test enablement**

1. Selaraskan testcase dengan keputusan PO-SIT-001:
   - **Nomor internal otomatis:** ubah fokus menjadi dua creation paralel menghasilkan dua nomor internal berbeda dan lengkap.
   - **Nomor eksternal customer:** kirim dua request dengan `customerPoNumber` canonical sama dan verifikasi satu ditolak.
2. Gunakan unique constraint database pada key canonical yang dipilih; pre-check hanya untuk UX.
3. Untuk nomor internal, gunakan allocator/counter concurrency-safe, bukan `MAX + 1` tanpa lock.
4. Canonicalize nomor eksternal secara eksplisit, misalnya trim dan policy casing, sebelum unique comparison.
5. Masukkan PO/order, items, document metadata, dan audit ke dalam satu transaction boundary; gunakan cleanup/compensation untuk object storage jika diperlukan.
6. Jalankan parallel integration test dengan dua Sales cookie jar dan periksa seluruh table/storage setelah kedua request selesai.

**Kriteria lulus retest**

- Nomor internal tidak pernah duplikat pada parallel creation.
- Jika nomor eksternal diterapkan, dua nilai canonical sama menghasilkan tepat satu record.
- Request kalah tidak meninggalkan header, item, file, metadata, nomor, atau audit parsial.
- Akun pemenang dapat membuka PO dan mengunduh dokumennya secara lengkap.

**Keputusan / implementasi**

- Karena nomor adalah internal otomatis, testcase direvisi: dua creation paralel harus mendapat dua nomor PO berbeda. Unique constraint `customerPoNumber` tetap menjadi pertahanan terakhir dan allocator `(PO, year)` memakai atomic increment.
- Kegagalan business transaction tidak menurunkan counter; storage object baru dikompensasi agar tidak orphan.

**Hasil retest fase dua**

- **Partial.** Concurrency counter database sudah terbukti unik/non-reuse pada `tests/integration/batch-two-commercial-integrity.test.ts`. Dua Customer PO penuh paralel dengan dua upload nyata belum dijalankan melalui HTTP/E2E.

### PO-SIT-006 — Required date dan metadata PO bertahan setelah edit dan proses hilir

**Kondisi saat ini**

Metadata PO sintetis bertahan setelah invoice, picking, dan Surat Jalan. Namun PO tersebut tidak pernah diedit ketika Draft, sehingga perbandingan nilai awal-versus-revisi dan penggunaan snapshot terbaru pada seluruh detail/print belum terbukti.

**Kondisi seharusnya**

- Field yang boleh diedit pada Draft memiliki allowlist yang jelas dan tersimpan setelah reload.
- Setelah Confirmed atau downstream document terbentuk, metadata yang harus immutable tidak dapat diubah diam-diam.
- Invoice, picking, Surat Jalan, detail, dan print menggunakan source terbaru atau snapshot pada transition point yang telah ditentukan.
- Nomor internal Sales Order, nomor internal PO, dan nomor PO eksternal customer—jika ada—tetap terpisah dan berlabel jelas.
- Edit dan audit commit bersama; stale edit tidak menimpa perubahan yang lebih baru.

**Usulan perbaikan / test enablement**

1. Definisikan lifecycle ownership setiap field: editable pada Draft, snapshot saat Confirm/Invoice, atau selalu berasal dari source.
2. Gunakan whitelist update server-side; abaikan bukan berarti aman—field terlarang yang dikirim sebaiknya ditolak.
3. Tambahkan optimistic concurrency melalui `version` atau `updatedAt` pada edit Draft.
4. Simpan snapshot yang diperlukan downstream, termasuk required date, document reference, customer PO number, dan identitas terkait.
5. Pastikan renderer detail/print mengambil nilai dari source atau snapshot yang benar, bukan campuran tidak konsisten.
6. Buat fixture Draft dengan nilai awal, edit ke nilai baru, reload, lanjutkan hingga invoice/picking/delivery, lalu bandingkan seluruh tampilan dan database.

**Kriteria lulus retest**

- Nilai edit Draft bertahan setelah reload dan audit mencatat perubahan.
- Seluruh downstream consumer memakai nilai terbaru sesuai snapshot policy.
- Edit setelah lock point ditolak tanpa perubahan parsial.
- Nomor PO dan nomor SO tidak tertukar pada detail, print, atau export.
- Stale edit menghasilkan conflict dan tidak menimpa versi terbaru.

**Keputusan / implementasi**

- Draft Customer PO tanpa invoice/picking/delivery boleh mengubah hanya `requiredDate` dan optional replacement PDF. Update memakai exact `version`, menaikkan version, dan menulis audit dalam transaction yang sama.
- Lock point adalah saat status bukan Draft atau saat downstream invoice/picking/delivery sudah ada. Setelah replacement berhasil, object lama dihapus; bila database gagal, object baru dibersihkan.

**Hasil retest fase dua**

- **Partial.** Server action, optimistic concurrency, allowlist UI, metadata integrity, dan cleanup workflow sudah diterapkan. Integration test khusus edit Draft → stale edit → lock setelah downstream → verifikasi seluruh print/detail masih perlu ditambahkan sebelum testcase dinyatakan Pass penuh.

---

## Approvals

### APR-SIT-005 — Keputusan ganda atau stale ditolak

**Kondisi saat ini**

Dua tab dengan session Manager yang sama sudah membuktikan keputusan kedua dari tab stale ditolak dan invoice tetap satu. Race menggunakan dua session Manager independen belum diuji.

**Kondisi seharusnya**

- Order Pending Approval hanya menerima satu keputusan final.
- Setelah Approve atau Reject pertama commit, request kedua—baik keputusan sama maupun berlawanan—ditolak sebagai stale/already decided.
- Approve menghasilkan maksimal satu invoice; Reject tidak menghasilkan invoice.
- Request kalah tidak menambah decision note, nomor invoice, child record, atau audit sukses.
- Respons conflict menjelaskan bahwa state sudah berubah tanpa membocorkan data session lain.

**Usulan perbaikan / test enablement**

1. Gunakan conditional update pada `id + PendingApproval + version/updatedAt`, atau row lock dalam transaction.
2. Masukkan decision, status order, invoice bila Approve, note, dan audit dalam satu transaksi.
3. Tambahkan unique constraint invoice per order sebagai pertahanan terakhir.
4. Jangan menggunakan state yang dibaca saat page render sebagai sumber kebenaran saat submit.
5. Jalankan race dengan dua cookie jar Manager independen untuk Approve/Approve, Approve/Reject, dan Reject/Reject.

**Kriteria lulus retest**

- Setiap race memiliki tepat satu keputusan pemenang.
- Approve menghasilkan tepat satu invoice; Reject tidak menghasilkan invoice.
- Request stale tidak mengubah order, notes, invoice, sequence, atau audit.
- Hasil akhir konsisten setelah reload dari kedua session.

**Keputusan / implementasi**

- Submit membawa `expectedVersion`; action mengambil row lock, membaca ulang state, lalu melakukan conditional update `Pending + Draft + version`. Unique invoice-per-order tetap menjadi pertahanan terakhir. Request kalah menerima conflict tanpa invoice/audit sukses.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** `sales-order-approval-actions.test.ts` menguji stale loser; `batch-three-approval-atomicity.test.ts` membuktikan retry menghasilkan satu keputusan/invoice.

### APR-SIT-006 — Hanya Manager dapat memutuskan approval

**Kondisi saat ini**

Sales tidak melihat tombol keputusan dan Manager berhasil melakukan Reject. Direct Approve/Reject request sebagai Sales dan Admin belum dikirim, sehingga authorization backend belum terbukti.

**Kondisi seharusnya**

- Hanya role Manager yang dapat melakukan Approve atau Reject sesuai policy.
- Sales/Admin tetap ditolak walaupun memanggil server action atau endpoint secara langsung.
- Authorization dilakukan sebelum pembacaan detail sensitif dan sebelum mutation/audit bisnis.
- Penolakan tidak mengubah status, note, invoice, sequence, atau audit sukses.
- UI hanya merefleksikan policy; UI bukan pengaman utama.

**Usulan perbaikan / test enablement**

1. Panggil guard server-only seperti `requireRole('MANAGER')` pada satu boundary keputusan canonical.
2. Hindari memiliki action alternatif/legacy yang melewati guard yang sama.
3. Validasi current user masih Active dan scope order dapat diakses sebelum keputusan.
4. Kirim direct request dengan cookie Sales, Admin, tanpa session, dan Manager sebagai kontrol.
5. Snapshot order, invoice, notes, sequence, dan audit sebelum/sesudah setiap request.

**Kriteria lulus retest**

- Sales, Admin, dan unauthenticated request ditolak server-side.
- Tidak ada mutation atau audit bisnis sukses dari request tidak sah.
- Manager dapat mengambil keputusan valid tepat satu kali.

**Keputusan / implementasi**

- Boundary `decideSalesOrderApproval` memanggil `requireCurrentUser` lalu menolak semua role selain `MANAGER` sebelum membaca order atau menulis mutation/audit. Session inactive ditolak oleh resolver session canonical.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Direct action test untuk Sales dan Admin ditolak sebelum order read; Manager control path lulus.

### APR-SIT-007 — Keputusan memakai state terbaru saat tab approval sudah stale

**Kondisi saat ini**

Belum tersedia skenario ketika outstanding/customer risk/order status berubah setelah halaman approval dibuka tetapi sebelum Approve/Reject disubmit.

**Kondisi seharusnya**

- Server membaca ulang order, customer, outstanding, eligibility, dan version terbaru saat keputusan dikirim.
- Perubahan yang membuat order tidak lagi eligible menyebabkan stale/conflict dan tidak ditimpa oleh tab lama.
- Bila perubahan tidak membatalkan eligibility, keputusan menggunakan data terbaru dan snapshot yang sesuai policy.
- Approve dan Reject tidak boleh mengembalikan order yang sudah Cancelled atau terminal ke state lain.
- Tidak ada invoice/audit parsial ketika stale check gagal.

**Usulan perbaikan / test enablement**

1. Kirim `expectedVersion` atau `updatedAt` dari page dan gunakan pada conditional update.
2. Di dalam transaction, baca ulang seluruh dependency yang menentukan approval gate.
3. Definisikan dependency mana yang menaikkan approval version, misalnya total, term, customer risk, dan outstanding.
4. Return conflict yang memerintahkan user refresh, bukan diam-diam memproses dengan data lama.
5. Buat integration tests: ubah outstanding, ubah customer status, edit order, dan cancel order di session kedua sebelum submit tab lama.

**Kriteria lulus retest**

- Stale Approve/Reject tidak menimpa state terbaru.
- Perubahan eligibility selalu dievaluasi ulang di server.
- Tidak ada invoice, note, atau audit sukses parsial dari request stale.
- Setelah refresh, Manager melihat state dan alasan terbaru.

**Keputusan / implementasi**

- Dependency stale canonical: order `version`, status/approval state, existing invoice, customer Active, total/tax/term/item snapshot, dan outstanding/risk terbaru. Seluruhnya dibaca ulang setelah row lock; edit komersial menaikkan version dan current outstanding dihitung ulang sebelum decision.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Version mismatch/state change menghasilkan conflict tanpa artifact; approval normal menyimpan risk dari state customer terbaru.

### APR-SIT-008 — Kegagalan pembuatan invoice atau audit me-rollback approval

**Kondisi saat ini**

Approve normal menghasilkan invoice, tetapi belum tersedia fault injection untuk memaksa invoice insert atau audit insert gagal di tengah transaksi.

**Kondisi seharusnya**

- Approved, invoice, decision note, dan audit yang diwajibkan commit bersama.
- Jika invoice atau audit gagal, order tetap Pending Approval dan tidak ada nomor/record parsial.
- Error tidak ditelan sebagai best-effort success.
- Retry setelah fault dihilangkan aman dan menghasilkan tepat satu invoice serta satu keputusan final.

**Usulan perbaikan / test enablement**

1. Pindahkan status update, invoice creation, notes, dan audit ke satu database transaction.
2. Buat helper audit yang menerima transaction client; jangan melakukan write audit melalui koneksi di luar transaksi.
3. Biarkan error audit/invoice memicu rollback dan map ke error operasional yang aman.
4. Sediakan fault-injection seam khusus test pada invoice repository dan audit repository.
5. Snapshot order, invoice, items, sequence/counter, notes, dan audit sebelum/sesudah fault.
6. Uji retry normal setelah setiap fault.

**Kriteria lulus retest**

- Jalur normal menghasilkan satu Approved order, satu invoice lengkap, dan audit wajib.
- Fault invoice maupun audit menghasilkan rollback penuh.
- Tidak ada nomor invoice yang digunakan ulang secara tidak aman atau record parsial.
- Retry menghasilkan satu hasil final yang konsisten.

**Keputusan / implementasi**

- Decision, invoice, collection, allocator INV, dan seluruh audit menggunakan transaction client yang sama. Audit atomik tidak lagi best-effort. Error apa pun dibiarkan me-rollback transaksi; retry memakai guard version/unique yang sama.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** `batch-three-approval-atomicity.test.ts` fault-inject audit insert, membuktikan order tetap Pending, invoice/audit kosong, counter tidak berubah, lalu retry commit tepat satu invoice dan audit wajib.

---

## Invoices

### AR-SIT-001 — Overdue dan invoice terminal diperlakukan benar

**Kondisi saat ini**

Invoice aktif lewat due date tampil Overdue dan invoice lunas tampil Paid/Rp0. Invoice Cancelled yang terhubung ke fixture receivables belum tersedia, dan UI belum menyediakan aksi Cancel Invoice.

**Kondisi seharusnya**

- Invoice aktif dengan remaining positif dan business date melewati due date memiliki effective status Overdue.
- Paid selalu terminal dengan remaining nol dan tidak masuk piutang aktif.
- Cancelled selalu terminal serta mengalahkan status berbasis due date.
- Paid/Cancelled tidak muncul pada active receivables, collection eligibility, atau outstanding customer.
- Status yang ditampilkan konsisten pada Invoice, Receivables, Customer, Dashboard, dan print.

**Usulan perbaikan / test enablement**

1. Pusatkan status pada pure function/service dengan precedence terminal sebelum kalkulasi due date.
2. Gunakan business date WIB yang sama pada seluruh consumer.
3. Pisahkan stored lifecycle status dari derived effective status bila Overdue tidak disimpan.
4. Siapkan fixture future unpaid, overdue unpaid, Paid, dan Cancelled dalam database test.
5. Bila cancellation bukan fitur produk, revisi testcase; bila fitur diperlukan, implementasikan sesuai INV-SIT-010.

**Kriteria lulus retest**

- Keempat fixture memiliki effective status yang benar.
- Paid/Cancelled tidak dihitung sebagai active receivable atau outstanding.
- Semua modul menampilkan status dan saldo yang sama.

**Keputusan / implementasi**

- `Paid` dan `Cancelled` adalah terminal sebelum evaluasi due date. Open/closed predicates mengecualikan keduanya dari active receivable. Workflow Cancel Invoice ditambahkan sesuai policy Unpaid/no-payment pada INV-SIT-010.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Unit effective-status, integration read-without-write, cancellation/payment integration, serta customer/dashboard predicates lulus.

### INV-SIT-002 — Invoice duplikat untuk order yang sama diblokir

**Kondisi saat ini**

UI menyembunyikan aksi Generate Invoice setelah invoice terbentuk. Direct request kedua dan pembuktian constraint backend belum dilakukan.

**Kondisi seharusnya**

- Satu order hanya memiliki satu invoice canonical kecuali requirement eksplisit mendukung revision/credit note.
- Direct request kedua ditolak atau mengembalikan invoice existing secara idempotent.
- Tidak ada invoice, items, nomor, snapshot, atau audit tambahan.
- Race dua generate invoice bersamaan tetap menghasilkan maksimal satu invoice.

**Usulan perbaikan / test enablement**

1. Tambahkan unique constraint pada `invoice.orderId` atau relation canonical setara.
2. Periksa eligibility dan existing invoice di dalam transaction, bukan hanya sebelum transaction.
3. Gunakan idempotency key untuk retry dari request yang sama.
4. Tangani unique conflict sebagai `already invoiced`, bukan generic error.
5. Uji sequential duplicate dan parallel duplicate melalui direct action.

**Kriteria lulus retest**

- Generate pertama menghasilkan satu invoice lengkap.
- Request kedua dan race tidak pernah menambah invoice/nomor/audit kedua.
- Order tetap menunjuk invoice pertama secara konsisten.

**Keputusan / implementasi**

- Eligibility dan existing invoice diperiksa ulang setelah row lock; invoice memiliki unique constraint `sales_order_id`. Allocator berjalan dalam transaksi sehingga loser tidak mengonsumsi nomor atau membuat audit.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Dua `generateInvoice` paralel menghasilkan tepat satu invoice, order version 2, dan satu set audit pada `batch-three-approval-atomicity.test.ts`.

### INV-SIT-003 — Order Draft, Pending, Rejected, atau Cancelled tidak dapat diinvoicing

**Kondisi saat ini**

Pending dan Rejected/Cancelled terlihat tanpa invoice dan tanpa tombol Generate. Draft biasa serta direct request untuk seluruh state terlarang belum diuji.

**Kondisi seharusnya**

- Hanya order dengan lifecycle/approval state yang secara eksplisit eligible dapat diinvoicing.
- Draft, Pending Approval, Rejected, dan Cancelled ditolak server-side.
- Eligibility diperiksa ulang saat submit untuk mencegah stale-page generation.
- Penolakan tidak membuat invoice, items, nomor, snapshot, atau audit sukses palsu.

**Usulan perbaikan / test enablement**

1. Definisikan satu invoice eligibility policy berdasarkan source type, order status, dan approval requirement.
2. Gunakan policy yang sama untuk visibilitas UI dan server action.
3. Lakukan conditional read/update di transaction dan lindungi dari state change bersamaan.
4. Kirim direct generation request untuk setiap state terlarang plus satu state eligible sebagai kontrol.
5. Bandingkan invoice, items, counter, dan audit sebelum/sesudah.

**Kriteria lulus retest**

- Keempat state terlarang ditolak server-side.
- Tidak ada artifact parsial atau nomor yang digunakan oleh request invalid.
- State eligible menghasilkan satu invoice lengkap.

**Keputusan / implementasi**

- `canGenerateInvoiceForOrder` adalah policy canonical UI/server: hanya `Confirmed`, approval `Approved|NotRequired`, dan belum memiliki invoice yang eligible. Policy dicek sebelum dan di dalam transaksi.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Table-driven `invoice-policy.test.ts` dan direct-action Pending/Rejected tests lulus; state invalid tidak memulai transaksi/allocator.

### INV-SIT-004 — Status overdue efektif tampil tanpa mutasi saat pembacaan

**Kondisi saat ini**

Effective Overdue terlihat di UI, tetapi timestamp dan stored state sebelum/sesudah membuka Invoice/Receivables belum dibandingkan.

**Kondisi seharusnya**

- Membaca list/detail tidak mengubah invoice, `updatedAt`, audit, notification state, atau projection lain.
- Effective Overdue diturunkan secara deterministik dari terminal status, remaining, due date, dan business date.
- Invoice yang belum jatuh tempo tetap Unpaid/Partial sesuai state.
- Pergantian status berbasis waktu terjadi tanpa side effect tersembunyi pada GET/render.

**Usulan perbaikan / test enablement**

1. Implementasikan effective status sebagai pure function atau computed query.
2. Hindari `update` di page loader hanya untuk menandai Overdue.
3. Jika stored status diperlukan untuk reporting, gunakan job eksplisit yang idempotent dan audit policy terpisah; jangan mutasi saat read.
4. Gunakan controlled clock dan snapshot row, timestamps, audit count, serta notification state sebelum/sesudah render.
5. Uji invoice past, today, dan future pada timezone WIB.

**Kriteria lulus retest**

- UI menunjukkan effective status yang benar.
- Stored invoice, timestamps, dan audit identik sebelum/sesudah read.
- Boundary today/past/future konsisten di Invoice dan Receivables.

**Keputusan / implementasi**

- Overdue tetap derived melalui pure helper/query predicate berdasarkan remaining, terminal state, due date, dan business date WIB. Tidak ada update pada page loader/detail/print.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** `invoice-effective-status.test.ts` membandingkan stored row sebelum/sesudah read; unit status/filter lulus.

### INV-SIT-006 — Penomoran invoice memakai sequence canonical tertinggi dan tidak reuse

**Kondisi saat ini**

Fixture malformed, prefix/tahun lain, gap, rollover tahun, dan dua generate bersamaan belum tersedia. Membuat gap melalui delete pada instance bersama tidak diperbolehkan.

**Kondisi seharusnya**

- Nomor invoice unik dalam scope prefix/tahun canonical.
- Malformed dan prefix/tahun lain tidak mengubah allocator.
- Nomor yang pernah dialokasikan tidak digunakan ulang setelah cancel/delete pada lingkungan yang mengizinkannya.
- Pergantian tahun mengikuti policy reset/continuation yang eksplisit.
- Generate paralel tidak menghasilkan duplikasi.

**Usulan perbaikan / test enablement**

1. Gunakan tabel counter/sequence per document type dan tahun, bukan parsing `MAX(invoiceNumber) + 1` dari seluruh row.
2. Increment counter secara atomik dalam transaction atau lock yang sesuai database.
3. Pertahankan unique constraint pada nomor invoice final.
4. Jangan menurunkan counter ketika invoice dibatalkan/dihapus; gap adalah histori alokasi yang valid.
5. Uji malformed, prefix/tahun lain, gap, rollover, dan concurrency hanya pada database terisolasi/rollback.

**Kriteria lulus retest**

- Nomor baru hanya mengikuti allocator canonical.
- Gap tidak digunakan ulang dan rollover sesuai policy.
- Parallel generation selalu unik dan masing-masing invoice lengkap.

**Keputusan / implementasi**

- Policy final: counter `document_sequences` terpisah per document type + tahun WIB; format `INV-YYYY-NNN`; gap tidak dipakai ulang. Allocation menggunakan atomic upsert dan, untuk issuance invoice, transaction client yang sama dengan invoice/audit.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Concurrency/gap/year/malformed coverage pada `document-numbering.test.ts`, `batch-two-commercial-integrity.test.ts`, dan parallel invoice generation lulus.

### INV-SIT-007 — PPN inclusive direkonsiliasi hingga pembulatan nilai akhir

**Kondisi saat ini**

Satu invoice sudah merekonsiliasi net Rp3.081.081 + PPN Rp338.919 = gross Rp3.420.000 pada detail dan print. Fixture pecahan akibat quantity/discount dan nilai receivable belum dibandingkan.

**Kondisi seharusnya**

- Untuk harga inclusive, gross adalah nilai komersial final; net dan tax diturunkan dengan formula serta rounding canonical.
- Setelah rounding, `net + tax = gross` tepat dalam satuan Rupiah yang digunakan sistem.
- Rounding dilakukan pada tingkat yang disepakati—line atau document—dan tidak dicampur antar modul.
- Detail, print, receivable, payment remaining, Dashboard, dan export memakai snapshot angka yang sama.
- Tidak ada drift satu Rupiah setelah partial/full payment.

**Usulan perbaikan / test enablement**

1. Pusatkan perhitungan tax inclusive pada decimal-safe/integer function.
2. Tetapkan formula canonical, misalnya net dibulatkan dari `gross × denominator / (denominator + rate)`, lalu `tax = gross - net` agar rekonsiliasi terjaga.
3. Tentukan dan dokumentasikan apakah rounding per-line atau per-document.
4. Snapshot gross, net, rate basis points, dan tax amount ketika invoice dibuat.
5. Hindari menghitung ulang angka snapshot secara berbeda pada print/receivables.
6. Buat fixture multi-line dengan quantity, discount, dan nilai yang menghasilkan pecahan; lanjutkan partial/full payment.

**Kriteria lulus retest**

- Setiap line/document mengikuti rounding policy yang sama.
- Net + tax selalu sama dengan gross.
- Detail, print, receivable, payment, Dashboard, dan export identik.
- Pelunasan menutup remaining tepat nol tanpa drift.

**Keputusan / implementasi**

- Policy final adalah document-level rounding: `net = round(gross × 10000 / (10000 + rateBps))`, lalu `tax = gross - net`. Semua amount integer Rupiah dan DB CHECK mewajibkan `net + tax = gross` pada order/invoice.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** `tax-policy.test.ts`, `order-tax-snapshot.test.ts`, dan preflight menunjukkan rekonsiliasi tepat termasuk nilai Rp1 dan nilai pecahan formula.

### INV-SIT-008 — Konfigurasi PPN invalid ditolak sebelum snapshot dibuat

**Kondisi saat ini**

Rate negatif, terlalu besar, dan teks sudah ditolak pada test lokal; 1100 basis points diterima. Nilai kosong saat ini menjadi default 11%, sedangkan expected result menganggap kosong invalid. Konfigurasi juga diterapkan saat Sales Order dibuat, bukan baru saat invoice generation.

**Kondisi seharusnya**

- Sumber konfigurasi, timing snapshot, rentang rate, format basis points, dan behaviour nilai kosong harus eksplisit.
- Nilai negatif, non-numeric, di luar batas, atau konfigurasi yang tidak dapat di-resolve ditolak sebelum order/invoice snapshot dibuat.
- Tidak ada fallback diam-diam kecuali default 11% memang policy resmi dan terdokumentasi.
- Snapshot rate, net, dan tax tidak berubah ketika konfigurasi global berubah setelah transaksi.
- Kegagalan konfigurasi tidak meninggalkan order/invoice/audit parsial.

**Usulan perbaikan / test enablement**

1. Putuskan salah satu policy nilai kosong:
   - **Strict:** kosong/missing adalah misconfiguration dan transaksi ditolak.
   - **Explicit default:** kosong menggunakan default 1100 bps yang didefinisikan di code/config schema dan dicatat pada observability.
2. Selaraskan testcase dengan titik snapshot sebenarnya: saat Sales Order atau saat invoice dibuat.
3. Parse konfigurasi sekali melalui typed config loader dengan range validation.
4. Simpan rate basis points dan amount pada snapshot transaction, jangan membaca config global saat render.
5. Gunakan proses/env test terisolasi untuk matrix kosong, negatif, batas, terlalu besar, teks, dan valid 1100.
6. Fault-inject config invalid sebelum transaction dan periksa seluruh state.

**Kriteria lulus retest**

- Behaviour empty config cocok dengan policy yang disepakati dan test diperbarui.
- Seluruh config invalid ditolak sebelum artifact bisnis terbentuk.
- Config valid menghasilkan snapshot rate/net/tax yang benar dan immutable.

**Keputusan / implementasi**

- Policy final: config missing/blank memakai explicit default `1100` bps; non-empty wajib integer 0..10000. Rate/net/tax disnapshot saat Sales Order dibentuk; invoice hanya menyalin snapshot order dan tidak membaca config global lagi.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Matrix blank/default, valid, decimal/text/negative/out-of-range pada `tax-policy.test.ts` lulus; invalid berhenti sebelum mutation.

### INV-SIT-009 — Snapshot invoice immutable setelah master dan order berubah

**Kondisi saat ini**

Snapshot NPWP/pajak pada satu invoice tetap bertahan setelah master customer berubah. Identitas lain, produk, alamat, term, harga, due date, print/export, dan transaksi baru belum dibandingkan lengkap.

**Kondisi seharusnya**

- Invoice yang sudah diterbitkan tetap memakai customer identity, tax identity, address, item description/SKU, quantity, price, term, due date, dan tax snapshot saat penerbitan.
- Perubahan master atau field order setelah issuance tidak mengubah invoice lama.
- Transaksi baru menggunakan master terbaru.
- Detail, print, export, receivable, dan payment reference membaca snapshot yang sama.
- Relasi master nullable/inactive tidak membuat invoice historis tidak terbaca.

**Usulan perbaikan / test enablement**

1. Inventarisasi seluruh field invoice yang wajib di-snapshot dan tambahkan kolom snapshot yang belum ada.
2. Pada issuance, copy snapshot dalam transaksi yang sama dengan invoice/items/audit.
3. Renderer invoice tidak boleh bergantung pada live customer/product untuk field legal/komersial historis.
4. Gunakan live relation hanya untuk navigasi/enrichment opsional dengan fallback aman.
5. Buat fixture: issue invoice → ubah customer/product/address/term → inactive/null relation → buka detail/print/export → buat transaksi baru.

**Kriteria lulus retest**

- Invoice lama identik sebelum/sesudah perubahan master.
- Seluruh output invoice lama memakai snapshot yang sama.
- Transaksi baru memakai nilai master terbaru.
- Histori tetap terbaca ketika relasi live inactive/null.

**Keputusan / implementasi**

- Invoice menyimpan order number/source/PO, customer identity/contact/address/NPWP, item description/SKU/qty/base/markup/discount/final/subtotal, term/due date, dan gross/net/rate/tax. Detail dan print membaca snapshot invoice, sedangkan live relation hanya untuk navigasi.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** `batch-three-invoice-snapshot.test.ts` mengubah customer, order, dan item setelah issuance; semua field historis tetap identik.

### INV-SIT-010 — Cancelled mengalahkan status due date dan menghapus proyeksi aktif

**Kondisi saat ini**

UI Admin/Manager belum menyediakan Cancel Invoice. Tidak ada fixture Overdue/Partial yang dapat dibatalkan, sehingga status precedence, downstream projection, dan payment guard belum dapat diuji.

**Kondisi seharusnya**

- Jika cancellation merupakan fitur produk, hanya role berwenang yang dapat membatalkan invoice eligible dengan reason wajib.
- Cancelled adalah terminal dan selalu mengalahkan effective Overdue/Partial.
- Invoice Cancelled keluar dari active receivables, customer outstanding, Dashboard, notification, dan collection eligibility.
- Payment baru terhadap invoice Cancelled ditolak server-side.
- Existing payment tidak boleh hilang atau menjadi inkonsisten; Partial cancellation membutuhkan policy reversal/refund/credit note yang eksplisit.
- Cancellation, downstream update, note, dan audit commit secara atomik.

**Usulan perbaikan / test enablement**

1. Putuskan scope produk terlebih dahulu:
   - **Tidak mendukung cancellation:** hapus/revisi testcase dan gunakan reversal document yang benar.
   - **Mendukung cancellation:** definisikan eligibility, role, reason, dan perlakuan existing payment.
2. Implementasikan action server dengan current-state/version guard dan transaksi atomik.
3. Pusatkan predicate active invoice agar Receivables, Customer, Dashboard, Notifications, dan Collections otomatis mengecualikan Cancelled.
4. Tambahkan payment guard terhadap terminal invoice.
5. Untuk Partial/paid invoice, jangan sekadar mengubah status; gunakan workflow reversal/refund/credit note sesuai keputusan akuntansi.
6. Buat fixture Unpaid Overdue dan Partial pada database test, lalu verifikasi seluruh consumer sebelum/sesudah cancellation.

**Kriteria lulus retest**

- Cancellation hanya berhasil pada status dan role yang diizinkan dengan reason valid.
- Effective status tetap Cancelled walaupun due date lampau.
- Semua proyeksi aktif berhenti menghitung invoice tersebut.
- Payment baru ditolak dan existing payment ditangani sesuai policy tanpa kehilangan histori.
- Fault pada downstream/audit menghasilkan rollback penuh.

**Keputusan / implementasi**

- Cancel Invoice termasuk scope thesis hanya untuk stored `Unpaid`, `paidAmount=0`, dan tidak ada payment row; role Admin/Manager; reason 1..150 karakter wajib. Partial/Paid ditolak sampai reversal/refund/credit-note formal tersedia. Cancellation, metadata/version, planned collection closure, dan audit Invoice+Receivable commit atomik.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Integration cancellation membuktikan status terminal, collection keluar dari active, dua audit atomik, dan payment Rp1 sesudah cancel ditolak tanpa row.

---

## Payments

### PAY-SIT-007 — Pembayaran presisi menutup remaining tanpa drift

**Kondisi saat ini**

Testcase meminta pembayaran desimal, sedangkan `Payment.amount` dan `Invoice.totalAmount` saat ini memakai integer Rupiah. Tanpa keputusan mengenai unit moneter, hasil Pass/Fail tidak dapat ditentukan secara konsisten.

**Kondisi seharusnya**

- Semua amount menggunakan unit dan precision canonical yang sama pada order, invoice, payment, receivable, Dashboard, dan export.
- Partial payment mengurangi remaining secara tepat; payment terakhir membuat remaining tepat nol dan status Paid.
- Overpayment sebesar unit terkecil yang didukung ditolak.
- Concurrent payment tidak dapat membuat remaining negatif.
- Sistem tidak menggunakan binary floating point untuk arithmetic uang.

**Usulan perbaikan / test enablement**

1. Putuskan model moneter:
   - **Rekomendasi untuk Rupiah:** pertahankan integer Rupiah dan revisi testcase agar menguji nilai integer serta overpayment Rp1.
   - **Jika pecahan wajib:** migrasikan seluruh money field ke fixed decimal/minor-unit dengan scale yang eksplisit; jangan hanya mengubah field Payment.
2. Pusatkan perhitungan `paid`, `remaining`, dan status pada decimal-safe/integer service.
3. Validasi payment positif dan `amount <= remaining` di dalam transaction menggunakan state terbaru.
4. Gunakan conditional update/locking untuk mencegah race overpayment.
5. Tambahkan database constraints untuk amount positif dan remaining non-negative bila disimpan.
6. Uji beberapa partial payment, exact final payment, overpayment satu unit terkecil, dan dua payment paralel.

**Kriteria lulus retest**

- Total seluruh payment sama dengan paid amount dan `total - paid = remaining` tepat.
- Exact final payment menghasilkan remaining nol dan status Paid.
- Overpayment satu unit terkecil ditolak tanpa record/audit parsial.
- Hasil konsisten di Invoice, Payments, Receivables, Customer, dan Dashboard.

**Keputusan / implementasi**

- Unit canonical adalah integer Rupiah dengan unit terkecil Rp1. Parser action menolak desimal/non-digit; DB mewajibkan amount positif. Payment row-lock invoice, membaca remaining terbaru, dan payment + invoice + receivable audit commit bersama.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** `payment-recording.test.ts` membuktikan partial/exact-final, stale overpayment, dan concurrent payment tanpa remaining negatif; preflight seluruh reconciliation = 0 invalid.

---

## Pick & Pack

### PICK-SIT-012 — Completed filter, search, dan pagination konsisten

**Kondisi saat ini**

Database saat pengujian hanya memiliki tujuh Picking List sehingga tidak memenuhi prasyarat lebih dari satu halaman. Kombinasi filter dan stabilitas pagination belum dapat dibuktikan.

**Kondisi seharusnya**

- Search dan seluruh filter diterapkan sebelum pagination.
- Kombinasi Picking PIC, Packing PIC, condition, date, dan status Surat Jalan menghasilkan himpunan yang benar.
- Next/Previous mempertahankan seluruh query state.
- Sort memiliki tie-breaker stabil sehingga record tidak hilang atau muncul dua kali antar halaman.
- Count dan jumlah halaman merefleksikan hasil terfilter, bukan seluruh dataset.
- Direct query parameter invalid dinormalisasi atau ditolak secara aman.

**Usulan perbaikan / test enablement**

1. Pusatkan parsing filter dan pembentuk `where/orderBy` pada satu service.
2. Tambahkan stable tie-breaker ID setelah sort tanggal/teks/status.
3. Pertahankan query allowlist pada seluruh pagination link.
4. Gunakan index pada field pencarian/filter yang memang sering dipakai setelah query plan diverifikasi.
5. Buat fixture Completed lebih dari dua page dengan variasi PIC, condition, date, status SJ, dan nilai tie.
6. Jalankan matrix filter tunggal dan kombinasi; gabungkan IDs seluruh page dan bandingkan dengan query sumber.

**Kriteria lulus retest**

- Setiap kombinasi menampilkan tepat record yang memenuhi filter.
- Tidak ada duplikasi/hilang antar halaman.
- Filter dan sort tidak hilang ketika Next/Previous.
- Count/page total sama dengan database fixture.

**Keputusan / implementasi**

- Parsing filter Completed, normalisasi tanggal WIB, query `where`, dan pembentukan deep link dipusatkan di `pick-pack-query.ts`.
- Search, Picking PIC, Packing PIC, fulfillment, rentang tanggal, status Surat Jalan, scope portfolio, count, dan pagination memakai predicate database yang sama; post-filter JavaScript yang sebelumnya dapat membuat count/isi drift dihapus.
- Urutan canonical adalah `packedAt DESC, id DESC`. Link Next/Previous hanya mempertahankan allowlist parameter Completed serta cursor history.
- Index komposit `picking_lists(status, packed_at, id)` ditambahkan untuk scan/sort Completed; indeks foreign key item yang sebelumnya hilang juga ditambahkan.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** `pick-pack-query.test.ts`, `pagination.test.ts`, dan `warehouse-page.test.tsx` membuktikan normalisasi parameter invalid, predicate gabungan sebelum pagination, query state canonical, serta union 47 ID dengan nilai sort tie melewati tiga page tanpa record hilang/duplikat.

---

## Receivables

### AR-SIT-009 — Boundary due date konsisten pada tengah malam WIB

**Kondisi saat ini**

Instance bersama tidak menyediakan controlled clock untuk menguji sebelum dan sesudah 00:00 WIB pada Invoice, Receivables, Dashboard, dan Notifications.

**Kondisi seharusnya**

- Seluruh modul memakai business timezone `Asia/Jakarta` dan definisi business date yang sama.
- Invoice dengan due date kemarin dan remaining positif adalah Overdue.
- Invoice yang due hari ini belum Overdue sampai business date melewati due date, kecuali policy bisnis menetapkan aturan lain.
- Invoice due besok tetap aktif tetapi belum Overdue.
- Perubahan effective status terjadi pada boundary 00:00 WIB yang sama di seluruh modul tanpa pergeseran UTC.
- Paid/Cancelled tetap terminal dan tidak dipengaruhi boundary waktu.

**Usulan perbaikan / test enablement**

1. Introduce `Clock`/`nowProvider` dan helper `businessDateWib(clock.now())` yang dapat diinjeksi pada test.
2. Gunakan date-only comparison untuk due date; hindari parsing timestamp bebas pada setiap halaman.
3. Pusatkan effective invoice/receivable status agar Dashboard dan Notifications tidak memiliki rumus sendiri.
4. Jangan mengubah clock host/deployment; freeze clock melalui dependency injection di process test.
5. Uji tepat sebelum 00:00 WIB, tepat 00:00, dan sesudahnya dengan due yesterday/today/tomorrow.

**Kriteria lulus retest**

- Seluruh modul berpindah status pada boundary bisnis yang sama.
- Tidak ada status berbeda akibat konversi UTC/WIB.
- Read tidak mengubah stored invoice atau timestamp secara tersembunyi.
- Terminal invoice tidak kembali menjadi Overdue.

**Keputusan / implementasi**

- Policy final: due today belum Overdue; Overdue hanya jika business date WIB lebih besar dari due date. `Clock`/`getBusinessDateWib` menjadi boundary canonical untuk Invoice, Receivables, Dashboard, dan Notifications; terminal status tetap precedence.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** `business-clock.test.ts` membuktikan 23:59:59.999 dan 00:00 WIB; effective-status/dashboard filters memakai helper yang sama tanpa mengubah host clock.

---

## Notifications

### NOTIF-SIT-001 — Admin menerima reminder collection overdue sampai tujuh hari

**Kondisi saat ini**

Fixture Collection pada due date overdue, hari ini, +7, +8, Done, dan Cancelled serta controlled clock belum tersedia.

**Kondisi seharusnya**

- Hanya Collection berstatus Planned yang eligible.
- Planned yang overdue, due hari ini, dan due sampai +7 hari inklusif muncul.
- Due +8 hari serta status Done/Cancelled tidak muncul.
- Satu source menghasilkan satu notification deterministik tanpa duplikasi setelah refresh.
- Deep link membuka Collection Task yang tepat dan tetap menjalankan authorization.
- Setelah status/due date berubah keluar dari window, notification tidak lagi aktif sesuai refresh policy.

**Usulan perbaikan / test enablement**

1. Gunakan Clock/business date WIB yang sama dengan Receivables.
2. Pusatkan predicate notification menjadi pure function/query dengan boundary inklusif yang terdokumentasi.
3. Buat notification ID deterministik dari event type dan source ID untuk deduplication.
4. Filter terminal state sebelum menghasilkan notification.
5. Buat fixture lengkap untuk overdue, today, +7, +8, Done, dan Cancelled.
6. Uji refresh, perubahan due date/status, read state, dan deep link.

**Kriteria lulus retest**

- Hanya overdue sampai +7 inklusif yang tampil untuk Planned.
- Terminal dan +8 tidak tampil.
- Refresh tidak menggandakan notification.
- Deep link mengarah ke task benar dan unauthorized access tetap ditolak.

**Keputusan / implementasi**

- Window memakai business date WIB yang sama dengan Receivables: Planned overdue/hari ini sampai `businessDate + 7` inklusif eligible; +8, Done, dan Cancelled tidak eligible.
- Query menekan window/status di database, memiliki sort `scheduledDate, id`, dan mengecualikan invoice Cancelled atau tanpa remaining. ID event stabil adalah `collection-deadline:<collectionTaskId>`.
- Ketika pembayaran membuat invoice Paid, seluruh Collection Planned terkait diubah menjadi Done pada transaksi pembayaran yang sama, notes menyimpan system reason, dan audit `STATUS_CHANGED` dibuat; histori tidak dihapus.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Boundary overdue/+7/+8 dan terminal lulus pada `notifications.test.ts`; `notification-queries.test.ts` membuktikan event deterministik dan signal stale hilang; `payment-recording.test.ts` membuktikan partial tetap Planned dan full payment menutup Collection menjadi Done tanpa menghapus histori.

### NOTIF-SIT-002 — Sales menerima sinyal customer tanpa order selama tiga bulan

**Kondisi saat ini**

Belum tersedia controlled clock dan portfolio fixture dengan order tepat sebelum, pada, dan sesudah threshold tiga bulan WIB.

**Kondisi seharusnya**

- Sales hanya menerima notification untuk customer dalam portfolio miliknya.
- Threshold tiga bulan dihitung dengan definisi canonical—calendar months atau jumlah hari—pada business timezone WIB.
- Boundary inklusif/eksklusif pada tepat tiga bulan harus eksplisit.
- Order eligible baru menghapus kondisi inactivity setelah refresh.
- Customer inactive/terminal atau order yang tidak eligible diperlakukan sesuai policy dan tidak mencemari last-order date.
- Notification tidak terduplikasi dan deep link tidak membuka portfolio Sales lain.

**Usulan perbaikan / test enablement**

1. Putuskan bahwa `tiga bulan` berarti calendar-month subtraction atau 90 hari; rekomendasi memakai calendar months karena bahasa requirement menggunakan bulan.
2. Tetapkan boundary, misalnya notification muncul jika `lastEligibleOrderDate <= businessDate.minusMonths(3)`.
3. Scope query berdasarkan current Sales portfolio di database, bukan post-filter di UI.
4. Pusatkan definisi eligible order dan latest-order selection dengan tie-break deterministik.
5. Buat Sales A/B dengan portfolio terpisah serta dates sebelum/pada/sesudah threshold.
6. Tambahkan order baru, refresh, dan pastikan signal stale hilang hanya untuk customer terkait.

**Kriteria lulus retest**

- Before/on/after boundary cocok dengan policy yang disepakati.
- Setiap Sales hanya melihat customer portfolionya.
- Order baru menghapus notification yang relevan tanpa memengaruhi customer lain.
- Tidak ada duplicate event atau cross-portfolio deep-link access.

**Keputusan / implementasi**

- `Tiga bulan` ditetapkan sebagai pengurangan calendar month pada business date WIB dengan clamp akhir bulan; signal muncul bila `lastEligibleOrderDate <= businessDate.minusMonths(3)`.
- Order eligible hanya Confirmed, Invoiced, atau Shipped. Customer harus Active, latest order dipilih dengan `orderDate DESC, id DESC`, dan scope `portfolioOwnerUserId` diterapkan langsung di query database.
- ID event stabil adalah `customer-inactivity:<customerId>`; deep link memakai halaman Customer Outreach canonical yang kembali menerapkan portfolio scope.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Test mencakup no-order, tepat boundary inklusif, satu hari sesudah boundary, clamp 31 Mei ke 28 Februari, scope Sales, eligible status, dedup refresh, dan query portfolio database-side.

### NOTIF-SIT-003 — Customer PO aktif dengan required date tujuh hari terdeteksi tepat

**Kondisi saat ini**

Fixture Customer PO pada required date overdue, hari ini, +7, +8, dan status terminal serta controlled clock belum tersedia.

**Kondisi seharusnya**

- Hanya Customer PO berstatus aktif menurut lifecycle policy yang eligible.
- Required date overdue, hari ini, dan sampai +7 hari inklusif muncul; +8 tidak muncul.
- Terminal/Cancelled/Completed tidak menghasilkan reminder aktif.
- Event didedup berdasarkan source PO dan notification type.
- Deep link membuka PO canonical yang tepat dan mematuhi portfolio authorization.
- Perubahan required date/status memperbarui notification tanpa meninggalkan event stale.

**Usulan perbaikan / test enablement**

1. Definisikan status PO yang termasuk `active` pada satu lifecycle helper.
2. Gunakan Clock/business date WIB dan window inklusif yang sama untuk seluruh notification deadline.
3. Query source dengan scope current user dan required date canonical.
4. Buat event ID deterministik dan jangan membuat row/event baru setiap page refresh.
5. Siapkan fixture overdue, today, +7, +8, serta terminal untuk dua portfolio.
6. Uji perubahan tanggal/status, refresh, read state, dedup, dan deep link.

**Kriteria lulus retest**

- Hanya PO aktif dalam window sampai +7 inklusif yang tampil.
- +8 dan terminal tidak tampil.
- Refresh serta perubahan source tidak menghasilkan duplicate/stale notification.
- Deep link dan scope portfolio benar.

**Keputusan / implementasi**

- Status Customer PO aktif untuk reminder adalah Draft, Confirmed, Invoiced, dan Shipped selama belum memiliki dokumen Delivered; Cancelled dan source yang sudah Delivered terminal untuk reminder.
- Required date overdue/hari ini sampai +7 inklusif ditekan di database; +8 tidak eligible. Query memakai scope current user, sort `requiredDate, id`, dan ID `customer-po-processing:<salesOrderId>`.
- Deep link canonical adalah `/customer-purchase-orders/<salesOrderId>`, yang memakai detail Sales Order bersama dan query `findFirst` dengan portfolio scope.

**Hasil retest fase dua**

- **Pass — 27 Sep 2026.** Pure boundary test membuktikan +7/+8, Cancelled, dan Delivered; query integration membuktikan scope database, event ID stabil tanpa duplicate refresh, serta canonical href. Authorization detail lintas portfolio tetap dipaksakan oleh guard/query yang juga diliput fondasi Batch 1.

---

## Data Integrity & Transactions

### DATA-SIT-004 — Volume representatif stabil untuk list, pagination, export, dan Dashboard

**Kondisi saat ini**

Dataset pengujian hanya memiliki 111 customer dan 146 invoice, belum mencapai prasyarat ratusan customer dan ribuan transaksi. Hasil performance/volume belum representatif.

**Kondisi seharusnya**

- Dataset besar tidak menyebabkan timeout, memory spike, page duplikat/hilang, export terpotong, atau agregat Dashboard berbeda dari sumber.
- Search/filter/sort/pagination tetap deterministik pada nilai tie dan concurrent insert.
- Export subset berisi seluruh dan hanya record dalam scope/filter.
- Dashboard tetap merekonsiliasi transaksi sumber sebelum dan setelah satu transaksi baru.
- Authorization dan portfolio scope tetap diterapkan pada volume besar.

**Usulan perbaikan / test enablement**

1. Buat deterministic data generator untuk ratusan customer dan ribuan order/invoice/payment/picking/delivery lintas status.
2. Jalankan seed hanya pada database performance test dan sediakan cleanup/reset otomatis.
3. Tetapkan performance budget sebelum test, misalnya p95 per operasi dan batas ukuran export; jangan menyatakan Pass hanya karena tidak crash.
4. Gunakan server-side pagination dan streaming/batched export; hindari memuat seluruh dataset ke memory bila tidak perlu.
5. Tambahkan stable composite indexes berdasarkan query plan nyata untuk scope, status, date, search, dan sort.
6. Capture query count/latency untuk mendeteksi N+1.
7. Bandingkan union IDs seluruh page, row export, dan agregat Dashboard dengan query oracle.
8. Ulangi setelah concurrent insert untuk memastikan pagination dan agregat memiliki consistency model yang dipahami.

**Kriteria lulus retest**

- Semua operasi memenuhi performance budget yang disepakati tanpa timeout/error.
- Tidak ada record hilang/duplikat pada pagination.
- Export lengkap dan cocok dengan filter/scope.
- Dashboard merekonsiliasi sumber sebelum/sesudah transaksi baru.
- Query count dan memory tidak tumbuh tidak terkendali terhadap jumlah row.

**Keputusan / implementasi**

- Generator deterministik `scripts/batch4-volume.mjs` disediakan untuk 240 customer, 2.880 order, 5.760 item, serta ribuan invoice/payment/picking/delivery lintas status dengan nilai tanggal tie dan tiga portfolio Sales.
- Seed dan cleanup hanya dapat berjalan bila opt-in `YES_BATCH4_PERFORMANCE_ONLY`, expected host, dan expected database name seluruhnya sama dengan `DATABASE_URL`; setiap row memakai run ID/marker dan cleanup hanya menarget marker tersebut. Percobaan tanpa opt-in dibuktikan berhenti sebelum mutasi.
- Index untuk Completed, deadline notification, Customer PO window, customer portfolio, serta foreign key item telah dideploy sebagai migration ke-23.
- Performance budget tidak difabrikasi. p50/p95, query count, peak memory, export duration/rows, dan reconciliation sebelum/sesudah insert harus dicatat dari satu run pada database performance terisolasi.

**Hasil retest fase dua**

- **Blocked (environment) — 27 Sep 2026.** Tooling seed/reconcile/cleanup dan safety guard selesai serta lolos syntax/schema validation, tetapi workspace ini hanya terhubung ke database proyek bersama `postgres`; sesuai safety requirement, seed ribuan transaksi dan klaim baseline tidak dijalankan di sini. Test pagination deterministik 47 ID/3 page lulus, tetapi DATA-SIT-004 tetap Blocked sampai database performance terisolasi dan angka baseline aktual tersedia.

---

## End-to-End & Compatibility

### E2E-SIT-002 — Revenue cycle Credit mingguan menghasilkan overdue dan collection yang benar

**Kondisi saat ini**

Alur tidak dapat melintasi due date secara aman karena instance bersama tidak menyediakan controlled clock untuk UI, notification, dan projection.

**Kondisi seharusnya**

- Credit Weeks menghasilkan due date `issue date + weeks × 7` berdasarkan business date WIB.
- Order/invoice dapat melalui fulfillment/delivery sesuai lifecycle yang disetujui.
- Setelah business date melewati due date dan remaining positif, invoice menjadi Overdue serta muncul pada Receivables/reminder yang tepat.
- Collection Task terhubung ke invoice/customer yang sama dan mengikuti lifecycle canonical.
- Partial payment mengurangi paid/remaining dan seluruh projection tepat satu kali.
- Full payment membuat remaining nol, invoice Paid, active receivable tertutup, serta notification/collection projection mengikuti policy terminal.
- Semua dokumen, audit, Dashboard, dan compatibility route menunjuk entity canonical yang sama.

**Usulan perbaikan / test enablement**

1. Gunakan Clock/business date WIB bersama untuk Order, Invoice, Receivables, Notifications, Collections, dan Dashboard.
2. Buat scenario builder end-to-end yang menghasilkan customer, Credit Weeks order, approval bila perlu, invoice, picking, delivery, collection, dan payments.
3. Pusatkan status/eligibility helper agar tiap modul tidak menghitung overdue atau outstanding secara berbeda.
4. Jalankan setiap mutation dan audit terkait dalam transaction boundary yang sesuai serta gunakan idempotency untuk retry.
5. Freeze clock sebelum due date, pada due date, dan setelah due date tanpa mengubah clock host.
6. Snapshot IDs, amounts, statuses, due dates, audit, notifications, dan Dashboard pada setiap tahap.
7. Verifikasi canonical dan compatibility routes mengarah ke record yang sama.

**Kriteria lulus retest**

- Due date tepat untuk batas 1 dan 4 minggu.
- Overdue/reminder hanya muncul setelah boundary yang disepakati.
- Partial dan full payment merekonsiliasi saldo tanpa drift atau double count.
- Full payment menutup active receivable dan downstream projection sesuai policy.
- Audit serta relasi antar dokumen lengkap, unik, dan dapat ditelusuri end-to-end.

**Keputusan / implementasi**

- Policy final: Collection Planned yang terkait invoice otomatis menjadi Done pada transaksi full payment yang sama dengan system reason dan audit; row historis tidak dihapus. Partial payment tidak menutup Collection.
- Credit Weeks 1–4 tetap disimpan sebagai weeks dan due date dihitung tepat `issue + weeks × 7`; clock bisnis WIB bersama dipakai untuk due/overdue/reminder tanpa mengubah host clock.
- Relasi customer → SO/Customer PO → approval bila diperlukan → invoice → Picking List → Surat Jalan Delivered → receivable/collection → payment tetap canonical. Compatibility route Customer PO memakai entity Sales Order yang sama.

**Hasil retest fase dua**

- **Pass otomatis — 27 Sep 2026.** `weekly-credit-term-actions.test.ts` membuktikan 1–4 minggu untuk Direct/Customer PO, invoice otomatis/manual/approval, due +7/+28, dan Collection terhubung; `picking-fulfillment.test.ts` melintasi Packed sampai Delivered; boundary clock/notification membuktikan pre/due/post policy; `payment-recording.test.ts` membuktikan partial lalu full dengan saldo tepat dan active Collection tertutup. Satu rekaman browser manual lintas seluruh layar tetap disarankan sebagai evidence SIT operasional, bukan blocker implementasi.

---

## Backlog penambahan berikutnya

Tambahkan modul/testcase baru di bawah dokumen ini dengan struktur yang sama:

1. Kondisi saat ini
2. Kondisi seharusnya
3. Usulan perbaikan / test enablement
4. Kriteria lulus retest
5. Keputusan / implementasi
6. Hasil retest fase dua
