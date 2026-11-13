/* shell.js — bagian DOM: nav, status, pemilihan theme, view registry, tab Log.
   Data ada di client.js (headless); theme hanya membaca ctx. */
(function(){
"use strict";
const N=window.Noterra;
if(!N||!N.ctx)throw new Error("shell.js butuh client.js");

/* ---- format angka (kontrak: core yang memformat, theme yang menata) ---- */
const $=s=>document.querySelector(s);
const mk=h=>{const d=document.createElement("div");d.innerHTML=h;return d};
const {clamp,avg,fx,val,esc,mmss}=N.fmt;
const ctx=N.ctx, REG=N.registry, MOCK=N.mock;
const dataStart=N.start.bind(N);
const params=new URLSearchParams(location.search);
let theme=null, themeMeta=null, rec=null, THEMES=[];
Object.defineProperty(ctx,"recording",{get:()=>rec,configurable:true});

/* ---- id DOM yang dipakai core; index.html wajib menyediakan empat pertama ---- */
const DOM={
  nav:"#nav", status:"#status", theme:"#theme", ui:"#ui", root:"#root",
  dashboard:"#dashboard-view", session:"#session-manager-view", hud:"#hud-overlay-view",
  iv:"#iv", lb:"#lb", tg:"#tg", tm:"#tm", mk:"#mk", rc:"#rc", ex:"#ex",
  asub:"#asub", an:"#an", mt:"#mt", tr:"#tr", gp:"#gp", ov:"#ov",
};

/* padanan chipsTop() lama: hook opsional theme, aman di tab Log */
function refreshTheme(){if(theme&&theme.chips)theme.chips(ctx);}

/* ---- pemilihan theme: ?theme=nama > localStorage > default ---- */
function themeName(){
  const q=params.get("theme"); if(q)return q;
  try{const st=localStorage.getItem("nt.theme"); if(st)return st;}catch(e){}
  return "default";
}
/* pemilih THEME UI (tampilan Overview), terpisah dari palette warna */
function populateUiSelect(){
  const sel=$(DOM.ui); if(!sel)return;
  const cur=themeName();
  const names=THEMES.map(t=>t.name).filter(Boolean);
  if(!names.includes(cur))names.unshift(cur);
  sel.innerHTML=names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
  sel.value=cur;
  sel.title="Pilih tampilan Overview (theme UI), bukan palette warna";
  sel.onchange=()=>{
    const next=sel.value;
    try{localStorage.setItem("nt.theme",next);}catch(e){}
    const u=new URL(location.href);
    u.searchParams.set("theme",next);
    u.searchParams.delete("layout");  // layout khusus theme lama
    location.assign(u.toString());
  };
}
function initPalette(){
  const pals=[...new Set([...(themeMeta&&themeMeta.palettes||["light","dark"]),"neon"])];
  let storedPalette=null;
  try{storedPalette=localStorage.getItem("nt.palette")||localStorage.getItem("noterra-theme");}catch(e){}
  let p=storedPalette;
  if(!p||pals.indexOf(p)<0){
    p=(window.matchMedia?window.matchMedia("(prefers-color-scheme:dark)").matches:false)?"dark":"light";
    if(pals.indexOf(p)<0)p=pals[0];
  }
  const th=$(DOM.theme);
  th.innerHTML=pals.map(x=>`<option value="${x}">${x[0].toUpperCase()+x.slice(1)}</option>`).join("");
  th.value=p;
  const applyPalette=value=>{
    document.documentElement.dataset.theme=value;
    try{
      localStorage.setItem("nt.palette",value);
      localStorage.setItem("noterra-theme",value);
    }catch(e){}
    let neonLink=$("#palette-neon-stylesheet");
    if(value==="neon"&&themeName()!=="neon"){
      if(!neonLink){
        neonLink=document.createElement("link");
        neonLink.id="palette-neon-stylesheet";
        neonLink.rel="stylesheet";
        document.head.append(neonLink);
      }
      neonLink.href="themes/neon/theme.css";
    }else if(neonLink){
      neonLink.remove();
    }
    document.querySelectorAll(".themesw [data-t]").forEach(button=>{
      button.setAttribute("aria-pressed",String(button.dataset.t===value));
    });
  };
  if(!storedPalette){
    const initial=document.documentElement.dataset.theme;
    if(pals.includes(initial))p=initial;
    th.value=p;
  }
  th.onchange=()=>applyPalette(th.value);
  document.querySelectorAll(".themesw [data-t]").forEach(button=>{
    button.onclick=()=>{
      th.value=button.dataset.t;
      th.dispatchEvent(new Event("change",{bubbles:true}));
    };
  });
  applyPalette(p);
}
async function loadTheme(){
  await N.loadSchema();
  let themes=[];
  try{const r=await fetch("/api/themes",{cache:"no-store"}); if(r.ok)themes=(await r.json()).themes||[];}catch(e){}
  THEMES=themes;
  populateUiSelect();
  const name=themeName();
  themeMeta=themes.find(t=>t.name===name)||{name:name,palettes:["light","dark"]};
  const lp=params.get("layout");
  const entry=(themeMeta&&themeMeta.entry)||"overview.js";
  const css=(themeMeta&&themeMeta.css)||"theme.css";
  const link=document.createElement("link");
  link.id="ui-theme-stylesheet";
  const assetVersion=themeMeta&&themeMeta.version;
  link.rel="stylesheet";
  link.href="themes/"+encodeURIComponent(name)+"/"+css+(assetVersion?"?v="+encodeURIComponent(assetVersion):"");
  document.head.append(link);
  // theme tanpa script: overview langsung dari layout.json (L2)
  if(!themeMeta.entry&&(lp||themeMeta.layout)){
    registerLayoutTheme(name,lp||themeMeta.layout);
    return;
  }
  const sc=document.createElement("script");
  sc.src="themes/"+encodeURIComponent(name)+"/"+entry;
  sc.onerror=()=>{$(DOM.status).textContent="Theme gagal dimuat";
    $(DOM.root).innerHTML=`<div class="empty">Theme "${esc(name)}" tidak ditemukan di themes/${esc(name)}/${esc(entry)}. Pasang theme hanya dari sumber yang dipercaya.</div>`;};
  sc.onload=()=>{if(!theme)$(DOM.status).textContent=`Theme "${name}" gagal mendaftar ke Aether OS`;};
  document.body.append(sc);
}

/* ---- navigasi: view registry (Log milik core, Overview dari addTheme) ---- */
const VIEWS=new Map();            // id -> {id,label,order,mount,update}
let activeView="overview";
function updateTelemetryMode(){
  const badge=$("#telemetry-mode"); if(!badge)return;
  const live=!MOCK&&ctx.online;
  badge.textContent=live?"[ LIVE TELEMETRY ]":"[ DEMO MODE / OFFLINE PREVIEW ]";
  badge.dataset.mode=live?"live":"demo";
}
function renderNav(){
  const nav=$(DOM.nav); if(!nav)return;
  const tabs=[
    ["btn-tab-dashboard","overview"],
    ["btn-tab-session","log"],
    ["btn-tab-hud","hud"]
  ];
  tabs.forEach(([buttonId,view])=>{
    const button=document.getElementById(buttonId);
    if(button)button.onclick=()=>show(view);
  });
  const back=document.getElementById("btn-back-dash");
  if(back)back.onclick=()=>show("overview");
  populateUiSelect();
  renderNavState();
}
function renderNavState(){
  const selected=activeView==="overview"?"overview":activeView==="log"?"log":"hud";
  document.querySelectorAll("#nav .nav-pills [data-p]").forEach(button=>{
    button.setAttribute("aria-current",String(button.dataset.p===selected));
  });
}
function addView(id,v){
  VIEWS.set(id,{id,label:v.label||id,order:v.order??100,mount:v.mount,update:v.update});
  renderNav();
}
/* view overview dari file layout (tanpa JavaScript milik theme) */
function layoutView(name,file){
  let inst=null, seq=0;
  return{
    mount(root,c){
      const my=++seq;
      root.innerHTML=`<div class="empty">Memuat layout ${esc(file)}…</div>`;
      fetch("themes/"+encodeURIComponent(name)+"/"+file,{cache:"no-store"})
        .then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.text()})
        .then(txt=>{
          if(my!==seq)return;
          inst=window.Noterra.renderLayout?window.Noterra.renderLayout(root,txt,c):null;
          if(!inst)root.innerHTML=`<div class="layout-error">Renderer layout tidak tersedia (widgets.js belum dimuat).</div>`;
        })
        .catch(e=>{if(my!==seq)return;
          root.innerHTML=`<div class="layout-error">Layout "${esc(file)}" gagal dimuat: ${esc(e.message||e)}</div>`;});
    },
    update(c){if(inst&&inst.update)inst.update(c);}
  };
}
/* theme L2 murni: tidak ada script, overview = layout.json */
function registerLayoutTheme(name,file){
  theme=null;
  addView("overview",{label:"Overview",order:0,...layoutView(name,file)});
  initPalette(); show(location.hash.slice(1)); start();
}
function show(id){
  if(!VIEWS.has(id))id="overview";
  activeView=id;
  if(id!=="log")location.hash=id;
  const isHud=id==="hud";
  $(DOM.dashboard).hidden=id!=="overview";
  $(DOM.session).hidden=id!=="log";
  $(DOM.hud).hidden=!isHud;
  document.documentElement.classList.toggle("hud-active",isHud);
  document.body.classList.toggle("hud-active",isHud);
  document.body.classList.toggle("session-active",id==="log");
  const nav=$(DOM.nav);
  if(nav)nav.hidden=isHud;
  renderNavState();
  if(window.noterraDesktop&&window.noterraDesktop.setHudMode)
    window.noterraDesktop.setHudMode(isHud);
  const root=id==="log"?$(DOM.session):$(DOM.root), v=VIEWS.get(id);
  if(!isHud){
    root.classList.remove("layout-host");
    if(v&&v.mount)v.mount(root,ctx); else root.innerHTML="";
  }
  if(isHud)updateHud(ctx);
}

/* ---- tab Log: sesi persisten di server, folder logs/<tanggal>_<label>/ ---- */
const METRICS=[["cpuT","CPU temp","°C","cpu_temp_c"],["cpuW","CPU power","W","cpu_power_w"],["cpuU","CPU utilization","%","cpu_util_percent"],["pfa","CPU average clock","GHz","cpu_avg_clock_ghz"],["gT","GPU temp","°C","gpu_temp_c"],["gW","GPU power","W","gpu_power_w"],["gU","GPU utilization","%","gpu_util_percent"],["vbw","VRAM bandwidth","GB/s","vram_bw_gbs"],["prx","PCIe receive","GB/s","pcie_rx_gbs"],["majF","Major faults","/s","mem_major_faults_s"],["ramU","RAM used","GiB","ram_used_gib"],["memTot","RAM total","GiB","memory_total_gib"],["avail","RAM available","GiB","memory_available_gib"],["swapU","Swap used","GiB","swap_used_gib"],["ctx","Context switches","/s","context_switches_s"],["r0","Disk 0 read","MB/s","drive0_read_mbps"],["w0","Disk 0 write","MB/s","drive0_write_mbps"],["i0","Disk 0 IOPS","IOPS","drive0_iops"]];
/* header CSV -> key registry; fallback: nama kolom yang kebetulan sama dengan key */
const HEADER_TO_KEY={"cpu_temp_c":"cpuT","cpu_power_w":"cpuW","gpu_temp_c":"gT","gpu_power_w":"gW",
  "cpu_util_percent":"cpuU","cpu_avg_clock_ghz":"pfa","gpu_util_percent":"gU",
  "vram_bw_gbs":"vbw","pcie_rx_gbs":"prx","mem_major_faults_s":"majF",
  "ram_used_gib":"ramU","memory_total_gib":"memTot","memory_available_gib":"avail",
  "swap_used_gib":"swapU","context_switches_s":"ctx","nvme0_read_mbps":"r0",
  "drive0_read_mbps":"r0","drive0_write_mbps":"w0","drive0_iops":"i0"};
let LOG_METRICS=METRICS;          // [key,label,unit]; diperbarui dari header CSV
const COL=["--a","--b","--ok","--warn","--bad"];
let SES=[],sel=new Set(),CSV={},lo={m:"cpuT",trim:0,grp:true,iv:1,lb:"",tg:""};
const LOG_EVENT_ROOTS=new WeakSet();
const f2=v=>typeof v==="number"?fx(v,Math.abs(v)<10?2:1):"unavailable";
function st(a){
  const v=a.filter(x=>typeof x==="number");
  if(!v.length)return null;
  const s=[...v].sort((x,y)=>x-y),m=avg(v);
  return{mean:m,med:s[s.length>>1],p95:s[Math.floor(s.length*.95)],sd:Math.sqrt(avg(v.map(x=>(x-m)**2))),min:s[0],max:s[v.length-1]};
}
async function loadSessions(){
  try{
    const r=await fetch("/api/log/sessions",{cache:"no-store"});
    if(!r.ok)throw new Error("HTTP "+r.status);
    SES=((await r.json()).sessions||[]).filter(s=>typeof s.id==="number");
  }catch(e){
    // Server mati / offline / dibuka lewat file:// -> sediakan dummy sesi contoh untuk demonstrasi UAS
    SES=[
      {
        id: 1730000001,
        label: "Cyberpunk 2077 - Bazzite OS",
        tag: "Bazzite OS",
        start_ms: 1730440000000,
        started_iso: "2026-11-01 10:15:00",
        interval_s: 1,
        samples: 60,
        markers: [{ name: "Night City Bench", idx: 10 }],
        config: { "OS": "Bazzite OS", "Kernel": "6.11.5-bazzite", "Governor": "performance", "TDP Limit": "15 W" }
      },
      {
        id: 1730000002,
        label: "Cyberpunk 2077 - SteamOS",
        tag: "SteamOS",
        start_ms: 1730443600000,
        started_iso: "2026-11-01 11:00:00",
        interval_s: 1,
        samples: 60,
        markers: [{ name: "Night City Bench", idx: 10 }],
        config: { "OS": "SteamOS", "Kernel": "6.5.0-valve", "Governor": "performance", "TDP Limit": "15 W" }
      }
    ];
    if (!CSV[1730000001]) {
      const ts = Array.from({length: 60}, (_, i) => 1730440000000 + i * 1000);
      CSV[1730000001] = {
        ts,
        cpuT: Array.from({length: 60}, (_, i) => +(64 + Math.sin(i / 5) * 3 + (i % 7 === 0 ? 2 : 0)).toFixed(1)),
        cpuW: Array.from({length: 60}, (_, i) => +(26 + Math.cos(i / 4) * 2.5).toFixed(1)),
        gT: Array.from({length: 60}, (_, i) => +(66 + Math.sin(i / 6) * 2.5).toFixed(1)),
        gW: Array.from({length: 60}, (_, i) => +(48 + Math.sin(i / 3) * 3.5).toFixed(1)),
        vbw: Array.from({length: 60}, (_, i) => +(14.2 + Math.sin(i / 8) * 0.5).toFixed(1)),
        prx: Array.from({length: 60}, (_, i) => +(3.2 + Math.cos(i / 9) * 0.2).toFixed(2)),
        majF: Array.from({length: 60}, () => 0),
        r0: Array.from({length: 60}, (_, i) => i % 10 === 0 ? 42 : 2)
      };
    }
    if (!CSV[1730000002]) {
      const ts = Array.from({length: 60}, (_, i) => 1730443600000 + i * 1000);
      CSV[1730000002] = {
        ts,
        cpuT: Array.from({length: 60}, (_, i) => +(68 + Math.sin(i / 5) * 4 + (i % 6 === 0 ? 2.5 : 0)).toFixed(1)),
        cpuW: Array.from({length: 60}, (_, i) => +(30 + Math.cos(i / 4) * 3).toFixed(1)),
        gT: Array.from({length: 60}, (_, i) => +(70 + Math.sin(i / 6) * 3.2).toFixed(1)),
        gW: Array.from({length: 60}, (_, i) => +(52 + Math.sin(i / 3) * 4).toFixed(1)),
        vbw: Array.from({length: 60}, (_, i) => +(13.8 + Math.sin(i / 8) * 0.4).toFixed(1)),
        prx: Array.from({length: 60}, (_, i) => +(3.0 + Math.cos(i / 9) * 0.2).toFixed(2)),
        majF: Array.from({length: 60}, () => 0),
        r0: Array.from({length: 60}, (_, i) => i % 10 === 0 ? 35 : 2)
      };
    }
  }
  if(rec){const s=SES.find(x=>x.id===rec.id); if(s){rec.samples=s.samples; rec.mk=(s.markers||[]).length}}
}
async function toggleRec(){
  if(!rec){
    const iv=+$(DOM.iv).value;
    const r=await fetch("/api/log/start",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({label:$(DOM.lb).value.trim(),tag:$(DOM.tg).value.trim(),interval:iv})});
    rec=await r.json(); rec.iv=iv; rec.samples=0; rec.mk=0;
    sel.add(rec.id);
    await loadSessions();
    rec.timer=setInterval(async()=>{
      if(!rec)return;
      await loadSessions();
      const t=$(DOM.tm); if(t)t.textContent=mmss(Math.round((rec.samples||0)*rec.iv));
      refreshTheme();
    },1000);
  } else {
    await fetch("/api/log/stop",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({id:rec.id})});
    clearInterval(rec.timer);
    rec=null; await loadSessions();
  }
  refreshTheme(); renderLog();
}
async function addMarker(){
  if(!rec)return;
  await fetch("/api/log/marker",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({id:rec.id})});
  await loadSessions();
  const e=$(DOM.mk); if(e)e.textContent="Add marker ("+(rec.mk||0)+")";
}
async function loadCsv(id){
  if(CSV[id])return CSV[id];
  const r=await fetch(`/api/log/${id}/samples.csv`);
  if(!r.ok)return null;
  const txt=await r.text();
  const lines=txt.split("\n");
  const cols=(lines[0]||"").replace(/\r$/,"").split(",").map(c=>c.trim());
  // header asli tidak memuat timestamp_ms, jadi data bergeser satu kolom;
  // kalau suatu saat header memuatnya, offset menyesuaikan.
  const off=cols[0]==="timestamp_ms"?0:1;
  const found=[];
  cols.forEach((col,i)=>{
    if(!col||col==="timestamp_ms")return;
    const key=HEADER_TO_KEY[col]||(REG.has(col)?col:null);
    if(!key)return;
    const old=METRICS.find(x=>x[0]===key), e=REG.get(key);
    found.push([key,old?old[1]:((e&&e.label)||key),old?old[2]:((e&&e.unit)||""),i+off]);
  });
  let use;
  if(found.length){use=found; LOG_METRICS=found.map(([k,l,u])=>[k,l,u]);}
  else{use=METRICS.map(([k,l,u],i)=>[k,l,u,i+1]); LOG_METRICS=METRICS;}
  const d={ts:[],...Object.fromEntries(use.map(([k])=>[k,[]]))};
  lines.slice(1).forEach(ln=>{
    ln=ln.replace(/\r$/,""); if(!ln)return;
    const p=ln.split(",");
    d.ts.push(+p[0]);
    use.forEach(([k,,,idx])=>{const v=p[idx]; d[k].push(v===undefined||v===""?null:+v)});
  });
  CSV[id]=d; return d;
}
async function exportCsv(){
  for(const s of SES.filter(x=>sel.has(x.id))){
    const r=await fetch(`/api/log/${s.id}/samples.csv`);
    const t=await r.text();
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([t],{type:"text/csv"})); a.download=s.label+".csv"; a.click();
  }
}
function bindLogEvents(root){
  if(LOG_EVENT_ROOTS.has(root))return;
  LOG_EVENT_ROOTS.add(root);
  root.addEventListener("change",e=>{
    const checkbox=e.target.closest?.("[data-id]");
    if(!checkbox||!root.contains(checkbox))return;
    const id=+checkbox.dataset.id;
    sel.has(id)?sel.delete(id):sel.add(id);
    renderLog();
  });
  root.addEventListener("click",async e=>{
    const button=e.target.closest?.("[data-del]");
    if(!button||!root.contains(button)||button.disabled)return;
    e.preventDefault();
    const id=+button.dataset.del;
    if(!Number.isFinite(id))return;
    button.disabled=true;
    try{
      const response=await fetch(`/api/log/${id}`,{method:"DELETE"});
      if(!response.ok)throw new Error("HTTP "+response.status);
      sel.delete(id);
      delete CSV[id];
      await renderLog();
    }catch(error){
      button.disabled=false;
      const message=root.querySelector("#log-action-error");
      if(message){
        message.textContent="Gagal menghapus sesi: "+error.message;
        message.hidden=false;
      }
    }
  });
}
async function renderLog(){
  const root=$(DOM.session);
  bindLogEvents(root);
  await loadSessions();
  const r=!!rec;
  const rows=SES.map(s=>`<tr><td><input type="checkbox" data-id="${s.id}" ${sel.has(s.id)?"checked":""} aria-label="Select ${esc(s.label)}"></td><td>${esc(s.label)}${s.status==="recording"?' <span class="tag">recording</span>':""}</td><td><span class="tag">${esc(s.tag||"none")}</span></td><td>${esc(s.started_iso||String(s.start_ms))}</td><td>${mmss(Math.round(s.samples*(s.interval_s||1)))}</td><td>${s.interval_s} s</td><td>${s.samples}</td><td>${(s.markers||[]).length}</td><td><button class="btn" data-del="${s.id}">Delete</button></td></tr>`).join("");
  root.innerHTML=`<div class="bar-top"><input id="lb" placeholder="Session label" size="22" value="${esc(lo.lb)}"><input id="tg" placeholder="Tag (groups repeated runs)" size="24" value="${esc(lo.tg)}">
    <label>Interval <select id="iv" ${r?"disabled":""}>${[.5,1,5].map(v=>`<option value="${v}" ${v===(r?rec.iv:lo.iv)?"selected":""}>${v} s</option>`).join("")}</select></label>
    <button class="btn ${r?"on":""}" id="rc">${r?"Stop and save":"Start recording"}</button><span class="timer" id="tm">${r?mmss(Math.round((rec.samples||0)*rec.iv)):"00:00"}</span>
    <button class="btn" id="mk" ${r?"":"disabled"}>Add marker${r?" ("+(rec.mk||0)+")":""}</button><span class="grow"></span><button class="btn" id="ex" ${sel.size?"":"disabled"}>Export CSV</button></div>
    <div id="log-action-error" role="alert" hidden></div>
    <div class="stack">
    <section class="p" style="display:block"><h2>Sessions</h2><div class="sub" style="margin:2px 0 16px">${SES.length} tersimpan di server (folder logs/). Interval & marker ikut tersimpan di meta.json.</div>
    ${SES.length?`<table><tr><th></th><th>Name</th><th>Tag</th><th>Started</th><th>Length</th><th>Interval</th><th>Samples</th><th>Markers</th><th></th></tr>${rows}</table>`:`<div class="empty">No logs yet. Start a recording to create one.</div>`}</section>
    <section class="p" style="display:block"><h2>Analysis</h2><div class="sub" id="asub" style="margin:2px 0 16px">0 selected</div><div id="an"><div class="empty">Select one or more sessions above to analyze them.</div></div></section></div>`;
  $(DOM.lb).oninput=e=>lo.lb=e.target.value; $(DOM.tg).oninput=e=>lo.tg=e.target.value; $(DOM.iv).onchange=e=>lo.iv=+e.target.value;
  $(DOM.rc).onclick=toggleRec; $(DOM.ex).onclick=exportCsv; $(DOM.mk).onclick=addMarker;
  const ss=SES.filter(s=>sel.has(s.id));
  $(DOM.asub).textContent=ss.length+" selected";
  if(!ss.length)return;
  const cs=await Promise.all(ss.map(s=>loadCsv(s.id)));
  if(!LOG_METRICS.some(x=>x[0]===lo.m)&&LOG_METRICS.length)lo.m=LOG_METRICS[0][0];
  const M=LOG_METRICS.find(x=>x[0]===lo.m)||LOG_METRICS[0]||METRICS[0];
  const arrs=cs.map(c=>c?c[lo.m].slice(Math.round(lo.trim/(ss[0].interval_s||1))).filter(v=>typeof v==="number"):[]);
  const S2=arrs.map(st);
  const line=(l,x,c)=>`<tr${c?' class="grp"':""}><td>${l}</td>${["mean","med","p95","sd","min","max"].map(k=>`<td>${x?f2(x[k]):"unavailable"}</td>`).join("")}</tr>`;
  let tb=ss.map((s,i)=>line(`<i style="display:inline-block;width:10px;height:3px;border-radius:2px;background:var(${COL[i%5]});margin-right:8px;vertical-align:middle"></i>${esc(s.label)}`,S2[i])).join("");
  if(lo.grp){
    const g={};ss.forEach((s,i)=>{if(S2[i])(g[s.tag||"none"]=g[s.tag||"none"]||[]).push(S2[i])});
    Object.entries(g).filter(([,v])=>v.length>1).forEach(([t,v])=>{const m=k=>avg(v.map(x=>x[k]));
      tb+=line(`Average of ${v.length} runs (${esc(t)})`,{mean:m("mean"),med:m("med"),p95:m("p95"),sd:st(v.map(x=>x.mean)).sd,min:Math.min(...v.map(x=>x.min)),max:Math.max(...v.map(x=>x.max))},1)});
  }
  const flat=o=>{const r={};const walk=(v,p)=>{if(v&&typeof v==="object"){for(const k in v)walk(v[k],p?p+"."+k:k)}else r[p]=v};walk(o,"");return r};
  const cfgs=ss.map(s=>({...flat(s.config||{}),tag:s.tag||"none",interval_s:s.interval_s}));
  const keys=[...new Set(cfgs.flatMap(c=>Object.keys(c)))].filter(k=>new Set(cfgs.map(c=>JSON.stringify(c[k]))).size>1);
  const hasData=arrs.some(a=>a.length);
  $(DOM.an).innerHTML=`<div class="ctl"><label>Metric <select id="mt">${LOG_METRICS.map(m=>`<option value="${m[0]}" ${m[0]===lo.m?"selected":""}>${m[1]} (${m[2]})</option>`).join("")}</select></label>
    <label>Skip first <span class="fld"><input type="number" id="tr" min="0" step="5" value="${lo.trim}" aria-label="Seconds to skip"><em>s</em></span></label>
    <label><input type="checkbox" id="gp" ${lo.grp?"checked":""}> Average runs with the same tag</label></div>
    ${hasData?`<svg class="sp lg" id="ov" viewBox="0 0 200 60" preserveAspectRatio="none"></svg>`:""}
    <div class="hint lg">${M[1]} (${M[2]}) dari CSV server. ${hasData?"Sample yang di-skip tidak masuk chart/statistik. Marker tersimpan di meta.json.":"Tidak ada sample untuk metrik ini — mungkin unavailable di mesin ini."}</div>
    <h3 style="margin-top:18px">Statistics</h3><table class="n"><tr><th>Session</th><th>Mean</th><th>Median</th><th>p95</th><th>Std dev</th><th>Min</th><th>Max</th></tr>${tb}</table>
    ${lo.grp?`<div class="hint lg">Untuk baris average, std dev = spread antar run.</div>`:""}
    <h3 style="margin-top:18px">Perbedaan konfigurasi sesi</h3>${keys.length?`<table class="n"><tr><th>Field</th>${ss.map(s=>`<th>${esc(s.label)}</th>`).join("")}</tr>${keys.map(k=>`<tr><td>${k}</td>${cfgs.map(c=>`<td>${esc(String(c[k]))}</td>`).join("")}</tr>`).join("")}</table>`:`<div class="hint lg">Semua sesi terpilih punya konfigurasi (governor/EPP/turbo/sysctl/power limit) yang sama.</div>`}`;
  $(DOM.mt).onchange=e=>{lo.m=e.target.value;renderLog()}; $(DOM.tr).onchange=e=>{lo.trim=Math.max(0,+e.target.value||0);renderLog()}; $(DOM.gp).onchange=e=>{lo.grp=e.target.checked;renderLog()};
  const ov=$(DOM.ov);
  if(ov) overlay(ov,arrs,ss.map(s=>s.interval_s||1));
}
function overlay(svg,arrs,ivs){
  const keep=arrs.map((a,i)=>[a,ivs[i]]).filter(([a])=>a.length>1);
  if(!keep.length){svg.innerHTML="";return}
  const all=keep.flatMap(([a])=>a),mn=Math.min(...all),sp=(Math.max(...all)-mn)||1,D=Math.max(...keep.map(([a,i])=>a.length*ivs[i]));
  svg.innerHTML=keep.map(([a,i])=>`<path class="l" style="stroke:var(${COL[i%5]})" d="${a.map((v,j)=>`${j?"L":"M"}${(j*ivs[i]/D*200).toFixed(1)},${(58-(v-mn)/sp*56).toFixed(1)}`).join("")}"/>`).join("");
}

function updateHudValue(id,value,unit,digits=0,reasonText="Metrik tidak tersedia di backend."){
  const element=document.getElementById(id);
  if(!element)return;
  if(typeof value==="number"&&Number.isFinite(value)){
    element.textContent=`${value.toFixed(digits)}${unit}`;
    element.removeAttribute("title");
  }else{
    element.textContent="unavailable";
    element.title=reasonText;
  }
}
function updateHud(ctx){
  const data=ctx.data||{}, snap=ctx.snap||{};
  const state=$("#hud-telemetry-state");
  if(state)state.textContent=ctx.online&&!ctx.mock?"LIVE TELEMETRY":ctx.mock?"DEMO DATA":"OFFLINE";
  const name=$("#hud-gpu-name");
  if(name)name.textContent=snap.gpuName||(snap.gpuPresent===false?"GPU not detected":"GPU name unavailable");
  updateHudValue("hud-gpu-util",data.gU,"%");
  updateHudValue("hud-gpu-temp",data.gT," °C",1);
  updateHudValue("hud-gpu-power",data.gW," W",1);
  const vram=$("#hud-vram");
  if(vram){
    vram.textContent=typeof data.vram==="number"&&typeof data.vramTot==="number"
      ?`${data.vram.toFixed(1)} / ${data.vramTot.toFixed(1)} GiB`:"unavailable";
    if(vram.textContent==="unavailable")vram.title="Metrik VRAM tidak tersedia dari NVML.";
    else vram.removeAttribute("title");
  }
  updateHudValue("hud-cpu-util",data.cpuU,"%",1);
  updateHudValue("hud-cpu-temp",data.cpuT," °C",1);
  const ram=$("#hud-ram");
  if(ram){
    ram.textContent=typeof data.ramU==="number"&&typeof data.memTot==="number"
      ?`${data.ramU.toFixed(1)} / ${data.memTot.toFixed(1)} GiB`:"unavailable";
    if(ram.textContent==="unavailable")ram.title="RAM usage atau kapasitas tidak tersedia.";
    else ram.removeAttribute("title");
  }

  const gameMetrics=[
    ["hud-fps","fps"],["hud-fps-avg","fpsAvg"],
    ["hud-fps-1low","fps1Low"],["hud-fps-01low","fps01Low"]
  ];
  gameMetrics.forEach(([id,key])=>
    updateHudValue(id,data[key]," FPS",1,"FPS game memerlukan integrasi VKD3D/DX12 yang belum tersedia."));
  const resolution=$("#hud-resolution");
  if(resolution){
    resolution.textContent=typeof data.resolution==="string"&&data.resolution
      ?data.resolution:"unavailable";
    if(resolution.textContent==="unavailable")
      resolution.title="Resolusi game tidak tersedia dari backend telemetry.";
    else resolution.removeAttribute("title");
  }
  const frametimes=ctx.hist("frametimeMs")||[];
  const frametime=$("#hud-frametime");
  const path=$("#hud-frametime-chart path");
  if(frametimes.length>1&&frametime&&path){
    const min=Math.min(...frametimes),span=Math.max(...frametimes)-min||1;
    path.setAttribute("d",frametimes.map((value,index)=>{
      const x=index/(frametimes.length-1)*200;
      const y=40-(value-min)/span*36;
      return`${index?"L":"M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(""));
    frametime.textContent=`${frametimes[frametimes.length-1].toFixed(2)} ms`;
    frametime.removeAttribute("title");
  }else{
    if(path)path.setAttribute("d","");
    if(frametime){
      frametime.textContent="unavailable";
      frametime.title="Frametime game memerlukan integrasi VKD3D/DX12 yang belum tersedia.";
    }
  }
}

/* shell memakai polling idempoten dari client */
function start(){dataStart();}

/* ---- titik masuk: daftar theme dari server, muat theme terpilih ---- */
addView("log",{label:"Log",order:10,mount(){renderLog();}});
addView("hud",{label:"Live HUD Overlay",order:20});
/* data update -> status + theme/view update; offline -> chips saja (perilaku lama) */
ctx.on("update",()=>{
  $(DOM.status).textContent=MOCK?"Backend: mock":"Backend: live";
  updateTelemetryMode();
  updateHud(ctx);
  try{
    if(theme&&theme.update)theme.update(ctx);
    const v=VIEWS.get(activeView); if(v&&v.update)v.update(ctx);
  }catch(e){
    /* perilaku lama: error render theme jatuh ke status offline + chips */
    N.markOffline();
    $(DOM.status).textContent=MOCK?"Backend: mock data gagal dimuat":"Backend: offline — run server.py";
    updateTelemetryMode();
    refreshTheme();
  }
});
ctx.on("offline",()=>{
  $(DOM.status).textContent=MOCK?"Backend: mock data gagal dimuat":"Backend: offline — run server.py";
  updateTelemetryMode();
  updateHud(ctx);
  refreshTheme();
});
ctx.mk=mk;
Object.assign(N,{
  addTheme(name,th){
    const file=params.get("layout")||(themeMeta&&themeMeta.layout)||null;
    if(file){
      theme=null;
      addView("overview",{label:"Overview",order:0,...layoutView(name,file)});
    }else{
      theme=th;
      addView("overview",{label:"Overview",order:0,mount(root,ctx){
        if(th.mount)th.mount(root,ctx);
        else root.innerHTML=`<div class="empty">Theme "${esc(name)}" tidak punya mount dan tidak punya layout.json.</div>`;
      }});
    }
    initPalette(); show(location.hash.slice(1)); start();
  },
  start:dataStart, addView,
  ctx, registry:REG, fmt:{fx,val,esc,mmss,clamp,avg}, mk, themeName, mock:MOCK,
});
renderNav();
loadTheme();
})();
