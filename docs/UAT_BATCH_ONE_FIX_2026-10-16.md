# Batch 1 — perbaikan cetak, catatan invoice, dan tanggal pembayaran

Tanggal pelaksanaan: 16 Oktober 2026 (WIB), pada working tree lokal. Tiga kelompok bug Batch 1 diperbaiki dan diverifikasi. Perubahan lokal yang sudah ada sebelum pekerjaan ini tetap dipertahankan. Tidak ada migrasi, deployment, commit, atau push dalam pekerjaan ini.

## Hasil perbaikan

| Temuan UAT | Perubahan | Status verifikasi |
| --- | --- | --- |
| FLOW-A-02 / AB-PRINT-01 / CDE-PRINT-01: filter atau paginasi mengurangi baris cetakan | Batalkan requestAnimationFrame TableEnhancer saat navigasi; tandai tabel dokumen Invoice, Pick checklist, Pick legacy, dan SJ dengan data-no-table-tools. CSS print memulihkan baris dokumen yang masih hidden serta teks yang dibatasi untuk layar. Filter tabel operasional tetap bekerja pada layar. | Lulus regresi browser: masing-masing dokumen 15 baris tampil dan dicetak lengkap setelah navigasi dari layar operasional. Baris yang sengaja dibuat hidden juga kembali terlihat di media print. |
| FLOW-A-01 / AB-NOTE-01 / BC-NOTE-01: alasan internal menjadi Notes invoice pelanggan | Invoice baru dari pembuatan langsung Manager, Generate Invoice, dan approval tidak lagi mengambil confirmation note sebagai customer notes. Update Notes menyimpan hanya input catatan pelanggan; alasan tetap di Audit Trail. Pembatalan mempertahankan customer notes; alasan tersedia pada cancellationReason dan audit. | Lulus melalui UI dan pemeriksaan database: tiga jalur penerbitan, edit/cetak catatan, pengosongan catatan, serta pembatalan. Alasan internal tetap ditemukan di audit. |
| CDE-DATE-01: default tanggal pembayaran mengambil hari UTC | Payments memakai toBusinessDateInputWib dengan waktu yang sama untuk evaluasi status invoice. | Lima kasus tanggal pada halaman Payments lulus, termasuk tepat sebelum/sesudah tengah malam WIB, 00.31 WIB, 06.59 WIB, dan pergantian tahun. Browser memverifikasi default hari WIB aktual serta tanggal bukti yang dipilih manual tersimpan benar. |

Catatan invoice historis yang sudah terlanjur tercampur tidak dihapus atau diklasifikasikan otomatis. Perbaikan mencegah pencampuran baru; catatan lama dapat ditinjau dan disunting secara eksplisit. Tidak ada perubahan nilai invoice, perhitungan pajak, atau aturan jatuh tempo dalam Batch 1.

## Validasi

- **32 tes terarah lulus:** 11 browser component tests toolbar/tabel, 10 approval action tests dengan mock database, 5 default tanggal pada halaman Payments, 2 business-clock tests, dan 4 regresi tanggal PO yang sudah ada.
- **3 kelompok browser aplikasi lulus setelah koreksi fixture/selector:** catatan invoice, kelengkapan cetakan, dan tanggal pembayaran. Prasyarat disiapkan pada schema kosong sementara, lalu tindakan yang dinilai dijalankan melalui login dan form aplikasi sebagai Manager/Admin.
- Empat PDF dokumen masing-masing memuat 15 baris. Screenshot cetak SJ juga diperiksa secara visual. SKU pada fixture cetak sengaja diisi; ini tidak menyatakan bug pembuatan SKU SJ pada Batch 2 sudah diperbaiki.
- Pembayaran uji Rp100.000 menyimpan tanggal pilihan pengguna dan menghasilkan paid Rp100.000, remaining Rp1.400.000, status Partial pada invoice Rp1.500.000.
- TypeScript dan lint file terkait lulus. git diff --check lulus.
- Tidak ada pageerror JavaScript pada bukti browser akhir.

## Sumber bukti dan riwayat run

Hasil akhir menggabungkan hasil yang lulus dari dua schema terpisah. Transaksi kedua schema tidak dianggap satu dataset fisik:

1. [Run cetak dan pembayaran](../outputs/uat-batch-one-fix-2026-10-16-final/browser-results.json): dua kelompok tersebut lulus. Kelompok catatan berhenti karena selector Generate Invoice cocok dengan dua tombol untuk pesanan yang sama; setelah selector diperjelas, hanya kelompok itu dijalankan ulang.
2. [Run ulang catatan invoice](../outputs/uat-batch-one-fix-2026-10-16-notes/browser-results.json): satu kelompok lulus, meliputi pembuatan langsung Manager, penerbitan manual Admin, approval Manager, edit customer notes, cetak, pengosongan catatan, dan cancellation. [Evidence database/audit](../outputs/uat-batch-one-fix-2026-10-16-notes/batch-one-evidence.json).
3. [Evidence cetak dan tanggal pembayaran](../outputs/uat-batch-one-fix-2026-10-16-final/batch-one-evidence.json).

Run persiapan terdahulu disimpan pada outputs/uat-batch-one-fix-2026-10-16 dan folder -recheck. Kegagalan berasal dari fixture username/SKU yang belum mengikuti constraint canonical database serta selector yang mencoba mengisi pencarian dalam fieldset terkunci. Ini diperbaiki pada tes; tidak dihitung sebagai bug aplikasi dan hasil mentah tidak ditandai ulang sebagai lulus.

Semua empat run memverifikasi publicUnchanged=true, schemaRemoved=true, dan storageRemoved=true. Masing-masing menyalin struktur 22 tabel, 30 foreign key, dan 4 trigger tanpa menyalin data bisnis. Bucket uji tidak diperlukan pada alur Batch 1 ini; runner memastikan tidak ada bucket sementara tertinggal. [Integritas cetak/pembayaran](../outputs/uat-batch-one-fix-2026-10-16-final/run-browser-summary.json), [integritas catatan](../outputs/uat-batch-one-fix-2026-10-16-notes/run-browser-summary.json).

Field date pada summary runner lama masih memakai default metadata 2026-10-15; waktu pelaksanaan aktual tersedia pada startTime browser-results dan timestamp record uji, yaitu 16 Oktober 2026. Bukti tidak diubah untuk mengganti tanggal metadata tersebut.

PDF:

- [Invoice: seluruh 15 barang](../outputs/uat-batch-one-fix-2026-10-16-final/invoice-all-15-rows.pdf).
- [Pick checklist: seluruh 15 barang](../outputs/uat-batch-one-fix-2026-10-16-final/checklist-all-15-rows.pdf).
- [Pick legacy: seluruh 15 barang](../outputs/uat-batch-one-fix-2026-10-16-final/legacy-pick-all-15-rows.pdf).
- [Surat Jalan: seluruh 15 barang](../outputs/uat-batch-one-fix-2026-10-16-final/surat-jalan-all-15-rows.pdf).
- [Invoice dengan catatan pelanggan saja](../outputs/uat-batch-one-fix-2026-10-16-notes/invoice-customer-notes.pdf).

## Menjalankan ulang

```powershell
node node_modules/vitest/vitest.mjs run --environment node tests/unit/table-search-toolbar.test.ts tests/unit/payment-date-default.test.tsx tests/unit/business-clock.test.ts tests/unit/po-date-input.test.ts tests/integration/sales-order-approval-actions.test.ts --exclude 'tmp/**'

$env:SIT_UMKM_OUTPUT_DIR = 'outputs/uat-batch-one-repeat'
$env:SIT_UMKM_DATE = '2026-10-16'
$env:SIT_UMKM_BROWSER_CONFIG = 'playwright.uat-batch-one.config.ts'
node scripts/run-uat-flow-a.mjs --browser-only
```

Gunakan output directory baru setiap run. Runner menggunakan konfigurasi database lokal yang tersedia tanpa mencatat kredensial, memulai server lokal port 3137, menjalankan Chrome, lalu menghapus schema sementara dan membandingkan fingerprint public. Source: [tes aplikasi](../e2e/uat-batch-one.spec.ts), [konfigurasi](../playwright.uat-batch-one.config.ts), [runner](../scripts/run-uat-flow-a.mjs).

## Sisa Batch 2

Update 16 Oktober 2026: kedua temuan di bawah sudah diselesaikan dan diverifikasi pada [laporan Batch 2](UAT_BATCH_TWO_FIX_2026-10-16.md).

- CDE-CREATE-01/P2: editor Draft transaksi lain ikut terbuka pada Create Surat Jalan.
- AB-SKU-01/P3: snapshot SKU belum diteruskan pada pembuatan item SJ.

Ini verifikasi fungsional otomatis. Pengujian peserta manusia dan printer fisik belum dilakukan.
