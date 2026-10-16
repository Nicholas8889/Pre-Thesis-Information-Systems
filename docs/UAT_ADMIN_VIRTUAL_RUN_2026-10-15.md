# Hasil simulasi virtual skenario Admin A1–A7

Tanggal: 15 Oktober 2026 (WIB). Aplikasi: CV Tajuk Revenue Cycle Information System pada working tree lokal saat pengujian.

**Hasil akhir: 7/7 skenario berhasil secara fungsional melalui browser sebagai Admin.** Ini merupakan simulasi otomatis dengan panduan rute dan pemeriksaan database, bukan hasil observasi responden UAT manusia. Tidak ada perbaikan kode aplikasi yang dilakukan untuk memperoleh hasil ini.

## Metode dan batas interpretasi

- Browser Chrome, viewport 1440 × 1000, aplikasi Next.js lokal pada port 3137, login Admin sungguhan. Tindakan yang dinilai dilakukan melalui UI, termasuk dialog konfirmasi.
- Prasyarat disiapkan sebagai data fiktif pada schema database sementara. Pembuatan fixture melalui database tidak dihitung sebagai keberhasilan tindakan peserta. A2–A6 menggunakan fixture masing-masing agar hasil tidak bergantung pada kegagalan skenario lain.
- Pemeriksaan menggabungkan hasil pada UI, pemuatan ulang halaman, serta data tersimpan. Bukti layar dan JSON disimpan sebelum schema uji dihapus.
- Struktur schema uji mencakup 22 tabel, 30 foreign key, dan 4 trigger. Kedua putaran mengonfirmasi `publicUnchanged: true` dan `schemaRemoved: true`.
- Durasi di bawah dihitung dari awal tindakan skenario sampai verifikasi selesai; login dan persiapan fixture dikecualikan. Durasi dapat mencakup kompilasi halaman lokal, navigasi, pemeriksaan, dan screenshot. Angka ini tidak mengukur kecepatan, kemudahan, kesalahan, atau pemahaman pengguna manusia.
- Tidak ada invoice yang dikirim ke pelanggan, pelanggan yang benar-benar dihubungi, ataupun transfer uang sungguhan. Tampilan cetak dibuka; pencetakan fisik tidak diuji.

## Ringkasan hasil akhir

| ID | Hasil virtual | Bukti yang diverifikasi | Durasi otomatis | Batas skenario |
| --- | --- | --- | ---: | ---: |
| A1 | Berhasil | Pelanggan baru tersimpan satu kali, dicari melalui kolom pencarian, dan detail kontak dibuka kembali. | 4,6 detik | 6 menit |
| A2 | Berhasil | Admin membuat satu invoice Rp5.000.000 dari SO Confirmed; jatuh tempo 22 Oktober 2026 sesuai kredit 1 minggu; tampilan cetak dibuka. | 6,9 detik | 8 menit |
| A3 | Berhasil | Pembayaran Bank Transfer Rp2.000.000 tersimpan; saldo Rp3.000.000, status Partial, dan riwayat pembayaran ditemukan. | 5,0 detik | 8 menit |
| A4 | Berhasil | Checklist barang lengkap, PIC tersimpan, kuantitas packing 100; Surat Jalan diterbitkan dengan driver dan plat kendaraan; tampilan cetak dibuka. | 19,4 detik | 20 menit |
| A5 | Berhasil | Invoice Overdue ditemukan; tugas Planned tersimpan lalu Done dengan hasil kontak dan alasan; invoice tetap Overdue dengan saldo Rp3.000.000. | 8,5 detik | 10 menit |
| A6 | Berhasil | Pelunasan Rp3.000.000 tersimpan; total pembayaran Rp5.000.000, saldo Rp0, status Paid pada tab Completed; hilang dari piutang aktif. | 4,8 detik | 4 menit |
| A7 | Berhasil | Produk biaya Rp30.000 dibuat lalu diubah menjadi Rp32.000 dengan catatan; ID tetap sama, satu produk, dan riwayat biaya terbentuk. | 8,2 detik | 8 menit |

Semua durasi otomatis berada di bawah batas skenario. Batas waktu untuk peserta manusia tetap perlu diuji langsung.

## Kartu data simulasi dan alur yang dijalankan

### A1 — Pelanggan baru

Perusahaan `PT Pelanggan Baru UAT UT-01`; kontak `Ibu Rina UT-01`; telepon `081234567891`; email `rina.uat@example.test`; alamat `Jl. Uji Pelanggan 1, Jakarta`; segmen Retail; catatan `Pelanggan simulasi UAT A1`.

Alur: Customers → Add Customer → isi data → simpan dan konfirmasi → kembali ke daftar → cari `UT-01` → buka detail. Data perusahaan dan kontak cocok dengan data tersimpan; tidak ada duplikat.

Bukti: [detail pelanggan ditemukan kembali](../outputs/uat-admin-2026-10-15-recheck/A1-customer-found.png), [JSON A1](../outputs/uat-admin-2026-10-15-recheck/A1-evidence.json).

### A2 — Invoice

Prasyarat: `SO-UAT-A2`, pelanggan `PT Simulasi UAT A2`, pembuat pesanan akun Sales, status Confirmed dan belum mempunyai invoice. Barang `Kain Fixture UAT`, 100 unit × Rp50.000 = Rp5.000.000, tanpa PPN, kredit 1 minggu.

Alur: detail Sales Order → Generate Invoice → konfirmasi → periksa detail invoice → Cetak Invoice. Invoice `INV-2026-001` dibuat pada 15 Oktober 2026 dengan jatuh tempo 22 Oktober 2026. Total, perusahaan, nomor pesanan, dan isi halaman cetak sesuai.

**Catatan untuk kartu tugas manusia:** jalur pembuatan pesanan normal aplikasi dapat menghasilkan invoice otomatis. Jika tujuan A2 menilai Admin membuat invoice, fasilitator harus menyediakan pesanan Confirmed tanpa invoice seperti fixture ini. Jika memakai pesanan yang sudah mempunyai invoice, sesuaikan tugas menjadi menemukan, memeriksa, dan menyiapkan invoice yang sudah ada.

Bukti: [detail invoice](../outputs/uat-admin-2026-10-15-recheck/A2-invoice-verified.png), [tampilan cetak](../outputs/uat-admin-2026-10-15-recheck/A2-invoice-print.png), [JSON A2](../outputs/uat-admin-2026-10-15-recheck/A2-evidence.json).

### A3 — Pembayaran sebagian

Prasyarat: `INV-UAT-A3`, nilai Rp5.000.000, belum dibayar, jatuh tempo 1 November 2026. Data bukti transfer fiktif: referensi `UAT-TRF-A3-001`, tanggal 15 Oktober 2026, nominal Rp2.000.000, metode Bank Transfer.

Alur: Payments → pilih invoice → isi tanggal, nominal, metode, dan referensi → simpan → periksa invoice → temukan riwayat pembayaran. Penjelasan posisi tagihan: sudah dibayar Rp2.000.000; sisa Rp3.000.000; status Partial.

**Batas bukti pembayaran:** form pembayaran saat ini tidak menyediakan unggah bukti transfer. Simulasi memakai informasi bukti fiktif sebagai referensi dalam Notes; tidak menguji penyimpanan file bukti transfer.

Bukti: [saldo invoice](../outputs/uat-admin-2026-10-15/A3-balance.png), [riwayat pembayaran](../outputs/uat-admin-2026-10-15/A3-history.png), [JSON A3](../outputs/uat-admin-2026-10-15/A3-evidence.json).

### A4 — Packing dan Surat Jalan

Prasyarat: `SO-UAT-A4` dan `INV-UAT-A4`, 100 unit Kain Fixture UAT, tujuan `Jl. Simulasi UAT 15, Jakarta`. Hasil pemeriksaan fiktif: seluruh barang diperiksa dan lengkap. PIC `Pak Gudang UAT`; pengemudi `Budi Santoso`; kendaraan `B 1234 TJK`.

Alur: buat Picking List → Lanjut ke Pack → centang pemeriksaan → Selesaikan Pick & Pack → buat Draft Surat Jalan untuk seluruh barang → Kirim Surat Jalan → Ya, Kirim & Kunci → buka tampilan cetak.

Packing berstatus Packed dengan `pickerName` dan `packerName` sama-sama `Pak Gudang UAT`. Semua item diperiksa dan jumlah packing sama dengan jumlah pesanan. `SJ-2026-001` diterbitkan sebagai Issued; label pada dokumen adalah Dikirim. Nomor pesanan, perusahaan, jumlah 100, PIC, pengemudi, dan kendaraan terverifikasi. Penerimaan barang oleh pelanggan berada di luar tugas A4.

Bukti: [packing](../outputs/uat-admin-2026-10-15/A4-packed.png), [Surat Jalan siap cetak](../outputs/uat-admin-2026-10-15/A4-surat-jalan-print.png), [JSON A4](../outputs/uat-admin-2026-10-15/A4-evidence.json).

### A5 — Penagihan

Prasyarat: `INV-UAT-A5`, total Rp5.000.000, pembayaran sebelumnya Rp2.000.000, sisa Rp3.000.000, jatuh tempo 8 Oktober 2026. Rencana: hubungi pelanggan via telepon pada 15 Oktober 2026. Hasil kontak fiktif: pelanggan berjanji membayar Rp3.000.000 pada 20 Oktober 2026.

Alur: Receivables → filter Overdue dan temukan invoice → Create Collection Task → simpan Planned → buka tugas → isi hasil kontak, ubah Done, dan isi alasan → simpan → periksa tab Completed serta invoice.

Tugas Done dan hasil kontak tersimpan; alasan penyelesaian juga terverifikasi dalam audit. Penjelasan posisi sekarang: pekerjaan kontak penagihan selesai. Janji bayar bukan pembayaran; saldo invoice tetap Rp3.000.000 dan status tetap Overdue sampai pembayaran dicatat.

Bukti: [invoice overdue ditemukan](../outputs/uat-admin-2026-10-15/A5-overdue-found.png), [tugas Planned](../outputs/uat-admin-2026-10-15/A5-planned.png), [tugas Done](../outputs/uat-admin-2026-10-15/A5-done.png), [invoice tetap overdue](../outputs/uat-admin-2026-10-15/A5-invoice-still-overdue.png), [JSON A5](../outputs/uat-admin-2026-10-15/A5-evidence.json).

### A6 — Pelunasan

Prasyarat: `INV-UAT-A6`, total Rp5.000.000, telah dibayar Rp2.000.000. Pelunasan fiktif `UAT-TRF-A6-001` sebesar Rp3.000.000 melalui Bank Transfer pada 15 Oktober 2026.

Alur: Payments → catat seluruh sisa Rp3.000.000 → buka Invoices tab Completed → periksa Paid dan Remaining Rp0 → periksa piutang aktif. Dua pembayaran berjumlah Rp5.000.000; invoice tidak lagi berada dalam piutang aktif.

Tab Completed invoice menampilkan daftar ringkas. Verifikasi Paid dan saldo nol dilakukan pada baris invoice, bukan mengasumsikan detail invoice ditampilkan di tab tersebut.

Bukti: [Paid dan saldo nol](../outputs/uat-admin-2026-10-15-recheck/A6-paid-zero.png), [tidak ada piutang aktif](../outputs/uat-admin-2026-10-15-recheck/A6-no-active-receivable.png), [JSON A6](../outputs/uat-admin-2026-10-15-recheck/A6-evidence.json).

### A7 — Produk baru dan perubahan biaya

Data: nama `Kain Uji UT-01`, SKU kartu simulasi `UAT-UT-01`, status Active, biaya awal Rp30.000/unit. Perubahan: biaya Rp32.000/unit dan catatan `Biaya diperbarui`.

Alur: Products → Add Product → simpan → buka produk yang sama → Edit Product → ubah biaya dan Notes → Save Product → buka kembali detail. ID produk tidak berubah, jumlah produk dengan nama/SKU tersebut masing-masing satu, dan riwayat biaya memuat Rp30.000 serta Rp32.000.

Aplikasi menambahkan `Confirmation note: Simulasi UAT Admin` pada Notes setelah konfirmasi. Teks `Biaya diperbarui` tetap tersimpan dan terlihat; catatan akhirnya juga memuat teks sistem tersebut.

Bukti: [produk setelah perubahan](../outputs/uat-admin-2026-10-15-recheck/A7-updated-product.png), [JSON A7](../outputs/uat-admin-2026-10-15-recheck/A7-evidence.json).

## Riwayat pelaksanaan dan integritas bukti

Putaran pertama menjalankan seluruh tujuh skenario: A3, A4, dan A5 langsung lulus. Empat pemeriksaan otomatis lainnya berhenti karena asumsi skrip: Notes dibandingkan sebagai teks persis pada A1/A7 meskipun aplikasi menambahkan catatan konfirmasi; format mata uang halaman cetak A2 memakai pemisah berbeda; dan A6 mengharapkan panel detail pada tab Completed yang sebenarnya hanya menampilkan tabel.

Skrip diperbaiki untuk memeriksa data masukan beserta catatan tambahan, format angka cetak yang benar, dan baris invoice pada tab Completed. Pengujian ulang hanya menjalankan A1, A2, A6, dan A7; semuanya lulus. Tidak ada hasil mentah putaran pertama yang diubah menjadi lulus. Ringkasan akhir menggabungkan tiga hasil lulus putaran pertama dengan empat hasil lulus pengujian ulang.

- [Hasil browser putaran pertama](../outputs/uat-admin-2026-10-15/browser-results.json)
- [Integritas dan cleanup putaran pertama](../outputs/uat-admin-2026-10-15/run-browser-summary.json)
- [Hasil browser pengujian ulang](../outputs/uat-admin-2026-10-15-recheck/browser-results.json)
- [Integritas dan cleanup pengujian ulang](../outputs/uat-admin-2026-10-15-recheck/run-browser-summary.json)
- [Ringkasan gabungan beserta sumber tiap hasil](../outputs/uat-admin-2026-10-15/final-results.json)

## Menjalankan ulang

Gunakan konfigurasi lingkungan database proyek yang sudah tersedia, lalu dari root proyek:

```powershell
$env:SIT_UMKM_OUTPUT_DIR = 'outputs/uat-admin-new-run'
node scripts/run-uat-admin.mjs --browser-only
```

Skrip membuat schema sementara, memulai aplikasi lokal terisolasi, menjalankan tujuh skenario, menyimpan bukti, mematikan server uji, menghapus schema, dan membandingkan fingerprint data utama. Gunakan direktori output baru agar bukti lama tetap tersedia. Jangan reset atau reseed data utama.

Sumber pengujian: [skenario browser](../e2e/uat-admin.spec.ts), [konfigurasi Playwright](../playwright.uat-admin.config.ts), [runner terisolasi](../scripts/run-uat-admin.mjs). Lint untuk ketiga file tersebut lulus tanpa peringatan.
