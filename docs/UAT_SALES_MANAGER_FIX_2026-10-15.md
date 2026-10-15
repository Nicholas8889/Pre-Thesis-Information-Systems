# Perbaikan temuan Sales/Manager — 15 Oktober 2026

Perbaikan diterapkan pada working tree lokal. Tidak ada deployment, migrasi, reset database, atau koreksi massal data historis.

## Perubahan

| Temuan | Hasil perbaikan |
| --- | --- |
| SM-01: biaya produksi otomatis menjadi harga kesepakatan | Pemilihan produk membiarkan Agreed Unit Price kosong. Requested Unit Price maupun biaya produksi tidak lagi menjadi fallback harga konversi. Semua item wajib mempunyai harga kesepakatan eksplisit. |
| SM-02: negosiasi setelah inquiry disimpan terblokir | Detail inquiry Open menyediakan **Update Agreed Prices**. Harga dapat disimpan setelah negosiasi lalu inquiry dikonversi menjadi pesanan. Form konversi mengikuti produk, jumlah, dan harga tersimpan serta menyediakan tautan kembali ke inquiry. |
| SM-03: lokasi alasan Approve tidak konsisten | Alasan yang diisi pada konfirmasi Approve juga masuk ke Approval Decision Note, seperti Reject; Notes dan Audit tetap menyimpan alasan. |
| SM-04/05: cakupan periode/status KPI membingungkan | Label menjadi **All-time Order Value**, dengan keterangan semua tanggal/status, termasuk Pending dan Cancelled. Pembayaran dijelaskan sebagai seluruh tanggal; piutang sebagai saldo kini. Label bulan berjalan yang memberi kesan semua angka berbasis bulan tersebut dihapus. Rumus agregat tidak diubah. |
| SM-06: perubahan audit berbentuk JSON teknis | Detail audit menampilkan Before/After dengan nama field yang mudah dibaca, pelaku, referensi, waktu, dan alasan dalam satu dialog. |
| SM-07: panel audit terpotong | Detail audit dibuka melalui dialog di atas halaman. Dialog terverifikasi berada dalam viewport desktop 1440 px dan mobile 390 px tanpa overflow horizontal. Escape dan Close mengembalikan fokus ke tombol asal. |

Penyimpanan harga menggunakan transaksi dan pemeriksaan `updatedAt`: update dari halaman lama ditolak, semua item harus milik inquiry yang sama, Sales dibatasi ke portfolio sendiri, dan inquiry yang telah dikonversi tidak dapat diubah harganya. Perubahan harga mencatat nilai sebelum/sesudah di Audit Trail. Pemeriksaan kecocokan harga sumber pada konversi tetap aktif.

Pengaman tambahan memeriksa schema koneksi sebelum memanggil fungsi refresh analisis bersama. Jika schema bukan `public`, fungsi bersama tidak dipanggil. Ini mencegah pengulangan insiden isolasi pada pengujian sebelumnya.

## Verifikasi

- **32 unit test lulus** pada enam file terkait: aturan harga inquiry, pembacaan/aksi analisis, batas schema refresh, harga form pesanan, serta token idempotensi SO/PO. File aturan inquiry dijalankan ulang setelah menambah pembanding harga valid dan tetap lulus (8 tes).
- **1 tes integrasi lulus**, mencakup penolakan konversi tanpa kesepakatan, penyimpanan harga negosiasi, pembatasan portfolio, penolakan update stale, audit nilai sebelum/sesudah, konversi sesuai harga tersimpan, penolakan edit setelah konversi, serta penolakan produk inactive/harga nol.
- **8 pemeriksaan browser unik lulus setelah pengujian ulang:** S1, S2, S2B, S2C, S3, M1, M2, M3. S2B/S2C merupakan kontrol tambahan untuk harga final sejak awal dan pencegahan fallback biaya produksi.
- Pemeriksaan TypeScript dan lint untuk file perubahan lulus.
- Semua putaran pengujian perbaikan memverifikasi `publicUnchanged: true` dan `schemaRemoved: true`. Data utama tidak berubah pada putaran perbaikan ini; server dan schema uji sudah dibersihkan.

Putaran browser utama meluluskan tujuh pemeriksaan. M3 sempat menemukan fokus yang tidak kembali setelah Escape; hal itu diperbaiki dan M3 dijalankan ulang sampai lulus. S2 dan M2 kemudian diperiksa ulang dengan menunggu tampilan tujuan secara eksplisit, agar bukti layar tidak merekam tampilan sebelum navigasi selesai. Hasil mentah setiap putaran tetap disimpan.

## Bukti hasil

- [S2: harga negosiasi tersimpan](../outputs/uat-sales-manager-fix-final-2026-10-15/S2-negotiated-prices-saved.png)
- [S2: pesanan hasil konversi](../outputs/uat-sales-manager-fix-final-2026-10-15/S2-conversion-result.png)
- [S2C: konversi menunggu harga kesepakatan](../outputs/uat-sales-manager-fix-2026-10-15/S2C-agreement-required.png)
- [M1: alasan persetujuan pada detail pesanan](../outputs/uat-sales-manager-fix-2026-10-15/M1-approved-detail.png)
- [M2: cakupan KPI diperjelas](../outputs/uat-sales-manager-fix-final-2026-10-15/M2-dashboard-kpi-and-trend.png)
- [M2: invoice pendukung prioritas](../outputs/uat-sales-manager-fix-final-2026-10-15/M2-priority-invoice.png)
- [M3: dialog desktop](../outputs/uat-sales-manager-fix-audit-2026-10-15/M3-audit-dialog-1440.png)
- [M3: dialog mobile](../outputs/uat-sales-manager-fix-audit-2026-10-15/M3-audit-dialog-390.png)
- [Integrasi harga](../outputs/uat-sales-manager-fix-2026-10-15/inquiry-price-conversion-integration-results.json)
- [Integritas putaran utama](../outputs/uat-sales-manager-fix-2026-10-15/run-inquiry-price-conversion-integration-summary.json)
- [Integritas pengujian audit](../outputs/uat-sales-manager-fix-audit-2026-10-15/run-browser-summary.json)
- [Integritas pemeriksaan akhir](../outputs/uat-sales-manager-fix-final-2026-10-15/run-browser-summary.json)
- [Ringkasan gabungan dan sumber hasil](../outputs/uat-sales-manager-fix-2026-10-15/final-results.json)

## Batas perubahan

Inquiry lama yang sudah terlanjur menyimpan biaya produksi sebagai harga kesepakatan tidak diubah otomatis, karena nilainya bisa juga merupakan harga yang memang disepakati. Tinjau dan ubah melalui form harga kesepakatan sebelum konversi bila perlu. Dokumen/pesanan yang telah terbentuk tidak ditulis ulang.

Dashboard tetap menampilkan seluruh riwayat dan saldo kini, dengan label yang menjelaskan cakupan tersebut. Perbaikan ini tidak menambahkan pemilih periode bulanan atau mengubah definisi penjumlahan semua pesanan. Pengukuran waktu dan pemahaman peserta manusia tetap dilakukan saat usability testing.
