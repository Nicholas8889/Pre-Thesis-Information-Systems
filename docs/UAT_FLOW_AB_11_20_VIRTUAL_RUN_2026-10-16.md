# Virtual run langkah 11–20 — pengiriman SO dan PO kredit

Pengujian dimulai 15 Oktober dan diverifikasi ulang 16 Oktober 2026 (WIB). Aplikasi lokal dari workspace saat ini, basis commit `0b2d05c` beserta perubahan lokal yang sudah ada. Kode aplikasi tidak diperbaiki dalam pekerjaan ini; yang ditambahkan adalah runner, tes, dan bukti pengujian.

## Hasil

Seluruh tindakan bisnis langkah 11–20 selesai melalui browser. Tujuh langkah lolos tanpa temuan; langkah 12, 13, dan 20 selesai dengan temuan. Tidak ada kegagalan tindakan simpan/approval/penerimaan atau crash JavaScript dalam run verifikasi.

Terdapat **tiga temuan**: satu bug baru tentang SKU Surat Jalan, serta dua perluasan masalah yang ditemukan pada run 1–10. Prioritas sebelum usability testing adalah kelengkapan barang pada cetakan dan pemisahan alasan approval dari catatan pelanggan.

| ID | Prioritas | Temuan | Cakupan |
| --- | --- | --- | --- |
| AB-PRINT-01 | P2 | Filter tabel dapat menghilangkan barang dari hasil cetak Surat Jalan. | Perluasan FLOW-A-02, langkah 13 |
| AB-NOTE-01 | P2 | Alasan approval Manager otomatis tercetak sebagai Notes pada invoice pelanggan. | Perluasan masalah catatan FLOW-A-01 melalui jalur approval, langkah 19–20 |
| AB-SKU-01 | P3 | SKU yang tersedia pada SO tidak diteruskan ke item Surat Jalan; Product Code tampil `-`. | Temuan baru, langkah 12–13 |

## Metode dan data

- Chrome headless, viewport 1440 × 1000, zona waktu browser Asia/Jakarta, Next.js lokal port 3137.
- Login nyata lewat form sebagai Manager, Admin, dan Sales. Tindakan langkah 11–20 dilakukan melalui UI.
- Schema uji run 1–10 sudah dihapus. Untuk melanjutkan skenario, disiapkan fixture setara akhir langkah 10: SO `SO-UAT-A-CONT`, invoice `INV-UAT-A-CONT` Rp1.870.000 Paid/sisa Rp0, dua pembayaran Rp750.000 dan Rp1.120.000, serta `PL-UAT-A-CONT` Completed tanpa Surat Jalan. Ini bukan penggunaan ID transaksi fisik dari run sebelumnya.
- Pelanggan A tanpa NPWP. Produknya A14 × Rp105.000 dan B2 × Rp200.000. Produk memiliki SKU `UAT-AB-1` dan `UAT-AB-2`; snapshot SKU SO juga terisi.
- Pelanggan B memiliki NPWP, berada dalam portofolio Sales, serta invoice historis Rp5.000.000, sudah dibayar Rp2.000.000, sisa Rp3.000.000, dengan Surat Jalan historis Delivered. Prasyarat ini memicu Pending approval sesuai aturan aplikasi.
- PO-B `PO-UAT-B-2026-001`: A4 × Rp100.000 dan B2 × Rp200.000 = Rp800.000. Revisi menjadi A4 dan B3 = Rp1.000.000. Harga jual PO disepakati berbeda dari harga jual SO-A.
- Tanggal kebutuhan awal 22 Oktober, revisi 25 Oktober 2026. PDF awal dan PDF revisi merupakan PDF satu halaman yang dapat dibaca, dengan nomor, tanggal, barang, total, dan Credit 3 Months. PDF revisi memuat perubahan kuantitas yang kemudian dicatat pada langkah 17.
- PDF diunggah ke bucket privat khusus run. Unduhan langkah 18 dibandingkan byte per byte dan SHA-256 dengan PDF revisi, sehingga pengujian tidak hanya memeriksa nama file.
- Halaman cetak dibuka dan PDF keluaran dihasilkan. Tidak menggunakan printer fisik atau mengirim dokumen kepada pelanggan.

## Hasil per langkah

| No. | Bukti hasil bisnis | Hasil |
| --- | --- | --- |
| 11 | Manager membuka kembali PL Completed tanpa SJ dengan alasan wajib. Semua pemeriksaan direset, status kembali Pack, waktu penyelesaian dikosongkan, alasan/audit tersimpan. Pemeriksaan ulang diselesaikan dan lembar final dua item dapat dicetak tanpa harga. | Lolos |
| 12 | Admin membuat Draft SJ dari PL-A: A14/B2, tujuan pelanggan, penerima, telepon, pengirim, otorisasi, pengemudi/kendaraan. Penerima/telepon direvisi, penugasan diubah Budi/B1234 → Andi/B5678; jumlah tetap A14/B2. Snapshot SKU sumber tidak diteruskan ke SJ. | Selesai; AB-SKU-01 |
| 13 | Admin mengirim SJ: Issued ditampilkan Dikirim, issuedAt/issuedBy terisi, form edit hilang. Sales membuka salinan miliknya dengan referensi SO/INV yang benar, A14/B2, tanpa harga. Pencarian Produk A pada halaman cetak menghilangkan Produk B dari print media/PDF. | Selesai; AB-PRINT-01 |
| 14 | Admin mengisi penerima aktual, waktu WIB, dan catatan penerimaan. SJ Delivered ditampilkan Diterima, satu audit DELIVERED tersimpan. Nilai waktu database tepat terhadap input WIB. INV-A tetap Paid, dibayar Rp1.870.000, sisa Rp0. | Lolos |
| 15 | Sales melihat outstanding Rp3.000.000 dan membuat PO-B dengan nomor, PDF, tanggal kebutuhan, dua produk, Credit 3 Months. Tersimpan Draft/Pending Rp800.000 tanpa invoice; hash PDF awal benar. | Lolos |
| 16 | Sales memperbarui tanggal kebutuhan dan PDF pada PO Draft. Nomor, pelanggan, tenor tiga bulan, total Rp800.000, dan Pending tetap. Path/hash PDF berubah; tanggal revisi tetap benar setelah buka ulang. | Lolos |
| 17 | Sales mengubah B2 → B3; A tetap 4. Total Rp1.000.000, harga tetap, alasan ditemukan di audit. PO masih Draft/Pending tanpa invoice. | Lolos |
| 18 | Sales mengunduh dokumen terbaru melalui link UI. Byte/hash sesuai PDF revisi, berbeda dari PDF awal; isinya nomor yang sama, A4/B3, Rp1.000.000, tanggal 25 Oktober. Detail PO juga sesuai. | Lolos |
| 19 | Manager membuka riwayat outstanding dan invoice lama Overdue, meninjau PO-B lalu Approve dengan alasan. PO menjadi Approved/Invoiced; invoice Rp1.000.000 Unpaid/sisa penuh dibuat otomatis. Keputusan dan aktor tersimpan. Satu Collection Task Planned dibuat dengan scheduledDate sama dengan dueDate. | Lolos tindakan bisnis; alasan approval juga memicu AB-NOTE-01 |
| 20 | Manager memeriksa dua item, NPWP, total/sisa Rp1.000.000, dibayar Rp0, Credit 3 Months. DPP Rp900.901 + PPN Rp99.099 = Rp1.000.000 pada tarif konfigurasi 11%. Run verifikasi: terbit 16 Oktober 2026 WIB, jatuh tempo 16 Januari 2027 WIB. Alasan approval terlihat pada cetakan invoice. | Selesai; AB-NOTE-01 |

## AB-PRINT-01 — Barang hilang dari cetakan Surat Jalan

**P2; langkah 13. Perluasan bug cetak FLOW-A-02.**

Reproduksi:

1. Sales membuka detail SJ miliknya yang sudah Dikirim, kemudian klik Cetak.
2. Halaman cetak memunculkan Search rows.
3. Cari `Produk A UAT` dan buat PDF/cetak.
4. Dokumen hanya memuat Produk A 14 unit. Produk B 2 unit hilang, meskipun database SJ tetap menyimpan kedua item.

Ekspektasi: cetakan Surat Jalan resmi selalu mencantumkan seluruh barang final. Filter untuk layar tidak boleh mengurangi isi dokumen.

Dampak: salinan pengiriman dapat tidak lengkap. Ini memengaruhi penilaian usability tugas menyiapkan dokumen, walaupun pengiriman dan kuantitas database tersimpan benar. Cetak normal sebelum menggunakan pencarian berhasil memuat dua item.

Diagnosis yang didukung kode: enhancement tabel masih terpasang setelah navigasi ke route print. `src/components/table-enhancer.tsx:316` mengatur `row.hidden` sesuai filter; `src/styles/globals.css:588` mempertahankan `display:none !important` untuk baris tersembunyi ketika dicetak. Seperti pada laporan sebelumnya, callback navigasi/requestAnimationFrame merupakan dugaan penyebab enhancement lolos dari guard route print; urutan callback belum diinstrumentasi.

Saran: pastikan dokumen print tidak di-enhance, batalkan pekerjaan enhancement saat route berubah, dan pastikan print selalu menampilkan seluruh baris final.

Bukti: [SJ normal](../outputs/uat-flow-ab-2026-10-16-recheck/13-sj-sales.pdf), [SJ tidak lengkap setelah filter](../outputs/uat-flow-ab-2026-10-16-recheck/13-sj-filtered.pdf), [print media](../outputs/uat-flow-ab-2026-10-16-recheck/13-sj-filtered-print-media.png), checkpoint `sj-print-filter-probe` pada [evidence alur A](../outputs/uat-flow-ab-2026-10-16-recheck/flow-a-continuation-evidence.json).

## AB-NOTE-01 — Alasan approval masuk ke invoice pelanggan

**P2; langkah 19–20. Jalur approval memperluas masalah catatan FLOW-A-01.**

Reproduksi:

1. Manager menyetujui PO Pending dengan Confirmation Note: `UAT19: outstanding Rp3 juta ditinjau; setujui kredit 3 bulan sesuai kesepakatan pelanggan`.
2. Invoice otomatis terbentuk dari approval.
3. Buka Cetak Invoice. Teks keputusan Manager tersebut muncul persis pada bagian Notes yang dicetak untuk pelanggan.

Ekspektasi: alasan keputusan approval tersedia pada catatan keputusan/audit. Keterangan invoice untuk pelanggan perlu memiliki tujuan dan pengisian tersendiri.

Dampak: penilaian internal tentang outstanding/kredit ikut terbawa ke dokumen pelanggan tanpa tindakan khusus menambahkan keterangan invoice. Pada run ini alasan keputusan tersimpan benar, tetapi juga digunakan sebagai isi invoice.

Kode penyebab: `src/lib/actions.ts:1740`, di `decideSalesOrderApproval`, mengisi invoice baru dengan `notes: actionNote || null`. Cetakan merender seluruh invoice.notes di `src/app/invoices/[invoiceId]/print/page.tsx:162`. Jalur ini berbeda dari `updateInvoiceNotes` pada temuan run sebelumnya dan perlu ikut diperbaiki.

Saran: simpan alasan keputusan pada approvalDecisionNote/audit, lalu gunakan field keterangan invoice pelanggan secara terpisah.

Bukti: [cetakan invoice kredit](../outputs/uat-flow-ab-2026-10-16-recheck/20-credit-invoice-print.png), [PDF invoice kredit](../outputs/uat-flow-ab-2026-10-16-recheck/20-credit-invoice.pdf), field `printedNotes` pada [evidence alur B](../outputs/uat-flow-ab-2026-10-16-recheck/flow-b-evidence.json).

## AB-SKU-01 — SKU tidak diteruskan dari SO ke Surat Jalan

**P3; langkah 12–13. Temuan baru.**

Reproduksi:

1. Gunakan SO dengan dua produk yang memiliki SKU dan productSkuSnapshot terisi: `UAT-AB-1` dan `UAT-AB-2`.
2. Buat SJ dari Pick Completed, kemudian buka detail dan cetaknya.
3. Kedua item SJ mempunyai `productCode: null`; kolom Product Code menampilkan `-`.

Ekspektasi: kode produk pada dokumen pengiriman mengikuti snapshot kode item sumber.

Dampak: identifikasi produk pada dokumen kurang lengkap, khususnya jika nama produk mirip. Nama dan kuantitas tetap benar, sehingga ini tidak menghalangi penyelesaian alur yang diuji.

Kode terkait: pemilihan item SO pada `src/lib/actions.ts:2516` hanya mengambil id/nama/kuantitas; pembuatan deliveryNoteItem sekitar baris 2610 tidak mengisi productCode. Halaman detail `src/app/surat-jalan/page.tsx:510` dan halaman print memakai `productCode ?? "-"`.

Saran: bawa productSkuSnapshot dari item SO dan simpan sebagai productCode pada item SJ saat dibuat, sehingga kode historis dokumen tidak bergantung pada perubahan master produk setelahnya.

Bukti: checkpoint `source-product-codes` membandingkan SKU sumber dengan nilai null SJ pada [evidence alur A](../outputs/uat-flow-ab-2026-10-16-recheck/flow-a-continuation-evidence.json), [detail Draft](../outputs/uat-flow-ab-2026-10-16-recheck/12-draft-updated.png), [salinan SJ tanpa kode](../outputs/uat-flow-ab-2026-10-16-recheck/13-sj-sales.pdf).

## Integritas dan validasi

Run awal dan run verifikasi menggunakan schema kosong terpisah, masing-masing 22 tabel/30 foreign key/4 trigger, serta bucket Storage privat khusus run. Tidak ada penulisan transaksi UAT ke public, refresh analytics manual, atau pesan ke pelanggan. Pada kedua run, fingerprint public sebelum/sesudah sama; schema dan bucket uji berhasil dibersihkan.

- [Ringkasan run awal](../outputs/uat-flow-ab-2026-10-15/run-browser-summary.json): publicUnchanged/schemaRemoved/storageRemoved = true.
- [Ringkasan verifikasi](../outputs/uat-flow-ab-2026-10-16-recheck/run-browser-summary.json): ketiga nilai = true.
- [Hasil gabungan](../outputs/uat-flow-ab-2026-10-16-recheck/final-results.json): 10 langkah, 7 bersih, 3 dengan temuan, 0 kegagalan tindakan, 0 runtime error.
- TypeScript source/tes lulus dengan folder artefak tmp/outputs dikecualikan. Perubahan lokal yang sudah ada tetap dipertahankan.

Reporter Playwright menandai kedua test group gagal karena assertion akhir mengharuskan daftar defect kosong. Seluruh checkpoint bisnis tetap dijalankan; kegagalan reporter berasal dari tiga defect di atas. Ini bukan klaim bahwa semua tindakan gagal atau bahwa seluruh pengujian lulus.

Pengujian merupakan simulasi fungsional, bukan sesi peserta manusia atau ukuran durasi usability. Printer fisik, mobile, concurrency transaksi besar, serta skenario setelah langkah 20 belum diuji.

## Menjalankan ulang

```powershell
$env:SIT_UMKM_OUTPUT_DIR = 'outputs/uat-flow-ab-repeat'
$env:SIT_UMKM_DATE = '2026-10-16'
node scripts/run-uat-flow-ab.mjs --browser-only

# Untuk salah satu kelompok saja:
node scripts/run-uat-flow-ab.mjs --browser-only --browser-focus='Alur A 11-14'
node scripts/run-uat-flow-ab.mjs --browser-only --browser-focus='Alur B 15-20'
```

Gunakan folder output berbeda untuk setiap run agar bukti sebelumnya tidak tertimpa. Memerlukan konfigurasi database/Storage lokal, Chrome, dan port 3137 yang kosong. Bukti berada dalam outputs yang diabaikan Git; kredensial tidak disalin ke laporan.
