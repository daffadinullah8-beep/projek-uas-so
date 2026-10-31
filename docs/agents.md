# AGENTS.md — Project UAS Sistem Operasi: Analisis Komparatif SteamOS vs Bazzite OS pada 2 Device

Dokumen ini adalah panduan konteks utama untuk AI/agent lokal di workspace ini. Baca seluruh isi dokumen ini sebelum memberikan saran, skrip pengujian, atau pengubahan kode.

## 1. Tujuan

Melakukan pengujian eksperimental dan analisis komparatif performa gaming antara **SteamOS** dan **Bazzite OS** yang dijalankan pada **2 perangkat (device) berbeda**.

Proyek ini bertujuan untuk mengidentifikasi kelebihan, kekurangan, efesiensi resource, dan stabilitas dari kedua OS gaming berbasi linux tersebut. Deliverable utama proyek mencakup:

1. **Aplikasi Desktop Murni Noterra (Noterra Native Desktop App):** Pemantau hardware berbasis GUI desktop murni (standalone window tanpa browser) dengan backend FastAPI (`server.py`) yang membaca 5 metrik sistem secara *real-time* dan dapat mengekspor log pengujian.
2. **Hasil Pengujian & Analisis Komparatif (Core Focus):** Data komparasi *head-to-head* pada 2 device untuk mengukur efisiensi 5 metrik utama, kestabilan FPS, konsumsi daya/TDP, efisiensi lapisan kompatibilitas Proton/DXVK, serta kelebihan & kekurangan fitur tiap OS.
3. **Kelengkapan Luaran Akademik UAS:**
  - Repositori GitHub (`daffadinullah8-beep/projek-uas-so`) berisi kode monitoring, log data pengujian, dan riset.
  - Laporan Proyek PDF (10–20 halaman) Bab I–V lengkap dengan Tabel Kontribusi 6 Anggota Tim.
  - Video Demo Pengujian (3–5 menit) dan Slide Presentasi Ujian.

Ini merupakan tugas UAS Sistem Operasi.

## 2. Aturan keras (Core Principles)

1. **Target Akhir Aplikasi Desktop Murni:** Antarmuka Noterra wajib dibungkus/di-porting menjadi aplikasi desktop mandiri (menggunakan `pywebview` window atau native GUI `CustomTkinter`), bukan aplikasi yang dibuka manual lewat tab browser web.
2. **Fokus pada 5 Metrik Utama:** Monitoring dan perekaman log wajib berfokus pada CPU, GPU, RAM, NVMe, dan Suhu (Temps).
3. **Data Objektif & Zero Hallucination:** Pengujian wajib dilakukan secara fair (minimal 3 kali pengujian/run per game pada OS yang sama). Metrik hardware yang tidak terbaca oleh sensor/kernel WAJIB ditandai `unavailable`, dilarang mengarang angka.
4. **Relevansi Konsep Sistem Operasi:** Seluruh temuan pengujian dari 5 metrik tersebut harus dianalisis menggunakan konsep OS (penjadwalan CPU, manajemen memori/swap, lapisan kompatibilitas Proton, immutable filesystem, dan power governor).
5. **Isolasi Log Mentah:** Seluruh rekaman snapshot metrik (CSV/JSON) wajib disimpan di dalam folder `logs/` di repositori sebagai bukti otentik pengujian.
6. **Overhead Rendah:** Aplikasi pemantau desktop tidak boleh membebani resource sistem sehingga mengganggu konsumsi FPS game yang diuji.

## 3. Pembagian kerja & Peran Tim (6 Anggota)

- **Daffa Dinullah (@daffadinullah8-beep) [NPM: 257006111121]:** Manajer Proyek, Lead Repository & Integrator Data Pengujian.
- **Anggota 2 (@zid985401-cmd):** Penguji Hardware Device 1 (Eksekutor pengujian game di SteamOS vs Bazzite OS Perangkat A).
- **Anggota 3:** Penguji Hardware Device 2 (Eksekutor pengujian game di SteamOS vs Bazzite OS Perangkat B).
- **Anggota 4:** Pengembang Monitoring Tool (Penyesuaian backend/UI Noterra untuk pencatatan log metrik saat game berjalan).
- **Anggota 5:** Penulis Laporan (Penyusun Laporan PDF Bab I–V, pembahasan kelebihan/kekurangan, & tabel kontribusi).
- **Anggota 6:** Tim Media & Presentasi (Perekam/Editor Video Demo Pengujian & Penyusun Slide Presentasi).
- **AI Agent (Kamu):** Pembuat skrip otomatisasi analisis data log, pembantu penyusun format laporan Markdown/PDF, serta penyesuai alat ukur Noterra.

## 4. Mesin dan lingkungan (fakta dari pengguna)

- **Device 1:** [Isi jenis device 1, misal: Handheld A / Laptop A]
- **Device 2:** [Isi jenis device 2, misal: Handheld B / Laptop B]
- **Sistem Operasi yang Diuji:** 
  1. **SteamOS** (Arch-based, Gaming Mode Valve, Read-Only Filesystem)
  2. **Bazzite OS** (Fedora Atomic/Silverblue-based, Cloud Native, Universal Blue)
- **Monitoring Tools:** Aplikasi Desktop Noterra (`server.py` + Desktop GUI Client), Mangohud / Steam Performance Overlay (opsional pendamping).
- **Lingkungan Pengembangan App:** Windows 10/11 (Mode Simulasi `?mock=1`) & Linux Native (Pengujian Asli).

## 5. Skenario & Protokol Pengujian Gaming

Pengujian dilakukan secara *head-to-head* pada *Device 1* dan *Device 2* untuk membandingkan karakteristik performa saat menjalankan game standar uji (1 game AAA dan 1 game esports/ringan).

- **Protokol Tes A/B:**
  1. Boot OS (SteamOS / Bazzite OS) dalam kondisi *fresh boot*.
  2. Jalankan **Aplikasi Desktop Noterra** di background untuk mulai merekam 5 metrik hardware utama.
  3. Jalankan game target dengan preset grafis identik selama kurun waktu terstandar (10–15 menit per sesi).
  4. Lakukan pengujian minimal 3 *run* per game/OS untuk mengambil rata-rata yang valid.
  5. Bersihkan cache / *reboot* sebelum berpindah ke OS berikutnya.

## 6. Spesifikasi Noterra Desktop Application

Aplikasi desktop berjalan sebagai jendela mandiri yang mengambil data metrik dari backend FastAPI local (`http://127.0.0.1:5130`).

### 6.1 5 Metrik Utama Hardware (Core Checked Metrics)
1. **CPU:** Utilisasi total & per-core, frekuensi clock, daya (RAPL), dan status CPU throttle.
2. **GPU:** Utilisasi GPU, SM clock, memory clock, konsumsi VRAM, dan daya GPU (Watt).
3. **RAM:** Total penggunaan RAM, sisa kapasitas, alokasi memori game, serta pemakaian SWAP/ZRAM.
4. **NVMe:** Kecepatan baca/tulis (*throughput* MB/s), I/O await, dan sisa kapasitas penyimpanan.
5. **Temps (Suhu):** Pemantauan suhu *real-time* untuk CPU, GPU, dan NVMe guna mendeteksi kecenderungan *thermal throttling*.

### 6.2 Fitur Pencatatan & Ekspor Desktop
- **Sesi Pencatatan:** Tombol *Start/Stop Recording* pada GUI Desktop dengan rincian metadata: `[Nama Device] - [Nama OS] - [Judul Game] - [Sesi ke-N]`.
- **Ekspor Otomatis:** Menyimpan log snapshot berformat CSV/JSON langsung ke folder `logs/`.
- **Analisis Performa:** Menghitung suhu puncak (*peak temp*), rata-rata daya (Watt), kestabilan utilisasi CPU/GPU, serta kecepatan I/O NVMe.

## 7. Area Komparasi Sistem Operasi (Relevansi Konsep OS)

Setiap perbedaan performa pada 5 metrik utama wajib dianalisis berdasarkan konsep dasar Sistem Operasi:

- **Penjadwalan CPU & Gaming Mode:** Efisiensi penjadwal kernel (EEVDF/Bore) dan alokasi prioritas proses game (*GameMode* / `renice`).
- **Lapisan Kompatibilitas GPU (Proton/Wine & DXVK/VKD3D):** Transmisi instruksi DirectX ke Vulkan, efisiensi prapemrosesan *shader cache*, dan konsumsi overhead GPU/CPU.
- **Manajemen Memori (RAM) & File System (NVMe):** Arsitektur *Immutable Root Filesystem* (Btrfs dengan Ostree di Bazzite OS vs Arch-based read-only di SteamOS), penanganan *page cache*, efisiensi SWAP/ZRAM, serta waktu *loading* game dari NVMe.
- **Power & Thermal Management (Temps):** Manajemen batas daya (TDP limit), governor CPU (`powersave` vs `performance`), penanganan interupsi, serta respon pengontrol suhu (fan curve/thermal daemon).

## 8. Struktur Repositori & Penyimpanan Log

projek-uas-so/
├── README.md              # Ringkasan hasil komparasi, identitas tim, & panduan app
├── AGENTS.md              # Dokumen panduan AI lokal (file ini)
├── app_desktop.py         # Entry point Aplikasi Desktop Murni (PyWebview / CustomTkinter)
├── server/                # Backend Noterra (FastAPI + collector metrik)
├── web/                   # Frontend antarmuka Noterra (Themes & CSS Desktop)
├── tests/                 # Automated test suite (npm test / check-layout.mjs)
├── logs/                  # Rekaman data mentah A/B testing (5 metrik utama)
│   ├── device1-steamos/   # Log snapshot Device 1 (SteamOS)
│   ├── device1-bazzite/   # Log snapshot Device 1 (Bazzite OS)
│   ├── device2-steamos/   # Log snapshot Device 2 (SteamOS)
│   └── device2-bazzite/   # Log snapshot Device 2 (Bazzite OS)
└── docs/                  # Draft laporan PDF & slide presentasi

## 9. Alur Kerja Porting Desktop & Pengujian

1. **Setup Environment & Web App:** Pastikan backend FastAPI (`server.py`) dan Web UI Noterra terverifikasi berjalan lancar di mode simulasi.
2. **Kustomisasi Tema Desktop (`web/themes/`):** Terapkan tata letak antarmuka yang menampilkan panel CPU, GPU, RAM, NVMe, dan Temps secara jelas.
3. **Porting ke Desktop App (`app_desktop.py`):** Integrasikan backend FastAPI dengan pembungkus GUI desktop mandiri (`pywebview` atau `CustomTkinter`).
4. **Pengujian Gaming A/B:** Jalankan aplikasi desktop di *Device 1* & *Device 2* saat bermain game di SteamOS vs Bazzite OS, lalu simpan log snapshot ke `logs/`.
5. **Penyusunan Laporan & Dokumentasi:** Olah data CSV/JSON 5 metrik utama menjadi grafik komparatif untuk Laporan PDF Bab IV dan bahan slide presentasi.

## 10. Hal-Hal yang Membutuhkan Konfirmasi Tim

- Kepastian spesifikasi dan tipe **Device 1** dan **Device 2** yang digunakan.
- Pemilihan 2–3 judul game standar yang akan diuji di kedua perangkat.
- Anggota tim yang bertugas sebagai eksekutor pengujian di masing-masing device.
- Pilihan teknologi porting desktop murni (`pywebview` vs `CustomTkinter`).
