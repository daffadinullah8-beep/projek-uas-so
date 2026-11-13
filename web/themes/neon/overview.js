/* Theme neon — Overview mission-control dari nol.
   Hanya membaca ctx (client.js); tidak fetch/parse sendiri. */
(function(){
"use strict";
const N=window.Noterra;
const {fx,esc,clamp}=N.fmt;

let rootEl=null;
const q=s=>rootEl?rootEl.querySelector(s):null;
const reason=(ctx,k)=>{const e=ctx.registry.get(k);return (e&&e.reason)||ctx.reasons[k]||"tidak ada sumber data"};
const isNum=v=>typeof v==="number";

function setNum(el,ctx,key,d=0){
  if(!el)return;
  const v=ctx.data[key];
  if(isNum(v)){el.textContent=v.toFixed(d);el.classList.remove("na");el.removeAttribute("title")}
  else{el.textContent="unavailable";el.classList.add("na");el.title=reason(ctx,key)}
}
function setPair(el,ctx,k1,k2,d=0){
  if(!el)return;
  const a=ctx.data[k1],b=ctx.data[k2];
  if(isNum(a)&&isNum(b)){el.textContent=a.toFixed(d)+" / "+b.toFixed(d);el.classList.remove("na");el.removeAttribute("title")}
  else{el.textContent="unavailable";el.classList.add("na");el.title=reason(ctx,k1)}
}
function setRing(circle,text,ctx,key,max,d=0){
  const v=ctx.data[key],ok=isNum(v);
  if(text){
    text.textContent=ok?v.toFixed(d):"unavailable";
    text.classList.toggle("na",!ok);
    if(ok)text.removeAttribute("title"); else text.title=reason(ctx,key);
  }
  if(circle)circle.style.strokeDashoffset=String(100-(ok?clamp(v/max*100,0,100):0));
}
function setBar(el,pct,ctx,key){
  if(!el)return;
  el.style.width=(isNum(pct)?clamp(pct,0,100):0)+"%";
  if(isNum(pct))el.removeAttribute("title"); else el.title=reason(ctx,key);
}
function drawTrace(ctx){
  const svg=q("#nui-trace"); if(!svg)return;
  const a=ctx.hist("cpuT")||[], b=ctx.hist("gT")||[];
  const all=a.concat(b);
  if(all.length<2){svg.innerHTML='<text class="trace-empty" x="300" y="74" text-anchor="middle">menunggu sampel…</text>';return}
  const mn=Math.min(...all), span=(Math.max(...all)-mn)||1;
  const path=arr=>arr.length?arr.map((v,i)=>{
    const x=(i/Math.max(arr.length-1,1)*600).toFixed(1);
    const y=(134-(v-mn)/span*124).toFixed(1);
    return `${i?"L":"M"}${x},${y}`;
  }).join(""):"";
  svg.innerHTML=`<path class="trace-cpu" d="${path(a)}"/><path class="trace-gpu" d="${path(b)}"/>`;
}
function drawDrives(ctx){
  const box=q("#nui-drive-list"); if(!box)return;
  const ds=ctx.drives||[];
  const sig=ds.map(d=>(d.dev||"")+"|"+(d.name||"")).join("|");
  if(box.dataset.sig!==sig){
    box.dataset.sig=sig;
    box.innerHTML=ds.length?ds.map((d,i)=>`<div class="drive" data-i="${i}">
      <div class="drive-head"><b>${esc(d.dev||("drive"+i))}</b><span>${esc(d.name||"unavailable")}</span></div>
      <div class="drive-row"><span>Read</span><b class="d-read">—</b><small>MB/s</small></div>
      <div class="drive-row"><span>Temp</span><b class="d-temp">—</b><small>°C</small></div>
      <div class="drive-row"><span>Used</span><b class="d-cap">—</b><small>%</small></div>
      <div class="cap"><i class="d-capbar"></i></div>
    </div>`).join(""):'<div class="empty-inline">tidak ada drive yang terdeteksi</div>';
  }
  ds.forEach((d,i)=>{
    const c=box.querySelector(`[data-i="${i}"]`); if(!c)return;
    setNum(c.querySelector(".d-read"),ctx,"r"+i,0);
    setNum(c.querySelector(".d-temp"),ctx,"t"+i,0);
    const cap=d.capUsed, capEl=c.querySelector(".d-cap"), bar=c.querySelector(".d-capbar");
    if(isNum(cap)){capEl.textContent=cap.toFixed(0);capEl.classList.remove("na");capEl.removeAttribute("title")}
    else{capEl.textContent="unavailable";capEl.classList.add("na");capEl.title=d.mount==null?"not mounted":"tidak ada data kapasitas"}
    if(bar)bar.style.width=(isNum(cap)?clamp(cap,0,100):0)+"%";
  });
}

function mount(root,ctx){
  rootEl=root;
  root.innerHTML=`<div class="nui">
    <header class="nui-head">
      <div class="nui-title">
        <div class="kicker">LOVELACE // TELEMETRY</div>
        <h1>Mission control</h1>
        <div class="sub">Live hardware snapshot · noterra</div>
      </div>
      <div class="nui-pills">
        <span class="pill"><i class="dot" id="nui-dot"></i><b id="nui-live">offline</b></span>
        <span class="pill">GPU <b id="nui-gpu-state">—</b></span>
        <span class="pill">DRIVES <b id="nui-drive-count">—</b></span>
        <span class="pill" id="nui-clock">--:--:--</span>
      </div>
    </header>

    <section class="nui-grid" id="nui-grid">
      <article class="card span2 cpu-card">
        <div class="card-top"><span>CPU package</span><em id="nui-cpu-sub">—</em></div>
        <div class="core">
          <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="CPU temperature">
            <circle class="ring-bg" cx="60" cy="60" r="51" pathLength="100"/>
            <circle class="ring-fg cpu" id="nui-cpu-ring" cx="60" cy="60" r="51" pathLength="100"/>
            <text class="ring-num" id="nui-cpu-temp" x="60" y="59" text-anchor="middle">—</text>
            <text class="ring-unit" x="60" y="76" text-anchor="middle">°C</text>
          </svg>
          <div class="stats">
            <div><span>Util</span><b id="nui-cpu-util">—</b><small>%</small></div>
            <div><span>Power</span><b id="nui-cpu-w">—</b><small>W</small></div>
            <div><span id="nui-cpu-clk-label">P clock</span><b id="nui-cpu-clk">—</b><small>GHz</small></div>
            <div><span>Major flt</span><b id="nui-cpu-flt">—</b><small>/s</small></div>
          </div>
        </div>
        <div class="mini">
          <div class="mini-row"><span>Idle residency</span><div class="track"><i id="nui-idle-bar"></i></div><b id="nui-idle">—</b></div>
          <div class="mini-row"><span>Context switches</span><div class="track"><i id="nui-ctx-bar"></i></div><b id="nui-ctx">—</b></div>
        </div>
      </article>

      <article class="card" id="nui-gpu-card">
        <div class="card-top"><span>GPU</span><em id="nui-gpu-sub">—</em></div>
        <div class="core">
          <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="GPU temperature">
            <circle class="ring-bg" cx="60" cy="60" r="51" pathLength="100"/>
            <circle class="ring-fg gpu" id="nui-gpu-ring" cx="60" cy="60" r="51" pathLength="100"/>
            <text class="ring-num" id="nui-gpu-temp" x="60" y="59" text-anchor="middle">—</text>
            <text class="ring-unit" x="60" y="76" text-anchor="middle">°C</text>
          </svg>
          <div class="stats">
            <div><span>Util</span><b id="nui-gpu-util">—</b><small>%</small></div>
            <div><span>Power</span><b id="nui-gpu-w">—</b><small>W</small></div>
            <div><span>VRAM</span><b id="nui-gpu-vram">—</b><small>GiB</small></div>
            <div><span>SM clock</span><b id="nui-gpu-clk">—</b><small>MHz</small></div>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-top"><span>Memory</span><em id="nui-mem-sub">—</em></div>
        <div class="large" id="nui-mem-big">—</div>
        <div class="stack">
          <div><span>Cache</span><b id="nui-cache">—</b><small>GiB</small></div>
          <div><span>Available</span><b id="nui-avail">—</b><small>GiB</small></div>
          <div><span>Swap</span><b id="nui-swap">—</b><small>GiB</small></div>
          <div><span>Swap I/O</span><b id="nui-swp">—</b><small>MB/s</small></div>
        </div>
      </article>

      <article class="card span2 trace">
        <div class="card-top"><span>Thermal trace</span><em>60 samples</em></div>
        <svg id="nui-trace" viewBox="0 0 600 140" preserveAspectRatio="none"></svg>
        <div class="legend"><span><i class="cpu"></i>CPU °C</span><span><i class="gpu"></i>GPU °C</span></div>
      </article>

      <article class="card span2 drives">
        <div class="card-top"><span>Storage lanes</span><em id="nui-drive-sub">—</em></div>
        <div class="drive-list" id="nui-drive-list"></div>
      </article>
    </section>

    <footer class="nui-foot">
      <span id="nui-foot-l">—</span>
      <span id="nui-foot-r">—</span>
    </footer>
  </div>`;
  update(ctx);
}

function update(ctx){
  if(!rootEl)return;
  const s=ctx.data, snap=ctx.snap||{}, drives=ctx.drives||[];
  const gpu=!!(ctx.registry.get("gpuPresent")&&ctx.registry.get("gpuPresent").available);

  const dot=q("#nui-dot"), live=q("#nui-live");
  if(live){
    live.textContent=ctx.online?(ctx.mock?"mock live":"live"):"offline";
    live.classList.toggle("off",!ctx.online);
  }
  if(dot)dot.className="dot"+(ctx.online?" on":"");
  const gs=q("#nui-gpu-state"); if(gs)gs.textContent=gpu?(snap.gpuName||"ready"):"absent";
  const dc=q("#nui-drive-count"); if(dc)dc.textContent=String(drives.length);
  const clock=q("#nui-clock"); if(clock)clock.textContent=new Date().toLocaleTimeString();

  const cpuSub=q("#nui-cpu-sub");
  if(cpuSub)cpuSub.textContent=snap.cpuCoreType==="logical"
    ?`${snap.cpuModel||"CPU"} · ${snap.cpuLogical||(s.pu||[]).length} logical CPUs`
    :(snap.cpuModel||"CPU")+` · ${(s.pu||[]).length} P + ${(s.eu||[]).length} E`;
  const cpuClockLabel=q("#nui-cpu-clk-label");
  if(cpuClockLabel)cpuClockLabel.textContent=snap.cpuCoreType==="logical"?"Avg CPU clock":"P clock";
  setRing(q("#nui-cpu-ring"),q("#nui-cpu-temp"),ctx,"cpuT",100,0);
  setNum(q("#nui-cpu-util"),ctx,"cpuU",0);
  setNum(q("#nui-cpu-w"),ctx,"cpuW",1);
  setNum(q("#nui-cpu-clk"),ctx,"pfa",2);
  setNum(q("#nui-cpu-flt"),ctx,"majF",0);
  const idle=q("#nui-idle"), idleBar=q("#nui-idle-bar");
  if(idle){
    if(isNum(s.idle)){idle.textContent=s.idle.toFixed(0)+"%";idle.classList.remove("na");idle.removeAttribute("title")}
    else{idle.textContent="unavailable";idle.classList.add("na");idle.title=reason(ctx,"idle")}
  }
  setBar(idleBar,s.idle,ctx,"idle");
  const ctxEl=q("#nui-ctx");
  if(ctxEl){
    if(isNum(s.ctx)){ctxEl.textContent=fx(s.ctx,0);ctxEl.classList.remove("na");ctxEl.removeAttribute("title")}
    else{ctxEl.textContent="unavailable";ctxEl.classList.add("na");ctxEl.title=reason(ctx,"ctx")}
  }
  const cmax=ctx.max("ctx");
  setBar(q("#nui-ctx-bar"),isNum(s.ctx)&&isNum(cmax)&&cmax>0?s.ctx/cmax*100:null,ctx,"ctx");

  const gcard=q("#nui-gpu-card");
  if(gcard){
    gcard.hidden=!gpu;
    const grid=q("#nui-grid"); if(grid)grid.classList.toggle("no-gpu",!gpu);
    if(gpu){
      setRing(q("#nui-gpu-ring"),q("#nui-gpu-temp"),ctx,"gT",100,0);
      setNum(q("#nui-gpu-util"),ctx,"gU",0);
      setNum(q("#nui-gpu-w"),ctx,"gW",1);
      setPair(q("#nui-gpu-vram"),ctx,"vram","vramTot",2);
      setNum(q("#nui-gpu-clk"),ctx,"gClk",0);
      const gsub=q("#nui-gpu-sub"); if(gsub)gsub.textContent=snap.gpuName||"GPU";
    }
  }

  const memBig=q("#nui-mem-big");
  if(memBig){
    if(isNum(s.ramU)&&isNum(s.memTot)){memBig.textContent=`${s.ramU.toFixed(1)} / ${s.memTot.toFixed(1)} GiB`;memBig.classList.remove("na");memBig.removeAttribute("title")}
    else{memBig.textContent="unavailable";memBig.classList.add("na");memBig.title=reason(ctx,"ramU")}
  }
  const msub=q("#nui-mem-sub"); if(msub)msub.textContent=snap.osName|| (snap.kernel?("kernel "+snap.kernel):"OS unavailable");
  setNum(q("#nui-cache"),ctx,"cache",1);
  setNum(q("#nui-avail"),ctx,"avail",1);
  setNum(q("#nui-swap"),ctx,"swapU",1);
  setNum(q("#nui-swp"),ctx,"swp",1);

  drawTrace(ctx);
  drawDrives(ctx);

  const dsub=q("#nui-drive-sub"); if(dsub)dsub.textContent=drives.length+" drive · "+(snap.platform==="Windows"?"Windows counters":"sysfs");
  const fl=q("#nui-foot-l"), fr=q("#nui-foot-r");
  if(fl)fl.textContent=(snap.cpuModel||"CPU")+" · "+(snap.osName||snap.kernel||"OS unavailable");
  if(fr)fr.textContent="governor "+(snap.governor||"unavailable")+" · EPP "+(snap.epp||"unavailable")+" · pinning "+(snap.pinning||"unavailable");
}

N.addTheme("neon",{mount,update});
})();
