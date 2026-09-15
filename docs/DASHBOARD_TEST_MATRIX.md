# Matriks pengujian dashboard

Jalankan uji unit dan render dengan `npm test -- --maxWorkers=1 --minWorkers=1`. Uji database terhadap Supabase yang terkonfigurasi dengan `$env:RUN_DB_INTEGRATION_TESTS='1'; npx vitest run tests/integration/dashboard-aggregates.test.ts tests/integration/dashboard-analysis.test.ts tests/integration/dashboard-testcases.test.ts tests/integration/dashboard-month-boundary.test.ts --environment node --maxWorkers=1 --minWorkers=1`. Fixture perubahan transaksi dan kegagalan kalkulasi dibatalkan setelah asersi.

Jalankan uji browser dengan `npm run test:e2e:dashboard`. Runner memakai Chrome yang terpasang, satu worker, server build produksi lokal pada port 3107, dan sesi aktif dari database. Refresh manual yang sukses akan menambahkan run/snapshot baru. Jalankan benchmark setelah `npm run build` dan `npm run start -- --port 3107` dengan `npm run test:dashboard:benchmark`. `DASHBOARD_BENCHMARK_SAMPLES` mengatur jumlah request (3–30). Browser dan benchmark memerlukan Supabase yang terjangkau.

| Kasus | Bukti otomatis |
| --- | --- |
| TC-01 Pembayaran parsial langsung, tren tetap | `dashboard-testcases.test.ts` membuat payment dan mengubah saldo dalam transaksi; `dashboard-aggregates.test.ts` memeriksa perubahan payment yang sudah ada dan isolasi Sales. |
| TC-02 Status pengiriman langsung | `dashboard-aggregates.test.ts` mengubah status Surat Jalan dan memeriksa distribusi. |
| TC-03 Order, invoice, tugas baru/berubah | `dashboard-testcases.test.ts` membuat ketiganya, mengubah status/nilai, memeriksa Sales pemilik, Sales lain, dan Manager. |
| TC-04 Pemisahan Sales/Manager/Admin | `dashboard-aggregates.test.ts` membandingkan semua KPI dengan perhitungan transaksi lama per akun; `dashboard-analysis.test.ts` memeriksa scope tren; `e2e/dashboard.spec.ts` memeriksa layout dua Sales dan Manager. |
| TC-05 Sales tidak boleh refresh | `dashboard-analysis-actions.test.ts` menguji penolakan action; `e2e/dashboard.spec.ts` memeriksa tombol tersembunyi dan mengirim form action langsung sebagai Sales. |
| TC-06 Refresh manual, loading/sukses | `refresh-dashboard-analysis-button.test.tsx`, `dashboard-analysis-actions.test.ts`, dan `e2e/dashboard.spec.ts` untuk Admin/Manager; browser mengecek timestamp DB bertambah. |
| TC-07 Refresh serentak | `dashboard-analysis.test.ts` dan `e2e/dashboard.spec.ts` memegang advisory lock; run kedua dilewati, snapshot tetap. |
| TC-08 Kegagalan manual | `dashboard-analysis.test.ts` memaksa exception SQL di dalam transaksi; unit action/UI memeriksa feedback; browser memeriksa feedback run yang dilewati. |
| TC-09 Kegagalan malam | `dashboard-analysis.test.ts` memaksa exception sumber NIGHTLY dan memeriksa ringkasan sukses semua scope tidak terganti. |
| TC-10 Job terlambat/terlewat | `dashboard-analysis.test.ts` dan `dashboard-time-boundaries.test.ts` memeriksa status pada cutoff 00.30 WIB. |
| TC-11 Sales baru belum punya ringkasan | `dashboard-analysis.test.ts`, `dashboard-testcases.test.ts`, dan render status kosong. |
| TC-12 00.15/00.30 WIB dan batas bulan/tahun | `dashboard-time-boundaries.test.ts` serta `dashboard-month-boundary.test.ts` untuk urutan enam label bulan SQL dan pemetaan tanggal UTC ke bulan WIB. |
| TC-13 Data API terisolasi | `dashboard-analysis.test.ts` memeriksa RLS/grant; `dashboard-testcases.test.ts` menjalankan SELECT nyata di bawah role `anon` dan `authenticated` dan mengharapkan pesan permission denied. |
| TC-14 Benchmark per peran | `scripts/dashboard-benchmark.mjs` menjalankan satu warmup dan tujuh request HTML penuh berurutan per Admin/Manager/Sales; melaporkan median dan p95 tanpa token atau identitas. |

Benchmark mengukur waktu respons HTML penuh dari server lokal, bukan waktu render visual browser. Bandingkan hanya putaran dengan mode server, jaringan, akun, dan jumlah sampel yang sama; baseline development pada tahap 1 dan angka produksi terdahulu dicatat dalam `DASHBOARD_PHASE3_VERIFICATION.md`.

## Hasil eksekusi 15 September 2026

- Uji unit dashboard: **27 lulus**, 6 file.
- Uji integrasi dashboard Supabase: **13 lulus**, 4 file. Perubahan fixture dan error paksa di-rollback.
- Uji Chrome produksi lokal: **5 lulus** dalam 31,5 detik. Refresh Admin dan Manager menulis run `MANUAL/SUCCEEDED`; pengiriman langsung form sebagai Sales ditolak dan tidak menulis run.
- Lint dan build produksi lulus.
- Suite repo penuh pada pengulangan akhir: **269 lulus, 13 dilewati** (52 file lulus, 4 file dilewati). Percobaan awal sempat terganggu Prisma P1001 pada test Picking List di luar dashboard; pengulangan setelah koneksi pulih lulus seluruhnya.

Benchmark produksi lokal pukul 21.32 WIB, satu warmup + **7 sampel** berurutan tiap peran:

| Peran | Median HTML penuh | p95 | Rentang |
| --- | ---: | ---: | ---: |
| Admin | 1.190 ms | 1.304 ms | 1.002–1.304 ms |
| Manager | 632 ms | 965 ms | 580–965 ms |
| Sales, satu akun | 679 ms | 1.231 ms | 608–1.231 ms |

Baseline tahap 1 di mode development adalah Admin 1.258 ms, Manager 922 ms, dan median dua Sales 972 ms. Angka terbaru memakai mode produksi dan satu Sales, jadi tidak dihitung selisih langsung. Benchmark produksi terdahulu dengan lima sampel menghasilkan 643/582/662 ms; selisih Admin yang besar memperlihatkan variasi koneksi atau beban antarputaran dan belum dapat diatribusikan ke perubahan kode.
