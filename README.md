# Noterra OS — Lovelace UI

Proyek UAS Sistem Operasi untuk memantau dan membandingkan performa sistem
SteamOS dan Bazzite OS. Noterra mengumpulkan telemetry hardware dari sumber OS
dan menampilkannya melalui dashboard web modular. Metrik tanpa sumber yang
tersedia ditampilkan sebagai `unavailable`, bukan diisi dengan angka perkiraan.

## Arsitektur

- **Python FastAPI Telemetry Backend** — membaca metrik dari Linux `/proc`,
  `/sys`, dan NVML; menyediakan snapshot, status ketersediaan metrik, serta
  perekaman sesi ke CSV/JSON.
- **Web UI Modular Dashboard** — frontend vanilla JavaScript dengan core data
  client, shell navigasi, renderer widget/layout, dan pilihan theme.
- **Themes** — `default` untuk dashboard monitor, `minimal` sebagai contoh
  layout tanpa JavaScript, dan `neon` sebagai dashboard kustom.

## Quick Start Guide

### Backend

Jalankan dari root repositori pada Linux:

```bash
python3 -m venv server/.venv
server/.venv/bin/pip install -r server/requirements.txt
python3 server/server.py
```

Buka <http://127.0.0.1:5130>. Sebagian sensor mungkin memerlukan izin khusus;
metrik yang tidak terbaca tetap ditandai `unavailable`. Untuk demo tanpa
hardware, buka <http://127.0.0.1:5130/?mock=1>.

### Testing UI

Dari direktori induk yang berisi folder `Lovelace`:

```bash
cd Lovelace/tests
npm install
node test-web.mjs
```

Status pengujian UI: **Smoke Test UI: 100% ALL PASS (Default, Minimal, Neon Themes)**.
Test memakai jsdom dan fixture/mock; test ini tidak menjalankan backend pada
hardware nyata.

## Struktur Proyek

```text
server/       FastAPI telemetry collector, schema, fixture, dan deployment unit
web/          shell, core client/widgets, dan themes
tests/        smoke test UI dan pemeriksaan layout komposit
docs/         panduan arsitektur, penggunaan, dan pengembangan
```

## Identitas Kelompok

Lengkapi nama dan NIM anggota sebelum pengumpulan akhir.

| No. | Nama | NIM | Peran |
|:---:|---|---|---|
| 1 | Nama Anggota 1 | NIM Anggota 1 | __________ |
| 2 | Nama Anggota 2 | NIM Anggota 2 | __________ |
| 3 | Nama Anggota 3 | NIM Anggota 3 | __________ |

## Dokumentasi Lanjutan

- Cara mengembangkan theme: [web/THEMES.md](web/THEMES.md)
- Panduan backend dan sumber metrik: [server/README.md](server/README.md)
- Catatan arsitektur dan rencana proyek: [docs/noterra-architecture.md](docs/noterra-architecture.md)
