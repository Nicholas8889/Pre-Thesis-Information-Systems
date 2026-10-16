# Virtual run langkah 31–45 — pengiriman gabungan, pembatalan, dan Manager

Tanggal: 16 Oktober 2026 (WIB). Aplikasi lokal dari workspace saat ini, basis commit `0b2d05c` beserta perubahan lokal yang sudah ada. Kode aplikasi belum diperbaiki; perubahan pekerjaan ini berupa definisi tes, runner, dan laporan.

## Kesimpulan

Seluruh **15 tindakan bisnis** berhasil diselesaikan setelah selector pengujian untuk alur C diperjelas. Bukti akhir menggunakan run ulang C31–33 dan run utama D34–37/E38–45. Diagnosis tambahan hanya membaca tanggal pembayaran default.

Ditemukan **dua bug baru dan dua bug lama yang masih muncul**:

| ID | Prioritas | Temuan | Cakupan |
| --- | --- | --- | --- |
| CDE-CREATE-01 | P2 — baru | Halaman Create Surat Jalan juga membuka editor Draft SJ transaksi pelanggan lain. | 31 |
| CDE-DATE-01 | P2 — baru | Tanggal pembayaran default memakai hari UTC; pada awal hari WIB tampil tanggal sebelumnya. | Diagnosis tambahan terkait 33/45 |
| CDE-PRINT-01 | P2 — lama | Filter tabel menghilangkan barang dari hasil cetak SJ gabungan. | 31; perluasan FLOW-A-02 |
| CDE-SKU-01 | P3 — lama | Product Code/SKU kosong pada SJ gabungan meskipun SKU sumber tersedia. | 31; pengulangan AB-SKU-01 |

Rekap tindakan utama: C31 selesai dengan temuan, C32–33 dan D34–E45 selesai tanpa kegagalan tindakan. Tanggal pembayaran pada tindakan utama dipilih sesuai tanggal WIB, sehingga diagnosis default tanggal yang salah tidak mengubah hasil nominal pelunasan yang diuji.

## Data dan metode

- Chrome headless, viewport 1440 × 1000, zona waktu Asia/Jakarta; login form sebagai Manager, Admin, dan Sales. Aplikasi Next.js lokal port 3137.
- Schema run sebelumnya sudah dibersihkan. Fixture baru merekonstruksi prasyarat yang dibutuhkan; ID transaksi bukan ID fisik run sebelumnya.
- Data C disesuaikan dengan angka eksplisit langkah 31: SO-C A1 × Rp100.000 + B1 × Rp200.000 = Rp300.000; PO-C A2 × Rp100.000 = Rp200.000. Pengiriman gabungan berjumlah A3/B1. Ini berbeda dari komposisi data simulasi C pada run 21–30; perubahan asumsi sudah disampaikan sebelum run.
- Kedua invoice C awalnya Unpaid, Credit 2 Weeks, tanpa PPN; dua Picking List Completed, inquiry C1 Converted to SO dan C2 Converted to Customer PO. SKU sumber terisi.
- Pelanggan B memiliki invoice historis Rp5.000.000, dibayar Rp2.000.000, sisa Rp3.000.000, dengan pengiriman Delivered. Ini menjadi dasar Pending approval SO-D dan SO-E2/PO-E4.
- Prasyarat E2 adalah SO Sales Draft/Pending A4 × Rp100.000, kredit satu bulan. E4 adalah PO Sales Draft/Pending Rp200.000, kredit dua bulan, PDF awal dan tanggal kebutuhan 23 Oktober. E5 adalah SO Sales Confirmed Rp300.000, kredit dua minggu, tanpa NPWP/invoice.
- Prasyarat E7 adalah Draft SJ untuk 10 unit/Rp1.000.000 dari Pick Completed. E8 adalah invoice kredit Rp600.000, terbit 1 Oktober/jatuh tempo 8 Oktober, belum dibayar dengan reminder Planned.
- Pembuatan SO-D/PO-D/SO-E1, approval E2, semua revisi, pengiriman, penerimaan, pembayaran, penghapusan, dan pembatalan pada langkah yang diminta menggunakan UI. PDF E4 direvisi lewat upload UI dan unduhannya dibandingkan dengan byte file revisi.
- Audit diperiksa dari database dan halaman Audit Trail, termasuk detail pelaku/alasan untuk penghapusan, pembatalan, dan perubahan yang relevan.

## Hasil per langkah

| No. | Hasil yang diverifikasi | Hasil |
| --- | --- | --- |
| 31 | Satu SJ dibuat dari dua Pick: dua source order dan dua invoice benar. Jumlah barang A3/B1; tiga baris sumber mempertahankan rincian A1+B1 dari SO dan A2 dari PO. SJ Dikirim dan edit terkunci. Admin membuka PDF normal dengan kedua referensi order/invoice dan jumlah benar. | Selesai dengan CDE-CREATE/PRINT/SKU |
| 32 | Manager mencatat penerima aktual, waktu WIB, dan bukti penerimaan. SJ Delivered/Diterima; kedua inquiry menjadi Done. Invoice tetap Unpaid dengan sisa Rp300.000 dan Rp200.000. | Lolos |
| 33 | Admin melunasi C1 Rp300.000: C2 tetap Unpaid/sisa Rp200.000 dan reminder C2 masih Planned. Manager kemudian melunasi C2 Rp200.000. Keduanya Paid/sisa nol, reminder Done, dan kartu pelanggan C menampilkan Clean/outstanding Rp0. | Lolos tindakan; lihat diagnosis default tanggal |
| 34 | Sales membuat SO-D Rp100.000 untuk pelanggan B: Draft/Pending, tanpa invoice, Pick, atau SJ. Invoice historis B tetap bersisa Rp3.000.000. | Lolos |
| 35 | Admin menghapus SO-D tanpa dependensi dengan alasan. Record order/item hilang, URL detail mengembalikan 404, dan audit DELETED tetap tersedia dengan pelaku/alasan. | Lolos |
| 36 | Manager membuat PO-D Rp200.000 dengan PDF dan kredit dua bulan. PO langsung Invoiced/NotRequired, invoice Unpaid/dibayar Rp0/sisa Rp200.000. Due date dua bulan dan satu reminder Planned sesuai. | Lolos |
| 37 | Admin membatalkan invoice D dengan alasan. Invoice Cancelled, alasan/aktor/waktu tersimpan, reminder Planned menjadi Cancelled, invoice hilang dari receivables aktif, dan audit dapat dibuka. | Lolos |
| 38 | Manager membuat SO-E1 Rp400.000, Invoiced/NotRequired. Invoice otomatis Unpaid/dibayar Rp0/sisa penuh, due satu bulan, reminder Planned. Audit CREATED menunjukkan Manager. | Lolos |
| 39 | Manager Approve SO Sales E2. SO Approved/Invoiced; invoice Rp400.000 Unpaid dengan due satu bulan/reminder Planned. Keputusan dan aktor Manager tersimpan dan dapat dibaca di audit. | Lolos |
| 40 | Manager mengubah A4 → A5 pada E2. SO dan invoice ber-ID sama menjadi Rp500.000/sisa penuh/dibayar Rp0; Approved tetap. Alasan dan revisi item tersedia pada audit. | Lolos |
| 41 | Manager mengubah tanggal E4 menjadi 28 Oktober dan PDF revisi. Nomor PO/pelanggan/total Rp200.000/tenor dua bulan tetap, Draft/Pending tanpa invoice. PDF unduhan sama dengan file revisi; audit DRAFT_UPDATED menyimpan alasan/aktor. | Lolos |
| 42 | Manager menerbitkan invoice E5 Rp300.000 Unpaid/dibayar Rp0/sisa penuh. Jatuh tempo tepat 14 hari, tanpa PPN, SO Invoiced, reminder Planned, audit CREATED benar. | Lolos |
| 43 | Manager membatalkan invoice E5. Invoice dan reminder menjadi Cancelled, keluar dari receivables aktif, alasan/aktor Manager tersedia pada audit. | Lolos |
| 44 | Manager mengurangi Draft SJ-E7 dari 10 menjadi kirim 8/sisa 2. Status tetap Draft, catatan dan adjustment note tersimpan, source order/ref invoice tetap, invoice Rp1.000.000 tidak berubah. Audit DRAFT_UPDATED tersedia. | Lolos |
| 45 | Invoice E8 tampil Overdue sebelum bayar. Manager membayar Rp600.000: Paid/dibayar Rp600.000/sisa nol, reminder Done, keluar dari receivables aktif. Riwayat pembayaran dan aktornya ditemukan. Snapshot nominal/status semua invoice lain sebelum/sesudah identik. | Lolos tindakan; lihat diagnosis default tanggal |

## Bug baru: CDE-CREATE-01 — editor Draft lain ikut muncul saat membuat SJ

**P2, langkah 31.**

Reproduksi:

1. Siapkan Draft SJ milik pelanggan A, lalu buka Create Surat Jalan.
2. Pilih pelanggan C untuk SJ baru.
3. Halaman menampilkan form Create Draft untuk C, lalu di bawahnya editor `SJ-UAT-E7` milik A dengan kolom Recipient/Phone/Driver serta tombol Simpan Draft/Kirim Surat Jalan sendiri.

Ada dua dropdown `deliveryAssignmentId` dan dua konteks transaksi berbeda pada halaman yang sama. Pengguna dapat mengira tombol/kolom editor bawah masih bagian dari pembuatan SJ baru. Run terarah dapat menyelesaikan tindakan dengan memilih form Create secara spesifik; tidak terjadi salah pengiriman pada pengujian.

Ekspektasi: halaman Create fokus pada transaksi baru; editor Draft lain dibuka setelah pengguna memilih transaksi tersebut secara eksplisit.

Penyebab yang terlihat di kode: `src/app/surat-jalan/page.tsx:219` memilih record pertama melalui fallback `visibleDeliveryNotes[0]?.id` pada baris 223; form Create dirender pada baris 284 dan detail/editor record terpilih tetap dirender pada baris 308 tanpa mengecualikan mode create.

Saran: hindari pemilihan otomatis/editor transaksi lama saat mode create, atau pisahkan tampilan pembuatan dan pengeditan.

Bukti: [dua form pelanggan berbeda](../outputs/uat-flow-cde-2026-10-16-c-recheck/31-create-and-unrelated-draft-editor.png), field CDE-CREATE-01 pada [evidence C run ulang](../outputs/uat-flow-cde-2026-10-16-c-recheck/flow-c-continuation-evidence.json).

## Bug baru: CDE-DATE-01 — tanggal pembayaran default mundur sehari dari WIB

**P2, diagnosis tambahan terkait pembayaran langkah 33/45.**

Pada 16 Oktober 2026 pukul 00:31 WIB, browser dengan timezone Asia/Jakarta membuka form pembayaran. Payment Date otomatis terisi **15 Oktober 2026**, sedangkan hari bisnis WIB adalah **16 Oktober 2026**.

Observasi tepat: `observedAtUtc=2026-10-15T17:31:32.513Z`, `expectedWib=2026-10-16`, `actual=2026-10-15`. Diagnosis membaca default tanpa mengirim pembayaran tambahan. Pembayaran skenario utama mengisi tanggal WIB secara eksplisit.

Penyebab: `src/app/payments/page.tsx:237` memasok `today={toDateInputValue()}`; `src/lib/workflow.ts:207` memakai `date.toISOString().slice(0,10)`, sehingga mengambil hari UTC. Perbedaan ini muncul pada awal hari WIB sebelum tanggal UTC berganti.

Dampak: tanggal bawaan berbeda dari tanggal bukti pembayaran hari itu. Pengguna perlu mengoreksinya agar catatan pembayaran mengikuti tanggal bisnis.

Saran: gunakan tanggal bisnis WIB untuk nilai default pembayaran; helper `toBusinessDateInputWib` sudah tersedia pada business-clock.

Bukti: [form dengan tanggal default](../outputs/uat-flow-cde-2026-10-16-date-check/payment-date-default.png), [diagnosis tanggal dan timezone](../outputs/uat-flow-cde-2026-10-16-date-check/payment-date-diagnostic.json).

## Bug lama yang terulang pada SJ gabungan

**CDE-PRINT-01/P2:** setelah Admin membuka cetak SJ gabungan, pencarian Produk B menyembunyikan kedua baris Produk A. Print media dan PDF hanya memuat Produk B, sementara dokumen yang benar harus memuat A3/B1. [PDF normal](../outputs/uat-flow-cde-2026-10-16-c-recheck/31-combined-sj.pdf), [PDF tidak lengkap setelah filter](../outputs/uat-flow-cde-2026-10-16-c-recheck/31-combined-filtered.pdf), [print media](../outputs/uat-flow-cde-2026-10-16-c-recheck/31-combined-filtered-print-media.png). Ini perluasan FLOW-A-02; perbaikan tetap perlu mencegah filter/paginasi layar mengurangi isi dokumen cetak.

**CDE-SKU-01/P3:** seluruh item SJ gabungan memiliki productCode kosong walaupun SO sumber memiliki SKU. Kolom Product Code mencetak `-`. Nama/jumlah tetap benar. Ini pengulangan AB-SKU-01; SKU snapshot sumber perlu diteruskan saat deliveryNoteItem dibuat.

## Bukti, provenance, dan integritas

Bukti akhir tidak menggabungkan record dari schema yang berbeda sebagai satu database fisik. Setiap kelompok dinilai dari fixture dan tindakan dalam schema run-nya sendiri:

- C31–33: [evidence run ulang](../outputs/uat-flow-cde-2026-10-16-c-recheck/flow-c-continuation-evidence.json).
- D34–37: [evidence run utama](../outputs/uat-flow-cde-2026-10-16/flow-d-evidence.json).
- E38–45: [evidence run utama](../outputs/uat-flow-cde-2026-10-16/flow-e-evidence.json).
- Diagnosis tambahan tanggal: [evidence tersendiri](../outputs/uat-flow-cde-2026-10-16-date-check/payment-date-diagnostic.json).
- [Hasil gabungan dengan sumber setiap kelompok](../outputs/uat-flow-cde-2026-10-16/final-results.json).

Run awal C31 berhenti karena selector pengujian yang terlalu umum menjumpai dua dropdown kendaraan. C32 tidak dapat dilanjutkan karena SJ belum dibuat. Ini bukan bukti bahwa penyimpanan SJ atau penerimaan gagal pada aplikasi. Setelah selector dibatasi ke form Create, ketiga langkah C diselesaikan ulang; keberadaan editor transaksi lain tetap dicatat sebagai defect usability tersendiri. D dan E pada run utama seluruhnya lulus.

Run utama, run ulang C, dan diagnosis tanggal masing-masing menggunakan schema kosong 22 tabel/30 foreign key/4 trigger serta bucket privat khusus run. Ketiga run memverifikasi publicUnchanged, schemaRemoved, dan storageRemoved = true: [utama](../outputs/uat-flow-cde-2026-10-16/run-browser-summary.json), [C ulang](../outputs/uat-flow-cde-2026-10-16-c-recheck/run-browser-summary.json), [tanggal](../outputs/uat-flow-cde-2026-10-16-date-check/run-browser-summary.json).

Tidak ada pageerror JavaScript yang tercatat. Log awal memuat peringatan hydration dengan atribut `caret-color:transparent` saat screenshot; atribut tersebut berasal dari penanganan caret screenshot Playwright. Ini tidak dihitung sebagai bug aplikasi. Helper screenshot kemudian menunggu network idle dan mempertahankan caret. Tidak ada crash atau kegagalan simpan terkait peringatan tersebut yang diamati.

Reporter awal menunjukkan C gagal/D dan E lulus; reporter C ulang gagal pada assertion daftar defect kosong, walaupun tindakan C31–33 selesai; diagnosis tanggal gagal karena default memang berbeda dari WIB. TypeScript source/tes dan git diff --check lulus. Tidak ada fix aplikasi atau push dalam pekerjaan ini.

Pengujian adalah simulasi fungsional, bukan pengukuran durasi peserta manusia. Printer fisik, mobile, dan concurrency besar belum diuji.

## Menjalankan ulang

```powershell
$env:SIT_UMKM_OUTPUT_DIR = 'outputs/uat-flow-cde-repeat'
node scripts/run-uat-flow-cde.mjs --browser-only

# Run kelompok tertentu dengan folder output terpisah:
node scripts/run-uat-flow-cde.mjs --browser-only --browser-focus='Alur C 31-33'
node scripts/run-uat-flow-cde.mjs --browser-only --browser-focus='Alur D 34-37'
node scripts/run-uat-flow-cde.mjs --browser-only --browser-focus='Alur E 38-45'
node scripts/run-uat-flow-cde.mjs --browser-only --browser-focus='Diagnostic default'
```

Diagnosis tanggal menilai waktu aktual; perbedaan UTC/WIB teramati pada awal hari WIB. Gunakan output berbeda per run agar bukti tidak tertimpa. Memerlukan konfigurasi database/Storage lokal, Chrome, dan port 3137 kosong. Kredensial tidak dicatat; outputs diabaikan Git.
