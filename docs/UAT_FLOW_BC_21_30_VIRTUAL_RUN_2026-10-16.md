# Virtual run langkah 21–30 — pelunasan PO kredit dan inquiry C

Tanggal: 16 Oktober 2026 (WIB). Dijalankan pada aplikasi lokal, basis commit `0b2d05c` beserta perubahan lokal yang sudah ada. Yang ditambahkan adalah runner, tes, dan laporan; kode aplikasi belum diperbaiki dalam pekerjaan ini.

## Kesimpulan

**Seluruh 10 tindakan bisnis selesai.** Delapan langkah lolos tanpa temuan, langkah 22 dan 24 selesai dengan dua temuan yang sudah diketahui dari run sebelumnya. Tidak ada bug baru yang terkonfirmasi dalam cakupan langkah 21–30, kegagalan tindakan, atau runtime error JavaScript.

- Revisi PO Approved mempertahankan ID invoice dan Approved; total PO/invoice menjadi Rp1.100.000.
- Pengiriman kredit tidak mensyaratkan pelunasan. Setelah barang Diterima, outstanding pelanggan menjadi Rp4.100.000.
- Cicilan Rp400.000 dan pelunasan Rp700.000 membuat INV-B Paid/sisa nol dan reminder Done. Invoice historis tetap bersisa Rp3.000.000.
- Konversi inquiry Manager menghasilkan SO Rp300.000 dengan invoice otomatis. Konversi Sales menghasilkan PO Rp200.000 Confirmed tanpa invoice sampai diterbitkan Admin.
- Kedua invoice C Unpaid, jatuh tempo 14 hari setelah terbit, tanpa PPN. Dua Picking List Completed tersedia untuk pengiriman gabungan; SJ gabungan belum dibuat.

## Data dan metode

Chrome headless, viewport 1440 × 1000, zona waktu browser Asia/Jakarta, Next.js lokal port 3137. Login melalui form sebagai Manager, Admin, dan Sales. Seluruh tindakan langkah 21–30 dilakukan melalui UI.

Schema run 11–20 sudah dibersihkan. Prasyarat berikut dibuat di schema baru, sehingga ini melanjutkan kondisi bisnis sebelumnya dengan ID fixture baru:

- PO `PO-UAT-B-CONT`/SO `SO-UAT-B-CONT`, Approved/Invoiced, A4 × Rp100.000 + B3 × Rp200.000, invoice `INV-UAT-B-CONT` Rp1.000.000 Unpaid, Credit 3 Months, belum memiliki pembayaran/Pick/SJ. PDF prasyarat disimpan sungguhan di bucket privat uji. Satu reminder Planned terkait invoice tersedia.
- Pelanggan B memiliki NPWP. Invoice historis `INV-UAT-B-HIST` Rp5.000.000 sudah dibayar Rp2.000.000, sisa Rp3.000.000, dengan pengiriman historis Delivered.
- Pelanggan C tanpa NPWP, portofolio Sales, tanpa pengiriman Delivered yang belum lunas. Dua inquiry Open dengan harga sudah disepakati merupakan prasyarat, bukan tindakan pembuatan inquiry yang diuji.
- C1: Katun C 2 × Rp50.000 dan Poliester C 2 × Rp100.000 = Rp300.000. C2: Katun C 2 × Rp50.000 dan Poliester C 1 × Rp100.000 = Rp200.000. Requested price Rp55.000/Rp105.000 dan biaya produksi Rp30.000/Rp40.000 sengaja berbeda agar sumber harga konversi dapat diverifikasi.
- PDF C2 satu halaman diunggah melalui form konversi, tanggal kebutuhan 25 Oktober 2026. Nomor PO dikosongkan untuk menguji penomoran otomatis.

Status Clean mengikuti aturan aplikasi: invoice belum lunas baru dihitung sebagai Outstanding Payment setelah Surat Jalan Diterima. Karena itu C masih Clean saat invoice C1 sudah terbit tetapi belum dikirim; perilaku ini sesuai skenario, bukan bug.

## Hasil per langkah

| No. | Hasil yang diverifikasi | Status |
| --- | --- | --- |
| 21 | Manager mengubah A4 → A5, B tetap 3. PO dan invoice dengan ID yang sama menjadi Rp1.100.000, pembayaran Rp0, sisa penuh, due date tetap. Status Approved dipertahankan. Snapshot invoice diperbarui dan alasan ditemukan pada audit. | Lolos |
| 22 | Catatan kredit disimpan dan salinan memuat referensi PO, A5/B3, total/sisa Rp1.100.000, due date 16 Januari 2027. DPP Rp990.991 + PPN Rp109.009 = Rp1.100.000 pada tarif konfigurasi 11%. Confirmation Note internal juga ikut tercetak. | Selesai; BC-NOTE-01 |
| 23 | Manager membuat Pick dengan PIC dan A5/B3, melanjutkan ke Pack, memeriksa seluruh item dan menyelesaikannya. Lembar Completed dapat dicetak tanpa harga. | Lolos |
| 24 | Manager membuat Draft SJ dari Pick, mengirim dan mengunci rincian. Admin membuka salinan dengan referensi SO/PO/INV dan dua item benar, tanpa harga. INV-B tetap Unpaid/sisa Rp1.100.000. Product Code SJ kosong meskipun SKU sumber tersedia. | Selesai; BC-SKU-01 |
| 25 | Manager mencatat penerima aktual, waktu WIB, dan bukti penerimaan. SJ menjadi Delivered. Customer outstanding menampilkan Rp4.100.000 dan dua link invoice; masing-masing ditelusuri ke saldo Rp1.100.000 dan Rp3.000.000. | Lolos |
| 26 | Manager membayar Rp400.000: Partial/sisa Rp700.000, reminder masih Planned. Admin membayar Rp700.000: Paid/sisa Rp0, reminder otomatis Done dengan alasan pelunasan. Sales melihat dua pembayaran. Invoice lama tetap Rp5 juta/dibayar Rp2 juta/sisa Rp3 juta dan hanya satu pembayaran historis. | Lolos |
| 27 | Manager mengonversi C1 menjadi Converted to SO, SO Rp300.000 Invoiced/NotRequired, Credit 2 Weeks. Invoice otomatis Rp300.000 Unpaid. Produk, kuantitas, dan harga akhir mengikuti agreed prices inquiry. | Lolos |
| 28 | Sales mengonversi C2 saat pelanggan Clean. Status Converted to Customer PO; nomor otomatis `PO-2026-001`, total Rp200.000, Confirmed/NotRequired, Credit 2 Weeks, tanpa invoice. PDF/hash dan tanggal kebutuhan benar. | Lolos |
| 29 | Admin menerbitkan invoice PO-C. `INV-2026-001` Rp300.000 dan `INV-2026-002` Rp200.000 masing-masing Unpaid/dibayar Rp0/sisa penuh. Terbit 16 Oktober dan jatuh tempo 30 Oktober 2026 WIB, tepat 14 hari. Keduanya tanpa PPN. | Lolos |
| 30 | Admin membuat dua Pick dengan PIC berbeda, melanjutkan keduanya ke Pack dan Completed. Setiap item/kuantitas cocok dengan ordernya. Pada form SJ, kedua order muncul dalam satu tujuan pelanggan dengan dua pilihan Select all ready items. SJ gabungan belum dibuat. | Lolos |

## Temuan yang masih terbuka

### BC-NOTE-01 — Confirmation Note internal ikut tercetak

**P2, langkah 22; pengulangan FLOW-A-01.**

Manager mengisi keterangan bisnis tentang kredit tiga bulan, kemudian Confirmation Note `UAT22-INTERNAL: Manager memeriksa ketentuan kredit sebelum salinan dikirim`. Bagian Notes pada invoice mencetak keduanya. Ketentuan bisnis tetap benar, tetapi alasan tindakan internal ikut menjadi keterangan pelanggan.

Kode terkait: `src/lib/actions.ts:2131` menggabungkan notes dan actionNote; `src/app/invoices/[invoiceId]/print/page.tsx:162` mencetak seluruh notes. Perbaikan yang disarankan tetap memisahkan alasan audit dari catatan invoice pelanggan.

Bukti: [gambar salinan invoice](../outputs/uat-flow-bc-2026-10-16/22-credit-copy.png), [PDF invoice](../outputs/uat-flow-bc-2026-10-16/22-invoice-b.pdf), field `BC-NOTE-01` pada [evidence B](../outputs/uat-flow-bc-2026-10-16/flow-b-continuation-evidence.json).

### BC-SKU-01 — SKU kosong pada SJ PO

**P3, langkah 24; pengulangan AB-SKU-01.**

Produk SO memiliki SKU `UAT-BC-B-1`/`UAT-BC-B-2`. Kedua item SJ kembali tersimpan dengan productCode null dan kolom Product Code pada dokumen menampilkan `-`. Nama, kuantitas, dan referensi tetap benar, sehingga pengiriman dapat diselesaikan.

Kode terkait: `createDeliveryNote` di `src/lib/actions.ts` tidak membawa productSkuSnapshot ke productCode saat membuat deliveryNoteItem. Perbaikan yang disarankan adalah menyimpan snapshot SKU sumber pada item SJ.

Bukti: [salinan SJ Admin](../outputs/uat-flow-bc-2026-10-16/24-admin-sj-credit-copy.png), [PDF SJ](../outputs/uat-flow-bc-2026-10-16/24-sj-b.pdf), field `BC-SKU-01` pada [evidence B](../outputs/uat-flow-bc-2026-10-16/flow-b-continuation-evidence.json).

Bug filter cetak FLOW-A-02/AB-PRINT-01 tidak dipicu ulang secara khusus dalam run ini. Hasil cetak yang dicatat pada langkah 22–24 menggunakan seluruh baris yang terlihat; run ini tidak membuktikan bug filter tersebut sudah diperbaiki.

## Bukti utama

- [Outstanding Rp4.100.000 dan dua tagihan](../outputs/uat-flow-bc-2026-10-16/25-combined-outstanding.png).
- [Riwayat dua pembayaran Sales](../outputs/uat-flow-bc-2026-10-16/26-sales-two-payments.png).
- [Reminder Done setelah pelunasan](../outputs/uat-flow-bc-2026-10-16/26-reminder-done.png).
- [Inquiry C1 Converted to SO](../outputs/uat-flow-bc-2026-10-16/27-inquiry-c1-converted.png).
- [Inquiry C2 Converted to Customer PO](../outputs/uat-flow-bc-2026-10-16/28-inquiry-c2-converted.png).
- [Kedua order tersedia untuk digabung](../outputs/uat-flow-bc-2026-10-16/30-two-orders-ready-to-combine.png).
- [Evidence B lengkap](../outputs/uat-flow-bc-2026-10-16/flow-b-continuation-evidence.json) dan [evidence C lengkap](../outputs/uat-flow-bc-2026-10-16/flow-c-evidence.json).

## Integritas dan batas hasil

Pengujian menggunakan schema sementara berisi 22 tabel, 30 foreign key, dan 4 trigger serta bucket Storage privat khusus run. Fingerprint tabel public sebelum/sesudah sama. Schema dan bucket uji berhasil dihapus; berkas bukti lokal tetap disimpan.

[Ringkasan integritas](../outputs/uat-flow-bc-2026-10-16/run-browser-summary.json): publicUnchanged, schemaRemoved, dan storageRemoved semuanya true. [Hasil gabungan](../outputs/uat-flow-bc-2026-10-16/final-results.json): 10 langkah, 8 bersih, 2 dengan temuan lama, 0 kegagalan tindakan, 0 runtime error, 0 bug baru terkonfirmasi.

Reporter Playwright menunjukkan satu test group gagal dan satu lulus: kelompok B sengaja gagal pada assertion akhir bahwa daftar defect harus kosong, sementara semua tindakan 21–26 selesai. Kelompok C 27–30 lulus. TypeScript source/tes lulus dengan folder artefak tmp/outputs dikecualikan; git diff --check lulus. Tidak ada perbaikan aplikasi atau push dalam pekerjaan ini.

Hasil ini simulasi fungsional melalui browser, bukan sesi peserta manusia atau ukuran durasi usability. Pengiriman gabungan setelah langkah 30, printer fisik, mobile, dan concurrency besar belum diuji dalam run ini.

## Menjalankan ulang

```powershell
$env:SIT_UMKM_OUTPUT_DIR = 'outputs/uat-flow-bc-repeat'
node scripts/run-uat-flow-bc.mjs --browser-only

# Batasi salah satu kelompok jika diperlukan:
node scripts/run-uat-flow-bc.mjs --browser-only --browser-focus='Alur B 21-26'
node scripts/run-uat-flow-bc.mjs --browser-only --browser-focus='Alur C 27-30'
```

Gunakan folder output berbeda pada setiap run. Memerlukan konfigurasi database dan Storage lokal, Chrome, serta port 3137 kosong. Kredensial tidak dicatat pada laporan; outputs diabaikan Git.
