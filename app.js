/* ============================================================================
   Market Pulse — app.js
   無料・キー不要。Cloudflare Worker プロキシ経由で Yahoo Finance / Google News RSS。
   PROXY を自分の Worker URL に変えるだけでライブ化します。
   ========================================================================== */

// ▼▼▼ ここをあなたの Cloudflare Worker の URL に変更 ▼▼▼
const PROXY = "https://marketpulse.chibigyala.workers.dev"; // 例: "https://market-pulse.your-name.workers.dev"
// ▲▲▲ 空のままだとデモ表示になります ▲▲▲

const REFRESH_MS = 15 * 60 * 1000; // 15分

/* ---- 12取引所（現地TZ・取引時間・取引曜日） ---- */
const EXCHANGES = [
  { name:"NYSE",         tz:"America/New_York", days:[1,2,3,4,5], sess:[[570,960]] },
  { name:"NASDAQ",       tz:"America/New_York", days:[1,2,3,4,5], sess:[[570,960]] },
  { name:"日本取引所",     tz:"Asia/Tokyo",       days:[1,2,3,4,5], sess:[[540,690],[750,930]] },
  { name:"上海証券",       tz:"Asia/Shanghai",    days:[1,2,3,4,5], sess:[[570,690],[780,900]] },
  { name:"香港取引所",     tz:"Asia/Hong_Kong",   days:[1,2,3,4,5], sess:[[570,720],[780,960]] },
  { name:"ボンベイ(BSE)",  tz:"Asia/Kolkata",     days:[1,2,3,4,5], sess:[[555,930]] },
  { name:"インド(NSE)",   tz:"Asia/Kolkata",     days:[1,2,3,4,5], sess:[[555,930]] },
  { name:"ロンドン",       tz:"Europe/London",    days:[1,2,3,4,5], sess:[[480,990]] },
  { name:"ユーロネクスト", tz:"Europe/Paris",     days:[1,2,3,4,5], sess:[[540,1050]] },
  { name:"ドイツ取引所",   tz:"Europe/Berlin",    days:[1,2,3,4,5], sess:[[540,1050]] },
  { name:"トロント",       tz:"America/Toronto",  days:[1,2,3,4,5], sess:[[570,960]] },
  { name:"サウジ(Tadawul)",tz:"Asia/Riyadh",      days:[0,1,2,3,4], sess:[[600,900]] },
];
const WD = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
function localInfo(tz){
  const p = new Intl.DateTimeFormat("en-GB",{timeZone:tz,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  const g = t => p.find(x=>x.type===t).value;
  const hh=+g("hour")%24, mm=+g("minute");
  return {day:WD[g("weekday")], minutes:hh*60+mm, t:`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`};
}
const isOpen = (e,i)=> e.days.includes(i.day) && e.sess.some(([s,x])=>i.minutes>=s && i.minutes<x);

/* ---- セクター → 銘柄（Yahoo記法。自由に編集可） ---- */
const SECTORS = {
  "半導体":   ["8035.T","6857.T","NVDA","TSM","AMD","ASML.AS"],
  "自動車":   ["7203.T","7267.T","TSLA","MBG.DE","STLA","7269.T"],
  "電機・電子":["6758.T","6501.T","6503.T","AAPL","6981.T","6502.T"],
  "IT・ソフト":["MSFT","GOOGL","9984.T","SAP.DE","SHOP.TO","AMZN"],
  "金融":     ["8306.T","JPM","HSBA.L","BNP.PA","8316.T","RY.TO"],
  "ヘルスケア":["4568.T","JNJ","AZN.L","SAN.PA","4502.T","4519.T"],
  "エネルギー":["5020.T","XOM","SHEL.L","TTE.PA","2222.SR","ENB.TO"],
  "小売・消費":["9983.T","7974.T","MC.PA","9433.T","3382.T","4661.T"],
};
const SECTOR_NAMES = Object.keys(SECTORS);

/* ---- state ---- */
const state = { tab:"good", sector:"半導体", cache:{}, loading:false, error:null };
const TABS = [
  {id:"good", label:"上昇/好調"},
  {id:"bad",  label:"下落/不調"},
  {id:"news", label:"セクターニュース"},
  {id:"market", label:"市場ニュース"},
];
const keyOf = ()=> (state.tab==="good"||state.tab==="bad"||state.tab==="news") ? `${state.tab}:${state.sector}` : state.tab;

/* ---- storage (sandbox-safe) ---- */
const store = {
  get(k){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):null; }catch(_){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(_){} },
};

/* ---- proxy fetch ---- */
async function px(params){
  if(!PROXY) throw new Error("NO_PROXY");
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${PROXY}?${q}`,{cache:"no-store"});
  if(!r.ok) throw new Error("PROXY_"+r.status);
  return r.json();
}
async function fetchQuote(sym){
  const j = await px({type:"chart",symbol:sym,range:"1y",interval:"1d"});
  const res = j.chart?.result?.[0]; if(!res) throw new Error("NO_DATA");
  const meta = res.meta || {};
  const closes = (res.indicators?.quote?.[0]?.close || []).filter(v=>v!=null);
  const last = meta.regularMarketPrice ?? closes[closes.length-1];
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length-2] ?? last;
  const pct = prev ? ((last-prev)/prev*100) : 0;
  return { sym, name:meta.shortName||meta.symbol||sym, exch:meta.fullExchangeName||meta.exchangeName||"",
           price:last, ccy:meta.currency||"", pct, closes };
}

/* ---- demo fallback (clearly labeled) ---- */
function demoQuotes(sector){
  return SECTORS[sector].map((sym,i)=>{
    const pct = ((i*37%13)-6) + (i%2?0.4:-0.3);
    const base = 100 + i*23;
    const closes = Array.from({length:60},(_,k)=> base*(1+Math.sin(k/7+i)/12 + k/200*(pct>0?1:-1)));
    return { sym, name:sym, exch:"DEMO", price:closes[closes.length-1], ccy:"", pct, closes, demo:true };
  });
}
function demoNews(q){
  return Array.from({length:5},(_,i)=>({title:`【デモ】${q} に関するサンプル見出し ${i+1}`, src:"DEMO", link:"#", time:""}));
}

/* ---- loaders ---- */
async function loadStocks(sector){
  if(!PROXY) return demoQuotes(sector);
  const syms = SECTORS[sector];
  const out = await Promise.allSettled(syms.map(fetchQuote));
  return out.filter(r=>r.status==="fulfilled").map(r=>r.value);
}
async function loadNews(query){
  if(!PROXY) return demoNews(query);
  const j = await px({type:"news",q:query});
  return (j.items||[]).slice(0,12);
}

async function load(force){
  const k = keyOf();
  if(!force && state.cache[k]){ render(); return; }
  state.loading=true; state.error=null; render();
  try{
    let data;
    if(state.tab==="good"||state.tab==="bad"){
      const all = await loadStocks(state.sector);
      all.sort((a,b)=> state.tab==="good" ? b.pct-a.pct : a.pct-b.pct);
      data = all;
    } else if(state.tab==="news"){
      data = await loadNews(`${state.sector} 決算 OR 業績`);
    } else {
      data = await loadNews(`株式市場 OR 株価 OR 日経平均 OR NYダウ`);
    }
    state.cache[k] = { data, updated:stamp(), demo:!PROXY };
    store.set("cache:"+k, state.cache[k]);
  }catch(e){
    state.error = e.message==="NO_PROXY" ? "Worker未設定のためデモ表示中（README参照）" : "取得に失敗しました: "+e.message;
    const cached = store.get("cache:"+k); if(cached) state.cache[k]=cached;
  }finally{ state.loading=false; render(); }
}

function stamp(){
  return new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
}

/* ---- mini SVG chart (1年・実データ) ---- */
function sparkline(closes, up){
  if(!closes || closes.length<2) return "";
  const w=116,h=42,pad=2;
  const min=Math.min(...closes), max=Math.max(...closes), span=(max-min)||1;
  const pts = closes.map((c,i)=>{
    const x = pad + i*(w-pad*2)/(closes.length-1);
    const y = h-pad - (c-min)/span*(h-pad*2);
    return [x,y];
  });
  const d = pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const col = up ? "var(--up)" : "var(--down)";
  const fill = up ? "rgba(255,91,87,.13)" : "rgba(62,155,255,.13)";
  const area = d + ` L ${pts[pts.length-1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none">
    <path d="${area}" fill="${fill}"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.6"/></svg>`;
}
const tvURL = s => "https://www.tradingview.com/chart/?symbol="+encodeURIComponent(s);

/* ---- render ---- */
function el(id){ return document.getElementById(id); }
function renderMarkets(){
  el("markets").innerHTML = EXCHANGES.map(e=>{
    const i=localInfo(e.tz), o=isOpen(e,i);
    return `<div class="mx${o?" open":""}"><div class="mx-top"><span class="mx-name">${e.name}</span>
      <span class="dot${o?" on":""}"></span></div><div class="mx-time">${i.t}</div>
      <div class="mx-st ${o?"o":"c"}">${o?"取引中":"閉場"}</div></div>`;
  }).join("");
  el("jst").textContent = localInfo("Asia/Tokyo").t;
}
function renderControls(){
  el("tabs").innerHTML = TABS.map(t=>`<button class="tab${state.tab===t.id?" act":""}" data-tab="${t.id}">${t.label}</button>`).join("");
  const showG = state.tab!=="market";
  el("genres").innerHTML = showG ? SECTOR_NAMES.map(s=>`<button class="g${state.sector===s?" act":""}" data-g="${s}">${s}</button>`).join("") : "";
  el("tabs").querySelectorAll(".tab").forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;renderControls();load(false);});
  el("genres").querySelectorAll(".g").forEach(b=>b.onclick=()=>{state.sector=b.dataset.g;renderControls();load(false);});
}
function render(){
  renderControls();
  const cur = state.cache[keyOf()];
  el("meta").innerHTML = cur ? `<span>最終更新 <b>${cur.updated}</b></span>${cur.demo?'<span style="color:var(--gold)">デモデータ</span>':"<span>自動更新 <b>15分</b></span>"}` : "";
  const body = el("body");

  if(state.loading && !cur){ body.innerHTML = `<div class="state"><div class="spin"></div>無料データを取得しています…</div>`; return; }
  if(state.error && !cur){
    body.innerHTML = `<div class="state err">${state.error}<div><button class="retry" id="rt">もう一度</button></div></div>`;
    el("rt") && (el("rt").onclick=()=>load(true)); return;
  }
  if(!cur){ body.innerHTML = `<div class="state">「更新」を押してください</div>`; return; }

  if(state.tab==="good"||state.tab==="bad"){
    body.innerHTML = `<div class="list">${cur.data.map(c=>{
      const up = c.pct>=0;
      const price = c.price!=null ? Number(c.price).toLocaleString(undefined,{maximumFractionDigits:2}) : "—";
      return `<div class="row">
        <div class="co"><div class="co-name">${c.name}<span class="tick">${c.sym}</span><span class="mkt">${c.exch||""}</span></div>
          <div class="px">${price} ${c.ccy||""}</div></div>
        <div class="chartcell">${sparkline(c.closes,up)}</div>
        <div class="right"><div class="chg ${up?"up":"down"}">${up?"+":""}${c.pct.toFixed(2)}%</div>
          <a class="chglink" href="${tvURL(c.sym)}" target="_blank" rel="noopener">1年チャート ↗</a></div>
      </div>`;
    }).join("")}</div>`;
  } else {
    body.innerHTML = `<div class="list">${cur.data.map(n=>`
      <a class="news" href="${n.link||"#"}" target="_blank" rel="noopener">
        <div class="news-h"><span class="src">${n.src||""}</span><span class="time">${n.time||""}</span></div>
        <div class="news-t">${n.title||""}</div></a>`).join("")}</div>`;
  }
}

/* ---- 15分自動更新（フォアグラウンド） ---- */
let timer=null;
function startTimer(){ clearInterval(timer); timer=setInterval(()=>load(true), REFRESH_MS); }
document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ render(); load(false); } });

/* ---- Android向け 定期バックグラウンド同期（iOSは非対応） ---- */
async function registerPeriodicSync(){
  try{
    const reg = await navigator.serviceWorker?.ready;
    if(reg && "periodicSync" in reg){
      const st = await navigator.permissions.query({name:"periodic-background-sync"});
      if(st.state==="granted") await reg.periodicSync.register("refresh-15m",{minInterval:REFRESH_MS});
    }
  }catch(_){}
}

/* ---- init ---- */
function init(){
  // restore caches
  TABS.forEach(t=>{
    if(t.id==="market"){ const c=store.get("cache:market"); if(c) state.cache.market=c; }
    else SECTOR_NAMES.forEach(s=>{ const k=`${t.id}:${s}`; const c=store.get("cache:"+k); if(c) state.cache[k]=c; });
  });
  el("banner").classList.toggle("hide", !!PROXY);
  el("refresh").onclick=()=>load(true);
  renderMarkets(); renderControls(); load(false);
  setInterval(renderMarkets,1000);
  startTimer();
  registerPeriodicSync();
}
init();
