# Simulasi Sales dan Manager — hasil dan daftar bug

> Status terbaru: temuan di bawah merekam kondisi sebelum perbaikan. Lihat [laporan perbaikan dan pengujian ulang](UAT_SALES_MANAGER_FIX_2026-10-15.md) untuk hasil setelah perbaikan.

Tanggal: 15 Oktober 2026 (WIB). Peran: Sales dan Manager, login melalui browser Chrome. Pengujian menggunakan working tree lokal saat pelaksanaan, tanpa memperbaiki kode aplikasi.

**Dua masalah harga pada S2 perlu diperbaiki sebelum usability testing.** S1, S3, dan keputusan M1 dapat diselesaikan. Data untuk M2 dan M3 tersedia, tetapi terdapat masalah interpretasi KPI dan tampilan detail audit.

## Hasil enam tugas

| ID | Hasil virtual | Bukti hasil dan batas interpretasi |
| --- | --- | --- |
| S1 | Berhasil secara fungsional | Pelanggan ditemukan melalui pencarian; transaksi lunas dan belum lunas ditemukan. Invoice Rp5 juta sudah dibayar Rp2 juta, sisa Rp3 juta, efektif Overdue. |
| S2 | Sebagian; alur negosiasi terblokir | Inquiry dua item tersimpan. Perubahan ke harga kesepakatan baru ditolak saat konversi, dan inquiry tersimpan tidak menyediakan edit harga. |
| S3 | Berhasil secara fungsional | Pesanan Rp500.000 tersimpan Draft/Pending, alasan Outstanding Payment terlihat, invoice belum dibuat, dan instruksi menunggu Manager tersedia. |
| M1 | Berhasil secara fungsional | Approve dengan alasan menghasilkan Approved/Invoiced beserta invoice. Kontrol Reject menghasilkan Cancelled/Rejected tanpa invoice. Alasan dapat ditemukan di Notes/Audit. |
| M2 | Bukti transaksi berhasil ditelusuri; cakupan periode bermasalah | KPI ditemukan dan cocok dengan agregat database. Invoice Overdue Rp3 juta dapat ditelusuri. KPI merupakan akumulasi seluruh tanggal, bukan otomatis bulan yang tampil pada Highlights. |
| M3 | Informasi benar; ada kendala tampilan | Pelaku dan perubahan Draft/Pending → Cancelled/Rejected ditemukan. Saat detail dibuka, hanya sekitar 10,4% lebar panel terlihat; perlu scroll horizontal tambahan. |

Pemahaman manusia dan batas waktu 3–16 menit belum diukur. Durasi otomatis tidak dapat digunakan sebagai hasil waktu responden. Otomatisasi mengetahui rute aplikasi dan memverifikasi data melalui UI serta database.

## Bug yang direproduksi

### SM-02 — P1: harga hasil negosiasi tidak dapat diterapkan setelah inquiry disimpan

**Dampak:** menghalangi penyelesaian S2 sesuai urutan kerja “catat permintaan, setelah harga disepakati lanjutkan menjadi pesanan”.

Langkah reproduksi:

1. Login Sales, buat inquiry dua produk: Katun 10 unit dengan Requested Unit Price Rp50.000, Poliester 20 unit dengan Requested Unit Price Rp75.000.
2. Kosongkan Agreed Unit Price karena kesepakatan belum terjadi, lalu simpan inquiry.
3. Setelah kesepakatan fiktif terjadi, buka Convert to Sales Order.
4. Form memperbolehkan Base Unit Price diubah menjadi Rp48.000 dan Rp70.000. Kirim pesanan tersebut.

Hasil: pesanan tidak dibuat. Aplikasi menampilkan `Inquiry products are unavailable or the conversion payload no longer matches the source`, kembali ke daftar, dan tidak memberikan jalur memperbarui harga inquiry yang sudah tersimpan. Ini terulang pada dua schema uji berbeda.

Harapan: ada jalur tercatat untuk memperbarui harga kesepakatan inquiry sebelum konversi. Jika harga pada konversi harus mengikuti inquiry secara ketat, UI perlu menyediakan edit inquiry dan tidak membiarkan input konversi seolah dapat diubah bebas.

Penyebab terkait: [pemeriksaan kecocokan harga sumber](../src/lib/actions.ts) membandingkan harga yang dikirim dengan harga inquiry tersimpan; [detail inquiry](../src/app/customer-inquiries/[inquiryId]/page.tsx) tidak memiliki edit harga. Pemeriksaan integritas server tetap diperlukan; masalahnya adalah tidak tersedianya alur negosiasi yang didukung UI.

Bukti: [inquiry tersimpan](../outputs/uat-sales-manager-2026-10-15-recheck/S2-inquiry-saved.png), [harga kesepakatan diisi](../outputs/uat-sales-manager-2026-10-15-recheck/S2-negotiated-price-entered.png), [konversi ditolak](../outputs/uat-sales-manager-2026-10-15-recheck/S2-conversion-result.png), [JSON S2](../outputs/uat-sales-manager-2026-10-15-recheck/S2-evidence.json).

Kontrol S2B: jika harga final Rp48.000 dan Rp70.000 sudah diisi sebelum inquiry pertama kali disimpan, konversi berhasil menjadi Sales Order Confirmed Rp1.880.000. Sales tidak menghasilkan invoice pada jalur ini; Admin/Manager dapat melanjutkannya. Jadi fungsi konversi dasar bekerja, tetapi negosiasi setelah penyimpanan terhalang. [JSON kontrol](../outputs/uat-sales-manager-2026-10-15-recheck/S2B-evidence.json).

### SM-01 — P1: biaya produksi otomatis menjadi Agreed Unit Price

**Dampak:** peserta dapat menyimpan pesanan dengan harga yang tidak sesuai kartu tugas, walaupun sudah mengisi Requested Unit Price dengan benar.

Langkah reproduksi:

1. Pilih Katun dengan biaya produksi Rp30.000 dan Poliester dengan biaya produksi Rp40.000.
2. Aplikasi otomatis mengisi Agreed Unit Price masing-masing Rp30.000 dan Rp40.000, sebelum pengguna memasukkan kesepakatan.
3. Isi permintaan pelanggan: 10 × Rp50.000 dan 20 × Rp75.000. Biarkan nilai otomatis Agreed Unit Price, simpan, lalu konversi tanpa mengubah harga.

Hasil terverifikasi: inquiry menyimpan biaya produksi tersebut sebagai harga kesepakatan, dan pesanan yang dibuat bernilai **Rp1.100.000**. Nilai permintaan pelanggan adalah **Rp2.000.000**. Probe ini tidak memasukkan persetujuan harga secara eksplisit. Invoice tidak dibuat oleh Sales dalam probe ini.

Harapan: harga kesepakatan diisi atau dikonfirmasi secara eksplisit. Biaya produksi seharusnya tidak otomatis diberi makna sebagai harga yang sudah disepakati dengan pelanggan.

Penyebab terkait: [form inquiry](../src/components/customer-inquiry-form.tsx) mengisi `agreedUnitPrice` dari `product.listPrice`; field tersebut dipakai aplikasi sebagai Production Cost / Unit. [Resolusi harga konversi](../src/lib/customer-inquiry.ts) mendahulukan agreed price dibanding requested price.

Bukti: [form inquiry](../outputs/uat-sales-manager-2026-10-15-recheck/S2C-inquiry-form.png), [nilai harga pada form konversi](../outputs/uat-sales-manager-2026-10-15-recheck/S2C-cost-default-order.png), [JSON yang memuat pesanan tersimpan Rp1.100.000](../outputs/uat-sales-manager-2026-10-15-recheck/S2C-evidence.json). Pesanan Confirmed Rp1.100.000 juga terlihat pada [daftar recent orders di dashboard](../outputs/uat-sales-manager-2026-10-15-recheck/M2-dashboard-kpi-and-trend.png).

### SM-07 — P2: panel detail audit sebagian besar berada di luar area terlihat

**Dampak:** langsung mengganggu M3, terutama dengan batas tugas tiga menit. Pemeriksaan teks otomatis dapat lulus sementara peserta belum dapat membaca perubahan.

Langkah reproduksi: login Manager → Audit Trail → cari `SO-UAT-M3-NEW` → filter Rejected → klik ikon mata untuk detail.

Hasil pada viewport 1440 × 1000: panel melebar menjadi sekitar 514 px, tetapi hanya sekitar 53 px atau **10,4%** terlihat di dalam viewport tabel setelah pembukaan. Actor berada di kolom kiri; detail perubahan berada di ujung kanan. Peserta perlu scroll horizontal tambahan untuk membaca detail, lalu kembali ke kiri untuk pelaku.

Scroll ke ujung kanan memulihkan akses ke isi panel. Jadi informasi tetap dapat ditemukan, tetapi tindakan membuka detail tidak langsung menampilkan isinya dengan layak.

Harapan: tampilkan detail sebagai modal/drawer, baris detail yang mengikuti lebar area konten, atau pastikan panel masuk ke area terlihat setelah dibuka. Sumber terkait: [TableDetailsAction](../src/components/table-actions.tsx), [layout panel](../src/styles/globals.css), [halaman audit](../src/app/audit-trail/page.tsx).

Bukti: [pembukaan awal terpotong](../outputs/uat-sales-manager-2026-10-15-audit-visual/M3-audit-detail.png), [setelah scroll kanan](../outputs/uat-sales-manager-2026-10-15-audit-visual/M3-audit-detail-scrolled-right.png), [JSON pengukuran geometri](../outputs/uat-sales-manager-2026-10-15-audit-visual/M3-evidence.json).

## Masalah definisi dan penyajian KPI untuk M2

### SM-04 — P2: periode KPI tidak dinyatakan secara jelas

Tidak ada pemilih periode pada dashboard. Header Highlights menampilkan `Company-wide · October 2026`, sedangkan KPI menjumlahkan semua tanggal. Data uji sengaja mencakup September dan Oktober.

| Angka | Dashboard / seluruh tanggal | Transaksi bertanggal Oktober |
| --- | ---: | ---: |
| Nilai seluruh Sales Order | Rp24.480.000 | Rp15.480.000 |
| Pembayaran diterima | Rp6.000.000 | Rp2.000.000 |
| Saldo invoice terbuka saat ini | Rp8.000.000 | Bukan arus transaksi bulanan; saldo kini |

Ini masalah cakupan dan komunikasi, bukan salah penjumlahan terhadap query yang ada. Peserta berisiko menyebut pembayaran Oktober Rp6 juta padahal Rp4 juta berasal dari September. Untuk tugas “periode ini”, tentukan apakah yang dimaksud adalah posisi saat ini, akumulasi seluruh riwayat, atau transaksi selama periode tertentu. Label/filter aplikasi perlu mendukung definisi tersebut.

### SM-05 — P2: Total Sales Value memasukkan Cancelled dan Pending

Pada dataset pengujian ulang, KPI Rp24.480.000 memuat pesanan Cancelled Rp7.000.000 dan Draft/Pending Rp500.000. Nilai tanpa kedua kelompok tersebut adalah Rp16.980.000. Semua angka ini mencakup seluruh tanggal.

Penjumlahan tersebut konsisten dengan implementasi dan tes agregasi yang sudah ada. Temuan ini **tidak dinyatakan sebagai bug aritmetika**. Masalahnya adalah penggunaan label Total Sales Value/Total Sales untuk angka semua pesanan, termasuk yang dibatalkan atau belum disetujui. Jika ini memang metrik yang diinginkan, namanya dan keterangannya perlu menyatakan cakupan tersebut; jika tujuannya penjualan yang valid, aturan status perlu disesuaikan.

Bukti SM-04/05: [dashboard dan daftar order](../outputs/uat-sales-manager-2026-10-15-recheck/M2-dashboard-kpi-and-trend.png), [invoice prioritas](../outputs/uat-sales-manager-2026-10-15-recheck/M2-priority-invoice.png), [JSON perhitungan pembanding](../outputs/uat-sales-manager-2026-10-15-recheck/M2-evidence.json). Sumber terkait: [agregasi KPI](../src/lib/dashboard-data.ts), [label dashboard](../src/app/page.tsx).

## Friksi tambahan; bukan blocker

- **SM-03 / M1:** alasan Approve yang dimasukkan melalui Confirmation Note tersimpan di Notes dan Audit, tetapi `approvalDecisionNote` tetap null. Pada Reject, alasan masuk ke field keputusan dan ditampilkan sebagai Approval Decision Note. Ini inkonsistensi penyajian, bukan kehilangan alasan. [Bukti Approve](../outputs/uat-sales-manager-2026-10-15/M1-approved-detail.png), [bukti Reject](../outputs/uat-sales-manager-2026-10-15/M1-rejected-detail.png), [JSON M1](../outputs/uat-sales-manager-2026-10-15/M1-evidence.json).
- **SM-06 / M3:** Old Value/New Value menggunakan JSON mentah dengan istilah seperti `approvalStatus`, `decisionNote`, dan `version`. Data aktor dan perubahan benar. Ringkasan perubahan berbahasa bisnis akan memudahkan peserta nonteknis. Bukti berada pada screenshot audit setelah scroll kanan di atas.

## Prasyarat kartu tugas

- S1 dan S3 menggunakan pelanggan milik portfolio Sales yang diuji. Invoice lama Rp5 juta mempunyai pembayaran Rp2 juta serta Surat Jalan berstatus **Delivered**, sehingga sisa Rp3 juta memenuhi aturan Outstanding Payment aplikasi. Invoice belum lunas tanpa Delivered tidak otomatis memicu Pending; ini aturan bisnis terdokumentasi, bukan bug dari uji ini.
- S2 menggunakan dua produk aktif dan jalur **Sales Order**. Cabang Customer PO tidak dijalankan; skenario memperbolehkan memilih salah satu.
- M1 memakai pesanan Pending dengan tunggakan pelanggan yang dapat diverifikasi; Approve dan Reject sama-sama dicoba pada pesanan berbeda.
- M2 pengujian ulang membaca snapshot historis khusus schema UAT. Penyegaran melalui fungsi database bersama dikeluarkan dari cakupan setelah insiden isolasi di bawah.
- M3 memakai perubahan penolakan pesanan yang benar-benar dilakukan melalui UI Manager; entry audit untuk tindakan tersebut tidak dibuat manual melalui database.

## Riwayat pemeriksaan dan integritas lingkungan

Putaran pertama menjalankan enam tugas dan dua probe S2. S2 gagal karena konversi harga hasil negosiasi ditolak. Kontrol S2B juga sempat gagal pada asumsi skrip bahwa Sales langsung menghasilkan invoice; pesanan sebenarnya sudah berhasil Confirmed. Asumsi itu diperbaiki. Navigasi M3 diperbaiki agar skrip menunggu halaman audit sebelum mengisi pencarian. Kegagalan skrip tersebut tidak dimasukkan sebagai bug aplikasi.

Pengujian ulang menjalankan S2, S2B, S2C, M2, dan M3: **hanya S2 yang gagal**, dengan penolakan harga baru terulang. Empat pemeriksaan lainnya selesai. Pemeriksaan visual M3 tambahan kemudian mengonfirmasi panel terpotong dan dapat dibaca setelah scroll kanan.

**Pengecualian isolasi pada putaran pertama:** tombol Perbarui Analisis memanggil `dashboard_private.refresh_dashboard_analysis`, yang secara eksplisit menulis ke `public`. Runner awal menyalin tabel dan trigger, tetapi tidak mengisolasi fungsi privat tersebut. Akibatnya, satu log `dashboard_analysis_runs` bertambah dan isi tabel `dashboard_analysis_snapshots` utama diperbarui. Pemeriksaan fingerprint membuktikan bahwa hanya dua tabel analisis itu yang berubah; pelanggan, produk, pesanan, invoice, pembayaran, dan tabel bisnis lainnya tidak berubah.

Snapshot lengkap sebelum pemanggilan itu tidak dibackup; runner hanya menyimpan count/hash. Nilai lama tidak direkonstruksi dengan perkiraan dan perubahan analisis tidak diklaim sudah dipulihkan. Log pemanggilan tetap tersedia sebagai bukti. Ini keterbatasan/defek runner pengujian, bukan bukti bahwa tombol refresh rusak pada penggunaan normal aplikasi. Pesan gagal pada lingkungan terisolasi pertama tidak dimasukkan ke daftar bug produk.

Pemicu tersebut dihapus dari pengujian. **Pengujian ulang dan pemeriksaan visual tambahan masing-masing memverifikasi `publicUnchanged: true` serta `schemaRemoved: true`.** Seluruh schema sementara sudah dihapus dan server uji dihentikan. Tidak ada perbaikan kode produk pada pelaksanaan ini.

Bukti integritas:

- [Putaran pertama, termasuk flag perubahan public](../outputs/uat-sales-manager-2026-10-15/run-browser-summary.json)
- [Pemeriksaan read-only dampak refresh](../outputs/uat-sales-manager-2026-10-15/dashboard-side-effect.json)
- [Pengujian ulang](../outputs/uat-sales-manager-2026-10-15-recheck/run-browser-summary.json)
- [Pemeriksaan visual audit](../outputs/uat-sales-manager-2026-10-15-audit-visual/run-browser-summary.json)
- [Ringkasan hasil gabungan](../outputs/uat-sales-manager-2026-10-15/final-results.json)

## Urutan penanganan sebelum usability testing

1. Perbaiki SM-02 agar negosiasi setelah penyimpanan inquiry memiliki jalur yang sah.
2. Perbaiki SM-01 agar biaya produksi tidak otomatis menjadi harga kesepakatan.
3. Perbaiki SM-07 agar detail audit dapat langsung dibaca setelah dibuka.
4. Tetapkan dan jelaskan periode serta cakupan status KPI untuk M2; bedakan nilai pesanan, pembayaran periode, dan saldo terbuka kini.
5. Rapikan lokasi alasan keputusan dan penyajian before/after audit bila masih ada waktu.

Sumber yang dapat dijalankan ulang: [skenario browser](../e2e/uat-sales-manager.spec.ts), [konfigurasi](../playwright.uat-sales-manager.config.ts), [runner](../scripts/run-uat-sales-manager.mjs). Gunakan output directory baru dan `--browser-only`. S2 akan tetap menghasilkan kegagalan tes sampai masalah negosiasi diperbaiki; kegagalan itu sengaja dipertahankan sebagai bukti, bukan ditandai lulus.
