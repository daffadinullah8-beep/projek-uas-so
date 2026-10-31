# blackbox.md — Catatan Kerja & Rekam Jejak Pengambangan Noterra

Dokumen ini mencatat seluruh riwayat teknis pengerjaan, perbaikan bug, kustomisasi UI, porting aplikasi desktop, serta pengujian komparatif SteamOS vs Bazzite OS.

## 2026-10-31 — Inisialisasi Repositori & Penyesuaian Ruang Lingkup Proyek

- **Konfigurasi Repositori & Git:**
  - Konfigurasi remote Git diarahkan penuh ke repositori kelompok: `daffadinullah8-beep/projek-uas-so.git`.
  - Identitas commit lokal diatur menggunakan `daffadinullah8-beep` (`daffadinullah8@gmail.com`).
  - Pull dan sinkronisasi penuh dengan cabang `main`.

- **Overhaul Dokumentasi Akademik & Konteks AI:**
  - `README.md` diperbarui sesuai standar panduan UAS Sistem Operasi (penambahan tabel kontribusi 6 anggota tim, deskripsi proyek, dan panduan penggunaan).
  - `AGENTS.md` dirombak total: mengubah fokus dari *solo LLM tuning* menjadi **Analisis Komparatif Gaming SteamOS vs Bazzite OS pada 2 Device** serta persiapan **Porting Aplikasi Desktop Murni Noterra**.
  - Penguncian 5 metrik utama pengujian hardware: **CPU, GPU, RAM, NVMe, dan Temps (Suhu)**.

- **Verifikasi Backend & Test Suite:**
  - Pengujian server backend FastAPI (`server/server.py`) di port `5130` berjalan lancar pada Windows menggunakan mode simulasi (`?mock=1`).
  - Verifikasi otomatisasi pengujian layout UI (`npm test` dan `check-layout.mjs`) terkonfirmasi **ALL PASS**.

## Next Steps Log (Akan Datang)
- [ ] Pengisian data lengkap 5 anggota tim pada `README.md`.
- [ ] Pembuatan folder tema kustom baru di `web/themes/` sesuai rancangan tim UI/UX.
- [ ] Pembuatan entry-point aplikasi desktop mandiri (`app_desktop.py`) via `pywebview` / `CustomTkinter`.
- [ ] Pengumpulan log snapshot A/B pengujian game di SteamOS dan Bazzite OS (`logs/`).