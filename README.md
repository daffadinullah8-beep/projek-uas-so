# Aether OS - Performance Monitor

Proyek UAS Sistem Operasi untuk memantau dan membandingkan performa sistem
SteamOS dan Bazzite OS. Aether OS mengumpulkan telemetry hardware dari sumber OS
dan menampilkannya melalui dashboard web modular. Metrik tanpa sumber yang
tersedia ditampilkan sebagai `unavailable`, bukan diisi dengan angka perkiraan.

## Arsitektur

- **Python FastAPI Telemetry Backend** — membaca metrik dari Linux `/proc`,
  `/sys`, dan NVML; menyediakan snapshot, status ketersediaan metrik, serta
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
- Python 3 untuk menjalankan backend.
- Linux direkomendasikan untuk telemetry hardware aktual karena collector
  membaca `/proc` dan `/sys`. Electron di Windows berjalan dalam mode demo.

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

### Aplikasi desktop Electron

Setelah instalasi dependensi root selesai, jalankan dari root proyek:

```bash
npm start
```

Launcher menjalankan backend sebagai child process dan menutupnya saat jendela
ditutup. Di Windows, dashboard dibuka dalam mode fixture (`?mock=1`) karena
collector telemetry memakai sumber Linux (`/proc` dan `/sys`); di Linux,
dashboard memakai telemetry live. Untuk membuat paket distribusi, jalankan
`npm run dist`.

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
