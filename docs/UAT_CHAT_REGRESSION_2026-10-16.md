# Pengujian ulang seluruh perbaikan dalam chat

Tanggal: 16 Oktober 2026, pukul 08.39–08.55 WIB. Target: working tree lokal yang memuat perbaikan Sales/Manager, Batch 1, dan Batch 2; bukan deployment publik.

## Hasil akhir

**Seluruh 12 temuan yang telah diperbaiki lolos regresi. Tidak ada regresi fungsional atau bug baru yang terdeteksi dalam cakupan pengujian ini.**

| Lapisan | Hasil |
| --- | --- |
| Tes terarah dengan mock/component browser, 15 file | 127 lulus, 0 gagal |
| Integrasi database: negosiasi inquiry | 1 lulus, 0 gagal |
| Integrasi database: pengiriman gabungan Delivered/Cancelled | 2 lulus, 0 gagal |
| Browser aplikasi, delapan kelompok | 31 lulus, 0 gagal, 0 skipped, 0 flaky |
| Langkah bisnis wajib 1–45 di dalam kelompok browser | 45/45 berstatus passed, tanpa passed_with_findings |
| TypeScript, lint file terkait perbaikan, git diff --check | Lulus |

Angka 45 merupakan langkah bisnis yang tercakup di dalam tes browser, bukan tambahan 45 tes Playwright. Hasil semua kelompok berasal dari satu pelaksanaan ulang menyeluruh dengan output baru; tidak menggabungkan kelulusan run lama untuk menutupi kegagalan run ini. Tidak ada retry tes browser yang diperlukan.

## Matriks perbaikan

| Temuan | Yang dikonfirmasi kembali | Hasil |
| --- | --- | --- |
| SM-01: biaya produksi menjadi harga kesepakatan otomatis | Harga kesepakatan tetap kosong sampai diisi; konversi tanpa kesepakatan ditolak. | Lulus |
| SM-02: negosiasi setelah inquiry disimpan terblokir | Harga kesepakatan diperbarui sebelum konversi; pesanan mengikuti harga tersimpan. Integrasi juga memeriksa stale update, portfolio, dan larangan edit setelah konversi. | Lulus |
| SM-03: alasan approval tidak konsisten | Alasan ditemukan pada Approval Decision Note dan audit; approve/reject menghasilkan status yang sesuai. | Lulus |
| SM-04: periode KPI tidak jelas | Label dan keterangan menyatakan cakupan all-time; angka cocok dengan agregat database. | Lulus |
| SM-05: Pending/Cancelled ikut Total Sales Value tanpa penjelasan | Label All-time Order Value menjelaskan semua status/tanggal; definisi agregat tidak berubah menjadi net sales. | Lulus |
| SM-06: perubahan audit berupa JSON teknis | Before/After, pelaku, referensi, waktu, dan alasan ditemukan pada dialog dengan nama field yang terbaca. | Lulus |
| SM-07: detail audit terpotong | Dialog berada dalam viewport desktop 1440 dan mobile 390 tanpa overflow horizontal; Close/Escape dan pengembalian fokus diverifikasi. Screenshot mobile juga diperiksa visual. | Lulus |
| FLOW-A-02 / AB-PRINT-01 / CDE-PRINT-01: filter mengurangi cetakan | Invoice, Pick checklist, Pick legacy, dan SJ masing-masing mencetak 15 baris. Navigasi dari layar berfilter dan pemulihan baris hidden pada media print diuji; cetakan gabungan juga lengkap. | Lulus |
| FLOW-A-01 / AB-NOTE-01 / BC-NOTE-01: catatan internal tercetak pada invoice | Pembuatan langsung Manager, Generate Invoice, approval, edit Notes, pengosongan Notes, dan cancellation mempertahankan pemisahan customer notes dari alasan audit. Jalur kredit/approval PO ikut diuji. | Lulus |
| CDE-DATE-01: tanggal pembayaran default UTC | Lima batas waktu pada halaman Payments termasuk tengah malam/00.31/06.59 WIB dan pergantian tahun; browser memeriksa default aktual dan persistensi tanggal bukti pilihan pengguna. | Lulus |
| CDE-CREATE-01: Create SJ membuka editor Draft lain | Create dengan/tanpa parameter view Draft lain hanya menampilkan satu form/assignment. Pembukaan editor secara normal tetap berfungsi; Draft lain tidak berubah. | Lulus |
| AB-SKU-01 / BC-SKU-01 / CDE-SKU-01: SKU SJ hilang | SKU mengikuti snapshot item sumber menurut ID pada SO, PO, dan gabungan; tetap sama setelah edit Draft/perubahan master/Issue dan tercetak benar. Legacy SKU null tetap terbaca; input kode palsu diabaikan. | Lulus |

Pengaman refresh analisis pada schema non-public juga dijalankan ulang sebagai bagian tes dashboard-analysis-schema. Dua file integrasi sungguhan memakai schema kosong sementara, bukan database utama.

## Kelompok browser dan bukti

| Kelompok | Tes Playwright | Cakupan | Bukti hasil |
| --- | ---: | --- | --- |
| Sales/Manager | 8 | S1–S3, kontrol S2B/S2C, M1–M3 termasuk KPI dan audit mobile | [JSON](../outputs/uat-chat-retest-2026-10-16-sales-manager/browser-results.json) |
| Batch 1 | 3 | Semua jalur catatan invoice, empat cetakan 15 baris, tanggal pembayaran | [JSON](../outputs/uat-chat-retest-2026-10-16-batch-one/browser-results.json) |
| Batch 2 | 3 | Create → edit Draft → Issue → cetak Sales, untuk SO/PO/gabungan | [JSON](../outputs/uat-chat-retest-2026-10-16-batch-two/browser-results.json) |
| Admin | 7 | A1–A7: pelanggan, invoice, pembayaran, packing/SJ, collection, pelunasan, produk | [JSON](../outputs/uat-chat-retest-2026-10-16-admin/browser-results.json) |
| Alur A | 2 | Langkah 1–10 serta probe tambahan navigasi ke cetak | [JSON](../outputs/uat-chat-retest-2026-10-16-flow-a/browser-results.json) |
| Alur A/B | 2 | Langkah 11–20: reopen Pack, SJ, PO/PDF, approval dan PPN | [JSON](../outputs/uat-chat-retest-2026-10-16-flow-ab/browser-results.json) |
| Alur B/C | 2 | Langkah 21–30: revisi invoice approved, pengiriman kredit, pembayaran dan inquiry | [JSON](../outputs/uat-chat-retest-2026-10-16-flow-bc/browser-results.json) |
| Alur C/D/E | 4 | Langkah 31–45 serta diagnosis default tanggal pembayaran | [JSON](../outputs/uat-chat-retest-2026-10-16-flow-cde/browser-results.json) |

Bukti utama:

- [Ringkasan terverifikasi: hitungan tes, 45 status langkah, dan integritas](../outputs/uat-chat-retest-2026-10-16/verification-summary.json).
- [Riwayat 11 pekerjaan beserta summary schema masing-masing](../outputs/uat-chat-retest-2026-10-16/results.json).
- [127 hasil tes terarah](../outputs/uat-chat-retest-2026-10-16/unit-results.json).
- [Integrasi harga inquiry](../outputs/uat-chat-retest-2026-10-16-inquiry-price-conversion/inquiry-price-conversion-integration-results.json), [integrasi pengiriman](../outputs/uat-chat-retest-2026-10-16-combined-delivery-database/combined-delivery-database-integration-results.json).
- [Audit mobile 390](../outputs/uat-chat-retest-2026-10-16-sales-manager/M3-audit-dialog-390.png).
- [PDF invoice 15 baris](../outputs/uat-chat-retest-2026-10-16-batch-one/invoice-all-15-rows.pdf), [PDF SJ gabungan dengan SKU](../outputs/uat-chat-retest-2026-10-16-batch-two/COMBINED-issued-sku.pdf).

## Integritas dan batas interpretasi

Sepuluh run database/browser masing-masing menyalin struktur 22 tabel, 30 foreign key, dan 4 trigger ke schema sementara tanpa menyalin data bisnis. Semua memverifikasi fingerprint public sebelum/sesudah sama serta schema dihapus. Delapan run browser juga memverifikasi bucket uji sudah dihapus atau memang tidak pernah dibuat. Dua run integration-only tidak memakai Storage; nilai storageRemoved=false bawaan pada summary keduanya bukan kegagalan cleanup.

Kelompok dijalankan bergantian agar server port 3137, build cache, fixture, dan metadata TypeScript tidak bertabrakan. Runner mengembalikan metadata TypeScript awal setelah setiap run. Tidak ada invoice dikirim ke pelanggan, transfer uang, atau kontak pelanggan sungguhan. Server uji telah dimatikan dan bukti lokal dipertahankan.

Alur 1–45 memakai prasyarat yang direkonstruksi pada tiap kelompok, bukan satu dataset fisik yang terus dipakai antar-schema. Angka dan komposisi kartu simulasi setiap kelompok mengikuti tes/laporan asal; hasil tidak menyatakan semua ID transaksi sama sepanjang 45 langkah.

Perbaikan KPI memperjelas cakupan, bukan menambahkan pemilih periode. Catatan invoice historis yang sudah tercampur, inquiry lama yang telanjur memakai biaya produksi sebagai agreed price, dan SJ lama tanpa SKU tidak dikoreksi otomatis. Pengujian ini adalah regresi fungsional otomatis, bukan pengukuran waktu/pemahaman peserta usability testing atau pengujian printer fisik.

Kode aplikasi tidak diubah dalam permintaan pengujian ulang ini. Yang ditambahkan adalah orchestrator dan laporan; runner integrasi mengecualikan arsip tmp/outputs agar tidak mengeksekusi salinan kode lama. Tidak ada commit, push, atau deployment.

## Verifikasi snapshot sebelum push ke main

Pada permintaan push berikutnya, hunk Batch 1/2 dan dependensinya dipilih ke index tanpa menyertakan perubahan lokal lain seperti payment submission replay, pengaman customer inactive, serta perubahan parsing/edit tanggal PO. Dokumen Word dan artefak build juga tidak disertakan. Helper tanggal WIB tetap disertakan sebagai dependensi default pembayaran.

Snapshot index diekspor ke folder sementara dan diuji kembali secara terpisah: **127 tes regresi, 6 tes browser Batch 1/2, dan TypeScript semuanya lulus**. Kedua run browser snapshot memverifikasi publicUnchanged, schemaRemoved, dan storageRemoved=true. Ini membedakan bukti full regression working tree di atas dari bukti khusus isi commit yang dipilih.

[Hasil validasi snapshot](../outputs/push-main-selected-2026-10-16/results.json), [hasil unit](../outputs/push-main-selected-2026-10-16/unit-results.json). Source runtime pada snapshot dibandingkan dengan blob index sebelum commit. Laporan ini tidak menyatakan deployment produksi telah berhasil.

## Menjalankan ulang

```powershell
$env:UAT_CHAT_OUTPUT = 'outputs/uat-chat-retest-repeat'
node scripts/run-uat-chat-regression.mjs
```

Gunakan output prefix baru yang belum dipakai. Memerlukan konfigurasi database/Storage lokal, Chrome, dan port 3137 kosong. [Orchestrator](../scripts/run-uat-chat-regression.mjs) menjalankan tes mock, integrasi, dan browser secara berurutan, menyimpan log masing-masing, dan berhenti jika pemeriksaan isolasi/cleanup gagal.
