/* Smoke test web/ (client + shell + theme default): render Overview, Storage
   tab, Log, widget/layout, theme minimal, dan simulasi hardware lain tanpa GPU.
   Fetch di-stub (tanpa hardware, tanpa server). */
import pkg from "jsdom";
const { JSDOM, requestInterceptor } = pkg;
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = readFileSync(path.join(PROJECT, "web", "index.html"), "utf8");
const base = JSON.parse(readFileSync(path.join(PROJECT, "server", "fixtures", "snapshot-sample.json"), "utf8"));
const SCHEMA = JSON.parse(readFileSync(path.join(PROJECT, "server", "metrics_meta.json"), "utf8"));
const WEB = path.join(PROJECT, "web");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = m => { console.error("FAIL:", m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); console.log("ok:", m); };

/* jsdom 30: muat aset web/ lewat requestInterceptor, bukan ResourceLoader */
const fileInterceptor = requestInterceptor(request => {
  const p = new URL(request.url).pathname;
  try {
    const body = readFileSync(path.join(WEB, p), "utf8");
    return new Response(body, { status: 200, headers: { "content-type": p.endsWith(".css") ? "text/css" : "text/javascript" } });
  } catch {
    return new Response("", { status: 404 });
  }
});

const HEALTH = { ok: true, nvml: false, items: {
  cpuThr: "belum ada sumber throttle CPU di mesin ini",
  cpuW: "RAPL energy_uj tidak terbaca tanpa privileges: file mode 0400",
  fan: "NVML NotSupported: kipas laptop diatur EC",
  pl1: "constraint RAPL belum dibaca",
  ramBW: "PMU IMC ada tapi perf diblokir kernel.perf_event_paranoid=4",
  pcieGen: "NVML dan sysfs tidak terbaca",
  cpuT: "hwmon coretemp tidak terbaca" } };
const CSV_TEXT = "timestamp_ms,cpu_temp_c,cpu_power_w,gpu_temp_c,gpu_power_w,vram_bw_gbs,pcie_rx_gbs,mem_major_faults_s,nvme0_read_mbps\n" +
  Array.from({ length: 12 }, (_, i) => `1793000000000,${60 + i}.000,,61.000,15.000,0.000,0.164,10.000,0.000`).join("\n") + "\n";
const SESSION = { id: 1793000000000, label: "rec-test", tag: "none", interval_s: 1,
  start_ms: Date.now(), started_iso: "2026-10-30T10:26:56+0700",
  config: { governor: "powersave", epp: "balance_performance", turbo: "on",
    swappiness: "60", kernel: "7.0.0-38-generic", sysctl: { "vm.swappiness": "60" } } };

/* stub fetch identik per harness: hanya /api/snapshot yang menaikkan counter i */
function installFetch(w, snapshotFn) {
  let i = 0, recStarted = false, recStopped = false;
  w.matchMedia = () => ({ matches: false });
  w.fetch = async (u, opts) => {
    const url = String(u), method = (opts && opts.method) || "GET";
    if (url.includes("/api/schema") || url.includes("/api/mock/schema")) return { ok: true, json: async () => SCHEMA };
    if (url.includes("/api/themes")) return { ok: true, json: async () => ({ themes: [
      { name: "default", entry: "overview.js", palettes: ["light", "dark"] },
      { name: "minimal", entry: null, layout: "layout.json", palettes: ["light", "dark"] },
      { name: "neon", entry: "overview.js", palettes: ["dark", "light"] }] }) };
    if (url.includes("/api/health") || url.includes("/api/mock/health")) return { ok: true, json: async () => HEALTH };
    if (url.includes("themes/")) {
      try { return { ok: true, text: async () => readFileSync(path.join(WEB, new URL(url, "http://localhost/").pathname), "utf8") }; }
      catch { return { ok: false }; }
    }
    if (url.includes("/api/mock/snapshot")) return { ok: true, json: async () => base };
    if (url.includes("/api/log/start")) { recStarted = true; return { ok: true, json: async () => ({ id: SESSION.id, dir: "logs/test" }) }; }
    if (url.includes("/api/log/stop")) { recStopped = true; return { ok: true, json: async () => ({ id: SESSION.id, status: "saved", samples: 12 }) }; }
    if (url.includes("/api/log/marker")) return { ok: true, json: async () => ({ id: SESSION.id, markers: [{ ts_ms: 1, since_s: 1.5, note: "" }] }) };
    if (url.includes("/api/log/sessions")) {
      const s = { ...SESSION, status: recStopped ? "saved" : "recording",
        samples: recStopped ? 12 : 3, markers: [] };
      return { ok: true, json: async () => ({ sessions: recStarted ? [s] : [] }) };
    }
    if (url.includes("samples.csv")) return { ok: true, text: async () => CSV_TEXT };
    if (snapshotFn) return { ok: true, json: async () => snapshotFn };
    i++;
    return { ok: true, json: async () => ({ ...base, majF: (base.majF ?? 20) + i * 7, cpuU: (base.cpuU ?? 10) + i, r0: (base.r0 ?? 0) + i, gT: 60 + i, gW: 50 + i }) };
  };
}

function domFor(html, wopts) {
  return new JSDOM(html, { url: wopts.url || "http://localhost/", runScripts: "dangerously",
    pretendToBeVisual: true, resources: wopts.resources,
    beforeParse(w) { installFetch(w, wopts.snapshot); } });
}
/* ---- assertions fungsional pada web/ baru ---- */
const dom = domFor(SHELL, { resources: { interceptors: [fileInterceptor] } });
const d = dom.window.document;
await sleep(2200);
const N = dom.window.Noterra;
ok(N && N.registry && N.registry.size > 0, "core membangun registry dari snapshot nyata");
ok(N.registry.get("cpuT") && N.registry.get("cpuT").label === "CPU temp" && N.registry.get("cpuT").unit === "°C",
  "registry punya label/satuan/sumber (cpuT)");
ok(N.registry.get("cpuW") && N.registry.get("cpuW").scaleKey === "pl1" && !N.registry.get("cpuW").available
  && N.registry.get("cpuW").reason.includes("RAPL"), "registry: cpuW unavailable + alasan + skala pl1");
ok([...N.registry.values()].filter(e => e.kind === "drive").length === base.drives.length,
  `entri drive registry mengikuti /sys/block (${base.drives.length})`);
ok(N.registry.get("gpuPresent")?.available === true, "gpuPresent tersedia dari snapshot");
ok(d.querySelector("#status").textContent.includes("live"), "backend live setelah fetch pertama");
ok(d.querySelector("#telemetry-mode")?.textContent === "[ LIVE TELEMETRY ]", "badge header menandai telemetry live");
ok(d.querySelector("#btn-tab-dashboard")?.textContent === "Dashboard"
  && d.querySelector("#btn-tab-session")?.textContent === "Session Manager"
  && d.querySelector("#btn-tab-hud")?.textContent === "Live HUD Overlay",
  "header menyediakan tiga tab utama terpisah");
/* ---- dashboard desain baru ---- */
const tlExpect = 1 + (base.snap.gpuPresent ? 4 : 0) + 1 + base.drives.length; // dipakai test ?layout=layout.json
ok(d.querySelector(".dash"), "dashboard dirender");
ok(d.querySelectorAll(".dash > .card").length === 7, "dashboard: 7 kartu");
ok(d.querySelector(".card.hero .name")?.textContent.includes("RTX 4060"), "hero: nama GPU dari snapshot");
ok(/%$/.test(d.querySelector(".dash > .card .big b")?.textContent || ""), "kartu CPU: angka besar berisi persen");
ok([...d.querySelectorAll(".dash .card")].every(c => !c.textContent.includes("undefined")), "kartu tanpa 'undefined'");
ok(d.querySelectorAll(".card.vs .item").length === 2, "Hardware Benchmark: 2 item");
ok(d.querySelectorAll(".card.cmp .crow").length === 3, "Benchmark Game: 3 baris");
ok(d.querySelector(".card.alt .subt")?.textContent.length > 0, "kartu NVMe: subjudul terisi");
ok(d.querySelectorAll("#nav .themesw button").length === 2, "saklar Light/Dark terpasang");
ok(!d.querySelector("#dashboard-view").hidden, "Dashboard view aktif secara default");
d.querySelector("#btn-tab-hud").click();
await sleep(80);
ok(d.querySelector("#hud-overlay-view") && !d.querySelector("#hud-overlay-view").hidden,
  "tab HUD membuka view overlay");
ok(d.querySelector("#nav").hidden && d.body.classList.contains("hud-active"),
  "HUD menyembunyikan navigasi utama");
ok(d.querySelector("#hud-gpu-util")?.textContent === `${N.ctx.data.gU}%`
  && d.querySelector("#hud-gpu-temp")?.textContent === `${N.ctx.data.gT.toFixed(1)} °C`
  && d.querySelector("#hud-gpu-power")?.textContent === `${N.ctx.data.gW.toFixed(1)} W`,
  "HUD menampilkan metrik GPU dari snapshot live");
const previousHudTemp = d.querySelector("#hud-gpu-temp").textContent;
await sleep(1150);
ok(d.querySelector("#hud-gpu-temp")?.textContent === `${N.ctx.data.gT.toFixed(1)} °C`
  && d.querySelector("#hud-gpu-temp").textContent !== previousHudTemp,
  "HUD tetap menerima update snapshot saat tab aktif");
ok(d.querySelector("#hud-fps")?.textContent === "unavailable"
  && d.querySelector("#hud-fps-1low")?.textContent === "unavailable",
  "HUD tidak mengarang metrik FPS game yang belum tersedia");
ok(d.documentElement.classList.contains("hud-active"), "HUD mengaktifkan latar transparan");
d.querySelector("#btn-back-dash").click();
ok(d.querySelector("#hud-overlay-view").hidden && !d.querySelector("#dashboard-view").hidden,
  "tombol kembali mengaktifkan Dashboard dan menutup HUD");
ok(!d.querySelector("#nav").hidden && !d.body.classList.contains("hud-active"),
  "kembali ke Dashboard memulihkan navigasi utama");
d.querySelector("#btn-tab-session").click();
await sleep(80);
ok(!d.querySelector("#session-manager-view").hidden && d.querySelector("#session-manager-view #rc"),
  "tab Session Manager menampilkan kontrol recording di view terpisah");
d.querySelector("#btn-tab-dashboard").click();
ok(d.querySelector("#session-manager-view").hidden && !d.querySelector("#dashboard-view").hidden,
  "navigasi kembali menyembunyikan Session Manager");
ok(d.documentElement.getAttribute("data-theme") === "dark", "palette default = dark");
ok(d.querySelector("#theme").options.length === 2, "palette light/dark dari theme.json");
ok([...d.querySelectorAll("#ui option")].map(o => o.value).sort().join(",") === "default,minimal,neon",
  "pemilih UI memuat theme dari /api/themes");
ok(d.querySelector("#ui").value === "default", "pemilih UI menandai theme aktif");

/* ---- simulasi hardware lain: tanpa GPU, 3 drive SATA ---- */
const alt = { ...base, snap: { ...base.snap, gpuPresent: false, nvml: false },
  gT: null, gW: null, gU: null, prx: null, gLim: null, thr: null, thrIdle: null,
  drives: [
    { dev: "sda", name: "Seagate Barracuda", sizeGB: 1000.2, link: null, linkMax: null, sched: "mq-deadline", readahead: "128 KB", capUsed: 71.2, mount: "/mnt/data" },
    { dev: "sdb", name: "WD Green", sizeGB: 500.1, link: null, linkMax: null, sched: "mq-deadline", readahead: "128 KB", capUsed: null, mount: null },
    { dev: "sdc", name: null, sizeGB: null, link: null, linkMax: null, sched: null, readahead: null, capUsed: null, mount: null }],
  r2: 12.4, w2: 3.1, i2: 220, a2: 4.2, a2Idle: false, u2: 8, q2: 1, t2: null };
const altDom = domFor(SHELL, { resources: { interceptors: [fileInterceptor] }, snapshot: alt });
const d2 = altDom.window.document;
await sleep(2200);
ok(d2.querySelectorAll(".dash > .card").length === 7, "tanpa GPU: dashboard tetap 7 kartu");
ok(d2.querySelector(".card.alt .subt")?.textContent === "Seagate Barracuda", "kartu NVMe: model drive 0 dari hardware lain");
ok(d2.querySelector(".card.alt .big b")?.textContent === "71%", "kartu NVMe: kapasitas terpakai drive 0");
ok([...d2.querySelectorAll(".dash .card")].every(c => !c.textContent.includes("undefined")),
  "hardware lain: tidak ada 'undefined' di kartu");
ok([...altDom.window.Noterra.registry.values()].filter(e => e.kind === "drive").map(e => e.dev).join(",") === "sda,sdb,sdc",
  "registry drive mengikuti hardware lain (sda,sdb,sdc)");
altDom.window.close();

/* ---- Phase 4: widget registry, layout renderer, view override ---- */
for (const w of ["value", "bar", "sparkline", "gauge"])
  ok(N.widgets.has(w), `widget registry punya "${w}"`);
const host = d.createElement("div");
d.body.append(host);
N.renderLayout(host, { cols: 12, gap: 8, items: [
  { widget: "value", bind: "cpuT", x: 0, y: 0, w: 3, h: 1 },
  { widget: "gauge", bind: "cpuT", x: 3, y: 0, w: 3, h: 2 }] }, N.ctx);
ok(host.querySelector(".w-value .w-num")?.textContent.trim().length > 0, "layout valid: widget value merender angka");
ok(host.querySelector(".w-value .w-label")?.textContent === "CPU temp", "layout valid: label dari schema");
ok(host.querySelector(".w-gauge svg path.w-val")?.getAttribute("d"), "layout valid: gauge menggambar arc");

const missingHost = d.createElement("div");
N.renderLayout(missingHost, { items: [{ widget: "tidak-ada", x: 0, y: 0, w: 2, h: 1 }] }, N.ctx);
ok(missingHost.querySelector(".w-missing")?.textContent.includes("tidak-ada"), "layout: widget tak dikenal jadi placeholder");

const bindHost = d.createElement("div");
N.renderLayout(bindHost, { items: [{ widget: "value", bind: "__tidak_ada__", x: 0, y: 0, w: 2, h: 1 }] }, N.ctx);
ok(bindHost.querySelector(".w-na")?.textContent === "unavailable", "layout: bind tak dikenal tampil unavailable");
ok((bindHost.querySelector(".w-na")?.getAttribute("title") || "").length > 0, "layout: bind tak dikenal punya tooltip alasan");

const badHost = d.createElement("div");
N.renderLayout(badHost, "{bukan json", N.ctx);
ok(badHost.querySelector(".layout-error")?.textContent.includes("tidak valid"), "layout: JSON invalid jadi error box (tidak crash)");

/* ---- tab Log (port assertion test.mjs) ---- */
[...d.querySelectorAll("nav button")].find(b => b.dataset.p === "log").click();
await sleep(400);
ok(d.querySelector("#rc"), "log controls rendered");
ok(d.body.textContent.includes("No logs yet"), "empty log state");
d.querySelector("#rc").click();
await sleep(2400);
ok(d.body.textContent.includes("recording"), "recording session listed from server");
d.querySelector("#rc").click();
await sleep(600);
ok(d.body.textContent.includes("1 tersimpan di server"), "session persisted on server with samples");
ok(d.body.textContent.includes("Mean"), "statistics table shown");
ok(d.body.textContent.includes("65.5"), "mean CPU temp dari CSV server (60..71 → 65.5)");
dom.window.URL.createObjectURL = () => "blob:fake";
let csvClicked = false;
dom.window.HTMLAnchorElement.prototype.click = function () { csvClicked = true; };
d.querySelector("#ex").click();
await sleep(400);
ok(csvClicked, "CSV export triggered");

let customLog = false;
N.addView("log", { label: "Log", order: 10, mount(root) {
  customLog = true; root.innerHTML = '<div id="custom-log">log versi theme</div>';
} });
[...d.querySelectorAll("nav button")].find(b => b.dataset.p === "log").click();
await sleep(80);
ok(customLog && d.querySelector("#custom-log")?.textContent.includes("versi theme"), "theme bisa override view log");

/* ---- layout URL mengalahkan mount theme default ---- */
const lay = domFor(SHELL, { url: "http://localhost/?layout=layout.json",
  resources: { interceptors: [fileInterceptor] } });
const dl = lay.window.document;
await sleep(2200);
ok(dl.querySelectorAll("#root .layout > .w").length === 5, "?layout=layout.json: 5 item komposit");
ok([...dl.querySelectorAll(".p h2")].map(h => h.textContent).join(",") === "CPU,GPU,Memory,Storage",
  "?layout=layout.json: 4 panel dari widget komposit");
ok(dl.querySelectorAll("#tl .tr").length === tlExpect, "?layout=layout.json: rail timeline");
lay.window.close();

/* ---- theme minimal L2 (tanpa JavaScript) di mode mock ---- */
const mini = domFor(SHELL, { url: "http://localhost/?theme=minimal&mock=1",
  resources: { interceptors: [fileInterceptor] } });
const dm = mini.window.document;
await sleep(2200);
const Nm = mini.window.Noterra;
ok(Nm.themeName() === "minimal", "theme minimal dipilih dari ?theme=minimal");
ok(dm.querySelector("#ui")?.value === "minimal", "pemilih UI menandai theme minimal");
ok(dm.querySelectorAll("#root .layout > .w").length === 4, "minimal: 4 item layout dirender");
ok(!dm.querySelector("#root .layout-error"), "minimal: tanpa error layout");
ok(dm.querySelector(".w-value .w-num")?.textContent.trim().length > 0, "minimal: value dari snapshot mock");
ok(dm.querySelector(".w-gauge svg path.w-val")?.getAttribute("d"), "minimal: gauge dari snapshot mock");
ok(dm.querySelector(".w-bar .w-caption")?.textContent.length > 0, "minimal: bar + caption");
ok(dm.querySelector(".w-spark svg path")?.getAttribute("d"), "minimal: sparkline dari ring buffer");
ok(dm.querySelector("#status").textContent.includes("mock"), "minimal: status mock (client.js + shell.js)");
ok(dm.querySelector("#telemetry-mode")?.textContent === "[ DEMO MODE / OFFLINE PREVIEW ]",
  "minimal: badge header menandai mode demo");
mini.window.close();

/* ---- theme neon L3 (Overview dari nol) di mode mock ---- */
const neon = domFor(SHELL, { url: "http://localhost/?theme=neon&mock=1",
  resources: { interceptors: [fileInterceptor] } });
const dn = neon.window.document;
await sleep(2200);
const Nn = neon.window.Noterra;
ok(Nn.themeName() === "neon", "theme neon dipilih dari ?theme=neon");
ok(dn.querySelector("#ui")?.value === "neon", "pemilih UI menandai theme neon");
ok(dn.querySelector(".nui") && !dn.querySelector(".layout-error"), "neon: UI kustom dirender tanpa error");
ok(dn.querySelectorAll(".nui-grid .card").length === 5, "neon: 5 kartu mission-control");
ok(dn.querySelector("#nui-cpu-temp")?.textContent === "74", "neon: ring CPU dari snapshot mock");
ok(dn.querySelector("#nui-cpu-w")?.textContent === "unavailable", "neon: nilai null jadi unavailable");
ok(dn.querySelector("#nui-gpu-card") && !dn.querySelector("#nui-gpu-card").hidden, "neon: kartu GPU tampil");
ok(dn.querySelectorAll("#nui-drive-list .drive").length === 2, "neon: storage lanes mengikuti 2 drive");
ok(dn.querySelector("#nui-trace path")?.getAttribute("d"), "neon: thermal trace dari ring buffer");
ok(dn.querySelector("#nui-mem-big")?.textContent.includes("/"), "neon: memori big readout");
ok(dn.querySelector("#telemetry-mode")?.textContent === "[ DEMO MODE / OFFLINE PREVIEW ]",
  "neon: badge header menandai mode demo");
neon.window.close();

dom.window.close();
console.log("ALL PASS");
process.exit(0);
