# Verifikasi dashboard tahap 3 — 15 September 2026

Dashboard membaca KPI operasional dari agregasi transaksi pada setiap request tanpa cache lintas-request. Grafik tren enam bulan membaca snapshot tersimpan. Tombol **Perbarui Analisis** hanya tersedia bagi Admin/Manager; Server Action memeriksa sesi dan peran kembali, memanggil fungsi SQL yang sama dengan job malam, lalu menyegarkan halaman untuk menampilkan grafik/waktu baru atau status gagal. Pending menonaktifkan tombol, dan advisory lock SQL menandai refresh kedua `SKIPPED`.

Job malam nyata berjalan pada 15 September 2026, 00.15 WIB: `cron.job_run_details.status=succeeded` dan `dashboard_analysis_runs.status=SUCCEEDED`. Pengiriman form produksi dengan sesi Admin menghasilkan pesan sukses, run `MANUAL/SUCCEEDED`, dan `last_succeeded_at` baru. Pengiriman field form yang sama dengan sesi Sales ditolak tanpa membuat run; tombol juga tidak dirender pada dashboard Sales.

## Waktu buka halaman

Angka tahap 1 berasal dari pengukuran dashboard di server **development** pada 14 September 2026. Pengukuran tahap 3 berikut memakai server development lokal, database Supabase yang sama, HTML autentikasi lengkap, request berurutan, dan lima sampel per akun setelah route hangat. Angka Sales adalah median gabungan dua akun.

| Peran | Sebelum tahap 1 | Sesudah tahap 1 | Tahap 3 | Selisih dari sesudah tahap 1 |
|---|---:|---:|---:|---:|
| Admin | 1.258 ms | 1.119 ms | 1.140 ms | +21 ms (+1,9%) |
| Manager | 922 ms | 659 ms | 1.180 ms | +521 ms (+79,1%) |
| Sales, dua akun | 972 ms | 679 ms | 1.050 ms | +371 ms (+54,6%) |

Putaran development sebelumnya pada sesi yang sama menghasilkan median 1.503/1.544/1.268 ms untuk Admin/Manager/Sales; variasi ini cukup besar sehingga perbedaan tabel tidak dapat dianggap efek kode saja. Pembacaan satu snapshot tersimpan diukur sekitar 90–94 ms. Pada **build produksi** lokal, median HTML penuh setelah satu warmup dan lima sampel per akun adalah 643 ms Admin, 582 ms Manager, dan 662 ms Sales gabungan. Angka produksi tidak dibandingkan langsung dengan baseline development.

## Pengujian

- Uji database opsional: tren manual sesuai transaksi perusahaan dan tiap Sales; pembayaran dan status Surat Jalan mengubah KPI langsung tetapi snapshot tren tetap; kegagalan nyata dalam kalkulasi `NIGHTLY` dan `MANUAL` mempertahankan tren/waktu sukses tiap scope; run kedua saat lock aktif menjadi `SKIPPED`; tabel ringkasan/riwayat tidak dapat diakses peran Data API.
- Uji unit: tanggal sukses diformat WIB, kegagalan/kelewatan jadwal menampilkan timestamp sukses terakhir, Sales tidak mendapat tombol, pending menonaktifkan tombol dan memberi status, feedback sukses/gagal aman, Server Action menolak Sales dan sesi tidak sah.
- Uji produksi HTTP: refresh Admin sukses; panggilan action Sales ditolak. Lint, TypeScript, dan build produksi lulus. Suite repo serial lulus **259 tes** sebelum tambahan tiga asersi unit terakhir; ketiga asersi tersebut lulus terpisah.

## Batas hasil

Simulasi kegagalan malam/manual dan perubahan transaksi dijalankan dalam transaksi test yang di-rollback; tidak ada kegagalan Cron nyata yang ditunggu. Uji browser Chrome sekarang membuktikan loading, refresh sukses Admin/Manager, penolakan form langsung Sales, serta feedback saat advisory lock aktif. Benchmark tetap mengukur respons HTML penuh, bukan paint/hidrasi browser. Sampel waktu kecil dan dipengaruhi variasi koneksi Supabase serta beban server development. Perbedaan checksum migrasi baseline lama masih perlu diselidiki sebelum memakai `prisma migrate dev` untuk migrasi berikutnya.
