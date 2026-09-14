# Test Case Singkat — Invoice, Customer Records, dan Picking & Surat Jalan

Tanggal: 12 September 2026  
Cakupan: keputusan akhir dalam percakapan, termasuk regresi invoice `INV-2026-152`.  
Status dokumen: checklist pengujian manual; seluruh hasil **Belum diuji melalui checklist ini**. Hasil pengujian otomatis sebelumnya tidak otomatis menjadi hasil UAT di dokumen ini.

## Persiapan dan aturan acuan

- Login sebagai Admin/Manager; siapkan akun Sales untuk uji pembatasan akses.
- Gunakan data uji customer, SO langsung, dan Customer PO. PO di dokumen ini berarti **Customer Purchase Order**.
- Siapkan invoice Rp1.000.000 dengan pembayaran Rp0, Rp400.000, dan Rp1.000.000 pada skenario terpisah; gunakan jatuh tempo mendatang kecuali disebutkan.
- `Paid amount` adalah jumlah yang sudah dibayar; `remaining amount` adalah sisa tagihan. Paid amount Rp0 bukan berarti lunas.
- Customer outstanding = total sisa invoice non-cancelled yang memiliki Surat Jalan `Delivered`. Invoice belum Delivered tetap memiliki saldo invoice, tetapi belum masuk outstanding customer.
- Flow: **SO/PO layak → Picking List → Packed → Surat Jalan Issued → Delivered**. Pengiriman parsial belum didukung.

## A. Invoice dan pembayaran

| ID | Skenario / langkah singkat | Hasil yang diharapkan |
| --- | --- | --- |
| INV-01 | Buka `INV-2026-152`; bandingkan total invoice, riwayat pembayaran, paid amount, remaining amount, dan status. | Bila total pembayaran sudah menutup invoice dan remaining Rp0, status Paid. Bila paid amount Rp0 dan total masih positif, invoice belum lunas. Catat ketidaksesuaian sebagai bug; jangan menganggap adanya penjualan sebagai bukti pembayaran. |
| INV-02 | Pada invoice Rp1.000.000 tanpa pembayaran, catat pembayaran Rp400.000. | Paid amount Rp400.000, remaining Rp600.000, status Partial. |
| INV-03 | Lunasi sisa Rp600.000 lalu buka ulang invoice dan daftar pembayaran. | Paid amount Rp1.000.000, remaining Rp0, status Paid konsisten setelah reload. |

## B. Customer Records dan pemicu outstanding

| ID | Skenario / langkah singkat | Hasil yang diharapkan |
| --- | --- | --- |
| CUS-01 | Buka daftar, detail, tambah, dan edit customer; periksa filter dan badge. | Customer Category New/Loyal/Normal/Occasional serta Payment Risk Low/Medium/High tidak lagi tersedia. |
| CUS-02 | Tambah/edit Customer Segment dan ubah status customer Active/Inactive. | Segment Retail/Wholesale/Corporate tetap tersedia dan tersimpan; Active/Inactive tetap berfungsi terpisah dari status pembayaran. |
| CUS-03 | Buka customer tanpa invoice yang memenuhi kriteria outstanding. | Status Clean; nominal outstanding Rp0. |
| CUS-04 | Buat invoice Credit belum lunas; periksa customer saat belum ada SJ, picking berjalan, Packed, dan SJ Issued. | Customer tetap Clean bila tidak memiliki invoice Delivered lain. Tahapan ini belum memicu outstanding. |
| CUS-05 | Ubah SJ menjadi Delivered untuk invoice Credit Rp1.000.000 yang belum dibayar; buka ulang customer. | Status Outstanding Payment; detail menunjukkan Rp1.000.000 dan satu invoice outstanding. |
| CUS-06 | Setelah Delivered, bayar Rp400.000 lalu lunasi Rp600.000. | Outstanding turun menjadi Rp600.000, lalu Rp0 dan status Clean; invoice yang lunas tidak lagi dihitung sebagai outstanding. |
| CUS-07 | Siapkan dua invoice Delivered bersisa Rp600.000 dan Rp200.000, ditambah invoice Issued Rp300.000 dan invoice Cancelled. | Outstanding Rp800.000, jumlah invoice dua; Issued dan Cancelled tidak ikut. Invoice yang terhubung lewat SO/SJ tidak dihitung ganda. |
| CUS-08 | Deliver pesanan yang invoice-nya sudah Paid; periksa customer. | Tidak menambah outstanding. Customer tetap Clean jika tidak ada tagihan Delivered lain. |
| CUS-09 | Sebagai Sales, buat SO dan Customer PO untuk customer Clean dan customer Outstanding Payment. | Customer Clean mengikuti alur normal; customer outstanding memerlukan approval sesuai aturan aplikasi, tanpa klasifikasi Low/Medium/High. |

## C. Modul Picking List & Surat Jalan

| ID | Skenario / langkah singkat | Hasil yang diharapkan |
| --- | --- | --- |
| WH-01 | Buka modul melalui sidebar dan pindah ketiga tab. | Nama modul Picking List & Surat Jalan; tab Picking & Packing, Surat Jalan Open, Completed; tombol Add Picking List berada di tab pertama. |
| WH-02 | Siapkan SO langsung dan Customer PO yang Confirmed/Invoiced, approval Approved/NotRequired, memiliki invoice Credit valid, tanpa PL/SJ. | Keduanya muncul dalam antrean yang layak dibuatkan Picking List. |
| WH-03 | Periksa order Draft/Cancelled, approval Pending/Rejected, tanpa invoice, atau invoice Cancelled. | Tidak tersedia sebagai order layak; percobaan membuat Picking List ditolak. |
| WH-04 | Periksa order Immediate dengan invoice Unpaid/Partial; buat Picking List, selesaikan packing, dan terbitkan SJ sebelum pelunasan. | Aturan sama dengan Credit: picking dan SJ diizinkan tanpa menunggu lunas jika approval dan invoice valid. Pembayaran/status invoice tetap sesuai transaksi pembayaran; outstanding muncul saat Delivered jika masih bersaldo. |
| WH-05 | Klik Add Picking List, pilih order, simpan; coba buat ulang untuk order yang sama. | Satu Picking List berisi barang dan jumlah dari order; duplikasi ditolak, order tidak tetap muncul sebagai antrean baru. |
| WH-06 | Cetak Picking List dari modul. | Lembar memuat barang, jumlah pesanan, kolom picked/packed, catatan selisih, picker/packer, dan jumlah paket; tidak mencetak harga atau nominal invoice. |
| WH-07 | Untuk pesanan 10 unit, simpan picked 6 dan packed 4 lalu reload. | Progres tersimpan; list tetap di Picking & Packing dan belum dapat dibuatkan SJ. |
| WH-08 | Masukkan jumlah negatif, pecahan, picked melebihi pesanan, atau packed melebihi picked. | Penyimpanan ditolak dengan pesan validasi; data sebelumnya tetap utuh. |
| WH-09 | Klik Mark Packed ketika jumlah masih kurang atau nama picker/packer/jumlah paket belum lengkap. | Ditolak; pengiriman parsial tidak otomatis dibuatkan SJ. |
| WH-10 | Isi picked dan packed sesuai seluruh jumlah pesanan, nama picker/packer, serta jumlah paket positif; klik Mark Packed. | Status Packed, data terkunci, tetap di tab Picking & Packing sampai SJ diterbitkan; aksi Buat Surat Jalan tersedia. |
| WH-11 | Buka list yang sama di dua sesi; simpan sesi pertama lalu simpan versi lama dari sesi kedua. | Simpan versi lama ditolak; pengguna diminta memuat data terbaru sehingga progres tidak tertimpa. |
| WH-12 | Dari Packed, isi penerima, alamat, tanggal, driver, dan kendaraan valid lalu buat SJ. | SJ berstatus Issued muncul di Surat Jalan Open, terhubung ke PL/order/invoice; barang dan jumlah sesuai hasil packing. PL tidak lagi tampil sebagai pekerjaan aktif. |
| WH-13 | Coba membuat SJ lewat URL/form lama tanpa Packed PL; manipulasi source ID/jumlah; coba terbitkan dua SJ dari PL sama. | Pembuatan tanpa Packed ditolak; data sumber/jumlah mengikuti data server; hanya satu SJ dapat diterbitkan untuk PL tersebut. |
| WH-14 | Buka Open Warehouse dari detail SO/PO, invoice, atau pembayaran. | Masuk ke modul dan proses/dokumen terkait; tidak melewati tahap picking melalui form SJ langsung. |
| WH-15 | Tandai SJ Issued sebagai Delivered; periksa tab dan customer. | Pindah dari Open ke Completed; penghitung Completed bertambah. Outstanding customer hanya bertambah jika invoice masih bersaldo. |
| WH-16 | Batalkan SJ Issued lalu cari melalui filter arsip Cancelled. | Dokumen tetap dapat ditemukan dengan label Cancelled; tidak dihitung sebagai Completed dan tidak memicu outstanding. |
| WH-17 | Coba mengubah Delivered/Cancelled kembali ke Issued atau status lain. | Transisi ditolak; Delivered dan Cancelled bersifat terminal. |
| WH-18 | Buka/cetak SJ historis yang belum terhubung ke PL; periksa status Draft/Issued. | Dokumen historis tetap terbaca dan dapat dicetak; Draft/Issued berada di Open. Dokumen baru tetap wajib melalui PL. |
| WH-19 | Sebagai Sales, coba membuat/mengubah PL dan SJ, termasuk pengiriman form langsung. | Aksi tulis yang hanya diizinkan bagi Admin/Manager ditolak di server. |

## Pencatatan hasil

Isi satu baris per test case setelah dijalankan. Gunakan **Pass**, **Fail**, atau **Blocked**; sertakan bukti bila gagal.

| ID test | Hasil | Hasil aktual / bukti / nomor bug | Penguji / tanggal |
| --- | --- | --- | --- |
| ... | Belum diuji | ... | ... |

Prioritas smoke test: **INV-01 → CUS-01/02 → WH-02/04 → WH-05/09/10/12 → WH-15 → CUS-06**. Ulangi alur gudang untuk SO langsung dan Customer PO.
