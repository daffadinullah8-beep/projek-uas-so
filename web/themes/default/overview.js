/* Theme default — overview.js. Hanya membaca registry + data lewat ctx
   (core yang fetch, parse, dan memformat). Tidak memanggil fetch sendiri.
   Mengekspor mount(root, ctx) dan update(ctx) lewat Noterra.addTheme. */
(function() {
  "use strict";
  const N = window.Noterra;
  const { fx, val, esc, mmss, clamp, avg } = N.fmt;
  const mk = N.mk;
  const one = h => mk(h).firstElementChild;   // elemen kartu asli (tanpa div pembungkus)

  let C = null, S = null, R = null; // ctx, ctx.data, ctx.reasons — di-refresh tiap update
  let storageSel = 0;             // index drive terpilih di panel Storage (bertahan antar update)
  
  const storageIndex = () => Math.min(storageSel, Math.max(0, ((C && C.drives) || []).length - 1));
  const H = k => C.hist(k);
  const dynMax = k => C.max(k);
  const metricKey = label => String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function spark(svg, keys, cols, min, max) {
    const pairs = keys.map((k, i) => [H(k) || [], cols[i]]).filter(([d]) => d.length > 1);
    if (!pairs.length) {
      svg.innerHTML = "";
      return;
    }
    const all = pairs.flatMap(([d]) => d),
          mn = min ?? Math.min(...all),
          mx = max ?? Math.max(...all),
          span = (mx - mn) || 1,
          h = svg.viewBox.baseVal.height;
          
    svg.innerHTML = pairs.map(([d, c]) => 
      `<path class="l" style="stroke:var(${c})" d="${d.map((v, j) => `${j ? "L" : "M"}${(j / Math.max(d.length - 1, 1) * 200).toFixed(1)},${(h - 2 - (clamp(v, mn, mx) - mn) / span * (h - 4)).toFixed(1)}`).join("")}"/>`
    ).join("");
  }

  /* ---- rpm-style gauge: 270° sweep; skala + ambang dari registry/sumber nyata ---- */
  const pt = (a, r) => [75 + r * Math.cos(a * Math.PI / 180), 66 + r * Math.sin(a * Math.PI / 180)];
  const arc = (a0, a1, r) => {
    const p = pt(a0, r), q = pt(a1, r);
    return `M${p[0].toFixed(1)},${p[1].toFixed(1)}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${q[0].toFixed(1)},${q[1].toFixed(1)}`;
  };

  function gauge(g) {
    const ring = (r, w, c) => `<path d="${arc(135, 405, r)}" fill="none" style="stroke:var(--line)" stroke-width="${w}" stroke-linecap="round"/><path class="${c}" fill="none" stroke-width="${w}" stroke-linecap="round"/>`;
    const el = mk(`<svg viewBox="0 0 150 124">${ring(54, 9, "v")}${g.in ? ring(41, 5, "w") : ""}<text x="75" y="72" text-anchor="middle" style="fill:var(--ink);font:600 24px var(--mono)"></text><text x="75" y="88" text-anchor="middle" style="fill:var(--mute);font:11px var(--sans)"></text><text x="75" y="118" text-anchor="middle" style="fill:var(--mute);font:11px var(--sans)"></text></svg>`);
    
    const v = el.querySelector(".v"), w = el.querySelector(".w"), tx = el.querySelector("text");
    const un = el.querySelectorAll("text")[1], lb = el.querySelectorAll("text")[2];
    const key = () => typeof g.key === "function" ? g.key() : g.key;
    
    const draw = (p, x, m, wn, bd, r) => {
      if (typeof x !== "number" || typeof m !== "number" || m <= 0) {
        p.setAttribute("d", "");
        return;
      }
      p.setAttribute("d", arc(135, 135 + 270 * clamp(x / m, .005, 1), r));
      p.style.stroke = bd ? "var(--bad)" : wn ? "var(--warn)" : "var(--a)";
    };

    return {
      el,
      up: () => {
        const k = key(), s = C.data, x = s[k], m = g.max ? g.max() : dynMax(k);
        un.textContent = typeof g.unit === "function" ? g.unit() : (g.unit || "");
        lb.textContent = typeof g.label === "function" ? g.label() : (g.label || "");
        draw(v, x, m, g.warn(s), g.bad(s), 54);
        tx.textContent = val(x, g.d || 0);
        tx.setAttribute("title", x == null ? (R[k] || "tidak ada sumber data") : "");
        
        if (g.in) {
          const ik = typeof g.in.key === "function" ? g.in.key() : g.in.key, 
                ix = s[ik], 
                im = g.in.max ? g.in.max() : dynMax(ik);
          draw(w, ix, im, g.in.warn(s), g.in.bad(s), 41);
          el.querySelector("svg").setAttribute("title", ix == null ? (R[ik] || "") : "");
        }
      }
    };
  }

  /* ---- blocks: each returns {el, up()} ---- */
  const B = {
    hd: b => {
      const g = gauge(b.g), 
            el = mk(`<div class="hd"><div class="gw"></div><div class="stats">${b.stats.map(() => `<div><span></span><b></b></div>`).join("")}</div></div>`);
      el.querySelector(".gw").append(g.el);
      const bs = [...el.querySelectorAll("b")];
      return {
        el,
        up: () => {
          g.up();
          b.stats.forEach((s, i) => {
            const sk = typeof s[0] === "function" ? s[0](C.data) : s[0];
            const label = typeof s[1] === "function" ? s[1](C.data) : s[1];
            const unit = typeof s[2] === "function" ? s[2](C.data) : s[2];
            const v = s[4] ? s[4](C.data) : C.data[sk];
            bs[i].previousElementSibling.textContent = label;
            bs[i].parentElement.dataset.metric = metricKey(label);
            if (typeof v === "number") {
              bs[i].innerHTML = fx(v, s[3] || 0) + `<small>${unit || ""}</small>`;
              bs[i].removeAttribute("title");
            } else {
              bs[i].innerHTML = `<span class="na">${v == null ? "unavailable" : v}</span>`;
              bs[i].title = v == null ? (R[sk] || "tidak ada sumber data") : "tidak ada I/O di interval ini";
            }
          });
        }
      };
    },
    cores: () => {
      const el = mk(`<div></div>`);
      el.className = "cores";
      return {
        el,
        up: () => {
          const s = (C && C.data) || {};
          let P = s.pu || (s.snap && s.snap.pu) || [];
          let E = s.eu || (s.snap && s.snap.eu) || [];
          const logical = s.snap && s.snap.cpuCoreType === "logical";

          // Jika data realtime belum ada, hitung core dinamis dari C.registry (snapshot test)
          if (P.length === 0 && E.length === 0 && C && C.registry) {
            let pCount = 0, eCount = 0;
            for (const [k, v] of C.registry.entries()) {
              if (/^pu\d+$/.test(k) || /^pf\d+$/.test(k) || /^pt\d+$/.test(k)) pCount++;
              else if (/^eu\d+$/.test(k) || /^ef\d+$/.test(k) || /^et\d+$/.test(k)) eCount++;
            }
            if (pCount > 0 || eCount > 0) {
              P = Array(Math.max(1, pCount)).fill(0);
              E = Array(eCount).fill(0);
            } else {
              let totalCores = 0;
              for (const [k, v] of C.registry.entries()) {
                if (v && (v.kind === "core" || /^core\d+$/.test(k) || /^cpu\d+$/.test(k))) totalCores++;
              }
              if (totalCores > 0) {
                P = Array(Math.min(6, totalCores)).fill(0);
                E = Array(Math.max(0, totalCores - 6)).fill(0);
              }
            }
          }

          // Fallback default (6 P-core + 4 E-core = 10 core)
          if (P.length === 0 && E.length === 0 && !logical) {
            P = Array(6).fill(0);
            E = Array(4).fill(0);
          }

          const layout = `${logical ? "logical" : "hybrid"}:${P.length}:${E.length}`;
          if (el.dataset.n !== layout) {
            const cell = labels => `<div>${labels.map(label => `<div class="cc"><i></i><b>${label}</b><u></u><s></s></div>`).join("")}</div>`;
            const groups = logical
              ? [Array.from({ length: P.length }, (_, i) => `CPU${i}`)]
              : [Array.from({ length: P.length }, (_, i) => `P${i}`),
                Array.from({ length: E.length }, (_, i) => `E${i}`)];
            el.innerHTML = groups.map(cell).join("") + `<div class="hint2">Clock dan suhu dari sensor yang tersedia. Fill = utilisasi. "—" = tidak ada sumber.</div>`;
            el.dataset.n = layout;
          }

          const cc = [...el.querySelectorAll(".cc")];
          cc.forEach((x, i) => {
            const pf = s.pf || [], pt = s.pt || [], pu = s.pu || [];
            const ef = s.ef || [], et = s.et || [], eu = s.eu || [];
            const src = i < P.length ? [pf[i], pt[i], pu[i]] : [ef[i - P.length], et[i - P.length], eu[i - P.length]];
            const u = x.querySelector("i"), f = x.querySelector("u"), t = x.querySelector("s");
            if (u) u.style.height = (typeof src[2] === "number" ? src[2] : 0) + "%";
            if (f) {
              f.textContent = val(src[0], 2);
              f.title = src[0] == null ? ((R && (R["pfa"] || R["ef"])) || "tidak ada sumber clock") : "";
            }
            if (t) {
              t.textContent = val(src[1]) + "°";
              t.title = src[1] == null ? ((R && R["pt"]) || "tidak ada sensor suhu core ini") : "";
            }
          });
        }
      };
    },
    bars: b => {
      const el = mk(`<div class="bars">${b.items.map(it => `<div class="br" data-metric="${metricKey(it.l)}"><span>${it.l}</span><div class="bar">${it.c.map(c => `<i style="background:var(${c})"></i>`).join("")}</div><em></em></div>`).join("")}</div>`);
      const rows = [...el.querySelectorAll(".br")];
      return {
        el,
        up: () => b.items.forEach((it, i) => {
          const f = it.f(C.data), den = f[f.length - 1];
          rows[i].querySelectorAll(".bar i").forEach((x, j) => {
            const ok = typeof f[j] === "number" && typeof den === "number" && den > 0;
            x.style.width = ok ? clamp(f[j] / den * 100, 0, 100) + "%" : "0%";
          });
          rows[i].querySelector("em").textContent = it.t(C.data);
          rows[i].querySelector("em").title = it.tip ? it.tip(C.data) : "";
        })
      };
    },
    chips: b => {
      const el = mk(`<div class="chips">${b.items.map(x => `<span class="cp">${x}</span>`).join("")}</div>`);
      const c = [...el.querySelectorAll(".cp")];
      return {
        el,
        up: () => {
          b.on(C.data).forEach((raw, i) => {
            const v = raw === true || raw === false ? raw : null;
            c[i].className = "cp" + (v === true ? " on" : "");
            c[i].textContent = b.items[i] + (v === null ? " —" : "");
            c[i].setAttribute("title", v === null ? (b.tip ? b.tip(C.data, i) : "tidak ada sumber (NVML)") : "NVML throttle reasons");
          });
        }
      };
    },
    chart: b => {
      let ti = 0;
      const el = mk(`<div class="ch"><div class="tabs">${b.tabs.map(x => `<button data-metric="${metricKey(x.n)}">${x.n}</button>`).join("")}<em class="lg"></em></div><svg class="sp" viewBox="0 0 200 50" preserveAspectRatio="none"></svg></div>`);
      const sv = el.querySelector("svg"), btn = [...el.querySelectorAll("button")], lg = el.querySelector(".lg");
      const draw = () => spark(sv, b.tabs[ti].s.map(s => s[0]), b.tabs[ti].s.map(s => s[2]), b.tabs[ti].min, b.tabs[ti].max);
      const tab = i => {
        ti = i;
        btn.forEach((x, j) => x.setAttribute("aria-pressed", j === i));
        lg.innerHTML = b.tabs[i].s.map(s => `<span><i style="background:var(${s[2]})"></i>${s[1]}</span>`).join("");
        draw();
      };
      btn.forEach((x, i) => x.onclick = () => tab(i));
      tab(0);
      return { el, up: draw };
    },
    dl: b => {
      const hdr = b.hdr ? `<dt></dt>${b.hdr.map(h => `<dt class="h">${h}</dt>`).join("")}` : "";
      const el = mk(`<dl class="${b.hdr ? "tb" : "pr"}">${hdr}${b.rows.map(r => `<dt data-metric="${metricKey(r[0])}">${r[0]}</dt>` + (b.hdr ? `<dd data-metric="${metricKey(r[0])}"></dd><dd data-metric="${metricKey(r[0])}"></dd>` : `<dd data-metric="${metricKey(r[0])}"></dd>`)).join("")}</dl>`);
      const dd = [...el.querySelectorAll("dd")];
      return {
        el,
        up: () => {
          let j = 0;
          b.rows.forEach(r => {
            const n = b.hdr ? 2 : 1;
            const warn = r[n + 1] ? r[n + 1](C.data) : false;
            for (let c = 0; c < n; c++) {
              const raw = r[1 + c], v = typeof raw === "function" ? raw(C.data) : raw;
              const na = v == null || v === "unavailable";
              dd[j].textContent = na ? "unavailable" : v;
              dd[j].className = (warn ? "warn " : "") + (na ? "dd-na" : "");
              dd[j].title = na ? (R[r[n + 2 + c]] || "tidak ada sumber data") : "";
              j++;
            }
          });
        }
      };
    },
    dynBars: b => {
      const el = mk(`<div class="bars"></div>`), box = el.firstElementChild;
      let n = -1, rows = [];
      return {
        el,
        up: () => {
          const items = b.items(C.data);
          if (items.length !== n) {
            n = items.length;
            box.innerHTML = items.map(it => `<div class="br" data-metric="${it.l.endsWith(" capacity") ? "capacity" : "read"}"><span>${it.l}</span><div class="bar">${it.c.map(c => `<i style="background:var(${c})"></i>`).join("")}</div><em></em></div>`).join("");
            rows = [...box.querySelectorAll(".br")];
          }
          items.forEach((it, i) => {
            const f = it.f(C.data), den = f[f.length - 1];
            rows[i].querySelectorAll(".bar i").forEach((x, j) => {
              const ok = typeof f[j] === "number" && typeof den === "number" && den > 0;
              x.style.width = ok ? clamp(f[j] / den * 100, 0, 100) + "%" : "0%";
            });
            rows[i].querySelector("em").textContent = it.t(C.data);
            rows[i].querySelector("em").setAttribute("title", it.tip ? it.tip(C.data) : "");
          });
        }
      };
    },
    dynTable: b => {
      const el = mk(`<dl class="tb"></dl>`), box = el.firstElementChild;
      let n = -1, dd = [];
      return {
        el,
        up: () => {
          const cols = b.n(C.data);
          if (cols !== n) {
            n = cols;
            box.style.gridTemplateColumns =
              `minmax(0, 1.2fr) repeat(${Math.max(cols, 1)}, minmax(0, 1fr))`;
            box.innerHTML = `<dt></dt>` + Array.from({ length: cols }, (_, i) => `<dt class="h">${esc(b.hdr(C.data, i))}</dt>`).join("") +
              b.rows.map(r => `<dt data-metric="${metricKey(r[0])}">${r[0]}</dt>` + Array.from({ length: cols }, () => `<dd data-metric="${metricKey(r[0])}"></dd>`).join("")).join("");
            dd = [...box.querySelectorAll("dd")];
          }
          let j = 0;
          b.rows.forEach(r => {
            for (let c = 0; c < cols; c++) {
              const v = r[1](C.data, c), na = v == null || v === "unavailable";
              dd[j].textContent = na ? "unavailable" : v;
              dd[j].className = (r[3] ? r[3](C.data, c) ? "warn " : "" : "") + (na ? "dd-na" : "");
              dd[j].setAttribute("title", na ? (R[r[2](C.data, c)] || "tidak ada sumber data") : "");
              j++;
            }
          });
        }
      };
    },
    dynChart: b => {
      let ti = 0, tabs = [];
      const el = mk(`<div class="ch"><div class="tabs"><em class="lg"></em></div><svg class="sp" viewBox="0 0 200 50" preserveAspectRatio="none"></svg></div>`);
      const sv = el.querySelector("svg"), tb = el.querySelector(".tabs"), lg = el.querySelector(".lg");
      const sel = () => typeof b.sel === "function" ? b.sel() : b.sel;
      const sync = () => { const w = sel(); if (typeof w === "number" && w >= 0 && w < tabs.length) ti = w; };
      const draw = () => {
        if (!tabs.length) { lg.innerHTML = ""; return; }
        sync();
        ti = Math.min(ti, tabs.length - 1);
        spark(sv, tabs[ti].s.map(x => x[0]), tabs[ti].s.map(x => x[2]), tabs[ti].min, tabs[ti].max);
        lg.innerHTML = tabs[ti].s.map(x => `<span><i style="background:var(${x[2]})"></i>${x[1]}</span>`).join("");
        const cur = tabs[ti].s[0] ? tabs[ti].s[0][0] : "";
        [...tb.querySelectorAll("button")].forEach(x => x.setAttribute("aria-pressed", String(x.dataset.key === cur)));
      };
      return {
        el,
        up: () => {
          const t = b.tabs(C.data);
          if (t.length !== tabs.length) {
            tabs = t;
            [...tb.querySelectorAll("button")].forEach(x => x.remove());
            tabs.forEach((x, j) => {
              const btn = document.createElement("button");
              btn.textContent = x.n;
              btn.dataset.metric = metricKey(x.n);
              btn.dataset.key = x.s[0] ? x.s[0][0] : "";
              btn.dataset.drive = x.n;
              btn.onclick = () => { ti = j; draw(); if (b.onSelect) b.onSelect(j); };
              tb.insertBefore(btn, lg);
            });
            ti = 0;
          }
          draw();
        }
      };
    }
  };

  function panel(c) {
    const el = document.createElement("section");
    el.className = "p p-" + metricKey(c.title);
    el.innerHTML = `<header><h2>${c.title}</h2><span></span></header><div class="col"></div><div class="col"></div>`;
    const cols = el.querySelectorAll(".col"), us = [];
    [c.l, c.r].forEach((side, k) => side.forEach(b => { const x = B[b.t](b); cols[k].append(x.el); us.push(x.up); }));
    return { el, us, sub: el.querySelector("span") };
  }

  /* ---- sinyal nyata untuk ambang gauge/chip ---- */
  const cpuThrottling = s => s.cpuThr != null && s.cpuThr !== "none";
  const gpuThermal = s => s.thrThermal === true || s.thrHw === true;
  const gpuPowerCap = s => s.thrPower === true;
  const pl1 = s => typeof s.pl1 === "number" ? s.pl1 : null;
  const gLim = s => typeof s.gLim === "number" ? s.gLim : null;
  const near = (v, m, f) => typeof v === "number" && typeof m === "number" && m > 0 && v >= m * f;

  const PANELS = [
    {
      title: "CPU",
      sub: s => s.snap.cpuCoreType === "logical"
        ? `${s.snap.cpuModel || "CPU"}, ${s.snap.cpuLogical || (S.pu || []).length} logical CPUs`
        : (s.snap.cpuModel || "CPU") + ", " + ((S.pu || []).length) + " P + " + ((S.eu || []).length) + " E cores (dinamis dari kernel)",
      l: [
        {
          t: "hd",
          g: {
            key: "cpuT",
            max: () => Math.max(dynMax("cpuT") || 0, 70),
            warn: () => cpuThrottling(C.data),
            bad: () => cpuThrottling(C.data),
            unit: "°C",
            label: "temp · ring = daya vs PL1",
            in: { key: "cpuW", max: () => pl1(C.data) || dynMax("cpuW"), warn: s => near(s.cpuW, pl1(s), .9), bad: s => near(s.cpuW, pl1(s), 1) }
          },
          stats: [["cpuU", "Util", "%"], ["migr", "Migrations", "/s"],
            ["pfa", s => s.snap.cpuCoreType === "logical" ? "Avg CPU clock" : "P clock", "GHz", 2],
            ["efa", s => s.snap.cpuCoreType === "logical" ? "Logical CPUs" : "E clock",
              s => s.snap.cpuCoreType === "logical" ? "" : "GHz", 2,
              s => s.snap.cpuCoreType === "logical" ? s.snap.cpuLogical :
                ((S.ef || []).filter(x => typeof x === "number").length
                  ? avg((S.ef || []).filter(x => typeof x === "number")) : null)]]
        },
        { t: "cores" },
        {
          t: "bars",
          items: [
            { l: "Power / PL1", c: ["--b"], f: s => [s.cpuW, pl1(C.data)], t: s => fx(s.cpuW, 1) + " / " + fx(pl1(C.data), 1) + " W", tip: s => pl1(C.data) == null ? (R["pl1"] || "") : "" },
            { l: "Idle residency", c: ["--a"], f: s => [s.idle, 100], t: s => fx(s.idle) + " % " + (s.idleName || ""), tip: s => R["idle"] || "" }
          ]
        }
      ],
      r: [
        {
          t: "chart",
          tabs: [
            { n: "Temp and power", s: [["cpuT", "Temp (°C)", "--b"], ["cpuW", "Power (W)", "--a"]] },
            { n: "Load and idle", min: 0, s: [["cpuU", "Util (%)", "--a"], ["idle", "Idle (%)", "--b"]] }
          ]
        },
        {
          t: "dl",
          rows: [
            ["Governor", s => s.snap.governor],
            ["EPP", s => s.snap.epp],
            ["Turbo", s => s.snap.turbo],
            ["PL1 / PL2", s => { const a = s.pl1 == null ? null : fx(s.pl1, 1) + " W (PL1)", b = s.pl2 == null ? null : fx(s.pl2, 1) + " W (PL2)"; const x = [a, b].filter(Boolean); return x.length ? x.join(" / ") : null; }, null, "pl1"],
            ["Context switches", s => s.ctx == null ? null : fx(s.ctx) + " /s", null, "ctx"],
            ["Interrupts", s => s.irq == null ? null : fx(s.irq) + " /s", null, "irq"],
            ["Throttle", s => s.cpuThr, null, "cpuThr"]
          ]
        }
      ]
    },
    {
      title: "GPU",
      sub: s => (s.snap.gpuName || "NVIDIA GPU") + (s.snap.nvml ? "" : " (NVML unavailable)"),
      l: [
        {
          t: "hd",
          g: {
            key: "gT",
            max: () => Math.max(dynMax("gT") || 0, 60),
            warn: () => gpuThermal(C.data),
            bad: () => gpuThermal(C.data),
            unit: "°C",
            label: "temp · ring = daya vs limit",
            in: { key: "gW", max: () => gLim(C.data) || dynMax("gW"), warn: s => near(s.gW, gLim(s), .9), bad: s => near(s.gW, gLim(s), 1) }
          },
          stats: [["gW", "Power", "W", 1], ["gClk", "SM clock", "MHz"], ["gU", "Util", "%"], ["vram", "VRAM", "GiB", 1]]
        },
        { t: "chips", items: ["Idle", "Power cap", "Thermal", "HW slowdown"], on: s => [s.thrIdle, s.thrPower, s.thrThermal, s.thrHw], tip: (s, i) => R["thr"] || "" },
        {
          t: "bars",
          items: [
            { l: "VRAM", c: ["--a"], f: s => [s.vram, s.vramTot], t: s => fx(s.vram, 2) + " / " + fx(s.vramTot, 2) + " GiB", tip: s => R["vram"] || "" },
            { l: "VRAM bw (est.)", c: ["--b"], f: s => [s.vbw, s.gpeak], t: s => fx(s.vbw) + " / " + fx(s.gpeak) + " GB/s (estimasi)", tip: s => R["vbw"] || "" },
            { l: "PCIe receive", c: ["--a"], f: s => [s.prx, s.pctheory], t: s => fx(s.prx, 2) + " / " + fx(s.pctheory, 2) + " GB/s", tip: s => R["prx"] || "" },
            { l: "PCIe transmit", c: ["--b"], f: s => [s.ptx, s.pctheory], t: s => fx(s.ptx, 2) + " / " + fx(s.pctheory, 2) + " GB/s", tip: s => R["ptx"] || "" }
          ]
        }
      ],
      r: [
        {
          t: "chart",
          tabs: [
            { n: "GPU temp", min: 30, max: 95, s: [["gT", "Temp (°C)", "--b"]] },
            { n: "Temp and power", s: [["gT", "Temp (°C)", "--b"], ["gW", "Power (W)", "--a"]] },
            { n: "Util", min: 0, s: [["gU", "GPU (%)", "--a"], ["gMU", "Mem ctrl (%)", "--b"]] },
            { n: "VRAM bw", min: 0, s: [["vbw", "GB/s (est.)", "--a"]] },
            { n: "PCIe", min: 0, s: [["prx", "Rx (GB/s)", "--a"], ["ptx", "Tx (GB/s)", "--b"]] }
          ]
        },
        {
          t: "dl",
          rows: [
            ["Memory clock", s => s.gMemClk == null ? null : s.gMemClk + " MHz", null, "gMemClk"],
            ["Bus width", s => s.gbw == null ? null : s.gbw + " bit", null, "gbw"],
            ["P-state", s => s.pstate, null, "pstate"],
            ["PCIe now / max", s => s.pcieGen == null ? null : "Gen" + s.pcieGen + " x" + s.pcieWidth + (s.pcieMax ? " / " + s.pcieMax : ""), null, "pcieGen"],
            ["Draw / limit", s => s.gW == null ? null : fx(s.gW, 1) + " W" + (s.gLim ? " / " + fx(s.gLim) + " W" + (s.gLimDef ? " (default)" : "") : ""), null, "gW"],
            ["Throttle", s => s.thr, g => g.thr != null && g.thr !== "none", "thr"],
            ["Fan", s => s.fan == null ? null : fx(s.fan) + " %", null, "fan"],
            ["NVIDIA driver", s => s.snap.gpuDriver]
          ]
        }
      ]
    },
    {
      title: "Memory",
      sub: s => s.snap.kernel ? "kernel " + s.snap.kernel : "",
      l: [
        {
          t: "hd",
          g: {
            key: "ramU",
            max: () => typeof S.memTot === "number" ? S.memTot : dynMax("ramU"),
            warn: () => near(S.ramU, S.memTot, .8),
            bad: () => near(S.ramU, S.memTot, .93),
            unit: "GiB used",
            label: "RAM (total dari meminfo)",
            d: 1
          },
          stats: [["cache", "Page cache", "GiB", 1], ["avail", "Available", "GiB", 1], ["majF", "Major faults", "/s"], ["swp", "Swap I/O", "MB/s", 1]]
        },
        {
          t: "bars",
          items: [
            { l: "RAM", c: ["--a", "--b"], f: s => [s.ramU, s.cache, S.memTot], t: s => `${fx(s.ramU, 1)} used, ${fx(s.cache, 1)} cache, dari ${fx(S.memTot, 1)} GiB`, tip: s => R["ramU"] || "" },
            { l: "Swap", c: ["--warn"], f: s => [s.swapU, S.swapTot], t: s => fx(s.swapU, 1) + " / " + fx(S.swapTot, 1) + " GiB", tip: s => R["swapU"] || "" },
            { l: "Major faults", c: ["--b"], f: s => [s.majF, dynMax("majF")], t: s => fx(s.majF) + " /s (peak terukur " + fx(dynMax("majF")) + ")", tip: s => R["majF"] || "" },
            { l: "Minor faults", c: ["--a"], f: s => [s.minF, dynMax("minF")], t: s => fx(s.minF) + " /s (peak terukur " + fx(dynMax("minF")) + ")", tip: s => R["minF"] || "" }
          ]
        }
      ],
      r: [
        {
          t: "chart",
          tabs: [
            { n: "RAM", min: 0, s: [["ramU", "Used (GiB)", "--a"], ["cache", "Cache (GiB)", "--b"]] },
            { n: "Page faults", min: 0, s: [["majF", "Major (/s)", "--b"], ["minF", "Minor (/s)", "--a"]] }
          ]
        },
        {
          t: "dl",
          rows: [
            ["Total", s => s.memTot == null ? null : fx(s.memTot, 2) + " GiB", null, "memTot"],
            ["Swap total", s => s.swapTot == null ? null : fx(s.swapTot, 2) + " GiB", null, "swapTot"],
            ["Measured bandwidth", s => s.ramBW == null ? null : fx(s.ramBW, 1) + " GB/s", null, "ramBW"],
            ["Hugepages", s => s.snap.thp],
            ["Swappiness", s => s.snap.swappiness]
          ]
        }
      ]
    },
    {
      title: "Storage",
      sub: s => C.drives.length ? C.drives.map(d => `${d.dev || "drive"}: ${d.name || "unavailable"}`).join(" · ")
        : s.snap.platform === "Windows" ? "tidak ada physical drive yang terdeteksi" : "tidak ada drive di /sys/block",
      l: [
        {
          t: "hd",
          g: {
            key: () => "r" + storageIndex(),
            max: () => dynMax("r" + storageIndex()),
            warn: () => false,
            bad: () => false,
            unit: "MB/s read",
            label: () => { const i = storageIndex(), d = C.drives[i] || {}; return i === 0 ? "drive 0 (skala = peak terukur)" : `drive ${i} · ${d.dev || ("drive" + i)} (skala = peak terukur)`; }
          },
          stats: [
            [() => "w" + storageIndex(), "Write", "MB/s", 1],
            [() => "i" + storageIndex(), "IOPS", "IOPS"],
            [() => "a" + storageIndex(), "Await", "ms", 1, s => s["a" + storageIndex() + "Idle"] ? "idle" : null],
            [() => "u" + storageIndex(), "Util", "%"]
          ]
        },
        {
          t: "dynBars",
          items: s => {
            const out = [];
            C.drives.forEach((d, i) => {
              out.push({
                l: `${d.dev || ("drive" + i)} read`,
                c: ["--a"],
                f: x => [x["r" + i], dynMax("r" + i)],
                t: x => fx(x["r" + i]) + " / " + fx(dynMax("r" + i)) + " MB/s (peak terukur)",
                tip: x => R["r" + i] || ""
              });
              out.push({
                l: `${d.dev || ("drive" + i)} capacity`,
                c: ["--warn"],
                f: x => [d.capUsed, 100],
                t: x => d.capUsed == null ? (d.mount == null ? "not mounted" : "unavailable") : fx(d.capUsed) + " % of " + fx(d.sizeGB, 1) + " GB",
                tip: x => R["d" + i + "capUsed"] || ""
              });
            });
            return out;
          }
        }
      ],
      r: [
        {
          t: "dynChart",
          sel: () => storageIndex(),
          onSelect: i => { storageSel = i; refreshSubs(); },
          tabs: s => C.drives.map((d, i) => ({
            n: d.dev || ("drive" + i),
            min: 0,
            s: [["r" + i, "Read (MB/s)", "--a"], ["w" + i, "Write (MB/s)", "--b"]]
          }))
        },
        {
          t: "dynTable",
          n: s => C.drives.length,
          hdr: (s, i) => C.drives[i].dev || ("drive" + i),
          rows: [
            ["Model", (s, c) => C.drives[c].name, (s, c) => "d" + c + "model"],
            ["Link / max", (s, c) => { const d = C.drives[c]; return d.link == null ? null : d.link + (d.linkMax ? " / " + d.linkMax : ""); }, (s, c) => "d" + c + "link"],
            ["Queue", (s, c) => s["q" + c] == null ? null : fx(s["q" + c], 1), (s, c) => "q" + c],
            ["Temp", (s, c) => s["t" + c] == null ? null : fx(s["t" + c]) + " °C", (s, c) => "t" + c],
            ["Scheduler", (s, c) => C.drives[c].sched, (s, c) => "d" + c + "sched"],
            ["Readahead", (s, c) => C.drives[c].readahead, (s, c) => "d" + c + "readahead"],
            ["Await", (s, c) => s["a" + c] == null ? (s["a" + c + "Idle"] ? "idle" : null) : fx(s["a" + c], 1) + " ms", (s, c) => "a" + c]
          ]
        }
      ]
    }
  ];

  let PSIG = ""; 
  let cur = [];
  
  function driveCount() {
    let n = 0;
    const reg = (C && C.registry);
    if (reg && typeof reg.values === "function") {
      for (const e of reg.values()) if (e && e.kind === "drive") n++;
    }
    return n;
  }

  function hasGpu(ctx) {
    const d = (ctx && ctx.data) || (C && C.data) || {};
    const snap = d.snap || {};
    return d.gpuPresent !== false && snap.gpuPresent !== false;
  }

  function buildPanels() {
    const g = document.querySelector("#g"); 
    if (!g) return;

    const gpuOK = hasGpu(C);
    const puLen = (S && S.pu) ? S.pu.length : ((C && C.data && C.data.pu) ? C.data.pu.length : 6);
    const euLen = (S && S.eu) ? S.eu.length : ((C && C.data && C.data.eu) ? C.data.eu.length : 4);
    const sig = (gpuOK ? "gpu" : "nogpu") + "|" + driveCount() + "|" + puLen + "|" + euLen + "|" + (C && C.drives ? C.drives.map(d => d.dev).join(",") : "");
    
    // Render ulang jika #g kehilangan panel saat layout di-mount ulang
    if (sig === PSIG && g.children.length >= 4) return;
    PSIG = sig;

    g.innerHTML = ""; 
    cur = [];
    const list = [PANELS[0]];
    if (gpuOK) list.push(PANELS[1]);
    list.push(PANELS[2], PANELS[3]);
    list.forEach(c => {
      const p = panel({ title: c.title, sub: c.sub, l: c.l, r: c.r });
      cur.push({ up: () => { p.us.forEach(f => f()); p.sub.textContent = (typeof c.sub === "function" ? c.sub(C.data) : c.sub) || ""; } });
      g.append(p.el);
    });
    buildRail();
  }

  function refreshSubs() { cur.forEach(x => x.up()); }

  function tlRows() {
    const gpuOK = hasGpu(C), rows = [];
    rows.push(["cpuT", "CPU temp", "°C", 0]);
    if (gpuOK) rows.push(["gT", "GPU temp", "°C", 0], ["gW", "GPU power", "W", 1], ["gU", "GPU util", "%", 0], ["prx", "PCIe rx", "GB/s", 1]);
    rows.push(["majF", "Major flt", "/s", 0]);
    C.drives.forEach((d, i) => rows.push(["r" + i, (d.dev || ("drive" + i)) + " read", "MB/s", 0]));
    return rows;
  }

  let TL = [];
  function buildRail() {
    TL = tlRows();
    const tl = document.querySelector("#tl"); 
    if (!tl) return;
    tl.innerHTML = TL.map(r => `<div class="tr"><span>${r[1]}</span><svg viewBox="0 0 200 24" preserveAspectRatio="none"></svg><b></b></div>`).join("");
  }

  const clock = () => new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" });
  let EV = [], F = {};

  function rail() {
    document.querySelectorAll("#tl .tr").forEach((r, i) => {
      spark(r.querySelector("svg"), [TL[i][0]], ["--a"]);
      const v = S[TL[i][0]];
      r.querySelector("b").textContent = val(v, TL[i][3]);
      r.querySelector("b").title = v == null ? (R[TL[i][0]] || "tidak ada sumber data") : "";
    });
    const s = C.data;
    if (C.online) {
      push("thr", s.thr != null && s.thr !== "none", `GPU throttle aktif: ${s.thr}`, "GPU throttle lepas");
      push("burst", typeof s.r0 === "number" && s.r0 > 600, `NVMe read burst ${fx(s.r0)} MB/s (> 600 MB/s)`, "NVMe burst selesai");
      push("cpuThr", cpuThrottling(s), `CPU thermal throttle: ${s.cpuThr}`, "CPU throttle lepas");
      push("power", near(s.gW, gLim(s), .95), `GPU draw ${fx(s.gW, 1)} W mendekati limit NVML`, "GPU draw turun di bawah limit");
    }
    document.querySelector("#ev").innerHTML = Array.from({ length: 6 }, (_, i) => EV[i]).map(e => e ? `<div class="ev"><i class="${e.warn ? "w" : ""}"></i><time>${e.t}</time><span title="${esc(e.x)}">${esc(e.x)}</span></div>` : `<div class="ev"></div>`).join("");
    document.querySelector("#sys").innerHTML = [
      ["Kernel", s.snap.kernel],
      ["NVIDIA driver", s.snap.gpuDriver],
      ["Governor", s.snap.governor],
      ["Turbo", s.snap.turbo],
      ["I/O scheduler", C.drives.map(d => d.sched).filter(Boolean).join(" / ") || null],
      ["Swappiness", s.snap.swappiness],
      ["Pinning", s.snap.pinning],
      ["NVML", s.snap.nvml ? "aktif" : "tidak aktif"]
    ].map(r => `<dt>${r[0]}</dt><dd>${r[1] == null ? "unavailable" : esc(String(r[1]))}</dd>`).join("");
  }

  function push(k, on, onMsg, offMsg) {
    const cur = on ? 1 : 0;
    if (F[k] === undefined) { F[k] = cur; return; }
    if (F[k] !== cur) {
      EV.unshift({ t: clock(), x: on ? onMsg : offMsg, warn: cur === 1 });
      F[k] = cur;
    }
    if (EV.length > 12) EV.pop();
  }

  function chipsTop() {
    const be = document.querySelector("#c-be");
    if (be) { be.innerHTML = `Backend <b>${C.online ? "live" : "offline"}</b>`; be.className = "chip" + (C.online ? "" : " warn"); }
    const tc = document.querySelector("#c-thr");
    if (tc) {
      const thr = S.thr == null ? "unavailable" : S.thr;
      tc.innerHTML = `Throttle <b>${thr}</b>`;
      tc.className = "chip" + (S.thr != null && S.thr !== "none" ? " warn" : "");
      tc.title = S.thr == null ? (R["thr"] || "tidak ada sumber data") : "";
    }
    const lc = document.querySelector("#c-link");
    if (lc) {
      const now = S.pcieGen == null ? "—" : "Gen" + S.pcieGen + " x" + S.pcieWidth;
      lc.innerHTML = `GPU link <b>${now}${S.pcieMax ? " → " + S.pcieMax : ""}</b>`;
      lc.title = S.pcieGen == null ? (R["pcieGen"] || "tidak ada sumber data") : "link sekarang bisa turun saat idle (normal)";
    }
    const rc2 = document.querySelector("#c-rec");
    if (rc2) {
      const rec = C.recording;
      rc2.innerHTML = `Recording <b>${rec ? ("on " + (rec.samples || 0) + " samples") : "off"}</b>`;
      rc2.className = "chip" + (rec ? " warn" : "");
    }
    const h = document.querySelector("#hint");
    if (!h) return;
    const rules = [];
    const rd = Math.max(-1, ...C.drives.map((d, i) => typeof S["r" + i] === "number" ? S["r" + i] : -1));
    if (rd > 600 && typeof S.gU === "number" && S.gU < 50) {
      rules.push(`page-bound: NVMe read ${fx(Math.max(rd, 0))} MB/s (> 600) dan GPU util ${fx(S.gU)} % (< 50)`);
    }
    if (S.thrThermal === true || cpuThrottling(S)) {
      rules.push(`thermal-bound: throttle NVML=${S.thr}, CPU sysfs=${S.cpuThr ?? "unavailable"}`);
    }
    if (near(S.gW, gLim(C.data), .95)) {
      rules.push(`power-bound: GPU draw ${fx(S.gW, 1)} W ≥ 95% limit NVML ${fx(gLim(C.data), 0)} W`);
    }
    const w = rules.length > 0;
    h.className = "hint" + (w ? " warn" : "");
    h.querySelector("span").textContent = (w ? rules.join(" · ") + " (aturan di atas dievaluasi dari data snapshot)" : "Tidak ada aturan bottleneck yang picu (page-bound >600 MB/s + GPU <50%; thermal-bound dari throttle NVML/sysfs; power-bound ≥95% limit).");
  }

  /* ---- Overview desain baru ----
     Dirender langsung dari layout yang disematkan di sini (sama dengan layout.json),
     jadi tampil benar walau halaman dibuka lewat file:// atau server tidak menjawab
     /api/themes. Jalur layout.json lewat theme.json tetap bekerja bila server aktif. */
  const EMBEDDED_LAYOUT = {
    "cols": 12,
    "gap": 0,
    "items": [
      {
        "widget": "dashboard",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 12,
        "props": {
          "appTitle": "Aether OS",
          "theme": "dark",
          "nav": {
            "overview": "Dashboard",
            "log": "Session Manager",
            "hud": "Live HUD Overlay"
          },
          "vs": {
            "sample": true,
            "title": "Performa Gaming Handheld (FPS & Suhu)",
            "items": [
              {
                "name": "Bazzite OS",
                "fps": 164,
                "temp": 67
              },
              {
                "name": "Windows",
                "fps": 158,
                "temp": 71
              }
            ]
          },
          "os": {
            "sample": true,
            "title": "Benchmark Game: Bazzite OS vs Windows",
            "labels": [
              "Bazzite OS",
              "Windows"
            ],
            "max": 200,
            "axis": true,
            "rows": [
              {
                "name": "Wuthering Waves",
                "a": 88,
                "b": 94
              },
              {
                "name": "Cyberpunk 2077",
                "a": 164,
                "b": 158
              }
            ]
          }
        }
      }
    ]
  };
  let LAYOUT_INST = null;

  function mount(root, ctx) {
    C = ctx; S = ctx.data; R = ctx.reasons;
    LAYOUT_INST = N.renderLayout ? N.renderLayout(root, EMBEDDED_LAYOUT, ctx) : null;
    if (!LAYOUT_INST) root.innerHTML = '<div class="layout-error">Renderer layout tidak tersedia (widgets.js belum dimuat).</div>';
  }

  function update(ctx) {
    C = ctx; S = ctx.data; R = ctx.reasons;
    if (LAYOUT_INST && LAYOUT_INST.update) LAYOUT_INST.update(ctx);
  }

  function chips(ctx) { C = ctx; S = ctx.data; R = ctx.reasons; }

  function compositePanel(names, spec) {
    const widget = {
      mount(el, props, ctx) {
        C = ctx; S = ctx.data; R = ctx.reasons;
        const p = panel(spec);
        el.append(p.el);
        el._up = () => { p.us.forEach(f => f()); p.sub.textContent = (typeof spec.sub === "function" ? spec.sub(C.data) : spec.sub) || ""; };
        el._up();
      },
      update(el, props, ctx) {
        C = ctx; S = ctx.data; R = ctx.reasons;
        if (el._up) el._up();
      }
    };
    names.forEach(name => N.addWidget(name, widget));
  }

  compositePanel(["cpu-panel", "cpu"], PANELS[0]);
  compositePanel(["memory-panel", "memory"], PANELS[2]);
  compositePanel(["storage-panel", "storage"], PANELS[3]);

  const gpuPanel = {
    mount(el) { el.style.display = "none"; },
    update(el, props, ctx) {
      C = ctx; S = ctx.data; R = ctx.reasons;
      if (!hasGpu(C)) { el.style.display = "none"; return; }
      el.style.display = "";
      if (!el._up) {
        const p = panel(PANELS[1]);
        el.append(p.el);
        el._up = () => { p.us.forEach(f => f()); p.sub.textContent = (typeof PANELS[1].sub === "function" ? PANELS[1].sub(C.data) : PANELS[1].sub) || ""; };
      }
      el._up();
    }
  };
  N.addWidget("gpu-panel", gpuPanel);
  N.addWidget("gpu", gpuPanel);

  const railWidget = {
    mount(el, props, ctx) {
      C = ctx; S = ctx.data; R = ctx.reasons;
      el.innerHTML = `<aside><div class="rc tl"><h2>Timeline (last 60 s)</h2><div id="tl" style="display:flex;flex-direction:column;flex:1"></div></div>
      <div class="rc"><h2>Events</h2><div id="ev" style="display:flex;flex-direction:column;gap:5px;height:133px;flex:none"></div></div>
      <div class="rc"><h2>System</h2><dl class="pr" id="sys"></dl></div></aside>`;
      buildRail();
      rail();
    },
    update(el, props, ctx) {
      C = ctx; S = ctx.data; R = ctx.reasons;
      if (!el.querySelector("#tl")) return;
      buildRail();
      rail();
    }
  };
  N.addWidget("rail", railWidget);

  /* ================= kartu ringkas ala mockup =================
     Satu kartu = ikon + judul + subjudul + angka besar + 3 bar tipis.
     Semua angka tetap berasal dari ctx.data (data nyata). */
  const ICON = {
    cpu: `#`,
    clock: `⏱`,
    chipArt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>`,
    moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>`
  };
  const isNum = v => typeof v === "number" && isFinite(v);
  const withUnit = (v, d, u) => isNum(v) ? fx(v, d) + u : "—";
  const avgOf = a => { const x = (a || []).filter(isNum); return x.length ? avg(x) : null; };
  const pct = (a, b) => isNum(a) && isNum(b) && b > 0 ? a / b * 100 : null;
  const ramSpeed = s => s.snap && isNum(s.snap.ramSpeed) ? s.snap.ramSpeed : null;
  const drv0 = () => (C && C.drives && C.drives[0]) || {};

  /* ---- top bar desain baru: nama app · pill tab · saklar Light/Dark ----
     shell.js membangun ulang #nav sendiri (h1 "Monitor", tombol, select UI/Palette),
     jadi kulitnya dipasang dari theme: core tidak diubah. Select tetap ada di DOM
     (tersembunyi) agar pemilih UI/Palette core tetap berfungsi. */
  let PREVIEW = true;   // backend offline -> tampilkan angka contoh desain (props.offlinePreview=false untuk mematikan)
  let APP_TITLE = "Aether OS";
  let NAV_LABELS = { overview: "Dashboard", log: "Session Manager", hud: "Live HUD Overlay" };
  let navObs = null;
  function ensureThemeSwitch() {
    const nav = document.getElementById("nav");
    if (!nav) return;
    const root = document.documentElement;
    const h1 = nav.querySelector("h1");
    if (h1) h1.textContent = APP_TITLE;
    if (!nav.querySelector(".nav-pills")) {
      const pills = document.createElement("div");
      pills.className = "nav-pills";
      [...nav.querySelectorAll(":scope > button[data-p]")].forEach(b => {
        const id = b.dataset.p;
        if (NAV_LABELS[id]) b.textContent = NAV_LABELS[id];
        pills.append(b);
      });
      if (h1) h1.after(pills); else nav.prepend(pills);
    }
    Object.entries(NAV_LABELS).forEach(([id, label]) => {
      const button = nav.querySelector(`.nav-pills [data-p="${id}"]`);
      if (button) button.textContent = label;
    });
    const foot = nav.querySelector(".foot");
    if (foot) {
      foot.querySelectorAll("label, #status").forEach(x => x.classList.add("sr-only"));
      if (!foot.querySelector(".themesw")) {
        const cur = () => root.getAttribute("data-theme") === "light" ? "light" : "dark";
        const sw = document.createElement("span");
        sw.className = "themesw";
        sw.setAttribute("role", "group");
        sw.setAttribute("aria-label", "Tema");
        sw.innerHTML = `<button type="button" data-t="light">☀️ Light</button><button type="button" data-t="dark">🌙 Dark</button>`;
        const btns = [...sw.querySelectorAll("button")];
        const sync = () => btns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === cur())));
        btns.forEach(b => b.onclick = () => {
          const sel = document.getElementById("theme");
          if (sel && [...sel.options].some(o => o.value === b.dataset.t)) {
            sel.value = b.dataset.t;
            sel.dispatchEvent(new Event("change", { bubbles: true }));   // core: simpan nt.palette + set data-theme
          } else {
            root.setAttribute("data-theme", b.dataset.t);
          }
          sync();
        });
        new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
        foot.append(sw);
        sync();
      }
    }
    /* shell.js bisa membangun ulang #nav (addView) — pasang ulang kulit bila hilang */
    if (!navObs) {
      navObs = new MutationObserver(() => { if (!nav.querySelector(".nav-pills") || !nav.querySelector(".themesw")) ensureThemeSwitch(); });
      navObs.observe(nav, { childList: true });
    }
  }
  /* default DARK (desain baru) kecuali pengguna sudah memilih palette */
  function defaultPalette(theme) {
    let saved = null;
    try { saved = localStorage.getItem("nt.palette"); } catch (e) {}
    if (saved) return;
    const t = theme === "light" ? "light" : "dark", sel = document.getElementById("theme");
    document.documentElement.setAttribute("data-theme", t);
    if (sel && [...sel.options].some(o => o.value === t)) sel.value = t;
  }

  function statCard(spec) {
    const el = one(`<section class="card${spec.alt ? " alt" : ""}"><div class="ch-head"><div class="ico${spec.dark ? " dark" : ""}">${ICON[spec.icon]}</div><h2>${spec.title}</h2></div><p class="subt"></p><div class="body"><div class="big"><b></b><span>${spec.bigLabel || "Terpakai"}</span></div><div class="mb">${spec.rows.map(() => `<div class="row"><span></span><em></em><div class="trk"><i></i></div></div>`).join("")}</div></div></section>`);
    const sub = el.querySelector(".subt"), big = el.querySelector(".big b");
    const rows = [...el.querySelectorAll(".row")];
    return {
      el,
      up: () => {
        const s = C.data;
        if (PREVIEW && !C.online && spec.demo) {
          sub.textContent = spec.demo.sub;
          big.textContent = spec.demo.big + "%";
          rows.forEach((row, i) => {
            const d = spec.demo.rows[i];
            row.querySelector("span").textContent = d[0];
            row.querySelector("em").textContent = d[1];
            row.querySelector(".trk i").style.width = d[2] + "%";
            row.className = "row";
          });
          return;
        }
        sub.textContent = (typeof spec.sub === "function" ? spec.sub(s) : spec.sub) || "";
        const bv = spec.big(s);
        big.textContent = isNum(bv) ? fx(bv, 0) + "%" : "—";
        rows.forEach((row, i) => {
          const r = spec.rows[i], f = r.f(s);
          const ok = isNum(f[0]) && isNum(f[1]) && f[1] > 0;
          row.querySelector(".trk i").style.width = ok ? clamp(f[0] / f[1] * 100, 0, 100) + "%" : "0%";
          row.querySelector("span").textContent = typeof r.l === "function" ? r.l(s) : r.l;
          row.querySelector("em").textContent = r.t(s);
          row.className = "row" + (r.bad && r.bad(s) ? " bad" : r.warn && r.warn(s) ? " warn" : "");
        });
      }
    };
  }

  const CARDS = {
    cpu: {
      demo: {"sub": "Ryzen 7 7800X3D", "big": 76, "rows": [["Core utama", "84%", 84], ["Core lain", "68%", 68], ["Temperature", "56°", 56]]},
      title: "CPU", icon: "cpu",
      sub: s => s.snap.cpuCoreType === "logical"
        ? `${s.snap.cpuModel || "CPU"} · ${s.snap.cpuLogical || (s.pu || []).length} logical CPUs`
        : s.snap.cpuModel || "CPU",
      big: s => s.cpuU,
      rows: [
        { l: s => s.snap.cpuCoreType === "logical" ? "Logical CPU avg" : "Core utama",
          f: s => [avgOf(s.pu), 100], t: s => withUnit(avgOf(s.pu), 0, "%") },
        { l: s => s.snap.cpuCoreType === "logical" ? "Average CPU clock" : "Core lain",
          f: s => s.snap.cpuCoreType === "logical" ? [s.pfa, s.pfaMax] : [avgOf(s.eu), 100],
          t: s => s.snap.cpuCoreType === "logical" ? withUnit(s.pfa, 2, " GHz") : withUnit(avgOf(s.eu), 0, "%") },
        { l: "Temperature", f: s => [s.cpuT, 100], t: s => withUnit(s.cpuT, 0, "°"), warn: s => cpuThrottling(s) }
      ]
    },
    gpu: {
      demo: {"sub": "NVIDIA RTX 4060", "big": 98, "rows": [["3D", "98%", 98], ["Daya", "51 W", 70], ["Temperature", "67°", 67]]},
      title: "GPU", icon: "cpu",
      sub: s => s.snap.gpuName || "NVIDIA GPU",
      big: s => s.gU,
      rows: [
        { l: "3D", f: s => [s.gU, 100], t: s => withUnit(s.gU, 0, "%") },
        { l: "Daya", f: s => [s.gW, gLim(s) || dynMax("gW")], t: s => withUnit(s.gW, 0, " W"), warn: s => near(s.gW, gLim(s), .9) },
        { l: "Temperature", f: s => [s.gT, 100], t: s => withUnit(s.gT, 0, "°"), warn: s => gpuThermal(s) }
      ]
    },
    ram: {
      demo: {"sub": "Kingston 32 GB", "big": 82, "rows": [["Terpakai", "26.2 GB", 82], ["Tersisa", "5.8 GB", 18], ["Kecepatan", "6000 MT/s", 63]]},
      title: "RAM", icon: "cpu",
      sub: s => s.snap.ramModel || (isNum(s.memTot) ? "Memory " + fx(s.memTot, 0) + " GiB" : "Memory"),
      big: s => pct(s.ramU, s.memTot),
      rows: [
        { l: "Terpakai", f: s => [s.ramU, s.memTot], t: s => withUnit(s.ramU, 1, " GiB"), warn: s => near(s.ramU, s.memTot, .9) },
        { l: "Tersisa", f: s => [s.avail, s.memTot], t: s => withUnit(s.avail, 1, " GiB") },
        {
          l: s => ramSpeed(s) != null ? "Kecepatan" : "Bandwidth",
          f: s => ramSpeed(s) != null ? [ramSpeed(s), 9500] : [s.ramBW, dynMax("ramBW") || s.ramBW],
          t: s => ramSpeed(s) != null ? fx(ramSpeed(s), 0) + " MT/s" : withUnit(s.ramBW, 1, " GB/s")
        }
      ]
    },
    nvme: {
      demo: {"sub": "WD Black SN850X", "big": 34, "rows": [["Baca", "34 MB/s", 34], ["Tulis", "2 MB/s", 8], ["Kesehatan", "Baik", 100]]},
      title: "Storage", icon: "clock", alt: true, dark: true,
      sub: s => drv0().name || "Storage",
      big: s => isNum(drv0().capUsed) ? drv0().capUsed : s.u0,
      rows: [
        { l: "Baca", f: s => [s.r0, dynMax("r0")], t: s => withUnit(s.r0, 0, " MB/s") },
        { l: "Tulis", f: s => [s.w0, dynMax("w0")], t: s => withUnit(s.w0, 0, " MB/s") },
        {
          l: s => drv0().health != null ? "Kesehatan" : "Suhu",
          f: s => drv0().health != null ? [isNum(drv0().healthPct) ? drv0().healthPct : 100, 100] : [s.t0, 100],
          t: s => drv0().health != null ? String(drv0().health) : withUnit(s.t0, 0, " °C")
        }
      ]
    }
  };

  function cardWidget(name, spec) {
    N.addWidget(name, {
      mount(el, props, ctx) {
        C = ctx; S = ctx.data; R = ctx.reasons;
        const c = statCard(spec);
        el.append(c.el);
        el._up = c.up;
        c.up();
        ensureThemeSwitch();
      },
      update(el, props, ctx) {
        C = ctx; S = ctx.data; R = ctx.reasons;
        if (el._up) el._up();
      }
    });
  }

  cardWidget("cpu-card", CARDS.cpu);
  cardWidget("gpu-card", CARDS.gpu);
  cardWidget("ram-card", CARDS.ram);
  cardWidget("nvme-card", CARDS.nvme);

  /* ---- kartu hero "GPU Terpasang" ---- */
  const gpuShort = n => {
    const m = /(RTX|GTX)\s*\d{3,4}(\s*(Ti|SUPER))*/i.exec(n || "");
    return m ? m[0].replace(/\s+/g, " ") : (n || "").replace(/^NVIDIA\s+/i, "").replace(/^GeForce\s+/i, "");
  };
  const gpuSeries = n => { const m = /(?:RTX|GTX)\s*(\d{2})\d{2}/i.exec(n || ""); return m ? "Seri " + m[1] : ""; };

  function heroCard() {
    const el = one(`<section class="card hero"><div class="lbl">GPU Terpasang</div><div class="chipart">${ICON.chipArt}</div><div class="foot2"><div class="name"></div><span class="pill"></span></div></section>`);
    return {
      el,
      up: () => {
        const n = (PREVIEW && !C.online) ? "NVIDIA GeForce RTX 4060" : C.data.snap.gpuName;
        el.querySelector(".name").textContent = n ? gpuShort(n) : "Tidak ada GPU";
        const sr = gpuSeries(n), pill = el.querySelector(".pill");
        pill.textContent = sr;
        pill.style.display = sr ? "" : "none";
      }
    };
  }

  /* ---- "Hardware Benchmark" — data contoh; ganti lewat props di layout.json ---- */
  function vsCard(p) {
    p = p || {};
    const items = (p.items || [{ name: "RTX 4060", fps: 164, temp: 67 }, { name: "RTX 2060", fps: 101, temp: 74 }])
      .map(i => ({ name: i.name, fps: i.fps != null ? i.fps : i.score, temp: i.temp }));
    const mx = Math.max(...items.map(i => i.fps)) || 1;
    return {
      el: one(`<section class="card vs"><h2>${esc(p.title || "Hardware Benchmark")}</h2>${p.sample ? '<p class="sample-note">Data contoh statis; bukan hasil pengukuran perangkat.</p>' : ""}${items.map((it, i) => `<div class="item"><span>${esc(it.name)}</span><div class="line"><div class="pbar" style="width:${(it.fps / mx * 80).toFixed(1)}%"><i class="${i ? "g" : ""}">${esc(String(it.fps))}</i></div><b>${esc(String(it.temp).replace(/°$/, ""))}°</b></div></div>`).join("")}</section>`)
    };
  }

  /* ---- "Benchmark Game: Bazzite OS vs Windows" — data contoh; ganti lewat props di layout.json ---- */
  function osCard(p) {
    p = p || {};
    const mx = p.max || 200, labels = p.labels || ["Bazzite OS", "Windows"];
    const rows = (p.rows || p.games || [{ name: "Wuthering Waves", a: 88, b: 94 }, { name: "Cyberpunk 2077", a: 164, b: 158 }])
      .map(r => ({ name: r.name, a: r.a != null ? r.a : r.os1, b: r.b != null ? r.b : r.os2 }));
    const ticks = [0, 1, 2, 3, 4].map(i => Math.round(mx / 4 * i));
    const w = v => clamp(v / mx * 100, 0, 100).toFixed(2) + "%";
    const delta = r => {
      if (!(r.b > 0)) return "<div></div>";
      const d = Math.round((r.a - r.b) / r.b * 100), up = d >= 0;
      return `<div class="delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(d)}%</div>`;
    };
    return {
      el: one(`<section class="card cmp"><h2>${esc(p.title || "Benchmark Game: Bazzite OS vs Windows")}</h2>
        ${p.sample ? '<p class="sample-note">Data contoh statis; bukan hasil pengukuran perangkat.</p>' : ""}
        ${p.axis ? `<div class="axis"><span></span><div>${ticks.map(t => `<span>${t}</span>`).join("")}</div><span></span></div>` : ""}
        ${rows.map(r => `<div class="crow"><span>${esc(r.name)}</span><div class="bars2"><div class="b1" style="width:${w(r.a)}">${esc(String(r.a))}</div><div class="b2" style="width:${w(r.b)}">${esc(String(r.b))}</div></div>${delta(r)}</div>`).join("")}
        <div class="legend"><span><i></i>${esc(labels[0])}</span><span><i class="o"></i>${esc(labels[1])}</span></div></section>`)
    };
  }

  N.addWidget("gpu-hero", {
    mount(el, props, ctx) {
      C = ctx; S = ctx.data; R = ctx.reasons;
      const h = heroCard();
      el.append(h.el);
      el._up = h.up;
      h.up();
    },
    update(el, props, ctx) {
      C = ctx; S = ctx.data; R = ctx.reasons;
      if (el._up) el._up();
    }
  });

  N.addWidget("gpu-compare", { mount(el, props) { el.append(vsCard((props && props.props) || props).el); }, update() {} });
  N.addWidget("os-compare", { mount(el, props) { el.append(osCard((props && props.props) || props).el); }, update() {} });

  /* ---- "dashboard": semua kartu dalam satu grid 3 kolom (jarak & tinggi tidak
     bergantung pada tinggi baris layout core). props: { vs: {...}, os: {...} } ---- */
  N.addWidget("dashboard", {
    mount(el, props, ctx) {
      C = ctx; S = ctx.data; R = ctx.reasons;
      const p = (props && props.props) || props || {};   // core mengoper seluruh item layout; props ada di item.props
      if (p.appTitle) APP_TITLE = p.appTitle;
      PREVIEW = p.offlinePreview !== false;
      if (p.nav) NAV_LABELS = Object.assign({}, NAV_LABELS, p.nav);
      defaultPalette(p.theme);
      const parts = [statCard(CARDS.cpu), statCard(CARDS.gpu), heroCard(), statCard(CARDS.ram), statCard(CARDS.nvme), vsCard(p.vs), osCard(p.os)];
      const box = document.createElement("div");
      box.className = "dash";
      parts.forEach(x => box.append(x.el));
      el.append(box);
      if (p.includeTimeline) {
        const timeline = document.createElement("div");
        timeline.style.gridColumn = "1 / -1";
        box.append(timeline);
        railWidget.mount(timeline, {}, ctx);
        el._timeline = timeline;
      }
      el._ups = parts.map(x => x.up).filter(Boolean);
      el._ups.forEach(f => f());
      ensureThemeSwitch();
    },
    update(el, props, ctx) {
      C = ctx; S = ctx.data; R = ctx.reasons;
      (el._ups || []).forEach(f => f());
      if (el._timeline) railWidget.update(el._timeline, {}, ctx);
    }
  });

  window.Noterra.addTheme("default", { mount, update, chips });
})();