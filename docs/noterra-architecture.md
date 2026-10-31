# Arsitektur Aplikasi Desktop Noterra — Monitoring Hardware & Komparasi SteamOS vs Bazzite OS

Noterra adalah aplikasi pemantau resource hardware berbasis desktop murni (standalone window) yang dibangun untuk mendukung pengujian eksperimental komparatif performa gaming antara **SteamOS** dan **Bazzite OS** pada 2 perangkat yang berbeda.

Aplikasi ini menggunakan backend lokal berbasis FastAPI (`server/server.py`) yang dipadukan dengan pembungkus antarmuka desktop (`app_desktop.py`), berfokus penuh pada **5 Metrik Utama Hardware: CPU, GPU, RAM, NVMe, dan Temps (Suhu)**.

---

## Komponen Utama Sistem

```
projek-uas-so/
├── app_desktop.py           # Entry point utama Aplikasi Desktop Murni (PyWebview / CustomTkinter)
├── server/
│   ├── server.py            # FastAPI Backend: Collector /proc, /sys, NVML, psutil + REST API
│   ├── metrics_meta.json    # Skema metrik (label, satuan, sumber sensor, pembulatan)
│   ├── requirements.txt     # Dependensi Python (fastapi, uvicorn, psutil, nvidia-ml-py, pywebview)
│   ├── README.md            # Dokumentasi internal backend & tabel sumber sensor
│   └── fixtures/            # Data fixture simulasi (?mock=1) untuk testing tanpa hardware asli
├── web/                     # Frontend UI yang dirender dalam Desktop Window
│   ├── index.html           # Layout shell: navbar, status koneksi, container panel
│   ├── core/client.js       # Data client (fetch/registry/ctx) tanpa manipulasi DOM langsung
│   ├── core/widgets.js      # Widget renderer (value, bar, sparkline, gauge)
│   ├── core/shell.js        # Manajer tab, log recording, dan status backend
│   ├── core/core.css        # Styling dasar antarmuka
│   └── themes/              # Folder tema UI kustom (minimal, steamos, bazzite)
├── logs/                    # Direktori penyimpanan log mentah A/B testing (CSV/JSON)
├── tests/                   # Automated test suite (npm test / check-layout.mjs)
└── docs/                    # Dokumentasi akademik UAS & cetak biru arsitektur
```

## Alur Data & Mekanisme Pengukuran

```
[ Sensor / Kernel / NVML / Sysfs ]
├── /proc/stat, /proc/meminfo, /proc/diskstats (CPU, RAM, NVMe I/O)
├── /sys/class/hwmon (Coretemp & Suhu NVMe / GPU)
├── /sys/class/powercap (RAPL Daya CPU)
└── NVML / nvidia-ml-py (Utilisasi GPU, VRAM, Daya, & Clock)
↓
[ Backend FastAPI server.py ] (Port 5130)
├── Snapshot() dipanggil setiap 1 detik untuk mengalkulasi delta laju I/O & resource
├── Menandai metrik yang tidak terbaca sebagai unavailable via /api/health
└── Menyimpan rekaman snapshot secara persisten saat sesi Log aktif
↓
[ App Desktop Window app_desktop.py ]
├── Membuka Jendela GUI Mandiri (Standalone Window) tanpa browser
├── Polling GET /api/snapshot (1s) & GET /api/health (5s)
└── Merender 5 Metrik Utama ke Widget UI & memperbarui sparkline ring buffer (60 sampel)
```

## Spesifikasi 5 Metrik Utama Hardware

1. **CPU:** Utilisasi total & per-core (P-core/E-core), frekuensi clock (GHz), konsumsi daya package (RAPL Watt), dan status thermal throttling.
2. **GPU:** Utilisasi Core GPU, clock SM & Memori, alokasi VRAM (GiB), konsumsi daya GPU (Watt), serta status *throttle reasons*.
3. **RAM:** Penggunaan memori utama (GiB), persentase utilisasi, dan pemakaian SWAP/ZRAM.
4. **NVMe:** *Throughput* kecepatan baca/tulis (MB/s), IOPS, status I/O await, dan sisa kapasitas penyimpanan.
5. **Temps (Suhu):** Pemantauan suhu *real-time* untuk CPU, GPU, dan drive NVMe guna mendeteksi kecenderungan *thermal throttling* saat pengujian game.

## Endpoint API Backend

| Endpoint | Metode | Deskripsi |
|---|---|---|
| `GET /` | GET | Memuat antarmuka web UI Noterra (`web/index.html`) |
| `GET /api/snapshot` | GET | Mengembalikan JSON snapshot lengkap 5 metrik hardware terkini |
| `GET /api/health` | GET | Daftar status ketersediaan sensor (`ok` atau alasan `unavailable`) |
| `POST /api/log/start` | POST | Memulai sesi perekaman log A/B testing ke folder `logs/` |
| `POST /api/log/stop` | POST | Menghentikan sesi perekaman dan mengunci file `samples.csv` |
| `POST /api/log/marker` | POST | Menambahkan catatan penanda (*marker*) peristiwa pada log pengujian |
| `GET /api/log/sessions` | GET | Mengambil daftar seluruh sesi pengujian yang tersimpan |
| `GET /api/log/<id>/samples.csv` | GET | Mendownload data mentah CSV hasil pengujian |
| `DELETE /api/log/<id>` | DELETE | Menghapus folder log sesi pengujian tertentu |

## Prinsip Desain Utama

* **Zero Hallucination:** Metrik yang tidak memiliki sumber sensor nyata di kernel/hardware WAJIB bernilai `null` dan ditampilkan sebagai status `unavailable`. Dilarang menggunakan angka buatan.
* **Overhead Low-Impact:** Proses pembacaan metrik dirancang sangat ringan (overhead snapshot < 50 ms) agar tidak mengganggu performa dan FPS game yang sedang diuji.
* **Isolasi Log Otentik:** Rekaman log pengujian A/B disimpan dalam format standar CSV/JSON di folder `logs/` untuk bahan analisis Bab IV laporan UAS.

## Status Pengembangan & Todolist Proyek

### Selesai (Completed):
- [x] Backend FastAPI collector untuk CPU, GPU, RAM, NVMe, dan Temps.
- [x] Sistem pencatatan persisten server-side (`logs/<tanggal>_<label>/samples.csv`).
- [x] Skema kustomisasi tema UI modular (L1–L3) dan pengujian layout otomatis (`npm test`).
- [x] Penyelarasan dokumen panduan agent (`AGENTS.md`), catatan kerja (`blackbox.md`), dan panduan forking (`FORKING.md`).

### Dalam Proses / Rencana Mendatang (In Progress):
- [ ] Implementasi script wrapper Desktop App murni (`app_desktop.py` via `pywebview`).
- [ ] Penyusunan tema visual UI kustom SteamOS dan Bazzite OS oleh tim UI/UX.
- [ ] Pelaksanaan protokol pengujian game A/B pada Device 1 dan Device 2.
- [ ] Pengolahan log mentah CSV menjadi grafik komparatif untuk Laporan PDF Bab IV.
