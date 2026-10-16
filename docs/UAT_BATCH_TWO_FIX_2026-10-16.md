# Batch 2 — konteks Create Surat Jalan dan snapshot SKU

Tanggal: 16 Oktober 2026 (WIB), aplikasi lokal dari working tree yang sudah memuat Batch 1. Kedua temuan Batch 2 diperbaiki dan diverifikasi. Perubahan lokal lain tetap dipertahankan. Tidak ada migrasi, koreksi massal data historis, commit, deployment, atau push dalam pekerjaan ini.

## Perbaikan

| Temuan | Perubahan | Hasil |
| --- | --- | --- |
| CDE-CREATE-01 / P2: Create Surat Jalan ikut membuka editor Draft transaksi lain | Pada mode=create, halaman tidak memilih record SJ untuk panel detail/editor, termasuk jika URL juga membawa view dari Draft lama. Daftar dokumen tetap tersedia; editor muncul kembali saat membuka view secara normal. | Lulus pada browser sebagai Admin/Manager: hanya satu form Create, satu pilihan driver/kendaraan, tidak ada editor atau tombol Simpan Draft lama. Draft pelanggan lain tidak berubah. |
| AB-SKU-01 / BC-SKU-01 / CDE-SKU-01 / P3: Product Code kosong meskipun SKU sumber tersedia | createDeliveryNote membaca productSkuSnapshot dari item pesanan, mencocokkannya lewat salesOrderItemId, lalu menyimpan ke deliveryNoteItem.productCode di transaksi yang sama dengan pembuatan SJ. | Lulus pada SJ dari SO, PO, dan gabungan. SKU mengikuti setiap sumber, tetap tersimpan saat kontak Draft diperbarui, dan tampil pada cetakan setelah Issue. Perubahan SKU master tidak mengganti snapshot dokumen. |

SKU sumber yang tidak tersedia tetap null. SKU master terkini tidak dipakai untuk menebak SKU historis. SJ lama yang sudah tersimpan tanpa Product Code tidak diubah otomatis.

## Validasi

**55 tes terarah lulus** pada:

- combined-delivery-actions.test.ts: 33 tes, termasuk SKU sumber berbeda untuk nama produk sama, SKU null, input Product Code palsu yang diabaikan, alur satu/gabungan pesanan, serta penolakan simpan Draft lama setelah Issue tanpa update/audit baru.
- warehouse-page.test.tsx: 19 tes, termasuk Create dengan/tanpa parameter view Draft lain, pemilihan editor normal, tab, cetakan, dan batas peran yang sudah ada.
- delivery-note-status.test.ts: 3 tes aturan status.

Run pertama tes mock menemukan empat fixture tabel lama tanpa relasi customer yang sekarang dibaca halaman. Fixture dilengkapi; seluruh 55 tes kemudian lulus. Kegagalan fixture ini tidak dihitung sebagai bug aplikasi.

**Tiga tes browser aplikasi lulus dalam satu run**, menggunakan Chrome headless, timezone Asia/Jakarta, viewport 1440 × 1000:

| Alur | Pelaku dan pemeriksaan |
| --- | --- |
| SO tunggal | Admin membuat SJ dengan snapshot SNAP-SO-A. URL Create sengaja menyertakan view Draft pelanggan lain untuk memastikan tidak membuka editor tersebut. Draft diperbarui, diterbitkan, lalu Sales mencetak dokumen milik portofolionya. |
| PO tunggal | Manager membuat SJ dengan snapshot SNAP-PO-A serta satu item legacy bersnapshot null walaupun SKU master ada. Draft diperbarui dan diterbitkan; Sales membuka cetak. |
| SO + PO gabungan | Manager membuat satu SJ dari dua Picking List Completed, dengan dua sumber/invoice dan tiga baris sumber. Produk A berjumlah 3 dan Produk B 1; SKU SNAP-C-A/SNAP-C-B muncul pada baris yang benar. Sales mencetak seluruh referensi dan baris. |

Pada setiap alur:

- Update nomor telepon Draft tersimpan, tanpa mengubah Product Code atau jumlah barang.
- SKU master A diubah setelah Draft dibuat; SKU pada SJ dan cetakan tetap mengikuti snapshot sumber.
- Status menjadi Issued; editor dan input kontak tidak lagi tampil. Penolakan server terhadap stale Draft diverifikasi pada tes action.
- Snapshot invoice sebelum/sesudah identik, termasuk nominal, saldo, status, dan updatedAt. Draft pelanggan lain juga identik sebelum/sesudah.
- Audit CREATED, DRAFT_UPDATED, dan ISSUED ditemukan.
- Halaman cetak tidak mempunyai filter tabel dan semua baris terlihat pada media print, sebagai pemeriksaan terkait perbaikan Batch 1.

TypeScript, lint file terkait, dan git diff --check lulus. Tidak ada pageerror JavaScript pada run browser. Screenshot cetakan gabungan diperiksa secara visual.

## Bukti dan integritas

- [Hasil browser: 3 passed](../outputs/uat-batch-two-fix-2026-10-16/browser-results.json).
- [Evidence fixture, snapshot SKU, invoice, dan audit](../outputs/uat-batch-two-fix-2026-10-16/batch-two-evidence.json).
- [Create SO tanpa editor Draft lain](../outputs/uat-batch-two-fix-2026-10-16/SO-single-create-context.png).
- [PDF SO](../outputs/uat-batch-two-fix-2026-10-16/SO-issued-sku.pdf), [PDF PO](../outputs/uat-batch-two-fix-2026-10-16/PO-issued-sku.pdf), [PDF gabungan](../outputs/uat-batch-two-fix-2026-10-16/COMBINED-issued-sku.pdf).
- [Screenshot gabungan dengan SKU dan referensi sumber](../outputs/uat-batch-two-fix-2026-10-16/COMBINED-issued-print.png).
- [Ringkasan integritas dan cleanup](../outputs/uat-batch-two-fix-2026-10-16/run-browser-summary.json): browserExit=0, publicUnchanged=true, schemaRemoved=true, storageRemoved=true.

Runner memakai schema sementara dengan struktur 22 tabel, 30 foreign key, dan 4 trigger, tanpa menyalin data bisnis. Prasyarat pesanan/invoice/Pick Completed dibuat sebagai fixture, bukan dianggap tindakan UI yang diuji. PO menggunakan metadata dokumen fixture; upload/download PDF PO tidak diuji pada Batch 2. Bucket Storage tidak diperlukan dan tidak ada bucket uji tertinggal. Server uji dan schema sudah dibersihkan; bukti lokal dipertahankan.

## Menjalankan ulang

```powershell
node node_modules/vitest/vitest.mjs run --environment node tests/integration/combined-delivery-actions.test.ts tests/integration/warehouse-page.test.tsx tests/unit/delivery-note-status.test.ts --exclude 'tmp/**'

$env:SIT_UMKM_OUTPUT_DIR = 'outputs/uat-batch-two-repeat'
$env:SIT_UMKM_DATE = '2026-10-16'
$env:SIT_UMKM_BROWSER_CONFIG = 'playwright.uat-batch-two.config.ts'
node scripts/run-uat-flow-a.mjs --browser-only
```

Gunakan output directory baru setiap run. Source: [tes browser](../e2e/uat-batch-two.spec.ts), [konfigurasi](../playwright.uat-batch-two.config.ts), [runner terisolasi](../scripts/run-uat-flow-a.mjs). Memerlukan konfigurasi database lokal, Chrome, dan port 3137 kosong.

Semua lima kelompok temuan dari rencana dua batch telah ditangani untuk transaksi baru. Ini verifikasi fungsional otomatis, bukan pengukuran usability peserta manusia, pengujian printer fisik, atau klaim aplikasi bebas bug.
