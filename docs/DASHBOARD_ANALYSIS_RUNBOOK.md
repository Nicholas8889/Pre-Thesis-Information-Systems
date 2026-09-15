# Analisis historis dashboard

Angka operasional pada dashboard dibaca langsung dari agregasi database. Grafik tren enam bulan dibaca dari `public.dashboard_analysis_snapshots`. Ringkasan ini dihitung pada 00.15 WIB setiap hari dan dapat dihitung ulang melalui fungsi yang sama untuk tombol manual pada tahap 3.

## Deploy dan pengisian awal

Jalankan `npx prisma migrate deploy` dan `npx prisma generate` pada lingkungan server dengan koneksi database migrasi yang berwenang. Migrasi `20260914221806_dashboard_analysis_snapshots` membuat tabel ringkasan, riwayat proses, fungsi privat, dan job Supabase Cron. Pada lingkungan pengembangan saat implementasi, prisma migrate dev --create-only mendeteksi checksum migrasi baseline lama yang berbeda dari riwayat database dan menawarkan reset. Migrasi tahap ini dibuat dari prisma migrate diff lalu diterapkan dengan prisma migrate deploy tanpa reset; prisma migrate status menunjukkan 12 migrasi sudah terpasang. Selidiki checksum baseline tersebut sebelum membuat migrasi baru dengan migrate dev.

Untuk mengisi ringkasan sebelum jadwal malam pertama:

```sql
SELECT dashboard_private.refresh_dashboard_analysis('NIGHTLY', NULL) AS run_id;
```

Periksa status `run_id` yang dikembalikan pada `dashboard_analysis_runs`; fungsi mengembalikan ID juga ketika statusnya `FAILED` atau `SKIPPED`. Jangan menganggap pemanggilan SQL yang selesai sebagai bukti perhitungan berhasil.

## Waktu dan jadwal

Database proyek ini diverifikasi memakai `TimeZone=UTC` dan `cron.timezone=GMT`. Jadwal `15 17 * * *` berjalan pukul 17.15 UTC, yaitu **00.15 WIB pada hari berikutnya**. Migrasi menolak pemasangan jadwal jika `cron.timezone` bukan UTC/GMT. Periksa ulang jika konfigurasi database dipindah:

```sql
SHOW TIMEZONE;
SELECT current_setting('cron.timezone', true) AS cron_timezone;
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'dashboard-analysis-nightly-wib';
```

## Pantau hasil dan tangani kegagalan

```sql
SELECT id, trigger_source, actor_user_id, started_at, finished_at,
       status, error_message
FROM public.dashboard_analysis_runs
ORDER BY id DESC
LIMIT 20;

SELECT scope_key, scope_type, owner_user_id, period_start,
       last_succeeded_at, last_attempt_at, last_run_status, last_error
FROM public.dashboard_analysis_snapshots
ORDER BY scope_key;

SELECT jobid, start_time, end_time, status, return_message
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid FROM cron.job
  WHERE jobname = 'dashboard-analysis-nightly-wib'
)
ORDER BY start_time DESC
LIMIT 20;
```

Jika perhitungan gagal, fungsi mencatat run `FAILED` dan menandai snapshot `FAILED` **tanpa mengganti tren atau `last_succeeded_at` terakhir**. Dashboard tetap menampilkan tren itu dengan pesan bahwa analisis belum diperbarui. Jika job tidak berjalan sama sekali, dashboard mulai menandai data lama setelah 00.30 WIB. Perhitungan yang gagal namun berhasil dicatat oleh fungsi dapat tampil sebagai perintah SQL sukses di `cron.job_run_details`; `dashboard_analysis_runs.status` adalah sumber utama untuk hasil kalkulasi. Status `SKIPPED` berarti proses lain sedang menghitung. Periksa `error_message`, perbaiki penyebabnya, lalu jalankan ulang fungsi.

## Akses dan pemicu manual

Scope `company` dipakai Admin dan Manager. Scope `sales:<user-id>` berisi hanya order yang dibuat Sales tersebut serta pembayaran invoice dari order itu. Kedua tabel mengaktifkan RLS dan hak Data API `anon`, `authenticated`, serta `service_role` dicabut; akses aplikasi berlangsung melalui server terautentikasi. Schema `dashboard_private` dan fungsinya tidak diberikan kepada peran API. Simpan koneksi database berwenang hanya di server.

`refreshDashboardAnalysisManually()` di `src/lib/dashboard-analysis.ts` adalah titik masuk server untuk tombol dashboard. Fungsi ini memeriksa sesi Admin/Manager, memanggil `dashboard_private.refresh_dashboard_analysis('MANUAL', userId)`, lalu memeriksa status run. Sales tidak dapat memicu perhitungan manual. Tombol Perbarui Analisis tersedia untuk Admin/Manager. Server Action memeriksa sesi dan peran lagi, lalu memanggil proses privat yang sama, memperbarui route dashboard setelah hasil sukses/gagal, dan mengembalikan pesan hasil. Saat proses berlangsung tombol dinonaktifkan; advisory lock database mencatat run kedua sebagai SKIPPED. KPI operasional tetap dibaca dari agregasi transaksi pada setiap pembukaan dashboard tanpa menunggu tombol ini.

Supabase menyediakan pengelolaan dan riwayat job melalui [Cron](https://supabase.com/docs/guides/cron) dan [panduan penjadwalan](https://supabase.com/docs/guides/cron/quickstart).
