# Aether OS - Performance Monitor

Proyek UAS Sistem Operasi untuk memantau dan membandingkan performa sistem
SteamOS dan Bazzite OS. Aether OS mengumpulkan telemetry hardware dari sumber OS
dan menampilkannya melalui dashboard web modular. Metrik tanpa sumber yang
tersedia ditampilkan sebagai `unavailable`, bukan diisi dengan angka perkiraan.

## Arsitektur

- **Python FastAPI Telemetry Backend** — mengumpulkan telemetry melalui sumber
  OS: Linux `/proc`, `/sys`, dan NVML; Windows psutil, Windows CIM, dan NVML.
  Backend menyediakan snapshot, alasan metrik yang tidak tersedia, serta
  perekaman sesi ke CSV/JSON.
- **Web UI Modular Dashboard** — frontend vanilla JavaScript dengan core data
  client, shell navigasi, renderer widget/layout, dan tiga view: Dashboard,
  Session Manager (recording/analisis/ekspor CSV), serta Live HUD Overlay.
- **Themes** — `default` untuk dashboard monitor, `minimal` sebagai contoh
  layout tanpa JavaScript, dan `neon` sebagai dashboard kustom.

HUD menampilkan metrik hardware yang tersedia. FPS game, frametime, dan
resolusi tetap `unavailable` sampai integrasi VKD3D/DX12 disediakan.

## Quick Start Guide

### Persyaratan

- Node.js dan npm untuk aplikasi desktop serta smoke test UI.
- Python 3 untuk menjalankan backend dalam mode pengembangan.
- Build Electron menyediakan collector untuk Windows dan Linux. Ketersediaan
  suhu/daya CPU serta sensor tertentu tetap bergantung pada OS, driver, hardware,
  dan izin; metrik yang tidak didukung ditandai `unavailable`.

### Instalasi

Jalankan dari root repositori:

```bash
npm install
```

Siapkan environment backend sesuai sistem operasi.

Linux:

```bash
python3 -m venv server/.venv
server/.venv/bin/python -m pip install -r server/requirements.txt
```

Windows PowerShell:

```powershell
py -3 -m venv server\.venv
server\.venv\Scripts\python.exe -m pip install -r server\requirements.txt
```

### Backend

Jalankan backend dari root repositori.

Linux:

```bash
python3 server/server.py
```

Windows PowerShell:

```powershell
server\.venv\Scripts\python.exe server\server.py
```

Buka <http://127.0.0.1:5130>. Sebagian sensor mungkin memerlukan izin khusus;
metrik yang tidak terbaca tetap ditandai `unavailable`. Untuk demo tanpa
hardware, buka <http://127.0.0.1:5130/?mock=1>.

### Testing UI

Dari root repositori:

```bash
cd tests
npm install
node test-web.mjs
```

Atau jalankan `npm test` dari direktori `tests`.
Status pengujian UI: **Smoke Test UI: 100% ALL PASS (Default, Minimal, Neon Themes)**.
Test memakai jsdom dan fixture/mock; test ini tidak menjalankan backend pada
hardware nyata.

Uji collector Windows dengan:

```bash
py -3 -m unittest discover -s tests -p "test_windows_backend.py"
```

### Aplikasi desktop Electron

Setelah instalasi dependensi root selesai, jalankan dari root proyek:

```bash
npm start
```

Launcher menjalankan backend sebagai child process dan menutupnya saat jendela
ditutup. Build distribusi membundel backend FastAPI sebagai executable mandiri,
jadi pengguna aplikasi hasil build tidak perlu memasang Python. Di Windows,
dashboard dan Linux sama-sama menggunakan telemetry live. Windows mengambil
metrik umum melalui psutil; suhu/daya CPU dan beberapa sensor khusus tetap
`unavailable` jika tidak tersedia dari Windows/driver. Demo bisa diaktifkan
secara eksplisit dengan `NOTERRA_DEMO_MODE=1`. Untuk membuat paket distribusi,
siapkan Python 3.11 dan dependensi `server/requirements.txt` beserta PyInstaller
pada mesin build, lalu jalankan `npm run build:win` atau `npm run build:linux`.
Build backend harus dilakukan pada OS targetnya masing-masing.

### Membandingkan sesi Windows dan Linux

Rekam sesi di tiap perangkat dengan nama workload yang sama dan tag platform
yang jelas (misalnya `Windows` dan `Bazzite`); samakan versi game, pengaturan
grafis, durasi, serta prosedur warm-up. Setelah sesi
berhenti, setiap folder sesi berisi `samples.csv` dan `meta.json` (identitas
perangkat, OS, CPU/GPU, dan driver). Salin folder sesi dari kedua perangkat ke
folder `logs` di direktori data pengguna Aether OS pada satu perangkat, lalu
buka ulang aplikasi. Pilih sesi-sesi tersebut di Session Manager untuk
membandingkan dan mengekspor data. Gunakan metrik yang tersedia pada kedua OS;
nilai `unavailable` bukan nol. Karena perangkatnya berbeda, hasil juga
mencerminkan perbedaan hardware, bukan hanya pengaruh OS. Kartu benchmark pada
Dashboard adalah contoh statis dan bukan hasil pengukuran aktual.

## Struktur Proyek

```text
server/       FastAPI telemetry collector, schema, fixture, dan deployment unit
web/          shell, core client/widgets, dan themes
tests/        smoke test UI dan pemeriksaan layout komposit
docs/         panduan arsitektur, penggunaan, dan pengembangan
```

## Anggota Tim

Pembagian peran dapat dilengkapi sesuai kontribusi masing-masing anggota.

| No. | Nama | NPM | Peran |
|:---:|---|:---:|---|
| 1 | Daffa Dinullah | 257006111121 | |
| 2 | Mochamad Syam Firza Ramadhan | 257006111122 | |
| 3 | Rahman | 257006111073 | |
| 4 | Reva Imelda | 257006111108 | |
| 5 | Repat Dwi Gunanda | 257006111069 | |
| 6 | Nadila Nuryadina | 257006111078 | |

## Dokumentasi Lanjutan

- Cara mengembangkan theme: [web/THEMES.md](web/THEMES.md)
- Panduan backend dan sumber metrik: [server/README.md](server/README.md)
