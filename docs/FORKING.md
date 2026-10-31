# FORKING & THEME DEVELOPMENT — Panduan UI Kustom Noterra (SteamOS / Bazzite OS)

Dokumen ini adalah panduan praktis untuk membuat antarmuka (UI theme) kustom pada Noterra yang disesuaikan dengan tema visual **SteamOS & Bazzite OS**. Kamu tidak perlu mengubah file JS inti (`shell.js` atau `client.js`) untuk kustomisasi visual biasa.

## 0. Jalankan Environment Noterra

### Di Windows (PowerShell / Command Prompt):
```powershell
server\.venv\Scripts\python server\server.py
```

### Di Linux / SteamOS / Bazzite OS:
```bash 
server/.venv/bin/python server/server.py
```

Aplikasi dapat diakses via browser di http://127.0.0.1:5130/?mock=1 (menggunakan data simulasi dari server/fixtures/snapshot-sample.json). Untuk pengujian hardware nyata, buka tanpa parameter ?mock=1.

## 1. Duplikasi Folder Tema Dasar

Salin folder tema dasar minimal menjadi nama tema baru kelompokmu (misalnya steamos atau bazzite):
```bash
cp -r web/themes/minimal web/themes/steamos
```

Folder minimal/ berisi file theme.json, layout.json, dan theme.css tanpa dependensi JavaScript eksternal.

## 2. Konfigurasi Identitas Tema (theme.json)

Edit file web/themes/steamos/theme.json:

```json
{
  "name": "steamos",
  "author": "Tim Projek UAS SO",
  "version": "1.0",
  "palettes": ["dark", "light"],
  "layout": "layout.json"
}
```

Uji tema baru kamu dengan mengakses `http://127.0.0.1:5130/?theme=steamos&mock=1`

## 3. Atur Tata Letak Widget 5 Metrik Utama (layout.json)

Edit file web/themes/steamos/layout.json untuk menampilkan 5 metrik utama (CPU, GPU, RAM, NVMe, dan Temps):

```json
{
  "cols": 12,
  "gap": 10,
  "items": [
    { "widget": "value", "bind": "cpuT", "x": 0, "y": 0, "w": 3, "h": 1 },
    { "widget": "bar", "bind": "cpuU", "x": 3, "y": 0, "w": 3, "h": 1 },
    { "widget": "value", "bind": "gpuT", "x": 6, "y": 0, "w": 3, "h": 1 },
    { "widget": "bar", "bind": "gpuU", "x": 9, "y": 0, "w": 3, "h": 1 },
    { "widget": "bar", "bind": "ramU", "x": 0, "y": 1, "w": 6, "h": 1 },
    { "widget": "sparkline", "bind": "nvmeReadMbps", "x": 6, "y": 1, "w": 6, "h": 1 }
  ]
}
```

- Tipe Widget Available: value, bar, sparkline, gauge.
- Daftar Key Sensor: Buka `http://127.0.0.1:5130/api/schema` saat server berjalan untuk melihat daftar lengkap key bind.
- Key atau widget yang salah tidak membuat aplikasi crash, melainkan akan menampilkan status `unavailable`.

## 4. Ganti warna (L1)

Edit variabel CSS pada `web/themes/steamos/theme.css` agar sesuai dengan palet warna SteamOS / Bazzite OS:

```css
:root {
  --bg: #1a1f29;
  --surface: #232a37;
  --ink: #ffffff;
  --a: #1a9fff; /* Accent Blue khas Steam */
  --bad: #ff4d4d;
}

[data-theme="dark"] {
  --bg: #0e141d;
  --surface: #171d25;
  --ink: #f3f3f3;
}
```

## 5. Menambahkan Skema Metrik Baru (metrics_meta.json)

Jika kelompokmu menambahkan metrik hardware baru (misalnya FPS Game):

1. Tambahkan key pada return dict JSON backend FastAPI (`server/server.py`), misalnya "fps": 60.0.
2. Daftarkan entri di `server/metrics_meta.json`:

```json
"fps": { "label": "FPS", "unit": "fps", "digits": 0, "source": "game overlay" }
```

3. Restart server backend. Key tersebut otomatis dapat di-bind di layout.json.

## 6. Kustomisasi JavaScript Lanjutan (L3 - Opsional)

Jika membutuhkan komponen JS khusus, buat file `web/themes/steamos/overview.js`:



```js
window.Noterra.addTheme("steamos", {
  mount(root, ctx) { 
    root.innerHTML = "<div class='p'><h2>SteamOS Monitor</h2></div>"; 
  },
  update(ctx) { 
    /* Akses data via ctx.data / ctx.registry */ 
  }
});
```

Tambahkan "entry": "overview.js" ke file `theme.json`.

## 7. Mode Headless (L4 - Opsional)

Jika ingin membangun GUI desktop murni menggunakan framework lain (misalnya Electron atau Webview kustom), gunakan `web/core/client.js` langsung tanpa mengganggu DOM:

```js
const N = window.Noterra, C = N.ctx;
C.on("update", () => console.log(C.data.cpuT, C.data.gpuT));
N.loadSchema().then(() => N.start());
```

## 8. Pengujian Otomatis Sebelum Commit

Pastikan kustomisasi tema tidak memecahkan pengujian layout otomatis:

```bash
cd tests
npm test
```