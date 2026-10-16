# Virtual run — Produk dan SO Immediate Payment, langkah 1–10

Tanggal: 15 Oktober 2026 (WIB). Pengujian aplikasi lokal dari workspace saat ini, dengan basis commit `0b2d05c` dan perubahan lokal yang sudah ada sebelum pengujian. Ini bukan pengujian deployment online.

## Kesimpulan

Seluruh tindakan bisnis pada langkah 1–10 dapat dijalankan melalui browser. Total SO/invoice, revisi, jatuh tempo, pelunasan, PIC, dan progres Pack sesuai skenario. Ditemukan **dua defect P2** yang relevan sebelum usability testing: pencampuran catatan konfirmasi ke invoice pelanggan, serta filter tabel yang dapat menghilangkan barang dari hasil cetak invoice dan Pick.

Pada alur utama, sembilan langkah lolos tanpa temuan dan langkah 7 selesai dengan temuan catatan. Reproduksi tambahan membuktikan masalah cetak bersyarat pada langkah 7 dan 9. Tidak ada crash JavaScript yang tercatat. Hasil ini merupakan simulasi fungsional dengan otomasi, bukan pengukuran kemampuan atau durasi peserta manusia.

## Data dan metode

- Chrome headless, viewport 1440 × 1000, aplikasi Next.js lokal port 3137.
- Login melalui form sebagai Admin, Sales, dan Manager; tidak memakai cookie role palsu.
- Pengguna dan pelanggan merupakan fixture prasyarat. Produk, SO, dua revisi, invoice, catatan, dua pembayaran, serta Pick/Pack pada alur utama dibuat melalui UI.
- Pelanggan A aktif, tanpa NPWP, berada dalam portofolio Sales, tanpa invoice/outstanding awal.
- Produk A: biaya produksi Rp70.000, harga dasar Rp100.000, markup 5%, harga akhir Rp105.000. Kuantitas 10 → 12 → 14.
- Produk B: biaya produksi Rp140.000, harga dasar Rp250.000, diskon 20%, harga akhir Rp200.000. Kuantitas tetap 2.
- Total: Rp1.450.000 → Rp1.660.000 → Rp1.870.000. Kedua produk berstatus Active.
- Rekap Excel benar-benar diunduh dan kedua worksheet diperiksa. Halaman cetak dibuka dan PDF dihasilkan; tidak mencetak melalui printer fisik.
- Reproduksi tambahan masalah cetak menggunakan fixture invoice/Pick khusus. Fixture ini bukan bukti keberhasilan tindakan bisnis; keberhasilan tindakan bisnis berasal dari alur utama di atas.
- Kode aplikasi tidak diperbaiki dalam pekerjaan ini. Yang ditambahkan adalah runner, tes, dan laporan.

## Hasil per langkah

| No. | Hasil yang diamati | Status |
| --- | --- | --- |
| 1 | Admin menyimpan Produk A/B dengan biaya yang benar dan Active. Keduanya tersedia pada form SO dan Customer PO untuk Sales. | Lolos |
| 2 | Sales membuat SO dua item Rp1.450.000. Confirmed, approval NotRequired, Immediate Payment, tanpa invoice dan tanpa PPN. | Lolos |
| 3 | Sales mengubah A menjadi 12; B tetap 2. Harga dasar, markup/diskon, dan harga akhir tetap. Total Rp1.660.000; alasan ditemukan di audit. | Lolos |
| 4 | Detail Admin terbaru. Excel memuat satu ringkasan SO Rp1.660.000 dan dua rincian barang dengan jumlah subtotal yang sama; kuantitas 12 dan 2. Rentang hari order menyertakan SO, rentang 1–2 Januari tidak menyertakannya. | Lolos |
| 5 | Invoice berasal dari SO tersebut: Rp1.660.000, dibayar Rp0, sisa Rp1.660.000, Unpaid. Tanggal jatuh tempo sama dengan tanggal terbit dalam WIB. Snapshot dua item benar. | Lolos |
| 6 | Admin mengubah A menjadi 14 sebelum ada pembayaran, Pick, atau SJ. SO dan invoice dengan ID yang sama menjadi Rp1.870.000; revisi invoice bertambah, due date tetap, alasan/audit tersimpan. | Lolos |
| 7 | Catatan bisnis tersimpan; Sales dapat membuka cetak miliknya dengan dua item, total/sisa Rp1.870.000 dan jatuh tempo benar, tanpa PPN. Namun catatan konfirmasi juga ikut tercetak. | Selesai dengan FLOW-A-01; juga terdampak FLOW-A-02 jika filter dipakai |
| 8 | Admin mencatat Rp750.000: Partial, sisa Rp1.120.000. Manager mencatat Rp1.120.000: Paid, dibayar Rp1.870.000, sisa Rp0. Sales menemukan kedua pembayaran; invoice tidak muncul pada piutang aktif. | Lolos |
| 9 | Admin membuat Pick dengan PIC Bapak Dedi UAT, A14 dan B2. Sales membuka cetak miliknya dengan dua item, tanpa harga. | Lolos pada alur biasa; terdampak FLOW-A-02 jika filter dipakai |
| 10 | Pick dilanjutkan ke Pack. Satu pemeriksaan disimpan dan tetap tercentang setelah buka ulang. Selesai ditolak oleh UI ketika belum lengkap/PIC kosong; setelah lengkap menjadi Packed, ditampilkan Completed, dan form Surat Jalan menampilkan barang yang siap. SJ belum dibuat karena di luar langkah 10. | Lolos |

Catatan istilah: nilai database `Pending`, `InProgress`, `Packed` ditampilkan sebagai Pick, Pack, Completed. Perbedaan nama tersebut bukan defect.

## FLOW-A-01 — Catatan konfirmasi ikut menjadi catatan invoice pelanggan

**Prioritas P2. Lokasi langkah 7.**

Reproduksi:

1. Admin membuka invoice dan mengisi Invoice Notes dengan keterangan pengiriman untuk pelanggan.
2. Klik Save Notes, lalu isi Confirmation Note pada dialog tindakan.
3. Sales membuka invoice yang sama dan klik Cetak Invoice.
4. Bagian Notes pada salinan pelanggan berisi keterangan yang dimasukkan **ditambah** `Confirmation note: Simulasi UAT Alur A`.

Ekspektasi: keterangan invoice untuk pelanggan dipertahankan; alasan konfirmasi tindakan disimpan dalam audit, atau setidaknya tujuan cetaknya diberi penjelasan yang jelas sebelum diisi.

Dampak: pengguna dapat menganggap alasan konfirmasi sebagai catatan internal, kemudian tanpa sadar memasukkannya ke dokumen pelanggan. Placeholder Invoice Notes sendiri menyebut `Optional internal or demo note`, walaupun field tersebut dicetak. Ini mengganggu pemahaman tugas melengkapi keterangan dan memeriksa salinan invoice.

Kode terkait:

- `src/lib/actions.ts:2131`: `updateInvoiceNotes` menggabungkan `notes` dengan `actionNote` melalui `mergeActionNotes`.
- `src/lib/action-notes.ts:28`: helper menambahkan teks `Confirmation note:`.
- `src/app/invoices/page.tsx:266`: placeholder menyebut catatan internal.
- `src/app/invoices/[invoiceId]/print/page.tsx:162`: seluruh `invoice.notes` dirender di dokumen.

Saran perbaikan: pisahkan alasan audit dari keterangan untuk pelanggan dan selaraskan label/placeholder dengan tujuan cetaknya.

Bukti: [tampilan cetak Sales](../outputs/uat-flow-a-2026-10-15-recheck/07-invoice-sales-print.png), [PDF invoice](../outputs/uat-flow-a-2026-10-15-recheck/07-invoice-sales.pdf), [checkpoint data dan catatan](../outputs/uat-flow-a-2026-10-15-recheck/flow-evidence.json).

## FLOW-A-02 — Filter tabel menghilangkan barang dari hasil cetak

**Prioritas P2, didahulukan di antara kedua temuan. Lokasi langkah 7 dan 9.**

Reproduksi melalui navigasi UI biasa, terbukti pada invoice dan Pick:

1. Sales membuka detail invoice/Pick miliknya, lalu klik Cetak Invoice atau Print Pick & Pack.
2. Pada halaman cetak muncul Search rows beserta kontrol tabel.
3. Cari `Produk A UAT` sehingga Produk B tersembunyi.
4. Hasil print media dan PDF hanya berisi Produk A. Invoice masih menampilkan total **Rp1.870.000** meskipun subtotal baris yang tercetak hanya **Rp1.470.000**. Pick masih menampilkan total **16 unit** meskipun baris yang tercetak hanya **14 unit**.

Ekspektasi: salinan invoice/Pick resmi selalu memuat seluruh rincian dokumen, terlepas dari pencarian atau paginasi tabel untuk layar.

Dampak: peserta dapat menghasilkan invoice atau lembar persiapan barang yang tidak lengkap saat memeriksa barang tertentu. Rincian dan total saling bertentangan. Ini dapat mencemari hasil usability testing karena kegagalan dokumen berasal dari aplikasi.

Temuan ini bersyarat pada penggunaan filter; cetak dengan kedua baris terlihat lolos pada alur utama. Bug bukan sekadar tampilan toolbar: baris hilang juga pada media cetak dan PDF.

Inspeksi kode yang mendukung diagnosis:

- `src/components/table-enhancer.tsx:40` mencoba melewati route `/print`, tetapi callback `requestAnimationFrame` pada baris 58 tidak dibatalkan saat effect dibersihkan pada baris 68. Callback terjadwal/navigasi merupakan dugaan penyebab toolbar tetap terpasang; urutan callback persisnya belum diinstrumentasi.
- Baris 316 mengatur `row.hidden` berdasarkan filter/paginasi.
- `src/styles/globals.css:588` menyembunyikan `tbody tr[hidden]` dengan `!important`. Aturan print tidak mengembalikan seluruh baris.

Saran perbaikan: cegah enhancement pada dokumen cetak, batalkan callback ketika route berganti, dan pastikan hasil cetak selalu menampilkan semua baris dokumen. Tambahkan regresi navigasi detail → cetak → pencarian → print media untuk invoice serta Pick.

Bukti:

- [Invoice hanya menampilkan Produk A, total tetap penuh](../outputs/uat-flow-a-2026-10-15-print-repro/11-invoice-filtered-print-media.png).
- [PDF invoice tidak lengkap](../outputs/uat-flow-a-2026-10-15-print-repro/11-invoice-filtered-print.pdf).
- [Pick hanya menampilkan 14 unit, total tetap 16](../outputs/uat-flow-a-2026-10-15-print-repro/11-pick-filtered-print-media.png).
- [PDF Pick tidak lengkap](../outputs/uat-flow-a-2026-10-15-print-repro/11-pick-filtered-print.pdf).
- [Checkpoint DOM, display pada print media, dan temuan](../outputs/uat-flow-a-2026-10-15-print-repro/flow-evidence.json).

## Integritas dan batas pengujian

Setiap run memakai schema kosong sementara berisi 22 tabel, 30 foreign key, dan 4 trigger. Struktur diambil dari database yang dikonfigurasi, tanpa menyalin baris bisnis. Penulisan fixture diarahkan ke schema sementara; hak akses schema dicabut dari anon/authenticated. Tidak ada refresh analytics manual atau pengiriman pesan kepada pelanggan.

Run ulang alur utama dan run reproduksi cetak sama-sama memverifikasi `publicUnchanged: true` dan `schemaRemoved: true`: [ringkasan alur utama](../outputs/uat-flow-a-2026-10-15-recheck/run-browser-summary.json), [ringkasan reproduksi](../outputs/uat-flow-a-2026-10-15-print-repro/run-browser-summary.json).

Pada run awal, fingerprint public berubah pada empat tabel karena satu SO lain, `SO-2026-035`, Rp50.000/satu item, muncul pada 23:42:12 WIB. Metadata pemeriksaan menunjukkan aktor bukan pengguna UAT dan tidak ada marker UAT pada catatan; record ini berbeda dari SO uji bernomor `SO-2026-001` dalam schema terpisah. Ini konsisten dengan aktivitas lain yang bersamaan, tetapi sumber aktivitas tersebut tidak dikonfirmasi. Record tidak diubah/dihapus. Karena fingerprint awal tidak stabil, klaim integritas di atas memakai dua run berikutnya yang stabil.

Run awal juga mengalami timeout karena skrip mencari tombol `Download`, padahal label UI ialah `Ekspor Excel`. Ini kesalahan selector pengujian, bukan bug aplikasi; sudah dikoreksi dan ekspor lulus pada run ulang.

Tes browser sengaja keluar dengan status gagal ketika daftar defect tidak kosong. Ini menunjukkan temuan FLOW-A-01/FLOW-A-02, bukan kegagalan seluruh transaksi. Pemeriksaan TypeScript untuk source dan tes lulus dengan folder artefak `tmp`/`outputs` dikecualikan; pemindaian awal tanpa pengecualian terbentur salinan source lama di `tmp/push-main-verify-20261015`.

Belum diuji dalam pekerjaan ini: printer fisik, perangkat mobile, perilaku peserta manusia, transaksi besar, atau langkah setelah kesiapan Surat Jalan. Durasi otomatis per langkah disimpan pada evidence JSON dan tidak digunakan untuk menilai batas waktu manusia.

## Mengulang tes

```powershell
# Alur utama 1–10 saja
$env:SIT_UMKM_OUTPUT_DIR = 'outputs/uat-flow-a-repeat'
node scripts/run-uat-flow-a.mjs --browser-only --browser-focus='Alur A 1-10'

# Reproduksi tambahan masalah cetak
$env:SIT_UMKM_OUTPUT_DIR = 'outputs/uat-flow-a-print-repeat'
node scripts/run-uat-flow-a.mjs --browser-only --browser-focus=Print-route
```

Runner membutuhkan koneksi database dari konfigurasi lokal, Chrome, serta port 3137 yang kosong. Kredensial tidak dicatat dalam laporan. File bukti berada di folder `outputs` yang diabaikan Git; laporan dan definisi tes berada di workspace.
