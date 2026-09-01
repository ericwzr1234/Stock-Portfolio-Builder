/* The application. Extracted from index.html on 2026-09-01 (E13.1) so that the Content Security
   Policy could drop 'unsafe-inline' from script-src.

   WHY THIS FILE EXISTS. 'unsafe-inline' tells the browser to run any script written into the page,
   which means it cannot tell this app's code from an attacker's. It is what turns an escaping slip
   into account takeover - the session token is in localStorage. Without it, the same slip is a
   cosmetic glitch.

   WHY EXTRACTED RATHER THAN HASHED. A CSP hash over THIS file would change on every edit, and a
   stale hash does not degrade the app, it blanks it. Three small blocks remain inline in
   index.html because they must run before first paint - the Turnstile callback, the Capacitor
   native check, and the one that keeps the sign-in gate up - and those are hashed instead,
   because they almost never change. tools/csp_hashes.py computes them and check_syntax.py fails
   when they are stale.

   Loaded with a plain <script src>, in the same position the inline block occupied, so execution
   order relative to the DOM is unchanged. Pages serves it with max-age=0, must-revalidate, so a
   browser revalidates by etag and cannot run a stale copy against a newer index.html. */
"use strict";
/* ======================================================================
   Configuration
   ====================================================================== */
const THEMES = [
  {key:"stablecoin",  name:"Stablecoin",     color:"#13605C", tickers:["CRCL","MA","V","COIN","JPM"]},
  {key:"personalai",  name:"Personal AI",    color:"#3A6EA5", tickers:["AAPL","AMZN","META","GOOGL","IBM"]},
  {key:"enterpriseai",name:"Enterprise AI",  color:"#7E9C84", tickers:["NOW","PLTR","MSFT","CRM","PATH"]},
  {key:"robotics",    name:"Robotics",       color:"#5B6B8C", tickers:["ISRG","ROK","NVDA","SYM","TSLA"]},
  {key:"data",        name:"Data Providers", color:"#B0894F", tickers:["SNOW","SPGI","MCO","MSCI","RDDT"]},
];
const DEFAULT_THEME_TICKERS = {}; THEMES.forEach(t=>DEFAULT_THEME_TICKERS[t.key]=t.tickers.slice());

/* Theme LIST is DATA-DRIVEN (E1.1). THEMES above are only the DEFAULTS. The live theme set —
   which themes exist, plus each theme's key/name/color — is state.themes; null/empty => use THEMES.
   Read the live list ONLY through themes(); look one up via themeByKey(). Membership (the tickers
   inside a theme) stays dynamic via state.themeTickers / tickersOf(). */
/* E8 - THERE IS NO DEFAULT THEME SET. Every account builds its own, so `state.themes` is simply
   the list: an array, possibly empty. This replaced a value whose meaning depended on a second
   flag (`null` = "the five built-ins" unless `noDefaults`), which is what let one button delete a
   user's themes and restore nothing. Documents written before E8 are migrated once, on load, by
   migrateThemes() - they keep exactly the themes they were showing. */
function themes(){ const t=state.themes; return Array.isArray(t)?t:[]; }
/* THEMES / DEFAULT_THEME_TICKERS survive for exactly ONE purpose now: seeding the one-time
   migration of a pre-E8 document (below). Nothing else in the app may read them - there is no
   default theme set any more. */
/* Pre-E8 documents leaned on TWO INDEPENDENT fallbacks, and both have to be migrated separately:
     - `themes` null      MEANT "the five built-in themes";
     - `themeTickers[k]` missing-or-empty MEANT "that theme's default five names".
   Keying the migration on `themes` alone lost the second one: creating, renaming or deleting a theme
   pre-E8 wrote a themes ARRAY while leaving themeTickers null, so those documents would have been
   skipped and every theme left empty - 25 holdings suddenly belonging to nothing.
   The marker is the schema version, not the shape, so a deliberately empty E8 board is never
   "repaired" back into the built-ins. Version snapshots carried the same two sentinels, so undo and
   revert are migrated as well. */
function migrateThemes(p){
  if(!p) return false;
  if(isNum(p.schemaVersion) && p.schemaVersion>=2) return false;    // already E8
  /* THREE inputs, not two. Pre-E8 also persisted `noDefaults`, and when it was true BOTH other
     sentinels inverted: `themes:null` meant "nothing", and empty membership meant "empty", not
     "that portfolio's five". A start-fresh account that undid past its initial build has exactly that
     shape - and materialising the built-ins into it would hand somebody a 25-name model they never
     chose, then offer to buy it. Honour the flag and migrate only the shape. */
  if(p.noDefaults===true){
    if(!Array.isArray(p.themes)) p.themes=[];
    if(!p.themeTickers || typeof p.themeTickers!=="object" || Array.isArray(p.themeTickers)) p.themeTickers={};
    (Array.isArray(p.versions)?p.versions:[]).forEach(v=>{
      const sn=v&&v.snapshot; if(!sn) return;
      if(!Array.isArray(sn.themes)) sn.themes=[];
      if(!sn.themeTickers || typeof sn.themeTickers!=="object" || Array.isArray(sn.themeTickers)) sn.themeTickers={};
    });
    p.schemaVersion=2;
    console.info("migrated a pre-E8 START-FRESH document: it stays empty");
    return true;
  }
  const builtins = ()=> THEMES.map(t=>({ key:t.key, name:t.name, color:t.color }));
  const fillMembership = (list,tickers)=>{
    const tk = (tickers && typeof tickers==="object" && !Array.isArray(tickers)) ? Object.assign({},tickers) : {};
    (Array.isArray(list)?list:[]).forEach(t=>{
      const def = DEFAULT_THEME_TICKERS[t && t.key];
      if(def && (!Array.isArray(tk[t.key]) || !tk[t.key].length)) tk[t.key] = def.slice();
    });
    return tk;
  };
  if(!Array.isArray(p.themes)) p.themes = builtins();
  p.themeTickers = fillMembership(p.themes, p.themeTickers);
  (Array.isArray(p.versions)?p.versions:[]).forEach(v=>{
    const snap = v && v.snapshot; if(!snap) return;
    if(!Array.isArray(snap.themes)) snap.themes = builtins();
    snap.themeTickers = fillMembership(snap.themes, snap.themeTickers);
  });
  p.schemaVersion = 2;
  console.info("migrated a pre-E8 document: "+p.themes.length+" portfolios, "+
               Object.keys(p.themeTickers).length+" membership lists, "+
               ((p.versions||[]).length)+" checkpoints");
  return true;
}
function useNoThemes(){ state.themes=[]; state.themeTickers={}; }
// N-adaptive default cap (1.5/N => 30% at five themes); guarded so an empty board cannot divide by zero.
function defaultCap(){ const n=themes().length; return n>0 ? weightBounds(n).hi : 0.3; }   // owner's 1/(n-1)
function themeByKey(k){ return themes().find(x=>x.key===k); }
const THEME_PALETTE=["#13605C","#3A6EA5","#7E9C84","#5B6B8C","#B0894F","#8C5B6B","#4F8CB0","#A4683C","#6B8C5B","#5B8C87","#7A5B8C","#9C7E84"];

/* Theme membership is DYNAMIC — the Screener "swap" feature replaces a name within a theme.
   It lives in state.themeTickers (persisted in the portfolio + every version snapshot).
   When unset for a theme we fall back to that theme's default 5 core names above. */
function tickersOf(key){ const m=state.themeTickers; return (m&&Array.isArray(m[key]))?m[key]:[]; }
function membership(){ return themes().flatMap(t=>tickersOf(t.key)); }                 // every themed name (5×5)
function holdingSyms(){ return Object.keys((state.portfolio&&state.portfolio.holdings)||{}); }
function tradeUniverse(){ return [...new Set([...membership(), ...holdingSyms()])]; } // themed ∪ held; held-but-unthemed = a position to liquidate
let themeOf = {};
function rebuildThemeOf(){ themeOf={}; themes().forEach(t=>tickersOf(t.key).forEach(s=>{ themeOf[s]=t; })); }
function themeOfSym(s){ return themeOf[s] || {key:"_exit", name:"Exiting position", color:"#9AA3A1"}; }

/* ======================================================================
   State
   ====================================================================== */
const state = {
  quotes:{}, fundamentals:{},
  portfolio:null,                 // {holdings:{sym:{shares,costBasis}}, ...}
  weights:{peg:0.20, ev:0.20, dfcf:0.20, pe:0.15, mcap:0.10, mom:0.15},
  penalty:{peg:10, ev:1000, dfcf:50, pe:200},  // negative/missing ratio -> this multiple; pe for negative-earnings (no P/E)
  cap:null,                       // max single-theme weight; null => N-adaptive default 1.5/N (=0.30 at 5 themes); excess redistributed
  overrides:{},                   // sym -> {peg?,ev?,marketCap?}
  asOf:null,
  themes:[],                      // [{key,name,color}] the account's themes (E8: no defaults; the list IS the truth)
  metrics:null,                   // ordered scoring-metric list (E2.1); null => DEFAULT_METRICS. Persisted as [{key}]; weights/penalty stay in state.weights/state.penalty
  metricCfg:null,                 // {key:{penalty?,badData?,direction?}} per-metric overrides (E2.4); null/absent => baked-in descriptor defaults. Pruned on default.
  presets:[],                     // [{name,config,savedAt}] saved metric+weight models (E2.5); a user library, NOT versioned (excluded from snapshots)
  statements:{},                  // sym -> {sym, quarters:[{date,<lineItems>}], asOf, source} financial statements (E3); source for computed metrics
  pulled:{},                      // sym -> raw PULLED fundamentals (Yahoo pre-computed); state.fundamentals = this base, optionally overlaid with computed (E3)
  computeFromStatements:true,     // E3.4: compute metrics FROM statements (primary) vs pull Yahoo's pre-computed fields
  metricSource:{},                // sym -> {field: 'computed'|'pulled'} provenance for the fundamentals table + detail page (E3.4)
  watchlist:[],                   // [{sym,theme}] watchlisted candidates (E1.3); staged in the Screener, NOT in the portfolio until added to a theme
  themeRecos:{},                  // {themeKey:{syms,sig}} runtime cache of keyword+peer recommendations for custom themes (E1.9)
  themeTickers:{},                // {themeKey:[syms]} membership per theme (E8: no default membership)
  universe:null,                  // screener universe (window.__UNIVERSE / data/universe.json)
  screenerQuotes:{},              // sym -> quote for screener stocks (lazy-loaded, chunked)
  screenerLoaded:false,
  serverUrl:"",                   // iOS: optional home-computer address for LAN sync (shared portfolio.json)
  syncStatus:"local",             // 'local' | 'remote' | 'remote-failed'
  syncError:null,                 // E6: last failure, shown persistently by the badge
  syncFailure:null,               // E9: {short,detail,act,ours} - the precise reason a read failed
  baseRevision:null,              // E6: the revision the SERVER last CONFIRMED. null => unknown, saving is refused.
  cloudRowExists:null,            // E6: does this account HAVE a row? null => not established (a failed read is not "empty")
  docSource:null,                 // E6: which adapter the in-memory document came from ('cloud'|'web'|'local'|'remote')
  docOwner:null,                  // E6: the uid that document belongs to, captured at load time
};
let curView="prices";
let timer=null;

/* ======================================================================
   Small helpers
   ====================================================================== */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
/* E6.7 - every string that reaches innerHTML and is not a number goes through this.
   Theme names, preset names and metric labels are typed by the user; company names and symbols
   come from Yahoo and from the weekly ticker-directory refresh, which does no validation of its
   own. None of them is trusted markup, and a theme name of <img src=x onerror=...> was PROVEN to
   execute - seven times per render - reading the Supabase session token out of localStorage.
   Escaping happens at the SINK, not on input: input-escaping would corrupt the stored value and
   double-escape on every re-save. */
/* No regex literal on purpose: check_syntax.py counts braces without understanding regex
   literals, so a quote inside a character class reads to it as an unclosed string and the gate
   fails on correct code. A split/join chain needs none. & goes FIRST - otherwise the ampersands
   introduced by the later replacements would themselves be escaped. */
/* E6.7 - ONE answer to "what do I do first?". The context bar and the Overview hero both answer
   it and they DISAGREED: the hero said Rebalance unconditionally, while the context bar correctly
   said Model until a theme exists. A brand-new account was told two different first steps on the
   same screen. Both now call this. */
function firstStepHint(){
  return themes().length ? "size it on <b>Rebalance</b>"
                         : "create your first portfolio on <b>Model</b>";
}
function esc(v){
  return String(v==null?"":v)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}
const isNum=v=>typeof v==="number"&&isFinite(v);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function money(v,dp=0){ if(!isNum(v))return "—";
  return (v<0?"-$":"$")+Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:dp,maximumFractionDigits:dp}); }
function num(v,dp=2){ return isNum(v)?v.toLocaleString("en-US",{minimumFractionDigits:dp,maximumFractionDigits:dp}):"—"; }
function pct(v,dp=1){ return isNum(v)?(v*100).toFixed(dp)+"%":"—"; }
function signed(v,dp=2){ if(!isNum(v))return "—"; return (v>=0?"+":"")+v.toFixed(dp); }
/* Scale by MAGNITUDE, not by the signed value. This tested v>=1e9 directly, so a negative never
   reached the B branch and fell through to M: capital expenditure of -18.8 billion printed as
   "$-18829M" in the same column where operating cash flow printed "$30.0B". There was also no K
   branch at all, so anything under a million collapsed to "$0M". volFmt() on the next line has
   always done this correctly - the two simply never got compared. */
function bil(v){
  if(!isNum(v)) return "—";
  const a=Math.abs(v);
  if(a===0)    return "$0";
  if(a>=1e12)  return "$"+(v/1e12).toFixed(2)+"T";
  if(a>=1e9)   return "$"+(v/1e9).toFixed(1)+"B";
  if(a>=1e6)   return "$"+(v/1e6).toFixed(1)+"M";
  return "$"+(v/1e3).toFixed(1)+"K";
}
function volFmt(v){ if(!isNum(v))return "—"; const a=Math.abs(v); if(a>=1e9)return (v/1e9).toFixed(2)+"B"; if(a>=1e6)return (v/1e6).toFixed(1)+"M"; if(a>=1e3)return (v/1e3).toFixed(1)+"K"; return String(Math.round(v)); }  // share counts (no $): 12.3M, 1.2B
function median(arr){ const a=arr.filter(isNum).slice().sort((x,y)=>x-y); if(!a.length)return null;
  const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2200); }
function todayISO(){ return new Date().toISOString().slice(0,10); }

/* effective fundamentals: manual override > live/seed feed */
function effPeg(s){ const o=state.overrides[s]; if(o&&isNum(o.peg))return o.peg; const f=state.fundamentals[s]; return f&&isNum(f.peg)?f.peg:null; }
function effEv(s){ const o=state.overrides[s]; if(o&&isNum(o.ev))return o.ev; const f=state.fundamentals[s]; return f&&isNum(f.ev)?f.ev:null; }
function effDfcf(s){ const o=state.overrides[s]; if(o&&isNum(o.dfcf))return o.dfcf; const f=state.fundamentals[s]; return f&&isNum(f.dfcf)?f.dfcf:null; }
function effPe(s){ const o=state.overrides[s]; if(o&&isNum(o.pe))return o.pe; const f=state.fundamentals[s]; return f&&isNum(f.pe)?f.pe:null; }
function momOf(s){ const f=state.fundamentals[s]; return f&&isNum(f.mom)?f.mom:null; }   // price momentum vs 50/200-day MA (display/compute only, not overridable)
function effMcap(s){ const o=state.overrides[s]; if(o&&isNum(o.marketCap))return o.marketCap;
  const q=state.quotes[s]; if(q&&isNum(q.marketCap))return q.marketCap;
  const f=state.fundamentals[s]; return f&&isNum(f.marketCap)?f.marketCap:null; }
function price(s){ const q=state.quotes[s]; return q&&isNum(q.price)?q.price:null; }
function nameOf(s){ return (state.quotes[s]&&state.quotes[s].name)||(state.fundamentals[s]&&state.fundamentals[s].name)||s; }

/* E11.9 - what may be ALLOCATED to, as opposed to what may be looked up.
   The model ranks themes on company fundamentals: PEG, EV/EBITDA, free cash flow, margins, growth.
   An ETF has none of them. Left in a theme it would not merely score badly - useMedian metrics fill
   a missing value with the theme median, so it would receive real capital on entirely invented
   inputs, which is worse than excluding it and much harder to notice.
   Research is deliberately unrestricted: look up anything, watchlist anything. Only membership of a
   theme is gated, because membership is what the allocator reads. */
function quoteTypeOf(s){ const q=state.quotes[s]; return (q&&q.quoteType)?String(q.quoteType).toUpperCase():null; }
function isEquity(s){ const t=quoteTypeOf(s); return t===null || t==="EQUITY"; }   // unknown => allow; the fetch below settles it
function notEquityNote(s){
  const t=quoteTypeOf(s), kind=(t==="ETF")?"an ETF":(t==="MUTUALFUND")?"a fund":(t==="INDEX")?"an index":"not a company";
  return s+" is "+kind+". The model allocates on company fundamentals \u2014 PEG, EV/EBITDA, free cash flow \u2014 "
       + "which it does not have, so it cannot join a theme. You can still track it on the watchlist.";
}

/* ======================================================================
   Metrics — DATA-DRIVEN list (E2.1). DEFAULT_METRICS holds the code-side descriptors (closures live here,
   never serialized). state.metrics (persisted as [{key}]) governs WHICH metrics score the model + their
   ORDER; the weight/penalty NUMBERS stay in state.weights / state.penalty. Read the live list via metrics().
   Default = these 6 in this order -> computeAllocation is byte-for-behaviour identical until the list changes.
   Each descriptor keeps its OWN value getter + score formula, so mcap stays log, momentum stays floored,
   Debt/FCF stays 1/max(x,0.1), and the ev/dfcf carry-over still fires. (The weight/penalty INPUTS + notes +
   fundamentals table are still hardcoded to the 6; generating those from metrics() is E2.2.)
   ====================================================================== */
// Builder for the extended catalog (E2.2): inactive-by-default metrics that score via dirScore (by direction).
// Each getter reads a plain field off state.fundamentals[s] (server-forwarded) unless a custom getter is given.
function catMetric(o){
  return Object.assign({
    defaultActive:false, weightKey:o.key, weightInputId:null, defaultWeight:0.10,
    valueKind:'themeMetric', penaltyKey:null, carryKey:null,
    allowZero:(o.direction==='higher'), nullExcludes:true, useMedian:true,
    overridable:false, overrideKey:null, scoreFromDir:true, computeCapable:false,
    badData:'exclude', source:{kind:'field',key:o.key}, formulaHint:'',
    readValue:function(r){ const v=r[o.key]; return v?v.value:null; },
    getter:function(s){ const f=state.fundamentals[s]; const v=f&&f[o.key]; return isNum(v)?v:null; }
  }, o);
}
// METRIC_CATALOG (E2.2): the 6 default metrics VERBATIM (getter/score closures unchanged -> byte-identical at the
// default set) plus additive metadata, followed by the extended catalog. DEFAULT_METRICS = the active-by-default 6.
const METRIC_CATALOG = [
  { key:'peg',  defaultActive:true, group:'value', direction:'lower', source:{kind:'field',key:'peg'}, badData:'penalize', fmt:{kind:'ratio',dp:2}, scoreFromDir:false, weightKey:'peg',  weightInputId:'#wPeg',  defaultWeight:0.20, getter:effPeg,  valueKind:'themeMetric', penaltyKey:'peg',  allowZero:false, nullExcludes:false, carryKey:null,   readValue:r=>r.peg.value,  useMedian:true,  score:x=>(isNum(x)&&x>0)?1/x:0,                          overridable:true,  overrideKey:'peg',       label:'PEG',                header:'PEG',   formulaHint:'P/E ÷ Growth%' },
  { key:'ev',   defaultActive:true, group:'value', direction:'lower', source:{kind:'field',key:'ev'}, badData:'carry', fmt:{kind:'x',dp:1}, scoreFromDir:false, weightKey:'ev',   weightInputId:'#wEv',   defaultWeight:0.20, getter:effEv,   valueKind:'themeMetric', penaltyKey:'ev',   allowZero:false, nullExcludes:true,  carryKey:'ev',   readValue:r=>r.ev.value,   useMedian:true,  score:x=>(isNum(x)&&x>0)?1/x:0,                          overridable:true,  overrideKey:'ev',        label:'EV/EBITDA',          header:'EV/EB', formulaHint:'Enterprise Value ÷ EBITDA', calcFlag:'evCalc' },
  { key:'dfcf', defaultActive:true, group:'risk', direction:'lower', source:{kind:'field',key:'dfcf'}, badData:'carry', fmt:{kind:'ratio',dp:2}, scoreFromDir:false, weightKey:'dfcf', weightInputId:'#wDfcf', defaultWeight:0.20, getter:effDfcf, valueKind:'themeMetric', penaltyKey:'dfcf', allowZero:true,  nullExcludes:true,  carryKey:'dfcf', readValue:r=>r.dfcf.value, useMedian:true,  score:x=>(isNum(x)&&x>=0)?1/Math.max(x,0.1):0,           overridable:true,  overrideKey:'dfcf',      label:'Debt/FCF',           header:'D/FCF', formulaHint:'Total Debt ÷ Free Cash Flow', nmNegative:true },
  { key:'pe',   defaultActive:true, group:'value', direction:'lower', source:{kind:'field',key:'pe'}, badData:'penalize', fmt:{kind:'x',dp:1}, scoreFromDir:false, weightKey:'pe',   weightInputId:'#wPe',   defaultWeight:0.15, getter:effPe,   valueKind:'themeMetric', penaltyKey:'pe',   allowZero:false, nullExcludes:false, carryKey:null,   readValue:r=>r.pe.value,   useMedian:true,  score:x=>(isNum(x)&&x>0)?1/x:0,                          overridable:true,  overrideKey:'pe',        label:'P/E',                header:'P/E',   formulaHint:'Price ÷ Earnings', calcFlag:'peCalc' },
  { key:'mcap', defaultActive:true, group:'size', direction:'higher', source:{kind:'derived'}, badData:'exclude', fmt:{kind:'money'}, scoreFromDir:false, weightKey:'mcap', weightInputId:'#wMcap', defaultWeight:0.10, getter:effMcap, valueKind:'avgMcap',     penaltyKey:null,   allowZero:false, nullExcludes:false, carryKey:null,   readValue:r=>r.mcap,       useMedian:true,  score:x=>(isNum(x)&&x>0)?Math.max(0,Math.log(x/1e9)):0,  overridable:true,  overrideKey:'marketCap', label:'Average market cap', header:'Cap',   formulaHint:'' },
  { key:'mom',  defaultActive:true, group:'momentum', direction:'higher', source:{kind:'derived'}, badData:'exclude', fmt:{kind:'pct',dp:1}, scoreFromDir:false, weightKey:'mom',  weightInputId:'#wMom',  defaultWeight:0.15, getter:momOf,   valueKind:'momentum',    penaltyKey:null,   allowZero:false, nullExcludes:false, carryKey:null,   readValue:r=>r.mom.value,  useMedian:false, score:x=>isNum(x)?Math.max(0,x):0,                       overridable:false, overrideKey:null,        label:'Price momentum',     header:'Mom',   formulaHint:'' },
  // ---- extended catalog (inactive until the user activates them; E2.2). LOWER-better (cheaper/safer wins): ----
  catMetric({key:'forwardPE',    group:'value',   direction:'lower',  fmt:{kind:'x',dp:1},     scoreFloor:0.5,  label:'Forward P/E',      header:'Fwd P/E', formulaHint:'Price ÷ next-yr EPS'}),
  catMetric({key:'evRev',        group:'value',   direction:'lower',  fmt:{kind:'x',dp:1},     scoreFloor:0.1,  label:'EV/Revenue',       header:'EV/Rev'}),
  catMetric({key:'ps',           group:'value',   direction:'lower',  fmt:{kind:'x',dp:1},     scoreFloor:0.1,  label:'P/S',              header:'P/S'}),
  catMetric({key:'pb',           group:'value',   direction:'lower',  fmt:{kind:'x',dp:1},     scoreFloor:0.1,  label:'P/B',              header:'P/B'}),
  catMetric({key:'pfcf',         group:'value',   direction:'lower',  fmt:{kind:'x',dp:1},     scoreFloor:0.5,  label:'P/FCF',            header:'P/FCF', source:{kind:'derived'}, getter:s=>{const f=state.fundamentals[s]||{}; const mc=effMcap(s), fcf=f.fcf; return (isNum(mc)&&isNum(fcf)&&fcf>0&&!currencyMismatch(s))?mc/fcf:null;}}),   // market-cap based -> skip on a currency mismatch (ADR)
  catMetric({key:'debtToEquity', group:'risk',    direction:'lower',  fmt:{kind:'x',dp:2},     scoreFloor:0.05, allowZero:true, label:'Debt/Equity', header:'D/E', getter:s=>{const f=state.fundamentals[s]; const v=f&&f.debtToEquity; return isNum(v)?v/100:null;}}),   // Yahoo returns a PERCENT; 0 = debt-free = best
  catMetric({key:'payout',       group:'income',  direction:'lower',  fmt:{kind:'pct',dp:0},   scoreFloor:0.02, allowZero:true, label:'Payout ratio', header:'Payout'}),   // 0% payout = retains all earnings = best
  catMetric({key:'beta',         group:'risk',    direction:'lower',  fmt:{kind:'ratio',dp:2}, scoreFloor:0.1,  label:'Beta',             header:'Beta'}),
  // ---- HIGHER-better (more profitable/healthier/faster wins): ----
  catMetric({key:'grossMargin',  group:'quality', direction:'higher', fmt:{kind:'pct',dp:1}, label:'Gross margin',     header:'GM'}),
  catMetric({key:'opMargin',     group:'quality', direction:'higher', fmt:{kind:'pct',dp:1}, label:'Operating margin', header:'OpM'}),
  catMetric({key:'netMargin',    group:'quality', direction:'higher', fmt:{kind:'pct',dp:1}, label:'Net margin',       header:'NM'}),
  catMetric({key:'roe',          group:'quality', direction:'higher', fmt:{kind:'pct',dp:1}, label:'ROE',              header:'ROE'}),
  catMetric({key:'roa',          group:'quality', direction:'higher', fmt:{kind:'pct',dp:1}, label:'ROA',              header:'ROA'}),
  catMetric({key:'ebitdaMargin', group:'quality', direction:'higher', fmt:{kind:'pct',dp:1}, label:'EBITDA margin',    header:'EBITDA%', source:{kind:'derived'}, getter:s=>{const f=state.fundamentals[s]||{}; return (isNum(f.ebitda)&&isNum(f.revenue)&&f.revenue>0)?f.ebitda/f.revenue:null;}}),
  catMetric({key:'fcfMargin',    group:'quality', direction:'higher', fmt:{kind:'pct',dp:1}, label:'FCF margin',       header:'FCF%', source:{kind:'derived'}, getter:s=>{const f=state.fundamentals[s]||{}; return (isNum(f.fcf)&&isNum(f.revenue)&&f.revenue>0)?f.fcf/f.revenue:null;}}),
  catMetric({key:'currentRatio', group:'risk',    direction:'higher', fmt:{kind:'ratio',dp:2}, label:'Current ratio',  header:'Curr'}),
  catMetric({key:'quickRatio',   group:'risk',    direction:'higher', fmt:{kind:'ratio',dp:2}, label:'Quick ratio',    header:'Quick'}),
  catMetric({key:'revGrowth',    group:'growth',  direction:'higher', fmt:{kind:'pct',dp:1}, label:'Revenue growth',   header:'Rev g'}),
  catMetric({key:'earnGrowth',   group:'growth',  direction:'higher', fmt:{kind:'pct',dp:1}, label:'Earnings growth',  header:'Earn g'}),
  catMetric({key:'netCashPct',   group:'risk',    direction:'higher', fmt:{kind:'pct',dp:1}, label:'Net cash / mcap',  header:'NetCash', source:{kind:'derived'}, getter:s=>{const f=state.fundamentals[s]||{}; const mc=effMcap(s); return (isNum(f.cash)&&isNum(f.debt)&&isNum(mc)&&mc>0&&!currencyMismatch(s))?(f.cash-f.debt)/mc:null;}}),   // market-cap based -> skip on a currency mismatch (ADR)
  catMetric({key:'divYield',     group:'income',  direction:'higher', badData:'penalize', fmt:{kind:'pct',dp:2}, label:'Dividend yield', header:'Yield'}),   // non-payers score 0 via penalize (higher-better bad value => worst = 0)
];
const DEFAULT_METRICS = METRIC_CATALOG.filter(m=>m.defaultActive);
function metrics(){ const m=state.metrics; return (Array.isArray(m)&&m.length)?m:DEFAULT_METRICS; }
function metricByKey(k){ return metrics().find(m=>m.key===k); }
function catalogByKey(k){ return METRIC_CATALOG.find(m=>m.key===k); }
function validateMetrics(list){   // reattach real descriptors by key from the CATALOG; dedupe; drop unknown; [] => null (defaults)
  const seen=new Set(), out=[];
  (list||[]).forEach(x=>{ const k=x&&x.key, d=METRIC_CATALOG.find(m=>m.key===k); if(d&&!seen.has(k)){ seen.add(k); out.push(d); } });
  return out.length?out:null;
}
// E2.4 per-metric config resolvers. state.metricCfg (null => baked-in descriptor defaults for every metric).
function cfgOf(k){ return (state.metricCfg&&state.metricCfg[k])||{}; }
function effBadData(m){ return cfgOf(m.key).badData||m.badData; }
function effDirection(m){ return m.direction; }   // direction is auto-assigned from the catalog map — never asked/editable
function effPenalty(m){ return m.penaltyKey ? state.penalty[m.penaltyKey]
  : (cfgOf(m.key).penalty!=null ? cfgOf(m.key).penalty : (m.defaultPenalty!=null ? m.defaultPenalty : (m.direction==='higher'?0:1000))); }
// E2.2 scoring: the 6 keep their own score() closures (scoreFromDir:false); catalog metrics score by direction.
function dirScore(m,x){ if(!isNum(x))return 0; return effDirection(m)==='higher' ? Math.max(0,x) : (x>=0?1/Math.max(x,m.scoreFloor||0.1):0); }   // lower-better: 0 = best (floored); negatives score 0
function scoreOf(m,x){ return m.scoreFromDir ? dirScore(m,x) : m.score(x); }
// module-load integrity (E2.2): the default set must be the 6 in order, reference-identical to the catalog entries.
console.assert(DEFAULT_METRICS.map(m=>m.key).join(',')==='peg,ev,dfcf,pe,mcap,mom','E2 catalog: default set drift');
console.assert(DEFAULT_METRICS.every(m=>METRIC_CATALOG.includes(m)),'E2 catalog: default not reference-identical');

/* ======================================================================
   Strategy: theme cap-weighted metrics -> target weights
   ====================================================================== */
function themeMetric(tickers, getter, penaltyVal, allowZero, nullExcludes){
  // Market-cap weighted ratio across a theme's names:
  //  - valid value           -> used as-is (allowZero=true also accepts 0, e.g. Debt/FCF debt-free = best).
  //  - reported non-positive  -> PENALIZED (replaced by penaltyVal): a real but bad value (e.g. negative EV/EBITDA).
  //  - missing / N-A (null)   -> if nullExcludes, EXCLUDED (metric doesn't apply, e.g. a bank's EV/EBITDA & FCF);
  //                              otherwise PENALIZED (null usually = losses, e.g. no trailing P/E).
  let num=0, den=0, penalized=[], excluded=[];
  for(const s of tickers){
    let v=getter(s); const mc=effMcap(s);
    if(!(isNum(mc)&&mc>0)) continue;                 // no market-cap data -> cannot weight (rare)
    if(!isNum(v)){
      if(nullExcludes || !isNum(penaltyVal)){ excluded.push(s); continue; }   // E2.2 guard: no numeric penalty => exclude (catalog metric)
      v=penaltyVal; penalized.push(s);
    } else if(!(allowZero ? v>=0 : v>0)){
      if(!isNum(penaltyVal)){ excluded.push(s); continue; }                   // E2.2 guard: non-positive but no penalty => exclude
      v=penaltyVal; penalized.push(s);
    }
    num+=v*mc; den+=mc;
  }
  return den>0 ? {value:num/den, penalized, excluded} : {value:null, penalized, excluded};
}

function themeAvgMcap(tickers, getter, penVal, pol){   // simple average market cap; missing => policy (penalize=substitute else exclude)
  getter=getter||effMcap;
  let sum=0, n=0;
  for(const s of tickers){ let v=getter(s);
    if(!(isNum(v)&&v>0)){ if(pol==='penalize'&&isNum(penVal)){ v=penVal; } else continue; }
    sum+=v; n++;
  }
  return n>0 ? sum/n : null;
}
function themeMomentum(tickers, getter, penVal, pol){   // cap-weighted momentum (negatives kept); missing => policy
  getter=getter||momOf;
  let num=0, den=0, excluded=[];
  for(const s of tickers){ let v=getter(s); const mc=effMcap(s);
    if(!(isNum(mc)&&mc>0)) continue;
    if(!isNum(v)){ if(pol==='penalize'&&isNum(penVal)){ v=penVal; } else { excluded.push(s); continue; } }
    num+=v*mc; den+=mc;
  }
  return den>0 ? {value:num/den, excluded} : {value:null, excluded};
}

// Quality carry-over: a name that genuinely can't report a factor (a bank's EV/EBITDA & Debt/FCF) shouldn't
// sit out — it inherits its STANDING on the factors it DOES report. We rank every name on each reported factor
// cross-sectionally, average those percentiles into a composite quality, then impute the missing factor at that
// same percentile of the factor's distribution. So a dominant, cheap name (JPM: low P/E, huge cap) earns a
// favorable imputed EV/EBITDA & Debt/FCF that actively lifts its sector. Returns {sym:{ev?,dfcf?}}.
function computeCarryover(){
  const F={
    peg : s=>{const v=effPeg(s);  return isNum(v)?(v>0?1/v:1/state.penalty.peg):1/state.penalty.peg;},
    pe  : s=>{const v=effPe(s);   return isNum(v)?(v>0?1/v:1/state.penalty.pe ):1/state.penalty.pe ;},
    mcap: s=>{const v=effMcap(s); return isNum(v)&&v>0?Math.log(v/1e9):null;},
    mom : s=>{const v=momOf(s);   return isNum(v)?v:null;},
    ev  : s=>{const v=effEv(s);   return isNum(v)?(v>0?1/v:1/state.penalty.ev):null;},      // null => N/A, impute
    dfcf: s=>{const v=effDfcf(s); return isNum(v)?(v>=0?1/Math.max(v,0.1):1/state.penalty.dfcf):null;}, // null => N/A
  };
  const MEMB=membership();
  const dist={}; Object.keys(F).forEach(k=>{ dist[k]=MEMB.map(F[k]).filter(isNum).sort((a,b)=>a-b); });
  const carryMs = metrics().filter(m=>effBadData(m)==='carry');   // any metric the user set to carry-over (default = ev,dfcf)
  carryMs.forEach(m=>{ if(!dist[m.key]){   // build a goodness distribution for a carry metric not among the 6 quality factors
    const gg=s=>{ const v=m.getter(s); return isNum(v)?(m.direction==='higher'?v:(v>0?1/Math.max(v,m.scoreFloor||0.1):null)):null; };
    dist[m.key]=MEMB.map(gg).filter(isNum).sort((a,b)=>a-b); } });
  const rank=(a,v)=>{ if(a.length<2)return 0.5; let c=0; for(const x of a) if(x<v)c++; return c/(a.length-1); };
  const quant=(a,p)=>{ if(!a.length)return null; const i=clamp(p,0,1)*(a.length-1),lo=Math.floor(i),hi=Math.ceil(i); return a[lo]+(a[hi]-a[lo])*(i-lo); };
  const carry={};
  for(const s of MEMB){
    const ranks=[]; Object.keys(F).forEach(k=>{ const g=F[k](s); if(isNum(g))ranks.push(rank(dist[k],g)); });
    if(!ranks.length) continue;
    const qp=ranks.reduce((a,b)=>a+b,0)/ranks.length;            // composite quality percentile (0..1)
    carryMs.forEach(m=>{ const k=m.key;
      if(!isNum(m.getter(s))){                                   // genuinely missing -> impute at this quality percentile
        const g=quant(dist[k],qp);
        if(isNum(g)&&g>0){ carry[s]=carry[s]||{};
          carry[s][k]= (k==='ev') ? 1/g : (k==='dfcf') ? Math.max(0,1/g) : (m.direction==='higher') ? g : Math.max(0,1/g); }
      }
    });
  }
  return carry;
}

function aliasWeights(wN){ return {wPeg:wN.peg||0, wEv:wN.ev||0, wDf:wN.dfcf||0, wPe:wN.pe||0, wMc:wN.mcap||0, wMo:wN.mom||0}; }  // E2.1: keep flat aliases so existing readers work
function computeAllocation(){
  const M=metrics();                                                               // E2.1: the active metric descriptors (default = the 6, fixed order)
  const wOf=m=>{ const w=state.weights[m.weightKey]; return isNum(w)?w:(m.defaultWeight||0); };   // E2.3: activated catalog metric w/o a weight entry falls back to its defaultWeight
  const wsum = M.reduce((a,m)=>a+wOf(m),0);
  const wN={}; M.forEach(m=>{ wN[m.key]= wsum>0 ? wOf(m)/wsum : 1/M.length; });   // all-zero weights => equal blend (never a 0-sum model that liquidates the book)
  const carry=computeCarryover();   // impute genuinely-N/A factors (bank EV/EBITDA & Debt/FCF) from the name's quality
  const getFor=m=> (effBadData(m)==='carry') ? (s=>{ const v=m.getter(s); return isNum(v)?v:((carry[s]&&isNum(carry[s][m.key]))?carry[s][m.key]:null); }) : m.getter;
  const allRows=themes().map(t=>{ const tk=tickersOf(t.key), row={theme:t};
    M.forEach(m=>{ const pol=effBadData(m), penVal=(pol==='exclude')?undefined:(m.direction==='higher'?0:effPenalty(m));   // penalize/carry: higher-better bad value => 0 (worst); ignore => exclude
      row[m.key] = m.valueKind==='avgMcap'  ? themeAvgMcap(tk, getFor(m), penVal, pol)
                 : m.valueKind==='momentum' ? themeMomentum(tk, getFor(m), penVal, pol)
                 : themeMetric(tk, getFor(m), penVal, m.allowZero, pol!=='penalize'); });
    return row; });
  // E1.4: a theme with no names is "empty" — it scores 0% and is excluded from the model until it has names.
  allRows.forEach(r=>{ if(tickersOf(r.theme.key).length===0){ r.empty=true; r.alloc=0; r.allocRaw=0; } });
  const rows = allRows.filter(r=>!r.empty);   // funded themes only — scored, normalized, capped below
  if(!rows.length){ const byKey={}; allRows.forEach(r=>byKey[r.theme.key]=r);   // all themes empty: nothing to allocate yet
    return Object.assign({rows:allRows, byKey, cap:(state.cap!=null?state.cap:0.3), carry, wByKey:wN, within:{}}, aliasWeights(wN)); }
  const med={}; M.forEach(m=>{ if(m.useMedian) med[m.key]=median(rows.map(r=>m.readValue(r))); });   // theme-level median fill (per metric; not momentum)
  rows.forEach(r=>M.forEach(m=>{ const raw=m.readValue(r); const used=m.useMedian?(isNum(raw)?raw:med[m.key]):raw;
    if(m.useMedian) r[m.key+'Used']=used; r[m.key+'Score']=scoreOf(m,used); }));                      // 6 keep score() closure; catalog metrics score by direction
  const S={}; M.forEach(m=>{ S[m.key]=rows.reduce((a,r)=>a+r[m.key+'Score'],0); });
  rows.forEach(r=>{ M.forEach(m=>{ r[m.key+'N']= S[m.key]>0 ? r[m.key+'Score']/S[m.key] : 1/rows.length; });
    r.alloc = M.reduce((a,m)=>a+wN[m.key]*r[m.key+'N'],0); });                                        // blend in fixed metric order == the old wPeg*pegN + … sum
  const rawT=rows.map(r=>r.alloc);
  const rawSum=rawT.reduce((a,v)=>a+v,0)||1;
  rows.forEach((r,i)=>{ r.allocRaw=rawT[i]/rawSum; });        // the UNBOUNDED model weight, for the UI
  const capEff = (state.cap!=null) ? state.cap : weightBounds(rows.length).hi;   // owner's 1/(n-1)
  const wT=boundedWeights(rawT, state.cap!=null?state.cap:null);
  rows.forEach((r,i)=>{ r.alloc=wT[i]; });
  /* ---- the SAME model, one level down (owner, 2026-08-27) --------------------------------
     Capital used to be split equally between the names inside a theme, which threw away the very
     judgement the model applies BETWEEN themes: two names rated PEG 0.6 and PEG 3.5 got identical
     money. Each name is now scored on its OWN metric values, by the same weights, normalised
     within its theme and bounded by the same 1/(2n) .. 1/(n-1) rule.

     This lives here, inside computeAllocation, rather than in a function of its own, because M,
     wN, carry and getFor are already built above. Rebuilding them elsewhere is how the crumb
     validator and the concurrency cap each ended up fixed in one place and wrong in another. */
  const within={};
  themes().forEach(t=>{
    const tk=tickersOf(t.key);
    if(!tk.length){ within[t.key]={}; return; }
    const perM={};
    M.forEach(m=>{
      const pol=effBadData(m), get=getFor(m);
      const penVal=(m.direction==='higher')?0:effPenalty(m);   // same convention as the theme level
      let vals=tk.map(sym=>{ const v=get(sym);
        return isNum(v) ? v : (pol==='penalize' ? penVal : null); });
      if(m.useMedian){ const med=median(vals.filter(isNum));
        vals=vals.map(v=>isNum(v)?v:med); }                    // fill from the THEME's own median
      perM[m.key]=vals.map(v=>scoreOf(m,v));
    });
    const S={}; M.forEach(m=>{ S[m.key]=perM[m.key].reduce((a,v)=>a+v,0); });
    const raw=tk.map((_,i)=>M.reduce((a,m)=>
      a + wN[m.key]*(S[m.key]>0 ? perM[m.key][i]/S[m.key] : 1/tk.length), 0));
    const w=boundedWeights(raw);
    const o={}; tk.forEach((sym,i)=>{ o[sym]=w[i]; });
    within[t.key]=o;
  });
  const byKey={}; allRows.forEach(r=>byKey[r.theme.key]=r);
  return Object.assign({rows:allRows, byKey, cap:capEff, carry, wByKey:wN, within}, aliasWeights(wN));
}

/* ======================================================================
   Bounded weights - owner's formula, 2026-08-27. Used at BOTH levels: between themes, and
   between the tickers inside one theme. Same scoring, same bounds, one implementation.

     ceiling = 1/(n-1)    3 themes -> 50% each max;  5 tickers -> 25% each max
     floor   = 1/(2n)     3 themes -> 16.67% min;    5 tickers -> 10% min

   Always satisfiable for n >= 2: the floors sum to exactly 1/2 at every n and the ceilings sum to
   n/(n-1) > 1, so there is always precisely half the book left to distribute by score. n === 1 is
   special-cased because 1/(n-1) divides by zero - a lone theme, or a theme holding one name,
   simply takes all of its parent's capital.

   Owner's decision, taken with the trade-off in front of him: the floor is always exactly 0.5x
   equal weight while the ceiling falls from 2x equal at n=2 to 1.05x at n=20, so the model can
   always halve a weak name but its room to reward a strong one shrinks as the basket grows.
   That asymmetry is deliberate - anti-concentration was preferred to symmetry.
   ====================================================================== */
function weightBounds(n){
  if(n<=1) return {lo:0, hi:1};
  return { lo: 1/(2*n), hi: 1/(n-1) };
}
/* raw = each item's model score (>= 0). Returns weights summing to 1, each within the bounds,
   preserving the model's ORDER - a better score is never given less weight than a worse one. */
function boundedWeights(raw, capOverride){
  const n=raw.length;
  if(n===0) return [];
  if(n===1) return [1];
  const b=weightBounds(n), lo=b.lo;
  const hi=(isNum(capOverride)&&capOverride>0&&capOverride<1) ? Math.max(capOverride, 1/n) : b.hi;
  const clean=raw.map(v=>(isNum(v)&&v>0)?v:0);
  const tot=clean.reduce((a,v)=>a+v,0);
  const p = tot>0 ? clean.map(v=>v/tot) : clean.map(()=>1/n);   // an all-zero model falls back to equal
  const w=p.slice(), locked=new Array(n).fill(false);
  for(let guard=0; guard<=n+2; guard++){
    let changed=false;
    for(let i=0;i<n;i++){
      if(locked[i]) continue;
      if(w[i]>hi+1e-12){ w[i]=hi; locked[i]=true; changed=true; }
      else if(w[i]<lo-1e-12){ w[i]=lo; locked[i]=true; changed=true; }
    }
    if(!changed) break;
    const free=[]; let fixed=0;
    for(let i=0;i<n;i++){ if(locked[i]) fixed+=w[i]; else free.push(i); }
    if(!free.length) break;
    const remaining=1-fixed;
    const ps=free.reduce((a,i)=>a+p[i],0);
    free.forEach(i=>{ w[i] = ps>0 ? remaining*p[i]/ps : remaining/free.length; });
  }
  /* Repair, so the caller never has to trust the loop: push any residual onto whichever items
     still have room in the right direction. Feasibility guarantees the room exists. */
  let sum=w.reduce((a,v)=>a+v,0);
  for(let pass=0; pass<3 && Math.abs(sum-1)>1e-9; pass++){
    const need=1-sum;
    const room=w.map(v=> need>0 ? Math.max(0,hi-v) : Math.max(0,v-lo));
    const rt=room.reduce((a,v)=>a+v,0);
    if(rt<=1e-12) break;
    for(let i=0;i<n;i++) w[i] += (need>0?1:-1)*Math.abs(need)*room[i]/rt;
    sum=w.reduce((a,v)=>a+v,0);
  }
  return w;
}

/* ======================================================================
   Portfolio valuation
   ====================================================================== */
function holdings(){ return (state.portfolio&&state.portfolio.holdings)||{}; }
function isInit(){ return !!(state.portfolio&&state.portfolio.holdings&&Object.keys(state.portfolio.holdings).length); }
function curValueBySym(){ const h=holdings(),o={}; tradeUniverse().forEach(s=>{ const sh=h[s]?h[s].shares:0; const p=price(s); o[s]=isNum(p)&&isNum(sh)?sh*p:0; }); return o; }
function curTotal(){ const cv=curValueBySym(); return tradeUniverse().reduce((a,s)=>a+(cv[s]||0),0); }
function curValueByTheme(){ const cv=curValueBySym(),o={}; themes().forEach(t=>o[t.key]=tickersOf(t.key).reduce((a,s)=>a+(cv[s]||0),0)); return o; }
function totalContributed(){ return state.portfolio&&isNum(state.portfolio.totalContributed)?state.portfolio.totalContributed:0; }
/* USER-FOUND 2026-08-27. Day P/L must measure the move over the period you actually OWNED the
   shares. It was Sum(shares x today's change), which credits you with the WHOLE day's move even on
   a position you bought minutes ago. A book built at the close reported +$2,337 for the day while
   its ALL-TIME gain was +$112 - impossible, and the giveaway: nothing bought today can have gained
   more today than it has gained in total.

   The standard intraday formula: value now, minus what the position was worth at the START of the
   day (only the shares you already held, marked at the previous close), minus the net cash you put
   in today. With no trades today the middle term is the whole position and it reduces exactly to
   shares x (price - prevClose) - the previous behaviour, which was right for untouched positions.

   Only checkpoints up to HEAD count: an undone checkpoint is not a trade you made. */
function dayPL(){
  const h=holdings(), today=todayISO(), net={}, cash={};
  versions().slice(0, head()+1).forEach(v=>{
    if(v.date!==today) return;
    (v.trades||[]).forEach(t=>{ if(!t||!t.sym) return;
      net[t.sym]  = (net[t.sym]||0)  + (isNum(t.shares)?t.shares:0);
      cash[t.sym] = (cash[t.sym]||0) + (isNum(t.amount)?t.amount:0); });
  });
  return tradeUniverse().reduce((a,s)=>{
    const px=price(s); if(!isNum(px)) return a;
    const q=state.quotes[s];
    const sh=(h[s]&&isNum(h[s].shares))?h[s].shares:0;
    let pc=(q&&isNum(q.prevClose))?q.prevClose:((q&&isNum(q.change))?px-q.change:null);
    if(!isNum(pc)) return a;                       // no reference price - contribute nothing, do not guess
    const shOpen=sh-(net[s]||0);                   // what you actually held when the day began
    return a + (sh*px - (shOpen*pc + (cash[s]||0)));
  },0);
}
function totalCostBasis(){ const h=holdings(); return Object.keys(h).reduce((a,s)=>a+((h[s]&&isNum(h[s].costBasis))?h[s].costBasis:0),0); }

/* Stamped at commit time by tools/stamp_version.py, which CI runs. "Which build are you on?" is
   the first question any bug report needs, and it is unanswerable without this. */
const APP_VERSION="2026-08-30 a65fa4d";

/* ---- version timeline: undo / redo / revert ----------------------------- */
const MAX_VERSIONS=10;   // E10.1 - the last 10 checkpoints; older ones are dropped on the next write
function deepCopy(x){ return x==null?x:JSON.parse(JSON.stringify(x)); }
function versions(){ return (state.portfolio&&state.portfolio.versions)||[]; }
function head(){ return (state.portfolio&&isNum(state.portfolio.head))?state.portfolio.head:-1; }
function currentVersion(){ const h=head(); return h>=0?versions()[h]:null; }
/* E10.1 - ids start at 1 and only ever increase, so a first id above 1 proves older checkpoints
   have been trimmed away. Undo must then stop at the oldest one we still hold: head === -1 means
   "before the very first build" and WIPES holdings to zero, which becomes a lie - and a total
   data loss - the moment that first build is no longer the first thing in the list. */
function timelineTrimmed(){
  /* MEASURED, not inferred. pushVersion records this the moment it drops a checkpoint. The first
     cut derived it from `versions()[0].id > 1` - true, but resting on ids being intact, and a
     single unusable id made it read "not trimmed", which lets undo walk to head -1 and WIPE
     holdings. The id test stays as a fallback for a document trimmed before this flag existed, and
     now fails SAFE: an id we cannot read counts as trimmed, because the only cost of being wrong
     that way is one unavailable undo step, while being wrong the other way destroys the book. */
  const p=state.portfolio;
  if(p && p.versionsTrimmed) return true;
  const v=versions();
  return !!(v.length && (!isNum(v[0].id) || v[0].id>1));
}
function canUndo(){ return head() > (timelineTrimmed() ? 0 : -1); }
function canRedo(){ return head() < versions().length-1; }
/* A checkpoint restored from a payload that predates ids, or trimmed by E10.1, has no v.id - and
   "#undefined REBALANCE" is what the user was shown. Name it by whatever it actually carries. */
function versionTitle(v){ return v ? (v.label || (isNum(v.id)?("#"+v.id):"") || v.type ||
  v.date || "Checkpoint") : "-"; }
function versionLabel(v){ if(!v) return "—";
  const who = v.label || (isNum(v.id)?("#"+v.id):"") || v.date || "";
  return (who?who+" ":"")+(v.type||"CHECKPOINT")+(v.cashIn?(" +"+money(v.cashIn,0)):""); }
function undoRedoButtons(){ return `<button class="btn sm" data-vaction="undo" ${canUndo()?"":"disabled"}>↶ Undo</button>`+
  `<button class="btn sm" data-vaction="redo" ${canRedo()?"":"disabled"}>↷ Redo</button>`; }
/* E10.2 - a checkpoint records the TRANSACTION and the settings that produced it. It deliberately
   does NOT record the theme list, its membership, or the watchlist. Those are the user's library:
   they are edited freely between checkpoints, and rewinding them threw that work away with no
   warning and no way back - delete a checkpoint-old theme by pressing Undo. See restoreVersion(). */
function snapshotState(){ return { holdings:deepCopy(state.portfolio.holdings), totalContributed:state.portfolio.totalContributed,
  weights:deepCopy(state.weights), penalty:deepCopy(state.penalty), overrides:deepCopy(state.overrides),
  metrics:(state.metrics?state.metrics.map(m=>({key:m.key})):null),
  metricCfg:(state.metricCfg?deepCopy(state.metricCfg):null) }; }   // E2.4 versioned; presets are NOT snapshotted (user library)

function pushVersion(txn){
  const p=state.portfolio; p.versions=p.versions||[]; if(!isNum(p.head))p.head=p.versions.length-1;
  if(p.head < p.versions.length-1) p.versions=p.versions.slice(0,p.head+1);   // apply from a reverted point -> fork (drop redo future)
  txn.id=(p.versions.length?p.versions[p.versions.length-1].id:0)+1;
  txn.snapshot=snapshotState();
  p.versions.push(txn); p.head=p.versions.length-1;
  /* E10.1 - keep only the last MAX_VERSIONS, so the stored document cannot grow without bound.
     `head` is an INDEX, so dropping from the front shifts every index and head has to move with
     it in the SAME operation. This is the only safe place to trim: the fork above plus the push
     mean head is the last index right now, so the trim can never cross it or land mid-fork. */
  if(p.versions.length>MAX_VERSIONS){
    const drop=p.versions.length-MAX_VERSIONS;
    /* Dropping the front of the timeline also destroys the recorded trade prices the value
       chart's equal-weight counterfactual is reconstructed from - it is CUMULATIVE, not
       per-checkpoint. So the surviving window carries them: the last known price per symbol,
       stamped on the oldest retained checkpoint. Every one is a real recorded trade price,
       nothing is estimated, and it is one number per symbol rather than another snapshot. */
    const seed=Object.assign({}, (p.versions[0]&&p.versions[0].pxSeed)||{});
    for(let i=0;i<drop;i++){
      const dv=p.versions[i]; if(!dv) continue;
      (dv.trades||[]).forEach(tr=>{ if(tr&&tr.sym&&isNum(tr.price)) seed[tr.sym]=tr.price; });
    }
    p.versions=p.versions.slice(drop);
    p.head-=drop;
    if(p.versions[0]) p.versions[0].pxSeed=seed;
    p.versionsTrimmed=true;                        // recorded, not inferred - see timelineTrimmed()
  }
}

function restoreVersion(i){
  const p=state.portfolio; p.head=i;
  /* E8 - going back BEFORE the initial build clears what the build created (holdings and
     contributions); it no longer touches the themes. Pre-E8 this wrote `null`, which MEANT "the
     built-in five" - the model was restored, not erased. With no defaults, writing null/[] here
     would erase the user's themes instead, which is both destructive and not what undo means. */
  if(i<0){ p.holdings={}; p.totalContributed=0; state.metrics=null; state.metricCfg=null; rebuildThemeOf(); return; }   // before the initial build
  const s=p.versions[i].snapshot||{};
  p.holdings=deepCopy(s.holdings)||{}; p.totalContributed=isNum(s.totalContributed)?s.totalContributed:0;
  if(s.weights)state.weights=deepCopy(s.weights);
  if(s.penalty)state.penalty=deepCopy(s.penalty);
  if(s.overrides!=null)state.overrides=deepCopy(s.overrides);
  /* E10.2 - themes, membership and the watchlist are NOT restored, by design; older snapshots that
     still carry them are ignored rather than replayed. Holdings that are no longer in any theme come
     back as "Exiting position", which is exactly what the next rebalance should do with them. */
  state.metrics = (Array.isArray(s.metrics)&&s.metrics.length) ? validateMetrics(s.metrics) : null;   // E2.1: reattach by key; null => defaults
  state.metricCfg = (s.metricCfg&&typeof s.metricCfg==='object'&&!Array.isArray(s.metricCfg)) ? deepCopy(s.metricCfg) : null;   // E2.4
  rebuildThemeOf();
}

function migrateVersions(p){   // forward-compat for any legacy file that only had `transactions`
  if(Array.isArray(p.versions)){ if(!isNum(p.head))p.head=p.versions.length-1; return; }
  p.versions=[]; const txns=p.transactions||[]; let h={}, contrib=0;
  txns.forEach(t=>{ (t.trades||[]).forEach(tr=>{ const c=h[tr.sym]||{shares:0,costBasis:0};
      c.shares+=tr.shares||0; c.costBasis+=tr.amount||0; h[tr.sym]=c; });
    contrib+=t.cashIn||0; const v=Object.assign({},t); v.id=p.versions.length+1;
    v.snapshot={holdings:deepCopy(h),totalContributed:contrib,weights:t.weights||deepCopy(state.weights),penalty:deepCopy(state.penalty),overrides:{},metrics:null,metricCfg:null};
    p.versions.push(v); });
  p.head=p.versions.length-1; delete p.transactions;
}

async function undo(){ if(!canUndo())return; const lbl=versionLabel(currentVersion()); restoreVersion(head()-1); const ok=await savePortfolio(); renderAll(); if(ok) toast("Undid "+lbl+" · Redo available"); }
async function redo(){ if(!canRedo())return; restoreVersion(head()+1); const ok=await savePortfolio(); renderAll(); if(ok) toast("Redid "+versionLabel(currentVersion())); }
/* Addressed by IDENTITY, never by position. This took an array INDEX read from data-idx, and
   pushVersion's trim shifts every index while the already-rendered buttons still hold the old ones:
   applyRebalance pushes, then AWAITS the save (up to CLOUD_TIMEOUT_MS), and only then re-renders, so
   there is a real window in which a click reverts to the WRONG checkpoint - and revertTo saves it.
   Ids are stable, already round-trip, and are already what data-vkey and OPEN_VERSIONS use. */
async function revertTo(id){
  const vs=versions(), i=vs.findIndex(v=>v&&String(v.id)===String(id));
  if(i<0){ toast("That checkpoint is no longer available"); renderAll(); return; }
  const tgt=vs[i];
  if(!confirm("Revert to version #"+tgt.id+" ("+tgt.type+" · "+tgt.date+")?\n\nHoldings, total invested and settings will be set to that point. Newer versions stay redoable until you apply a new rebalance from here.")) return;
  /* Re-resolve AFTER the confirm: the dialog is modal to the user, not to the app, and a save that
     was already in flight can trim underneath it. */
  const j=versions().findIndex(v=>v&&String(v.id)===String(id));
  if(j<0){ toast("That checkpoint is no longer available"); renderAll(); return; }
  restoreVersion(j); const ok=await savePortfolio(); renderAll(); if(ok) toast("Reverted to #"+tgt.id); }

/* ======================================================================
   Plan: given cash to add + mode, produce per-stock target $ and trade $
   mode: "full"  -> rebalance fully to target (buys AND sells)
         "cash"  -> deploy only the new cash into underweight names (no sells)
   ====================================================================== */
function planTrades(addCash, mode){
  const alloc=computeAllocation();
  const cv=curValueBySym();
  const U=tradeUniverse();                 // themed names + any held-but-unthemed (to liquidate)
  const M=membership();
  const cur0=U.reduce((a,s)=>a+(cv[s]||0),0);
  const newTotal=cur0+addCash;
  const target={}, trade={}, sharesD={}, missing=[];
  U.forEach(s=>{ target[s]=0; });          // default: not in any theme ⇒ target $0 (sell to zero)
  /* a.alloc is the theme's share of the book; w[s] is the name's share of THAT theme. Both come
     from the same scoring and the same bounds - see computeAllocation. */
  themes().forEach(t=>{ const a=alloc.byKey[t.key]; if(!a)return;
    const w=(alloc.within&&alloc.within[t.key])||{}; const tk=tickersOf(t.key);
    tk.forEach(s=>{ const share=isNum(w[s])?w[s]:(tk.length?1/tk.length:0);
      target[s]=a.alloc*newTotal*share; }); });
  if(mode==="cash"){
    const sf={}; let tot=0;
    U.forEach(s=>{ const v=Math.max(0,(target[s]||0)-(cv[s]||0)); sf[s]=v; tot+=v; });
    U.forEach(s=>{ trade[s]= tot>0 ? addCash*sf[s]/tot : (M.includes(s)?addCash/M.length:0); });
  } else {
    U.forEach(s=>{ trade[s]=(target[s]||0)-(cv[s]||0); });
  }
  U.forEach(s=>{ const p=price(s); if(isNum(p)&&p>0){ sharesD[s]=trade[s]/p; } else { sharesD[s]=null; if(Math.abs(trade[s]||0)>0.005) missing.push(s);} });
  return {alloc, cv, cur0, addCash, newTotal, target, trade, sharesD, mode, missing, universe:U};
}

/* ======================================================================
   Data layer — platform-agnostic.
   WEB (and Windows dev): talk to the local Python server (server.py) —
     GET /api/quotes, /api/fundamentals, GET/POST /api/portfolio.
   iOS (Capacitor native): there is NO server. Hit Yahoo directly via
     CapacitorHttp (no CORS) and persist the portfolio on-device (localStorage).
   Everything above calls loadQuotes/loadFundamentals/loadPortfolio/savePortfolio
   and never cares which platform it is.
   ====================================================================== */
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
function capHttp(){ return window.CapacitorHttp || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) || null; }
const MARKET_TIMEOUT_MS=45000;   // market data via the proxy; the account read uses CLOUD_TIMEOUT_MS
/* E13.4: the proxy requires the session now, so every /api call carries it. This is invisible to
   the user - they sign in exactly as before and the token rides along - and it was verified before
   shipping that a signed-out page makes ZERO /api calls, so nothing depends on anonymous access.

   The retry matters as much as the header. An access token expires while the app sits open, and
   the 60-second poll would otherwise start 401ing forever with nothing on screen to explain it -
   prices would simply stop being true. So a 401 refreshes ONCE and retries, mirroring sbApi. */
async function api(path, opts, _retried){
  // A wedged proxy request must not hang the whole boot: bootSignedIn awaits market data before it
  // paints, so an unanswered /api/quotes left the user staring at empty chrome indefinitely.
  let ctl=null, timer=null;
  /* Its own budget: one /api/fundamentals covers the whole membership against a cold cache, which
     legitimately takes longer than a single-row database read. */
  try{ if("AbortController" in window){ ctl=new AbortController();
        timer=setTimeout(()=>{ try{ ctl.abort(); }catch(e){} },MARKET_TIMEOUT_MS); } }catch(e){}
  try{
    const tok=(typeof sbSession==="object" && sbSession && sbSession.access_token) || null;
    const o=Object.assign({},opts,{signal:ctl?ctl.signal:undefined});
    if(tok) o.headers=Object.assign({}, o.headers||{}, {"Authorization":"Bearer "+tok});
    const r=await fetch(path, o);
    if(r.status===401 && !_retried && typeof sbRefresh==="function"){
      const rr=await sbRefresh();
      if(rr){ if(timer) clearTimeout(timer); return api(path, opts, true); }
    }
    if(!r.ok)throw new Error(path+" "+r.status);
    return await r.json();
  } finally { if(timer) clearTimeout(timer); }
}

/* ---- web (server-backed) ---- */
async function webQuotes(syms){ const d=await api("/api/quotes?symbols="+syms.join(",")); return {quotes:d.quotes, asOf:d.asOf}; }
async function webFundamentals(syms,force){ const d=await api("/api/fundamentals?symbols="+syms.join(",")+(force?"&force=1":"")); return d.fundamentals; }
async function webLoadPortfolio(){ const d=await api("/api/portfolio"); return d.portfolio; }
async function webSavePortfolio(p){ await api("/api/portfolio",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)}); }

/* ---- native (Capacitor / on-device) ---- */
const STORE_KEY="pb_portfolio_v1";
function nativeLoadPortfolio(){ try{ const raw=localStorage.getItem(STORE_KEY); return raw?JSON.parse(raw):null; }catch(e){ return null; } }
function nativeSavePortfolio(p){
  // Must THROW: the native adapter's save is awaited by _savePortfolioInner, which would otherwise
  // return true for a write that never landed (a full localStorage loses the whole rebalance).
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(p)); return true; }
  catch(e){ console.error("save failed",e); throw new Error("this device's storage is full - the change was not saved"); }
}

/* iOS LAN sync: when serverUrl is set, the app reads/writes the SAME portfolio.json the web
   version uses (via the home computer's server over Wi-Fi). Falls back to on-device storage. */
const SRV_KEY="pb_server_url";
function serverBase(){ return (state.serverUrl||"").trim().replace(/\/+$/,""); }
function useRemote(){ return NATIVE && !!serverBase(); }
async function remoteGetPortfolio(){ const Http=capHttp(); const r=await Http.request({url:serverBase()+"/api/portfolio", method:"GET"}); const d=jsonOf(r.data); return d?d.portfolio:null; }
async function remotePutPortfolio(p){
  const Http=capHttp();
  const r=await Http.request({url:serverBase()+"/api/portfolio", method:"POST", headers:{"Content-Type":"application/json"}, data:p});
  // E6 FIX: CapacitorHttp RESOLVES on a non-2xx. Without this the home computer can refuse the
  // write (500, disk full, stale serverUrl path) and the app still reports a successful save.
  const st=r&&r.status;
  // Fail CLOSED: an absent or non-numeric status is not evidence the write landed.
  if(!isNum(st) || st<200 || st>=300) throw new Error("the home computer did not confirm the save (status "+st+")");
}

/* ===== E6.2 — storage adapters =========================================================
   The app has always branched on platform inline inside loadPortfolio/savePortfolio. This
   names each implementation instead, so the account/cloud backend (E6.5) becomes a FOURTH
   entry here and nothing above this line has to change: the engine is pure, the UI only ever
   calls loadPortfolio()/savePortfolio(), and this is the single seam between them.

   Contract for an adapter:
     name    string                     — also used for state.syncStatus
     load()  -> portfolio | null        — may throw; `fallback` decides what happens then
     save(p) -> void                    — may throw
     mirror  boolean (optional)         — iOS LAN sync only: also write the on-device copy
     fallback(): portfolio | null       — iOS LAN sync only; the cloud adapter has none (E9)
   Behaviour is deliberately identical to the pre-E6.2 inline branching.               */
const STORAGE_ADAPTERS={
  cloud:  { name:"cloud",  load:()=>cloudLoadPortfolio(), save:p=>cloudSavePortfolio(p) },   // E9: no local copy
  lan:    { name:"remote", load:remoteGetPortfolio, save:remotePutPortfolio, mirror:true,
            fallback:()=>nativeLoadPortfolio() },
  native: { name:"local",  load:async()=>nativeLoadPortfolio(), save:async p=>nativeSavePortfolio(p) },
  web:    { name:"web",    load:webLoadPortfolio,   save:webSavePortfolio }
};
function storageAdapter(){
  if(typeof signedIn==="function" && signedIn()) return STORAGE_ADAPTERS.cloud;   // E6.5: an account beats local storage
  if(useRemote()) return STORAGE_ADAPTERS.lan;   // iOS + a configured computer URL
  if(NATIVE)      return STORAGE_ADAPTERS.native;
  return STORAGE_ADAPTERS.web;
}

/* ===== E6.1 — document metadata =======================================================
   Stamped on every save so a future server can migrate and can detect concurrent writes.
   schemaVersion : the shape of `data`; bump only on a breaking change.
   revision      : MONOTONIC. E6.5 sends the revision a save was based on and the server
                   rejects it if that no longer matches (optimistic concurrency), which is
                   what stops one device silently overwriting another's rebalance.
   updatedAt     : ISO timestamp of the last successful stamp.
   These are document-level fields, deliberately NOT part of snapshotState(), so they never
   leak into the version timeline.                                                       */
const PORTFOLIO_SCHEMA_VERSION=2;   // 2 = E8: themes AND membership are explicit; there is no default set
function stampPortfolioMeta(p){
  if(!p) return p;
  p.schemaVersion=PORTFOLIO_SCHEMA_VERSION;
  p.revision=(isNum(p.revision)?p.revision:0)+1;
  p.updatedAt=new Date().toISOString();
  return p;
}

/* ===== E6.4 - accounts (Supabase Auth over plain fetch) ================================
   No SDK and no build step: GoTrue is an ordinary REST API and PostgREST is an ordinary
   REST API, so the whole account layer is fetch() calls. Every endpoint below was verified
   against the live project rather than assumed.

   The publishable key is PUBLIC BY DESIGN. It identifies the project, not the user, and
   grants nothing beyond what row-level security permits. The secret key (which carries
   BYPASSRLS) must never appear here. */
const SB_URL="https://uvzxdeiiwswhthfaqhtb.supabase.co";
const SB_KEY="sb_publishable_smrzMSuM7plL-NWtHNt2BA_TJP6_lEY";
const SB_SESSION_KEY="pb_sb_session";

let sbSession=null;                                   // {access_token, refresh_token, expires_at, user}
/* ONE definition of "a session", used by every path that can produce or test one. sbSession had
   two entry points - adopted from an auth response, and loaded from storage - and only adoption
   checked its shape. So a stored session missing user.id booted as signed IN: the gate stayed
   down, sbUserId() was "", and every read and save then threw "not signed in" from the bottom of
   the stack, which the classifier reported as "could not connect / check your connection". The
   cause was a malformed session, the user was blamed on the network, and Try again could never
   work. Validating at the boundary is the fix; classifying the throw better is not. */
function sbValidSession(d){ return !!(d && d.access_token && d.refresh_token && d.user && d.user.id); }
/* USER-FOUND 2026-08-27. Supabase puts the new session in the URL FRAGMENT of a confirmation,
   magic-link or recovery link: #access_token=...&refresh_token=...&type=signup. NOTHING here read
   it. So clicking your own verification link never signed you in - it just opened the app, which
   restored whatever session happened to be cached in that browser. A brand-new user confirming
   their account on a browser where somebody else had been signed in landed in THAT person's
   portfolio. Both halves of the owner's report meet here.

   Order matters: strip the fragment first so the tokens cannot be replayed from history, then end
   whatever session is already here - the person who clicked this link is by definition not the
   person who was signed in - and only then adopt the link's own session. */
/* Set by sbConsumeAuthLink, shown by init once the gate is up. Setting it inline does not work:
   the gate is rendered again later in boot and that render clears the message area, so an accurate
   reason like "Email link is invalid or has expired" was being wiped before anyone saw it. The
   owner's standing rule is that an error must say what actually went wrong. */
let _authLinkError=null;
async function sbConsumeAuthLink(){
  let raw=""; try{ raw=(location.hash||"").replace(/^#/,""); }catch(e){}
  if(!raw) return false;
  const q=new URLSearchParams(raw);
  const err=q.get("error_description")||q.get("error");
  const tok=q.get("access_token"), ref=q.get("refresh_token");
  if(!err && !tok) return false;                       // an ordinary fragment, not an auth callback
  try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){}
  try{ sbSignOut(); }catch(e){}                        // never inherit the previous account
  if(err){ appLocked=true; _authLinkError=err; showGate(true); return true; }
  /* The fragment carries tokens but no user, and sbValidSession requires a user id - so ask who
     this token belongs to. Failing closed here is the point: an unverifiable link must land on
     the gate, never on somebody's portfolio. */
  let user=null;
  try{
    const r=await fetch(SB_URL+"/auth/v1/user",{ headers:{ "apikey":SB_KEY, "Authorization":"Bearer "+tok } });
    if(r.ok){ const u=await r.json(); if(u&&u.id) user=u; }
  }catch(e){}
  if(!user || !ref){
    appLocked=true; _authLinkError="That link could not be verified. Please sign in.";
    showGate(true); return true;
  }
  sbStoreSession({ access_token:tok, refresh_token:ref, user });
  appLocked=false;
  return true;
}
function sbLoadSession(){
  let d=null;
  try{ const raw=localStorage.getItem(SB_SESSION_KEY); d=raw?JSON.parse(raw):null; }catch(e){ d=null; }
  if(d && !sbValidSession(d)){                        // unusable by definition - do not carry it forward
    d=null; try{ localStorage.removeItem(SB_SESSION_KEY); }catch(e){}
  }
  sbSession=d;
  return sbSession;
}
/* E6 FIX (round 6) - this counts CHANGES OF IDENTITY, not session writes.
   It used to bump on every sbStoreSession, and a successful token refresh is one of those. So the
   ordinary returning-user path broke: reload after an hour -> the access token is expired -> the
   portfolio GET 401s -> sbRefresh succeeds (bumping the counter) -> the retry returns the real
   document -> and loadPortfolio's stale() then threw that document away as "a previous session".
   The user saw "No portfolio yet" over a live account, and their first click overwrote the offline
   mirror with a blank book. A refresh keeps you the same person; only signing in or out does not. */
let sbEpoch=0;
function sbStoreSession(sess){
  const _prevUid=(sbSession&&sbSession.user&&sbSession.user.id)||"";
  const _nextUid=(sess&&sess.user&&sess.user.id)||"";
  sbSession=sess||null;
  if(_prevUid!==_nextUid) sbEpoch++;                  // identity changed; a token refresh has not
  try{ if(sess) localStorage.setItem(SB_SESSION_KEY, JSON.stringify(sess));
       else localStorage.removeItem(SB_SESSION_KEY); }catch(e){}
}
/* E6 FIX - a refresh_token is REQUIRED. Every real session carries one (the password grant always
   returns it), so demanding it costs nothing - and it removes the trivially-forged
   {"access_token":"x"} localStorage entry that used to take the gate down and then serve whatever
   was sitting in that uid's offline mirror. */
function signedIn(){ return sbValidSession(sbSession); }   // the same test everywhere, user.id included
function sbUserEmail(){ return (sbSession&&sbSession.user&&sbSession.user.email)||""; }
function sbUserId(){ return (sbSession&&sbSession.user&&sbSession.user.id)||""; }

/* ===== Turnstile =============================================================================
   The site key is PUBLIC by design - it ships in the page and identifies the widget. The secret
   lives only in Supabase, which is what actually verifies the solved token.

   Supabase enforces this server-side the moment captcha protection is switched on: signup, sign-in
   and password recovery are rejected with captcha_failed until a token is supplied. Refresh is NOT
   covered, which matters - existing sessions keep renewing while this is deployed, so switching it
   on breaks new sign-ins only, never people already signed in. Verified against the live project
   rather than assumed. */
const TURNSTILE_SITE_KEY="0x4AAAAAAEiWIkOddcvroWq7";
let _tsWidget=null, _tsToken="";
/* Called by the script's own onload AND by showGate, because either can happen first: the script
   is async, and the gate may be raised before or after it lands. Rendering twice is prevented by
   the _tsWidget guard rather than by assuming an order. */
/* The site key is bound to the deployed hostname, so on a dev server Turnstile can only fail -
   error 110200, plus a 400 in the console that shows up as noise in every harness run. Adding
   localhost to the widget's allowed hostnames would weaken the binding on the LIVE key to buy a
   local sign-in that Supabase would reject anyway: it holds the real secret, which will not
   validate a token issued for another hostname. So do not render it where it cannot work, and say
   plainly why sign-in stops here rather than showing a challenge that can never be solved. */
/* Split out as a pure function of the hostname so it can be tested against many values. This one
   decides whether production has ANY bot protection: if it wrongly answered "no" on pages.dev the
   widget would never render, Supabase would reject every sign-in for a missing token, and the app
   would be locked. Too important to leave resting on an untestable read of location. */
function captchaAvailableFor(host){
  const h=String(host||"").toLowerCase();
  return !(h==="localhost" || h==="127.0.0.1" || h==="::1" || h==="[::1]" || h===""
           || h.endsWith(".localhost"));
}
function captchaAvailable(){ return captchaAvailableFor(location.hostname); }
function captchaEnsure(){
  if(!captchaAvailable()) return true;      // nothing to render, and nothing to keep retrying
  if(_tsWidget!==null) return true;
  if(!window.turnstile) return false;
  const el=$("#gateCaptcha"); if(!el) return false;
  try{
    _tsWidget=window.turnstile.render(el,{
      sitekey:TURNSTILE_SITE_KEY,
      callback:t=>{ _tsToken=t||""; },
      "expired-callback":()=>{ _tsToken=""; },      // tokens expire in ~5 minutes
      "error-callback":()=>{ _tsToken=""; }
    });
  }catch(e){ console.error("turnstile render",e); return false; }
  return true;
}
/* Neither single trigger is reliable, which cost a deploy to find out. The script is async, so its
   onload can fire BEFORE captchaEnsure exists; and showGate's call sits behind a "was it hidden"
   branch that is false on the very first load, because the gate markup carries no hidden attribute.
   On prod both missed and the widget never appeared - with no error, because nothing had failed.
   So: try on boot, and keep trying briefly until the script lands. A sign-in box that cannot render
   its own challenge is not a degraded experience, it is a locked door. */
function captchaBoot(){
  let tries=0;
  const go=()=>{ if(captchaEnsure()) return; if(++tries>50) return; setTimeout(go,200); };  // ~10s
  go();
}
/* A solved token is single-use. Not resetting after an attempt means the SECOND sign-in try fails
   with a confusing captcha error rather than the real reason. */
function captchaReset(){
  _tsToken="";
  try{ if(_tsWidget!==null && window.turnstile) window.turnstile.reset(_tsWidget); }catch(e){}
}
/* Sign-in, signup and recovery need it. Refresh must NOT be given one: there is no user present to
   solve a challenge, and Supabase does not ask for it there. */
function captchaRequired(path){
  return path==="signup" || path==="recover" || path==="token?grant_type=password"
      || path.indexOf("magiclink")===0 || path.indexOf("otp")===0;
}
async function sbAuth(path, body, method){
  /* The same reason sbApi has one: a black-holed connection would otherwise leave the SIGN-IN
     button disabled and reading "Working..." forever, with the Enter key gated on that same
     disabled flag - no route out but a reload, on the very first interaction anyone has. */
  let ctl=null, timer=null, timedOut=false;
  try{ if("AbortController" in window){ ctl=new AbortController();
        timer=setTimeout(()=>{ timedOut=true; try{ ctl.abort(); }catch(e){} },CLOUD_TIMEOUT_MS); } }catch(e){}
  /* Attached HERE, not at the three call sites, so a future auth call cannot forget it - the
     failure this codebase keeps producing is one fact with several readers and only one taught. */
  if(captchaRequired(path)){
    captchaEnsure();
    if(!_tsToken){
      throw new Error(!captchaAvailable()
        ? "Sign-in only works on the deployed site — the human check is tied to that hostname."
        : (window.turnstile
            ? "Complete the “I am human” check below, then try again."
            : "The human-verification widget could not load. Check your connection or any content blocker, then reload."));
    }
    body=Object.assign({}, body, { gotrue_meta_security:{ captcha_token:_tsToken } });
  }
  let r;
  try{
    r=await fetch(SB_URL+"/auth/v1/"+path,{ method:method||"POST",
      headers:{ "apikey":SB_KEY, "Content-Type":"application/json" },
      body: body?JSON.stringify(body):undefined, signal:ctl?ctl.signal:undefined });
  }catch(fe){
    const e=new Error(timedOut ? "the sign-in service did not respond - check your connection and try again"
                               : "could not reach the sign-in service - check your connection");
    e.transient=true; throw e;
  }finally{ if(timer) clearTimeout(timer); }
  let d=null; try{ d=await r.json(); }catch(e){}
  if(!r.ok){ const msg=(d&&(d.msg||d.error_description||d.message))||("HTTP "+r.status);
             const err=new Error(msg); err.status=r.status; err.code=d&&d.error_code; throw err; }
  return d;
}
function sbAdoptSession(d){
  // E6 FIX: must match signedIn(). Storing a session with no refresh_token produced a TRUTHY
  // return that sent sbApi down its retry path, where it exited through the plain "not signed in"
  // throw - no authFailed marker, no lockOut, gate still down, adapter silently identity-free.
  /* ...and a user. Without one sbUserId() is "", every read and save throws "not signed in", and
     the app reports an unreachable account for what is really a malformed session. */
  if(!sbValidSession(d)) return null;
  const sess={ access_token:d.access_token, refresh_token:d.refresh_token,
    expires_at: Math.floor(Date.now()/1000)+(isNum(d.expires_in)?d.expires_in:3600),
    user:d.user||null };
  sbStoreSession(sess); return sess;
}
async function sbSignIn(email,password){
  return sbAdoptSession(await sbAuth("token?grant_type=password",{email,password}));
}
async function sbSignUp(email,password){
  const d=await sbAuth("signup",{email,password});
  // With "Confirm email" on, signup returns a user but NO session until the link is clicked.
  return { session: sbAdoptSession(d), needsConfirmation: !(d&&d.access_token) };
}
async function sbRecover(email){ return sbAuth("recover",{email}); }
async function sbSignOut(){
  /* E6 FIX - local teardown FIRST, remote revoke fire-and-forget. Awaiting an untimed fetch meant
     that on a paused project or a captive portal the logout pended for minutes: the session stayed
     valid, the portfolio stayed on screen and the price timer kept running, while the user had
     walked away believing they had signed out. */
  const tok=sbSession && sbSession.access_token;
  appLocked=true;                       // set HERE, not only in the click handler, so no queued save slips through
  sbStoreSession(null);
  clearAccountState();
  if(tok){
    try{
      const ctl=("AbortController" in window)?new AbortController():null;
      if(ctl) setTimeout(()=>{ try{ ctl.abort(); }catch(e){} },4000);
      fetch(SB_URL+"/auth/v1/logout",{ method:"POST", signal:ctl?ctl.signal:undefined,
        headers:{ "apikey":SB_KEY, "Authorization":"Bearer "+tok } }).catch(()=>{});
    }catch(e){}
  }
}
/* E6 FIX - signing out previously left the account's portfolio in memory. Signing in to a DIFFERENT,
   empty account then found a book "already open" and offered to import it, so one person's holdings
   could be uploaded into another person's account. Everything session-scoped is dropped here. */
function clearAccountState(){
  state.portfolio=null; state.baseRevision=null; state.syncStatus=null; state.syncError=null; state.syncFailure=null;
  state.docSource=null; state.docOwner=null; state.cloudRowExists=null;
  state.themeTickers={}; state.themes=[]; state.watchlist=[];
  state.metrics=null; state.metricCfg=null; state.overrides={};
  /* These are account data too. Leaving them behind meant the NEXT person to sign in on this
     browser wrote the previous person's preset library, weights, penalties and cap into their
     own brand-new account on its very first save. */
  state.presets=[];
  state.weights=Object.assign({},DEFAULT_CONFIG.weights);
  state.penalty=Object.assign({},DEFAULT_CONFIG.penalty);
  state.cap=null; state.computeFromStatements=true;
  // market data is keyed by the previous account's tickers - it is their data too
  state.quotes={}; state.pulled={}; state.statements={}; state.screenerQuotes={};
  state.metricSource={}; state.asOf=null;
  state.fundamentals={}; state.themeRecos={}; state.screenerLoaded=false;   // derived from the above
  /* The SEARCH BOX is account data on screen. Everything above clears the model; this clears what
     is actually rendered, which is what the next person on this browser would otherwise read. */
  try{ const q=$("#resQuery"); if(q) q.value="";
       const rr=$("#resResults"); if(rr) rr.innerHTML="";
       const rc=$("#resClear"); if(rc) rc.hidden=true;
       const wl=$("#watchlist"); if(wl) wl.innerHTML="";
       const sb=$("#screenerBody"); if(sb) sb.innerHTML=""; }catch(e){}
  try{ rebuildThemeOf(); }catch(e){}
  try{ renderSyncBadge(); }catch(e){}   // the badge is account state too - it must not survive sign-out
}
function stopAutoRefresh(){ if(timer){ clearInterval(timer); timer=null; } }
/* E6 FIX - clearAccountState() nulls docSource/docOwner, which are exactly what the save guards
   read. A save already queued behind the failing one therefore woke up with no evidence of where
   its document belonged, rebuilt a BLANK portfolio, and wrote it to the identity-free store.
   This flag does not depend on any state the wipe touches. */
let appLocked=false;
/* Separate from appLocked because loadPortfolio must still RUN during boot while saving is
   forbidden. Without this, a reload left the app live and unlocked with state.portfolio===null and
   docSource===null for the seconds the load took - long enough for a keyboard-reachable
   "Reset portfolio" to write a blank document into the real user's mirror. */
let booting=true;
/* E6 FIX - the single way the app returns to the locked state. Previously a session could die
   mid-use (revoked/expired refresh token, paused project) and NOTHING re-gated: the adapter
   quietly fell through to the identity-free `web`/`native` store and the next save wrote the
   account's portfolio over the shared server file, or over the device's only local book. */
function lockOut(msg){
  appLocked=true;
  /* USER-FOUND 2026-08-27. Every DELIBERATE exit - the Sign out button, Delete account - called
     sbSignOut() before lockOut(). The IDLE TIMEOUT called lockOut() alone, so the one path whose
     entire purpose is security left the token sitting in localStorage: the gate went up, the
     message said "Signed out after 5 minutes of inactivity", and the very next page load restored
     that session and walked straight back in. A lock that depends on each caller remembering to
     sign out separately is not a lock, so the session now ends HERE. sbSignOut's local teardown is
     synchronous and its remote revoke is fire-and-forget, so this does not delay the gate; calling
     it twice is harmless because the second call finds no token. */
  try{ sbSignOut(); }catch(e){}
  /* E6 FIX - a modal open at lock-out used to SURVIVE behind the gate (z-index 400 vs 80) with
     live handlers closing over the previous account's data, and be revealed again by the next
     showGate(false). The import modal's "Start fresh" would then overwrite the NEXT user's row.
     The guided tour had exactly the same problem: its elements live on <body>, so the gate hid
     them without removing them, and the next user was shown the previous user's bubble mid-tour -
     whose Done button then wrote "seen" against the NEW account. */
  try{ closeModal(); }catch(e){}
  try{ coachEnd(); }catch(e){}
  clearAccountState();
  stopAutoRefresh();
  stopIdleWatch();                     // the idle clock is account state too
  try{ renderAll(); }catch(e){}        // wipe the previous account's numbers off the screen
  try{ renderAcctBtn(); }catch(e){}
  showGate(true);
  if(msg) gateMsg("err",msg);
}
async function sbRefresh(){
  if(!sbSession||!sbSession.refresh_token) return {ok:false,definitive:true};
  try{
    const sess=sbAdoptSession(await sbAuth("token?grant_type=refresh_token",{refresh_token:sbSession.refresh_token}));
    return sess ? {ok:true,session:sess} : {ok:false,definitive:true};
  }
  catch(e){
    /* E6 FIX - only a DEFINITIVE rejection may destroy the session. Clearing it on any error meant
       a network blip or a paused backend signed the user out mid-session, which is exactly the
       situation the offline fallback exists to survive.
       The lock-out itself is NOT done here: sbApi owns it, so that the "no refresh token at all"
       early return above cannot skip it. */
    /* E6 FIX - the caller must be able to TELL THE DIFFERENCE. Returning null for both outcomes
       made this whole distinction dead code: sbApi only tested truthiness, so a transient failure
       (waking from sleep, captive portal, 429, 5xx) fell straight through to the definitive
       lock-out two lines later and signed the owner out - precisely what this guards against. */
    const definitive = e && (e.status===400 || e.status===401);
    if(definitive) sbStoreSession(null);
    else console.warn("token refresh failed transiently - keeping the session", e && e.message);
    return {ok:false, definitive:!!definitive};
  }
}
/* Any authenticated call goes through here: it refreshes ONCE on a 401 and retries, so an
   expired access token is invisible to the caller instead of surfacing as a failed save. */
const CLOUD_TIMEOUT_MS=15000;   // a request that never answers must become an error, not silence
async function sbApi(path, opts, _retried){
  opts=opts||{};
  if(!signedIn()){ const e=new Error("not signed in"); e.authFailed=true; throw e; }
  const epoch=sbEpoch;                                // whose session this request belongs to
  const headers=Object.assign({ "apikey":SB_KEY, "Authorization":"Bearer "+sbSession.access_token },opts.headers||{});
  /* Without this the app can wait forever on a blackholed connection and say NOTHING - the user
     stares at a loading screen with no error and no idea whether their data is safe. A refused
     connection rejects immediately; one that is silently dropped does not. */
  let ctl=null, timer=null, timedOut=false;
  try{ if("AbortController" in window){ ctl=new AbortController();
        timer=setTimeout(()=>{ timedOut=true; try{ ctl.abort(); }catch(e){} },CLOUD_TIMEOUT_MS); } }catch(e){}
  let r;
  try{
    r=await fetch(SB_URL+path, Object.assign({},opts,{headers, signal:ctl?ctl.signal:undefined}));
  }catch(fe){
    if(timedOut){ const e=new Error("your account did not respond"); e.timeout=true; throw e; }
    // A network-layer rejection: offline, DNS, connection refused, CORS.
    const e=new Error("could not reach your account");
    e.offline = (typeof navigator!=="undefined" && navigator.onLine===false);
    e.network = true; throw e;
  }finally{ if(timer) clearTimeout(timer); }
  /* 403 counts: PostgREST answers 403 when the token is valid but row-level security refuses the
     row - which is the server saying "not you" just as plainly as a 401. Treating it as an outage
     let a revoked user keep reading their account from the offline mirror. */
  if(r.status===401 || r.status===403){
    /* E6 FIX - a reply belonging to a PREVIOUS session must not touch the CURRENT one. Without
       this, a slow request left over from user A landed after user B signed in and either
       replayed A's write under B's token or force-signed-out B, wiping their state. */
    if(epoch!==sbEpoch){ const e=new Error("a reply from a previous session was discarded"); e.stale=true; throw e; }
    if(r.status===401 && !_retried){
      const rr=await sbRefresh();
      if(rr.ok) return sbApi(path,opts,true);
      if(!rr.definitive){                             // an OUTAGE, not a rejection: keep the session
        const e=new Error("could not reach the sign-in service"); e.transient=true; throw e;
      }
    }
    /* E6 FIX - a 401 we cannot refresh is the ONE definitive "you are not this user any more".
       Every route to it converges here: an expired/rotated/revoked refresh token, and the case
       where the stored session carries no refresh token at all (sbRefresh returns early, so a
       lock-out placed inside its catch would have been skipped - which let a forged session run
       on, unauthenticated, displaying the previous account's offline mirror).
       The thrown error is marked so callers know this was a REJECTION, not an outage. */
    /* NOT every 401/403 is "you are not this user". PostgREST answers 42501 - "permission denied
       for table" - when the TABLE's grants or policies are wrong, which is a server-side
       misconfiguration (a migration deployed without its GRANT, say), not an identity problem.
       Classifying that as a rejection would destroy a perfectly good session, gate the user, and
       tell them to sign in again - which would succeed at the auth service and then fail
       identically on the next read. Every user, in a loop, blaming their own credentials.
       So: read the body once and let the server say which it is. */
    let code="", msg="";
    try{ const d=await r.clone().json(); code=(d&&(d.code||d.error_code))||""; msg=(d&&(d.message||d.msg))||""; }catch(e2){}
    if(code==="42501" || /permission denied/i.test(msg)){
      const cfg=new Error("the portfolio service is misconfigured (permission denied) - your sign-in is fine");
      cfg.serviceError=true; cfg.status=r.status;
      console.error("PostgREST refused the table itself (42501). This is a grants/policy problem on the "+
                    "database, not a session problem - check the migration in sql/.");
      throw cfg;                                    // session left intact; the user is not gated
    }
    sbStoreSession(null);
    try{ purgeLegacyLocalCopies(); }catch(e2){}   // E9: nothing of theirs stays on this device
    const err=new Error("your session is no longer valid"); err.authFailed=true; err.status=r.status;
    try{ lockOut("Your session is no longer valid. Please sign in again."); }catch(e2){}
    throw err;
  }
  return r;
}
/* One place that turns a failure into words. Every branch names a DIFFERENT cause and says who can
   do something about it, because "something went wrong" is not information anybody can act on. */
function describeCloudFailure(e){
  const d=(short,detail,act,ours)=>({short,detail,act,ours:!!ours});
  if(!e) return d("unknown problem","Something went wrong reaching your account.","Reload to try again.");
  if(e.serviceError) return d("service misconfigured",
      "The database refused this app's request outright (permission denied). Your sign-in is fine.",
      "Nothing you can do - this needs fixing on our side.", true);
  if(e.authFailed)   return d("signed out","Your session is no longer valid.","Sign in again.");
  if(e.emptyRow)     return d("account row is empty",
      "Your account has a record but no portfolio inside it.",
      "Nothing you can do - this needs fixing on our side.", true);
  if(e.notInSync)    return d("out of sync",
      "This device does not know your account's current version, so it will not risk overwriting it.",
      "Reload to pick up the latest, then make the change again.");
  if(e.timeout)      return d("no response",
      "Your account did not respond within "+Math.round(CLOUD_TIMEOUT_MS/1000)+" seconds.",
      "Check your connection and reload.");
  if(e.offline)      return d("no connection","This device appears to be offline.","Reconnect and reload.");
  if(e.network)      return d("could not connect",
      "The account service could not be reached from this device.","Check your connection and reload.");
  if(isNum(e.status)){
    if(e.status===429) return d("too many requests","The service is rate-limiting requests right now.",
        "Wait a minute, then reload.");
    if(e.status>=500)  return d("service error","The database service returned an error (HTTP "+e.status+").",
        "This is usually temporary - reload in a moment.");
    if(e.status===404) return d("not found","The app asked the database for something that is not there (HTTP 404).",
        "Nothing you can do - this needs fixing on our side.", true);
    return d("refused (HTTP "+e.status+")","The database refused the request (HTTP "+e.status+").",
        "Reload; if it keeps happening this needs fixing on our side.", true);
  }
  return d("could not connect","Your account could not be reached.","Check your connection and reload.");
}

/* ===== E6.5 - cloud storage adapter ====================================================
   The FOURTH entry in the registry above. The engine and UI are untouched: this only has to
   satisfy the same load()/save() contract as the other three.

   Concurrency: the row's `revision` column is authoritative and is kept equal to the
   document's own revision (stamped by E6.1). A save PATCHes filtered on the revision it was
   based on; ZERO rows affected means somebody else wrote first - that is the conflict, and
   it is surfaced to the user, never merged. */
const CLOUD_TABLE="/rest/v1/portfolios";
/* E8 - the adapter RETURNS what it learned; it never reaches into shared state. A module-level
   "meta" global was the previous compromise, and two loads resolving in the same microtask batch
   could read each other's - which would stamp a revision that does not match the document on
   screen, and the next PATCH would then match and silently overwrite a newer document. The
   revision now travels ON the reply, so it cannot be crossed with another one.
   `null` (no row) needs no carrier: loadPortfolio reads it as revision 0 / rowExists false. */
const CLOUD_META="__pbMeta";
async function cloudLoadPortfolio(){
  const uid=sbUserId(); if(!uid){ const e=new Error("not signed in"); e.authFailed=true; throw e; }   // signed out mid-flight
  const r=await sbApi(CLOUD_TABLE+"?user_id=eq."+encodeURIComponent(uid)+"&select=data,revision,schema_version&order=revision.desc&limit=1",
    { headers:{ "Accept":"application/json" } });
  if(!r.ok){ const e=new Error("cloud load failed: HTTP "+r.status); e.status=r.status; throw e; }   // status carried so it can be described accurately
  const rows=await r.json();
  if(!rows||!rows.length) return null;                 // no row yet - the first save creates it
  const row=rows[0], p=row.data||null;
  // Present but empty: permanent, and ours - not a transient 500 the user should retry.
  if(!p){ const e=new Error("your account row exists but holds no portfolio"); e.emptyRow=true; throw e; }
  if(p && isNum(row.revision)) p.revision=row.revision; // the row column is the source of truth
  if(p) try{ Object.defineProperty(p,CLOUD_META,{ value:{ revision:isNum(row.revision)?row.revision:0, rowExists:true },
                                                  enumerable:false, configurable:true }); }catch(e){}
  return p;
}
async function cloudSavePortfolio(p){
  const uid=sbUserId(); if(!uid){ const e=new Error("not signed in"); e.authFailed=true; throw e; }   // signed out mid-flight
  /* E6 FIX - the concurrency base must be the revision the SERVER last confirmed, not
     (document revision - 1). Deriving it from the document assumed every previous save landed,
     so one failed save desynced them permanently and every later save looked like a conflict on
     a device that was never contended.
     And if the confirmed base is unknown, REFUSE. The old fallback to
     (document revision - 1); after an offline edit the mirror's revision is server+1, so that
     guess produced a base equal to the server's revision and a stale document then matched the
     PATCH filter and overwrote a newer one. An unknown base means "reload first", never "guess". */
  if(!isNum(state.baseRevision))
    { const e=new Error("this device is not in sync with your account - reload the page before saving"); e.notInSync=true; throw e; }
  const base=state.baseRevision;
  const next=base+1;
  p.revision=next;                                      // keep the document consistent with the write
  const payload={ data:p, revision:next, schema_version:isNum(p.schemaVersion)?p.schemaVersion:1 };
  const r=await sbApi(CLOUD_TABLE+"?user_id=eq."+encodeURIComponent(uid)+"&revision=eq."+base,
    { method:"PATCH", headers:{ "Content-Type":"application/json", "Prefer":"return=representation" },
      body: JSON.stringify(payload) });
  if(r.ok){
    const rows=await r.json();
    if(rows && rows.length){                            // updated cleanly
      const rev=rows[0] && rows[0].revision;
      return { revision:isNum(rev)?rev:next, rowExists:true };   // E8: reported, not assigned
    }
    // Zero rows: either no row exists yet, or someone else wrote. Distinguish them.
    const probe=await sbApi(CLOUD_TABLE+"?user_id=eq."+encodeURIComponent(uid)+"&select=revision&limit=1");
    // E6 FIX: a FAILED probe is not evidence that the row is absent. Collapsing it to [] fell
    // through to the INSERT path against a live row (which the user_id primary key then rejects
    // with a 409 reported as a network problem, so the losing edit was never stashed).
    if(!probe.ok){ const e=new Error("cloud save failed: could not verify the account row"); e.status=probe.status; throw e; }
    const existing=await probe.json();
    if(existing && existing.length){
      const err=new Error("This account was changed on another device.");
      err.conflict=true; err.serverRevision=existing[0].revision; throw err;
    }
  }
  if(!r.ok){                                          // a non-2xx PATCH is a real error, not "no row yet"
    const t=await r.text();
    { const e=new Error("cloud save failed: "+t.slice(0,120)); e.status=r.status; throw e; }
  }
  const ins=await sbApi(CLOUD_TABLE,
    { method:"POST", headers:{ "Content-Type":"application/json", "Prefer":"return=representation" },
      body: JSON.stringify(Object.assign({user_id:uid},payload)) });
  if(!ins.ok){ const t=await ins.text(); const e=new Error("cloud save failed: "+t.slice(0,120)); e.status=ins.status; throw e; }
  let irev=next;
  try{ const irows=await ins.json(); const v=irows&&irows[0]&&irows[0].revision; if(isNum(v)) irev=v; }catch(e){}
  return { revision:irev, rowExists:true };         // E8: reported, not assigned
}
const YUA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
let _crumb=null;
function jsonOf(d){ return typeof d==="string"?JSON.parse(d):d; }
function rv(d,k){ const x=d&&d[k]; return (x&&typeof x==="object"&&("raw" in x))?x.raw:x; }
async function yGet(url, params){
  const Http=capHttp();
  // CapacitorHttp requires string param values; a number (e.g. E3 period1/period2, search counts)
  // crashes the native layer ("NSCFNumber cannot be cast to NSString"). Coerce everything to string.
  const sp={}; if(params){ for(const k in params){ if(params[k]!=null) sp[k]=String(params[k]); } }
  if(Http){ return Http.request({url, method:"GET", params:sp, headers:{"User-Agent":YUA, "Accept":"application/json,text/plain,*/*"}}); }
  const qs=Object.keys(sp).length?("?"+new URLSearchParams(sp).toString()):""; const r=await fetch(url+qs); return {status:r.status, data:await r.text()};
}
async function yEnsureCrumb(force){
  if(_crumb && !force) return _crumb;
  try{ await yGet("https://fc.yahoo.com/"); }catch(e){}
  try{ const r=await yGet("https://query2.finance.yahoo.com/v1/test/getcrumb");
       /* A crumb is a short token with NO WHITESPACE. Without that test an error body passes:
          a throttled edge returns "Edge: Too Many Requests" (23 chars, no "<"), which was then
          sent as ?crumb= and made every later call fail for a reason that looks nothing like
          throttling. Same fix as server.py's ensure_session - these two must stay in step, and
          the Cloudflare Worker port inherits this function. */
       const c=String(typeof r.data==="string"?r.data:"").trim();
       _crumb=(c && c.indexOf("<")<0 && c.length<40 && !/\s/.test(c))?c:null; }
  catch(e){ _crumb=null; }
  return _crumb;
}
/* Yahoo's v10 and timeseries endpoints take ONE symbol each, so the fan-out is forced - the
   CONCURRENCY is not. Promise.all(syms.map(...)) fired every request at once: 25 holdings meant 25
   simultaneous calls, and bursts draw throttling far more readily than steady volume. 4 matches
   server.py's thread pools and yahoo-finance2's published cap, the only concrete number either
   major client library commits to. This governs the native path today and the Cloudflare Worker
   port inherits it. */
const Y_CONCURRENCY = 4;
async function yMapLimit(items, fn){
  const queue = items.slice();
  const workers = [];
  for(let w=0; w<Math.min(Y_CONCURRENCY, queue.length); w++){
    workers.push((async()=>{ while(queue.length){ await fn(queue.shift()); } })());
  }
  await Promise.all(workers);
}
function jsMomentum(price,ma50,ma200){ if(!(isNum(price)&&price>0))return null; const parts=[];
  if(isNum(ma50)&&ma50>0)parts.push([0.6,price/ma50-1]); if(isNum(ma200)&&ma200>0)parts.push([0.4,price/ma200-1]);
  if(!parts.length)return null; return parts.reduce((a,p)=>a+p[0]*p[1],0)/parts.reduce((a,p)=>a+p[0],0); }
async function nativeQuotes(syms){
  const crumb=await yEnsureCrumb(); const out={};
  const fields="regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,marketCap,shortName,longName,marketState,currency,regularMarketTime,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketVolume,averageDailyVolume3Month,averageDailyVolume10Day,quoteType";
  for(let i=0;i<syms.length;i+=40){
    const chunk=syms.slice(i,i+40);
    try{
      const r=await yGet("https://query1.finance.yahoo.com/v7/finance/quote",{symbols:chunk.join(","), fields, crumb:crumb||""});
      const results=((jsonOf(r.data)||{}).quoteResponse||{}).result||[];
      results.forEach(q=>{ const sym=q.symbol; if(!sym)return; out[sym]={price:rv(q,"regularMarketPrice"),change:rv(q,"regularMarketChange"),changePct:rv(q,"regularMarketChangePercent"),prevClose:rv(q,"regularMarketPreviousClose"),marketCap:rv(q,"marketCap"),name:q.shortName||q.longName||sym,marketState:q.marketState,currency:q.currency,quoteType:q.quoteType,time:rv(q,"regularMarketTime"),
        high52:rv(q,"fiftyTwoWeekHigh"),low52:rv(q,"fiftyTwoWeekLow"),vol:rv(q,"regularMarketVolume"),avgVol:rv(q,"averageDailyVolume3Month")||rv(q,"averageDailyVolume10Day"),   // watchlist table (Screener)
        source:"live"}; });
    }catch(e){ console.error("yahoo quotes",e); await yEnsureCrumb(true); }
  }
  return {quotes:out, asOf:Math.floor(Date.now()/1000)};
}
async function nativeFundamentals(syms){
  const crumb=await yEnsureCrumb(); const out={};
  await yMapLimit(syms, async sym=>{
    try{
      const r=await yGet("https://query1.finance.yahoo.com/v10/finance/quoteSummary/"+encodeURIComponent(sym),{modules:"defaultKeyStatistics,price,financialData,summaryDetail", crumb:crumb||""});
      const res=jsonOf(r.data).quoteSummary.result[0];
      const ks=res.defaultKeyStatistics||{}, pr=res.price||{}, fd=res.financialData||{}, sd=res.summaryDetail||{};
      let peg=rv(ks,"trailingPegRatio"); if(peg==null)peg=rv(ks,"pegRatio");
      const mc=rv(pr,"marketCap"), price=rv(pr,"regularMarketPrice"), td=rv(fd,"totalDebt")||0, cash=rv(fd,"totalCash")||0;
      const fcf=rv(fd,"freeCashflow"); let dfcf; if(fcf==null)dfcf=null; else if(fcf>0)dfcf=td/fcf; else dfcf=-1.0;
      let pe=rv(sd,"trailingPE"), peCalc=false; if(pe==null){ const ni=rv(ks,"netIncomeToCommon"); if(mc&&isNum(ni)&&ni>0){pe=mc/ni;peCalc=true;} }
      let ev=rv(ks,"enterpriseToEbitda"), evCalc=false; if(ev==null){ const ebitda=rv(fd,"ebitda"); if(mc&&isNum(ebitda)&&ebitda!==0){ev=(mc+td-cash)/ebitda;evCalc=true;} }
      const mom=jsMomentum(price, rv(sd,"fiftyDayAverage"), rv(sd,"twoHundredDayAverage"));
      let fwdpe=rv(sd,"forwardPE"); if(fwdpe==null)fwdpe=rv(ks,"forwardPE");
      let dyield=rv(sd,"dividendYield"); if(dyield==null)dyield=rv(sd,"trailingAnnualDividendYield");
      let beta=rv(sd,"beta"); if(beta==null)beta=rv(ks,"beta");
      out[sym]={peg, ev, evCalc, dfcf, pe, peCalc, mom, marketCap:mc, price, name:pr.shortName||pr.longName||sym, source:"live",
        financialCurrency:rv(fd,"financialCurrency"), currency:rv(pr,"currency"),   // E3: currency mismatch (ADR) gate
        // ---- E2.2 extended catalog fields — mirror server.py._fetch_one_fundamental (same Yahoo keys) ----
        forwardPE:fwdpe, evRev:rv(ks,"enterpriseToRevenue"), ps:rv(sd,"priceToSalesTrailing12Months"), pb:rv(ks,"priceToBook"),
        grossMargin:rv(fd,"grossMargins"), opMargin:rv(fd,"operatingMargins"), netMargin:rv(fd,"profitMargins"),
        roe:rv(fd,"returnOnEquity"), roa:rv(fd,"returnOnAssets"), debtToEquity:rv(fd,"debtToEquity"),   // Yahoo % (152.3=1.523x); JS getter ÷100
        currentRatio:rv(fd,"currentRatio"), quickRatio:rv(fd,"quickRatio"),
        revGrowth:rv(fd,"revenueGrowth"), earnGrowth:rv(fd,"earningsGrowth"),
        divYield:dyield, payout:rv(sd,"payoutRatio"), beta:beta,
        // raw TTM operands for JS-derived metrics (pfcf, ebitdaMargin, fcfMargin, netCashPct) — RAW, not the ||0 locals
        fcf:fcf, ebitda:rv(fd,"ebitda"), revenue:rv(fd,"totalRevenue"), cash:rv(fd,"totalCash"), debt:rv(fd,"totalDebt")};
    }catch(e){ /* leave missing -> median/seed fallback handles it */ }
  });
  return out;
}

/* ---- unified entry points used by the rest of the app ---- */
async function dsQuotes(syms){ return NATIVE? nativeQuotes(syms) : webQuotes(syms); }
async function dsFundamentals(syms,force){ return NATIVE? nativeFundamentals(syms) : webFundamentals(syms,force); }
/* ---- E3: financial statements (fundamentals-timeseries). Client mirror of server _STMT_FIELDS. ---- */
const STMT_FIELD_MAP = {
  quarterlyTotalRevenue:'revenue', quarterlyCostOfRevenue:'costOfRevenue', quarterlyGrossProfit:'grossProfit',
  quarterlyOperatingExpense:'operatingExpense', quarterlyOperatingIncome:'operatingIncome',
  quarterlyPretaxIncome:'pretaxIncome', quarterlyTaxProvision:'taxProvision', quarterlyNetIncome:'netIncome',
  quarterlyNetIncomeCommonStockholders:'netIncomeCommon', quarterlyEBIT:'ebit', quarterlyEBITDA:'ebitda',
  quarterlyInterestExpense:'interestExpense', quarterlyDilutedEPS:'dilutedEPS',
  quarterlyDilutedAverageShares:'dilutedShares', quarterlyBasicAverageShares:'basicShares',
  quarterlyTotalAssets:'totalAssets', quarterlyTotalLiabilitiesNetMinorityInterest:'totalLiabilities',
  quarterlyStockholdersEquity:'equity', quarterlyCommonStockEquity:'commonEquity',
  quarterlyCashAndCashEquivalents:'cash', quarterlyCashCashEquivalentsAndShortTermInvestments:'cashAndSTI',
  quarterlyTotalDebt:'totalDebt', quarterlyCurrentAssets:'currentAssets', quarterlyCurrentLiabilities:'currentLiabilities',
  quarterlyInventory:'inventory', quarterlyInvestedCapital:'investedCapital',
  quarterlyOperatingCashFlow:'operatingCashFlow', quarterlyCapitalExpenditure:'capex', quarterlyFreeCashFlow:'fcf',
  quarterlyRepurchaseOfCapitalStock:'buyback', quarterlyCashDividendsPaid:'dividendsPaid'
};
async function webStatements(syms,force){ const d=await api("/api/statements?symbols="+syms.join(",")+(force?"&force=1":"")); return d.statements||{}; }
async function nativeStatements(syms){
  const crumb=await yEnsureCrumb(); const out={}; const types=Object.keys(STMT_FIELD_MAP).join(",");
  const p2=Math.floor(Date.now()/1000), p1=p2-6*366*24*3600;
  await yMapLimit(syms, async sym=>{
    try{
      const r=await yGet("https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"+encodeURIComponent(sym),
        {symbol:sym, type:types, period1:p1, period2:p2, merge:"false", padTimeSeries:"false", lang:"en-US", region:"US", crumb:crumb||""});
      const result=((jsonOf(r.data)||{}).timeseries||{}).result||[];
      const byDate={};
      result.forEach(series=>{ const t=((series.meta||{}).type||[])[0]; const field=STMT_FIELD_MAP[t]; if(!field)return;
        (series[t]||[]).forEach(pt=>{ if(!pt||pt.asOfDate==null)return; const rawv=(pt.reportedValue||{}).raw; if(rawv==null)return; (byDate[pt.asOfDate]=byDate[pt.asOfDate]||{})[field]=rawv; }); });   // skip padded/missing values
      const dates=Object.keys(byDate).sort().slice(-9);
      if(dates.length) out[sym]={sym, quarters:dates.map(d=>Object.assign({date:d}, byDate[d])), asOf:Math.floor(Date.now()/1000), source:"live"};
      else out[sym]={sym, quarters:[], asOf:Math.floor(Date.now()/1000), source:"empty"};   // sentinel (parity with server) so a statement-less name isn't refetched every open
    }catch(e){ /* fetch error -> leave uncached so it retries; pulled fallback stands */ }
  });
  return out;
}
async function dsStatements(syms,force){ return NATIVE? nativeStatements(syms) : webStatements(syms,force); }
async function dsLoadUniverse(){ if(window.__UNIVERSE) return window.__UNIVERSE; const r=await fetch("data/universe.json"); return r.json(); }
async function webSearch(q){ const r=await api("/api/search?q="+encodeURIComponent(q)); return r.results||[]; }
async function nativeSearch(q){
  try{
    const r=await yGet("https://query2.finance.yahoo.com/v1/finance/search",{q, quotesCount:10, newsCount:0, listsCount:0});
    const quotes=((jsonOf(r.data)||{}).quotes)||[];
    return quotes.filter(it=>it.symbol && ["EQUITY","ETF"].includes((it.quoteType||"").toUpperCase()))
      .map(it=>({symbol:it.symbol, name:it.shortname||it.longname||it.symbol, exchange:it.exchDisp||it.exchange||"", type:(it.quoteType||"").toUpperCase()}));
  }catch(e){ console.error("native search",e); return []; }
}
/* ---- local ticker directory (E11.10) ------------------------------------
   11k US-listed stocks and ETFs, built weekly by tools/build_ticker_directory.py from the NASDAQ
   Trader symbol directory. Loaded ONCE, lazily, and searched in-process, so typing in Research
   costs no network at all - the previous behaviour asked Yahoo on every 250ms pause, which is slow
   and the likeliest way to get an IP throttled. Yahoo stays as the fallback for what the directory
   cannot carry: OTC names, and anything listed since the last weekly refresh. */
let _tickers=null, _tickersLoading=null;
async function loadTickers(){
  if(_tickers) return _tickers;
  if(!_tickersLoading){
    _tickersLoading=fetch("data/tickers.json")
      .then(r=>r.ok?r.json():null)
      .then(d=>{ _tickers=Array.isArray(d)?d:[]; return _tickers; })
      .catch(()=>{ _tickers=[]; return _tickers; });   // a missing index must degrade to Yahoo, not break search
  }
  return _tickersLoading;
}
/* Ranked by WHERE the match falls, not by symbol length - the same bug server.py had, where
   "Maui Land & Pineapple" outranked "Apple Inc." for "apple" because MLP is shorter. */
function searchLocal(q){
  const rows=_tickers||[]; if(!rows.length||!q) return [];
  const qu=q.toUpperCase(), hits=[];
  for(let i=0;i<rows.length;i++){
    const r=rows[i], sym=r[0], NM=r[1].toUpperCase();
    let rank;
    if(sym===qu) rank=0;
    else if(sym.indexOf(qu)===0) rank=1;
    else if(NM.indexOf(qu)===0) rank=2;
    else if(NM.indexOf(" "+qu)>=0) rank=3;
    else if(sym.indexOf(qu)>=0) rank=4;
    else if(NM.indexOf(qu)>=0) rank=5;
    else continue;
    /* Tie-break WITHIN a rank. Symbol length is right for symbol matches and wrong for name
       matches - it is precisely the bug server.py had, where a shorter ticker won regardless of
       how well the name fit. For a name match the useful signal is how much of the name's FIRST
       WORD the query covers: "appl" is 4 of 5 letters of "Apple" but only 4 of 7 of "Applied",
       so Apple Inc. beats Applied Industrial Technologies. */
    const sp=NM.indexOf(" "), firstWord=(sp<0?NM.length:sp);
    hits.push([rank, (rank<=1||rank===4)?sym.length:firstWord, sym.length, r]);
    if(hits.length>400) break;                        // enough to rank well; do not scan for sport
  }
  hits.sort((a,b)=>a[0]-b[0] || a[1]-b[1] || a[2]-b[2] || (a[3][0]<b[3][0]?-1:1));
  return hits.slice(0,12).map(h=>({symbol:h[3][0], name:h[3][1], exchange:h[3][2], type:h[3][3]?"ETF":"EQUITY"}));
}
async function dsSearch(q){
  q=(q||"").trim(); if(!q) return [];
  try{ await loadTickers(); const local=searchLocal(q); if(local.length) return local; }catch(e){}
  return NATIVE? nativeSearch(q) : webSearch(q);      // OTC, or listed since the last refresh
}
async function dsPeers(sym){
  if(!sym) return [];
  if(NATIVE){ try{ const r=await yGet("https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/"+encodeURIComponent(sym),{}); const res=(((jsonOf(r.data)||{}).finance||{}).result)||[]; return ((res[0]||{}).recommendedSymbols||[]).map(x=>x.symbol).filter(Boolean); }catch(e){ return []; } }
  try{ const r=await api("/api/peers?symbol="+encodeURIComponent(sym)); return r.peers||[]; }catch(e){ return []; }
}

/* ===== THE FEED TRUST BOUNDARY ==============================================================
   Everything a data feed returns passes through here. Yahoo is an unauthenticated third party and
   the proxy only relays it, so the SHAPE of a response is not ours to trust - only its origin is.

   Object.assign was the wrong tool for this in three specific ways, each found by fuzzing the
   loaders (tests/fuzzingest.spec.js), not by reading the code:

     - over undefined or null it THROWS, which kills the 60-second refresh loop;
     - over a STRING it spreads the characters into "0","1","2"... keys, inventing symbols that
       never existed;
     - over an object carrying "__proto__" it invokes a SETTER rather than creating a property, and
       replaces the TARGET's prototype. After that, state.quotes["ANYTHING"] can return an object
       the feed supplied - a price for a symbol nobody holds. That is a wrong number, silently.

   So: copy only own, non-index, non-prototype keys whose value is a plain object. Anything else is
   dropped rather than guessed at, because a dropped quote shows as "-" and a guessed one does not. */
function mergeFeed(base, incoming){
  const out = Object.assign({}, base || {});
  if(!incoming || typeof incoming!=="object" || Array.isArray(incoming)) return out;
  for(const k of Object.keys(incoming)){
    if(k==="__proto__" || k==="constructor" || k==="prototype") continue;
    if(/^\d+$/.test(k)) continue;
    const v = incoming[k];
    if(!v || typeof v!=="object" || Array.isArray(v)) continue;
    out[k] = v;
  }
  return out;
}

async function loadQuotes(){ const d=(await dsQuotes(tradeUniverse()))||{};
  state.quotes=mergeFeed(state.quotes, d.quotes); if(d.asOf) state.asOf=d.asOf; }
async function loadFundamentals(force){ const f=await dsFundamentals(membership(),force); state.pulled=mergeFeed(state.pulled, f); rebuildFundamentals(); }   // E3: pulled base, then overlay computed
async function loadStatements(syms,force){ const list=syms||membership(); if(!list.length) return {}; const s=await dsStatements(list,force); state.statements=mergeFeed(state.statements, s); rebuildFundamentals(); return s; }   // E3

/* ======================================================================
   E3.2 — Computed-metric engine. Assemble TTM from the loaded statements (sum the
   last 4 quarters for flows; latest quarter for the balance sheet; YoY growth =
   latest Q vs the year-ago Q) and compute each catalog metric via a documented
   formula, OVERLAYING the pulled fundamentals base. Forward/market metrics stay
   pulled. A missing statement input (e.g. a bank's gross profit) falls back to the
   pulled field. Formulas validated live vs Yahoo's own numbers (valuation + margins
   match; ROE/ROA use AVERAGE equity/assets to match convention).
   ====================================================================== */
const STMT_COMPUTED_FIELDS = ['pe','ev','evRev','ps','pb','dfcf','debtToEquity','currentRatio','quickRatio',
  'grossMargin','opMargin','netMargin','roe','roa','payout','revGrowth','earnGrowth','fcf','ebitda','revenue','cash','debt'];
   // market / forward-looking: never computed from trailing statements

function stmtTTM(sym){
  const st=state.statements[sym]; if(!st||!st.quarters||!st.quarters.length) return null;
  const qs=st.quarters, n=qs.length, last=qs[n-1];
  const sum4=f=>{ const s=qs.slice(-4); if(s.length<4) return null; let t=0; for(const q of s){ if(!isNum(q[f])) return null; t+=q[f]; } return t; };
  const bal=f=> isNum(last[f])?last[f]:null;
  const startIdx=Math.max(0,n-5);   // balance at the START of the TTM window (the quarter-end before the 4 TTM quarters)
  const avgBal=f=>{ const a=qs[startIdx][f], b=last[f]; return (isNum(a)&&isNum(b))?(a+b)/2:(isNum(b)?b:null); };   // avg equity/assets over the TTM window (begin+end)
  const yoy=f=>{ if(n<5) return null; const v0=last[f], v4=qs[n-5][f]; return (isNum(v0)&&isNum(v4)&&v4!==0)?(v0-v4)/Math.abs(v4):null; };
  return { revenue:sum4('revenue'), grossProfit:sum4('grossProfit'), operatingIncome:sum4('operatingIncome'),
    netIncome:sum4('netIncome'), netIncomeCommon:sum4('netIncomeCommon'), ebitda:sum4('ebitda'), ebit:sum4('ebit'), fcf:sum4('fcf'),
    operatingCashFlow:sum4('operatingCashFlow'), capex:sum4('capex'), dividendsPaid:sum4('dividendsPaid'),
    equity:bal('equity'), avgEquity:avgBal('equity'), totalAssets:bal('totalAssets'), avgAssets:avgBal('totalAssets'),
    totalDebt:bal('totalDebt'), cash:(isNum(last.cashAndSTI)?last.cashAndSTI:bal('cash')), currentAssets:bal('currentAssets'),   // STI-inclusive to match Yahoo totalCash (EV/net-cash)
    currentLiabilities:bal('currentLiabilities'), inventory:bal('inventory'),
    revGrowth:yoy('revenue'), earnGrowth:yoy('netIncome'), asOfDate:last.date, quarters:n };
}
function currencyMismatch(sym){ const pf=state.pulled[sym]||{}; return !!(pf.financialCurrency && pf.currency && pf.financialCurrency!==pf.currency); }   // foreign ADR: statements in a different currency than the market cap
function computedMetrics(sym){
  const t=stmtTTM(sym); if(!t) return null;
  const mc=effMcap(sym), out={};
  const mcapOk = isNum(mc) && !currencyMismatch(sym);   // can't mix market cap (trading ccy) with statement figures (financial ccy) without an FX rate -> keep those pulled
  const ev=(isNum(t.totalDebt)&&isNum(t.cash)&&isNum(mc))? mc+t.totalDebt-t.cash : null;
  const put=(k,v)=>{ if(isNum(v)) out[k]=v; };
  if(mcapOk){
    const niCommon = isNum(t.netIncomeCommon)?t.netIncomeCommon:t.netIncome;   // prefer net income to common (matches Yahoo trailing P/E)
    put('pe', (isNum(niCommon)&&niCommon>0)? mc/niCommon : null);
    put('ps', (isNum(t.revenue)&&t.revenue>0)? mc/t.revenue : null);
    put('pb', (isNum(t.equity)&&t.equity>0)? mc/t.equity : null);
    put('ev', (isNum(ev)&&isNum(t.ebitda)&&t.ebitda>0)? ev/t.ebitda : null);
    put('evRev', (isNum(ev)&&isNum(t.revenue)&&t.revenue>0)? ev/t.revenue : null);
  }
  if(isNum(t.totalDebt)&&isNum(t.fcf)) put('dfcf', t.fcf>0 ? t.totalDebt/t.fcf : -1);   // matches server dfcf: >0 -> td/fcf, <=0 -> -1 sentinel
  put('debtToEquity', (isNum(t.totalDebt)&&isNum(t.equity)&&t.equity>0)? (t.totalDebt/t.equity)*100 : null);   // PERCENT (the getter divides /100)
  put('currentRatio', (isNum(t.currentAssets)&&isNum(t.currentLiabilities)&&t.currentLiabilities>0)? t.currentAssets/t.currentLiabilities : null);
  put('quickRatio', (isNum(t.currentAssets)&&isNum(t.currentLiabilities)&&t.currentLiabilities>0&&isNum(t.inventory))? (t.currentAssets-t.inventory)/t.currentLiabilities : null);
  if(isNum(t.revenue)&&t.revenue>0){
    put('grossMargin', isNum(t.grossProfit)? t.grossProfit/t.revenue : null);
    put('opMargin', isNum(t.operatingIncome)? t.operatingIncome/t.revenue : null);
    put('netMargin', isNum(t.netIncome)? t.netIncome/t.revenue : null);
  }
  put('roe', (isNum(t.netIncome)&&isNum(t.avgEquity)&&t.avgEquity>0)? t.netIncome/t.avgEquity : null);
  put('roa', (isNum(t.netIncome)&&isNum(t.avgAssets)&&t.avgAssets>0)? t.netIncome/t.avgAssets : null);
  put('payout', (isNum(t.dividendsPaid)&&isNum(t.netIncome)&&t.netIncome>0)? clamp(-t.dividendsPaid/t.netIncome,0,5) : null);   // dividendsPaid is a negative outflow
  put('revGrowth', t.revGrowth); put('earnGrowth', t.earnGrowth);
  put('fcf', t.fcf); put('ebitda', t.ebitda); put('revenue', t.revenue);   // operands for the currency-neutral derived margins (ebitdaMargin/fcfMargin) + pfcf
  if(mcapOk){ put('cash', t.cash); put('debt', t.totalDebt); }   // cash/debt only feed netCashPct (market-cap based) -> skip on a currency mismatch so it doesn't mix currencies
  return {values:out, ttm:t};
}
function applyComputedMetrics(){
  Object.keys(state.statements||{}).forEach(sym=>{
    const f=state.fundamentals[sym]; if(!f) return;
    const cm=computedMetrics(sym), vals=cm?cm.values:{}, src=state.metricSource[sym]||(state.metricSource[sym]={});
    STMT_COMPUTED_FIELDS.forEach(field=>{ if(isNum(vals[field])){ f[field]=vals[field]; src[field]='computed'; }
      else if(field in f && isNum(f[field])){ src[field]='pulled'; } });   // statement input missing -> keep the pulled value (banks)
    if(cm) f._ttm=cm.ttm;
  });
}
// state.fundamentals = the PULLED base (state.pulled), optionally overlaid with statement-computed metrics.
function rebuildFundamentals(){
  state.fundamentals={}; state.metricSource={};
  Object.keys(state.pulled||{}).forEach(s=>{ state.fundamentals[s]=Object.assign({}, state.pulled[s]); });
  if(state.computeFromStatements) applyComputedMetrics();
}

/* ======================================================================
   E3.3 — Stock-detail page: the 3 statements x last 4 quarters (+ TTM) and a
   computed-metrics panel (each metric: value + source). Reached by clicking a
   ticker (fundamentals table / Prices / Screener). Lazy-loads statements.
   ====================================================================== */
const STMT_PULLED_METRIC_KEYS = ['mcap','mom','peg','forwardPE','beta','divYield'];   // never computed from trailing statements
const STMT_DISPLAY = [
  ['Income statement', 'flow', [['revenue','Revenue'],['costOfRevenue','Cost of revenue'],['grossProfit','Gross profit'],
    ['operatingExpense','Operating expense'],['operatingIncome','Operating income'],['ebitda','EBITDA'],
    ['pretaxIncome','Pretax income'],['taxProvision','Tax provision'],['netIncome','Net income'],
    ['dilutedEPS','Diluted EPS'],['dilutedShares','Diluted shares']]],
  ['Balance sheet', 'point', [['totalAssets','Total assets'],['currentAssets','Current assets'],['cash','Cash & equivalents'],
    ['inventory','Inventory'],['currentLiabilities','Current liabilities'],['totalLiabilities','Total liabilities'],
    ['totalDebt','Total debt'],['equity','Shareholder equity']]],
  ['Cash flow', 'flow', [['operatingCashFlow','Operating cash flow'],['capex','Capital expenditure'],['fcf','Free cash flow'],
    ['dividendsPaid','Dividends paid'],['buyback','Share buybacks']]],
];
function fmtStmtCell(field, x){
  if(!isNum(x)) return '—';
  if(field==='dilutedEPS') return num(x,2);
  // Share counts are not money, so no $ - but they need the same magnitude scaling, or a company
  // with 50 million shares reads "0.05B". volFmt already does exactly this.
  if(field==='dilutedShares'||field==='basicShares') return volFmt(x);
  return bil(x);   // money in $B
}
const DERIVED_OPERANDS={pfcf:['fcf'], ebitdaMargin:['ebitda','revenue'], fcfMargin:['fcf','revenue'], netCashPct:['cash','debt']};
const STMT_MCAP_METRICS=['pe','ps','pb','ev','evRev','pfcf','netCashPct'];   // depend on market cap -> not computable across a currency mismatch
function metricSourceOf(sym, m){
  if(STMT_PULLED_METRIC_KEYS.indexOf(m.key)>=0) return 'pulled';
  if(currencyMismatch(sym) && STMT_MCAP_METRICS.indexOf(m.key)>=0) return 'pulled';   // ADR: market-cap metrics stay pulled
  const src=state.metricSource[sym]||{};
  const ops=DERIVED_OPERANDS[m.key];
  if(ops) return ops.every(k=>src[k]==='computed') ? 'computed' : 'pulled';   // derived: all operands must be computed
  return src[m.key] || 'pulled';
}
async function openStockDetail(sym){
  sym=(sym||'').toUpperCase(); if(!sym) return;
  const nm=(state.quotes[sym]&&state.quotes[sym].name)||(state.fundamentals[sym]&&state.fundamentals[sym].name)||sym;
  /* E12 4.6: a right-anchored panel, not a centred modal. Reachable from all five places a ticker
     appears, and it must work for a name you do NOT own - a searched company has statements and
     computed metrics exactly like a holding, and that is most of the point of Research. */
  const q0=state.quotes[sym]||{}, h0=holdings()[sym], t0=themeOf[sym];
  $("#modalRoot").innerHTML=`<div class="sd-back" id="sdModal" data-sd-sym="${esc(sym)}">
    <aside class="sd-panel" role="dialog" aria-modal="true" aria-label="${esc(sym)} detail">
      <div class="sd-head">
        <div class="sd-id"><h2>${esc(sym)}</h2><span>${esc(nm)}</span></div>
        <button class="sd-x" id="sdClose" type="button" aria-label="Close">&times;</button>
        <div class="sd-px">
          <b>${isNum(q0.price)?money(q0.price,2):"\u2014"}</b>
          <span class="${isNum(q0.changePct)?(q0.changePct>=0?"up":"down"):""}">${
            isNum(q0.changePct)?signed(q0.changePct,2)+"%":""}</span>
          <i>${h0&&isNum(h0.shares)?num(h0.shares,1)+" shares":"not held"}${
            t0?" \u00b7 "+esc(t0.name):""}</i>
        </div>
      </div>
      <div id="sdBody"><p class="sd-note">Loading statements\u2026</p></div>
    </aside></div>`;
  $("#sdClose").addEventListener("click",closeModal);
  $("#sdModal").addEventListener("click",e=>{ if(e.target.id==="sdModal")closeModal(); });
  /* A panel that only closes on a click is a trap for anyone on a keyboard. */
  $("#sdModal").addEventListener("keydown",e=>{ if(e.key==="Escape") closeModal(); });
  const _x=$("#sdClose"); if(_x) _x.focus();
  // Screener/search names aren't preloaded -> fetch quote + PULLED fundamentals + statements on demand, then rebuild
  const jobs=[];
  if(!state.quotes[sym]) jobs.push(dsQuotes([sym]).then(d=>{ state.quotes=mergeFeed(state.quotes, d&&d.quotes); }).catch(()=>{}));
  if(!state.pulled[sym]) jobs.push(dsFundamentals([sym],false).then(f=>{ state.pulled=mergeFeed(state.pulled, f); }).catch(()=>{}));
  if(!state.statements[sym]) jobs.push(dsStatements([sym]).then(s=>{ state.statements=mergeFeed(state.statements, s); }).catch(()=>{}));
  if(jobs.length){ await Promise.all(jobs); rebuildFundamentals(); }
  const modal=$("#sdModal"); if(!modal || modal.dataset.sdSym!==sym) return;   // a newer detail opened while we awaited -> don't clobber it
  renderStockDetail(sym);
}
function renderStockDetail(sym){
  const body=$("#sdBody"); if(!body) return;
  const st=state.statements[sym], f=state.fundamentals[sym]||{}, ttm=f._ttm;
  const mc=effMcap(sym);
  const pf=state.pulled[sym]||{}, fcur=pf.financialCurrency, tcur=pf.currency, fx=!!(fcur&&tcur&&fcur!==tcur);

  /* WHAT THE MODEL USED - the honest answer to "why does this name have this weight". Only the
     ACTIVE metrics, because those are the ones that actually moved the number; the other 21 in the
     catalog did not, and listing all 27 buries the answer among things that had no effect. */
  const rows=metrics().map(function(m){
    const v=m.getter(sym), src=metricSourceOf(sym,m);
    const tag = src==='computed'
      ? '<span class="tag calc" title="computed from the loaded statements">CALC</span>'
      : '<span class="tag" title="pulled from Yahoo (market or forward-looking, or a statement input was missing)">PULLED</span>';
    return '<div class="sd-m"><span class="n">'+esc(m.label)+
      (m.formulaHint?'<i>'+esc(m.formulaHint)+"</i>":"")+"</span>"+
      '<span class="num">'+(isNum(v)?fmtVal(m,v):"\u2014")+"</span>"+tag+"</div>";
  }).join("");
  const fxNote = fx
    ? '<p class="sd-note">Filed in <b>'+esc(fcur)+"</b> while the market cap is in <b>"+esc(tcur)+
      "</b>. Ratios that mix the two \u2014 P/E, EV/EBITDA, P/S, P/B \u2014 cannot be computed without an FX "+
      "rate, so they stay pulled. Margin, growth and return ratios are currency-neutral and are still computed.</p>"
    : "";
  let out='<div class="sd-sec"><div class="sd-lbl">WHAT THE MODEL USED</div>'+
    '<div class="sd-meta"><span>Market cap <b>'+bil(mc)+"</b></span>"+
      (ttm?'<span>TTM to <b>'+esc(ttm.asOfDate)+"</b></span>":"")+
      '<span>'+(state.computeFromStatements?"Computed from statements":"Pulled from Yahoo")+"</span></div>"+
    rows+fxNote+"</div>";

  // ---- statements, three tabs
  if(st&&st.quarters&&st.quarters.length){
    const qs=st.quarters.slice(-4);   // last 4 quarters, oldest -> newest
    out+='<div class="sd-sec"><div class="sd-lbl">STATEMENTS</div>'+
      (fcur&&fcur!=="USD"?'<p class="sd-note">Figures in <b>'+esc(fcur)+
        "</b>, the currency the company files in; the $ symbol below is nominal.</p>":"")+
      '<div class="sd-tabs" id="sdTabs">'+STMT_DISPLAY.map(function(d,i){
        return '<button type="button" class="sd-tab'+(i===0?" on":"")+'" data-sdtab="'+i+'">'+
               esc(String(d[0]).toUpperCase())+"</button>"; }).join("")+"</div>";
    STMT_DISPLAY.forEach(function(d,i){
      const title=d[0], kind=d[1], lines=d[2];
      /* The TTM column is DERIVED, so its header carries the accent and its figures are bold
         against the quarters - a derived column that looks reported is a figure the reader will
         attribute to the filing. */
      const heads=qs.map(function(q){ return '<span class="num">'+esc(q.date)+"</span>"; }).join("")+
        (kind==="flow"?'<span class="num ttm">TTM</span>':'<span class="num"></span>');
      const rws=lines.map(function(l){
        const field=l[0], label=l[1];
        const cells=qs.map(function(q){ return '<span class="num">'+fmtStmtCell(field,q[field])+"</span>"; }).join("");
        let ttmCell='<span class="num"></span>';
        if(kind==="flow"){
          const noSum=(field==="dilutedShares"||field==="dilutedEPS");   // shares/EPS aren't summed across quarters
          const vals=qs.map(function(q){ return q[field]; });
          const ok=!noSum&&vals.length===4&&vals.every(isNum);
          ttmCell='<span class="num ttm">'+(ok?fmtStmtCell(field,vals.reduce(function(a,b){return a+b;},0)):"\u2014")+"</span>";
        }
        return '<div class="sd-r"><span class="l">'+esc(label)+"</span>"+cells+ttmCell+"</div>";
      }).join("");
      out+='<div class="sd-table'+(i===0?"":" is-off")+'" data-sdpane="'+i+'">'+
        '<div class="sd-r sd-rh"><span class="l">'+esc(title)+
        (kind==="point"?" \u00b7 point in time":"")+"</span>"+heads+"</div>"+rws+"</div>";
    });
    out+="</div>";
  } else {
    out+='<div class="sd-sec"><div class="sd-lbl">STATEMENTS</div><p class="sd-note">No statement data '+
      "for "+esc(sym)+" \u2014 its metrics fall back to Yahoo's pulled figures.</p></div>";
  }
  body.innerHTML=out;
  const tabs=$("#sdTabs");
  if(tabs) tabs.addEventListener("click",function(e){
    const b=e.target.closest("[data-sdtab]"); if(!b) return;
    $$("#sdTabs .sd-tab").forEach(function(x){ x.classList.toggle("on",x===b); });
    $$(".sd-table").forEach(function(t){ t.classList.toggle("is-off",t.dataset.sdpane!==b.dataset.sdtab); });
  });
}

/* E3.4 — compare each statement-computed metric with Yahoo's pulled value (state.pulled is the untouched base). */
function openSourceCompare(){
  const fields=[['pe','P/E'],['ev','EV/EBITDA'],['ps','P/S'],['pb','P/B'],['roe','ROE'],['roa','ROA'],
    ['grossMargin','GrossM'],['netMargin','NetM'],['debtToEquity','D/E%'],['currentRatio','Curr'],['revGrowth','RevG']];
  const rows=membership().map(sym=>{
    const c=state.fundamentals[sym]||{}, p=state.pulled[sym]||{}, src=state.metricSource[sym]||{};
    const cells=fields.map(([k])=>{ const cv=c[k], pv=p[k];
      if(!isNum(cv)) return '<td class="num">—</td>';
      const delta=(isNum(pv)&&pv!==0)?(cv-pv)/Math.abs(pv)*100:null, big=isNum(delta)&&Math.abs(delta)>10;
      return `<td class="num${big?' down':''}" title="computed ${num(cv,3)} · pulled ${isNum(pv)?num(pv,3):'—'}${src[k]?' · '+src[k]:''}">${num(cv,2)}${isNum(delta)?` <span class="muted xs">${signed(delta,0)}%</span>`:''}</td>`;
    }).join("");
    return `<tr><td class="sym">${esc(sym)}</td>${cells}</tr>`;
  }).join("");
  $("#modalRoot").innerHTML=`<div class="modal-backdrop" id="scModal"><div class="modal-card card pad" style="max-width:920px;max-height:88vh;overflow:auto">
      <div class="section-title"><h2 style="font-size:16px">Computed vs pulled</h2><button class="btn sm" id="scClose">Close</button></div>
      <p class="small muted">Statement-<b>computed</b> value, with (%) distance from Yahoo's <b>pulled</b> figure. ROE / ROA / quick-ratio differ by design (Yahoo uses average balances / lease-inclusive debt); a &gt;10% gap is flagged.</p>
      <table class="mono" style="font-size:12px"><thead><tr><th>Ticker</th>${fields.map(f=>`<th>${f[1]}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
    </div></div>`;
  $("#scClose").addEventListener("click",closeModal);
  $("#scModal").addEventListener("click",e=>{ if(e.target.id==="scModal")closeModal(); });
}

/* ===== E8 - the persistence contract =====================================================
   These functions coordinate shared state across network calls. For seven review rounds each
   new guard was itself state-dependent and grew the same blind spot as the bug it fixed, so the
   rules are now stated ONCE and enforced at ONE checkpoint per operation, instead of being
   re-derived at each of the fourteen places these functions touched state.

   C1  Every operation runs in a CONTEXT captured before its first await: which adapter, which
       owner, which identity. Nothing after an await reads live state to decide what it meant.
   C2  Nothing is applied or written on behalf of a context that is no longer current. Current
       means: the app is not locked, the identity has not changed, the adapter has not changed,
       and - for an account - the signed-in user is still the owner. A TOKEN REFRESH IS NOT an
       identity change; treating it as one discarded a live portfolio on every stale reload.
   C3  state.baseRevision is a revision the SERVER confirmed, or null. Saving is refused while
       null. Only a load that returned content, or a confirmed write, may set it.
   C4  NOTHING about a portfolio is written to this device. The account is the single source of
       truth: a save that could not reach it did not happen, and the user is told so plainly
       rather than being handed a cached copy to reconcile later.
   C5  A save returns true only if the write landed.                                          */
/* ===== E9 - NOTHING ABOUT A PORTFOLIO IS STORED ON THIS DEVICE ==========================
   The account is the single source of truth. Earlier versions kept an offline mirror plus four
   kinds of local bookkeeping so that a save which could not reach the server was preserved and
   offered back later. That machinery produced most of the defects in review rounds 3-6 - several
   of which could hand a user STALE work that overwrote a good portfolio - and a web app writing
   somebody's financial records into their browser storage is a poor default besides.

   So: if a save cannot reach your account, it is not saved, and you are told so plainly. If the
   account cannot be read, the app says that rather than showing a cached copy.
   The only things now written locally are the sign-in session, the light/dark choice, whether a
   page's guide has been seen, and the iOS LAN-sync URL. None of them is portfolio data.

   This removes anything a previous version left behind on this machine. */
function purgeLegacyLocalCopies(){
  try{
    const doomed=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && (k.startsWith("pb_cloud_mirror_")||k.startsWith("pb_mirror_dirty_")||
               k.startsWith("pb_mirror_unfiled_")||k.startsWith("pb_unsynced_")||
               k.startsWith("pb_conflict_"))) doomed.push(k);
    }
    doomed.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
    if(doomed.length) console.info("removed "+doomed.length+" local portfolio copies left by an earlier version");
  }catch(e){}
}
function pctx(){
  const ad=storageAdapter();
  return { ad, name:ad.name, epoch:sbEpoch, owner:(ad.name==="cloud")?sbUserId():null };
}
function ctxCurrent(c){                          // C2, in one place
  if(appLocked) return false;
  if(c.epoch!==sbEpoch) return false;            // identity changed (a refresh does not bump this)
  const now=storageAdapter();
  if(now.name!==c.name) return false;            // the adapter changed under the document
  if(c.name==="cloud" && sbUserId()!==c.owner) return false;
  return true;
}

async function loadPortfolio(){
  const c=pctx();
  let doc=null, err=null;
  try{ doc=await c.ad.load(); }catch(e){ err=e; }
  // The revision travels ON the reply, so it cannot be crossed with a concurrent load's.
  const meta = doc ? doc[CLOUD_META] : { revision:0, rowExists:false };

  if(!ctxCurrent(c)){                            // ---- the single checkpoint ----
    console.warn("discarding a load whose context is no longer current");
    return;
  }
  // Past here the context holds, so it is safe to touch shared state.
  state.docSource=c.name; state.docOwner=c.owner;

  if(err){
    /* E9 - there is no cached copy to fall back to. An account that cannot be read is reported as
       such; the app never shows a portfolio it could not confirm. Saving stays refused because
       baseRevision is null. */
    console.error("load failed",err);
    state.syncStatus=c.name+"-failed";
    state.baseRevision=null;                     // C3
    state.portfolio=null;
    const why=describeCloudFailure(err);
    state.syncFailure=why;                          // the precise reason, for the badge and the panels
    state.syncError=why.short;
    try{ renderSyncBadge(); }catch(e){}   // the badge must not keep saying "synced" after a failed read
    return;
  }

  state.syncStatus=c.name;
  if(c.name==="cloud"){
    if(meta){ state.baseRevision=meta.revision; state.cloudRowExists=meta.rowExists; }
    if(!doc) state.portfolio=null;               // a CONFIRMED empty account
    state.syncError=null; state.syncFailure=null;
  }
  else if(doc && c.ad.mirror) nativeSavePortfolio(doc);       // iOS LAN sync only

  if(doc) hydrateFromDocument(doc);
  rebuildThemeOf();
  try{ renderSyncBadge(); }catch(e){}
}
/* E6 FIX - extracted so the IMPORT path can reuse it. It used to assign state.portfolio directly
   and skip all of this, so an imported book was uploaded stripped of its themes, theme membership,
   watchlist, metric list, per-metric config, presets, overrides, cap, weights and penalty - while
   the modal promised "its full history comes with it". */
function hydrateFromDocument(p){
  /* migrateVersions FIRST: it SYNTHESISES p.versions from a legacy `transactions` document, and
     those snapshots carry no theme fields at all. Migrating themes before they exist left them
     unmigrated, and restoreVersion now reads a missing snapshot theme list as "empty" rather than
     the old "use the built-in five" - so a single Undo would have erased the model outright. */
  /* migrateVersions synthesises snapshots from LIVE state.weights/state.penalty, so those must
     already reflect THIS document - otherwise a legacy book's reconstructed checkpoints are stamped
     with the module defaults and undoing to one silently changes the allocation model. */
  state.weights = (p.weights && typeof p.weights==="object") ? p.weights : Object.assign({},DEFAULT_CONFIG.weights);
  state.penalty = (p.penalty && typeof p.penalty==="object") ? p.penalty : Object.assign({},DEFAULT_CONFIG.penalty);
  try{ migrateVersions(p); }catch(e){ console.error("version migration failed",e); }
  migrateThemes(p);                    // E8: a pre-E8 document keeps the themes it was showing
  { state.portfolio=p;
    /* Absent means "the default", never "keep whatever the last document left in memory". The
       leftover values were being written straight back into the next document on its first save. */
    state.weights  = (p.weights  && typeof p.weights ==="object") ? p.weights  : Object.assign({},DEFAULT_CONFIG.weights);
    state.overrides= (p.overrides&& typeof p.overrides==="object") ? p.overrides: {};
    state.penalty  = (p.penalty  && typeof p.penalty ==="object") ? p.penalty  : Object.assign({},DEFAULT_CONFIG.penalty);
    /* E6 FIX: null is MEANINGFUL here ("use the defaults") - it is exactly what
       restoreDefaultThemes()/deleteTheme write. A truthiness guard could never move state back
       to null, so a theme deleted on one device was resurrected by the next save from another. */
    state.themeTickers=(p.themeTickers && typeof p.themeTickers==="object") ? p.themeTickers : {};
    state.themes=Array.isArray(p.themes) ? p.themes : [];
    if(Array.isArray(p.watchlist))state.watchlist=p.watchlist.map(w=>(typeof w==="string"?{sym:w,theme:null}:w));
    else if(Array.isArray(p.otherList))state.watchlist=p.otherList.map(s=>({sym:s,theme:null}));   // migrate old 'Other' list
    else state.watchlist=[];
    state.metrics = (Array.isArray(p.metrics)&&p.metrics.length) ? validateMetrics(p.metrics) : null;   // E2.1: reattach descriptors by key; null/absent => defaults
    state.metricCfg = (p.metricCfg&&typeof p.metricCfg==='object'&&!Array.isArray(p.metricCfg)) ? p.metricCfg : null;   // E2.4: per-metric overrides; null/absent => defaults
    if(state.metricCfg){ Object.keys(state.metricCfg).forEach(k=>{ if(!catalogByKey(k)) delete state.metricCfg[k]; }); if(!Object.keys(state.metricCfg).length) state.metricCfg=null; }   // drop entries for keys no longer in the catalog
    state.presets = Array.isArray(p.presets) ? p.presets.map(sanitizePreset).filter(Boolean) : [];   // E2.5: preset library (not versioned)
    ['peg','ev','dfcf','pe','mcap','mom'].forEach(k=>{ if(!(k in state.weights)) state.weights[k]=DEFAULT_CONFIG.weights[k]; });   // E2.3: backfill missing default weights WITHOUT nuking activated catalog metrics
    backfillPenalty();   // restore any missing default-metric penalty (peg/ev/dfcf/pe) — no-op when complete
    state.cap = isNum(p.cap) ? p.cap : null;   // E6 FIX: an absent cap means the default, not "keep the last one"
    state.computeFromStatements = (p.computeFromStatements!==false);   // E3.4: data-source preference (default on); non-versioned
    migrateVersions(p); }
}
/* E6 FIX - saves are SERIALISED. savePortfolio is wired to `change` handlers (weight sliders,
   the cap field) and to undo/redo, so two could overlap, both read the same baseRevision, and the
   second would be rejected as a "conflict" - manufacturing a cross-device warning, and a
   destructive reload, out of a single-device race. */
let _saveChain=Promise.resolve();
/* state.* -> the document. Idempotent, and deliberately separate from stampPortfolioMeta: it runs
   at QUEUE time as well as at write time, so a save that is later refused still has the edit inside
   the document it files. Nearly every setting - weights, penalty, cap, metrics, presets, themes,
   membership, watchlist - lives only in state.* until this runs; filing the document beforehand
   stored a copy WITHOUT the change, and for a state-only edit that copy was byte-identical to the
   account's own, which the recovery prompt then offered back as "unsaved work" that reverts it. */
function syncStateIntoDocument(){
  const d=state.portfolio; if(!d) return null;
  if(!Array.isArray(d.versions)) d.versions=[];
  if(!isNum(d.head)) d.head=d.versions.length-1;
  d.weights=state.weights; d.overrides=state.overrides; d.penalty=state.penalty; d.cap=state.cap;
  d.computeFromStatements = state.computeFromStatements!==false;                    // E3.4
  d.themeTickers=state.themeTickers; d.themes=state.themes; d.watchlist=state.watchlist;
  d.metrics = state.metrics ? state.metrics.map(m=>({key:m.key})) : null;           // E2.1
  d.metricCfg = state.metricCfg || null;                                            // E2.4
  d.presets = Array.isArray(state.presets) ? state.presets : [];                    // E2.5
  return d;
}
function savePortfolio(){
  const c=pctx();                                // C1: bound to the context that ASKED for this save
  syncStateIntoDocument();
  const run=()=>{
    if(!ctxCurrent(c)){
      console.warn("dropping a save whose context is no longer current");
      state.syncError="the session changed before that could be saved";
      try{ renderSyncBadge(); }catch(e){}
      return false;
    }
    return _savePortfolioInner(c);
  };
  const next=_saveChain.then(run,run);
  _saveChain=next.catch(()=>{});
  return next;
}
async function _savePortfolioInner(c){
  /* REFUSE FIRST, before anything is manufactured. This guard used to sit below the line that
     invents a document when state.portfolio is null - which during boot it always is. So a click
     in the boot window built a BLANK book, filed it as the user's "unsaved work", and the recovery
     prompt then offered "0 holdings - 0 checkpoints" back; accepting it wrote that emptiness over
     a real account, mirror and history included. The same inversion as #resetBtn had, one function
     along: a refusal that has already mutated is not a refusal. */
  if(booting){
    state.syncError="the account was still loading - that change was not saved";
    console.warn("save refused - still loading this account");
    try{ renderSyncBadge(); }catch(e){}
    setTimeout(()=>toast("Not saved - your account was still loading. Please make that change again."),400);
    return false;
  }
  /* REFUSE BEFORE MANUFACTURING. Inventing a document here while the account could not be read
     does two bad things: the save is refused anyway (C3, baseRevision is null), and the mere
     existence of state.portfolio flips accountUnreachable() off - permanently - so every honest
     "your portfolio could not be loaded" panel is replaced by an invitation to build a first
     theme, over a live account. One click on any Model control was enough.
     A document is only ever manufactured for an account we have READ and found empty. */
  if(c.name==="cloud" && !state.portfolio && !isNum(state.baseRevision)){
    state.syncError=(state.syncFailure&&state.syncFailure.short)||"your account has not been loaded";
    console.warn("save refused - this account has not been read yet");
    setTimeout(()=>toast("Not saved - your portfolio has not loaded yet. Reload and try again."),400);
    try{ renderSyncBadge(); }catch(e){}
    return false;
  }
  if(!state.portfolio)state.portfolio={holdings:{},totalContributed:0,versions:[],head:-1,createdAt:todayISO()};
  const doc=state.portfolio, owner=c.owner;      // C1
  syncStateIntoDocument();   // the edit must be IN the document before any refusal can file it

  /* C2 restated against the DOCUMENT: what is on screen must belong where we are about to write.
     This is the guard that stops an account's book reaching the identity-free store. */
  if(state.docSource && state.docSource!==c.name){
    console.error("refusing to save a "+state.docSource+" document to the "+c.name+" store");
    state.syncError="this portfolio was not loaded from "+(c.name==="cloud"?"your account":"this store");
    renderSyncBadge(); return false;
  }
  if(c.name==="cloud" && state.docOwner && state.docOwner!==owner){
    console.error("refusing to save one account's document into another");
    state.syncError="this portfolio belongs to a different account";
    renderSyncBadge(); return false;
  }

  stampPortfolioMeta(state.portfolio);           // E6.1: schemaVersion + monotonic revision + updatedAt
  state.syncError=null;

  let err=null, wrote=null;
  try{ wrote=await c.ad.save(doc); }catch(e){ err=e; }
  const still=ctxCurrent(c);                     // ---- the single checkpoint ----

  if(!err){
    if(!still){                                  // the write landed, but not for the session on screen
      console.warn("a save completed for a context that has since changed - not applying its result");
      return true;
    }
    state.syncStatus=c.name;
    // C3: only a CONFIRMED write advances the base, and only past the checkpoint.
    if(wrote && isNum(wrote.revision)){ state.baseRevision=wrote.revision; state.cloudRowExists=true; }
    // E9: nothing about the portfolio is written to this device. The `lan` adapter's mirror is the
    // iOS Wi-Fi-sync cache and is unrelated to the account path.
    if(still && c.ad.mirror) nativeSavePortfolio(doc);
    renderSyncBadge();
    return true;                                 // C5
  }

  // ---- the write did not land ----
  const whyS=describeCloudFailure(err);
  state.syncError=whyS.short;
  state.syncStatus=c.name+"-failed";
  console.error("save failed",err);

  if(err.conflict){
    /* Another device wrote first. Financial records are never auto-merged: the server's version
       wins, this edit is NOT applied, and the user is told plainly. E9: no copy is kept on the
       device - the change simply did not happen. */
    state.baseRevision=null;                     // C3 - the server's revision is not yet loaded
    try{
      await loadPortfolio(); rebuildThemeOf(); rebuildFundamentals(); renderAll();
      const got = state.syncStatus==="cloud" && isNum(state.baseRevision);
      /* E9 - say what actually happened. Nothing is kept aside any more, and on the failed-reload
         branch the screen is EMPTY (loadPortfolio nulls the document), not "the local copy". */
      setTimeout(()=>toast(got
        ? "Changed on another device - that version is now on screen. Your change was NOT applied; make it again if you still want it."
        : "Changed on another device, and that version could not be fetched. Your change was NOT applied - reload when your connection is back."),400);
    }catch(e2){
      console.error("conflict reload failed",e2); state.baseRevision=null;
      setTimeout(()=>toast("Changed elsewhere and the reload failed - refresh the page before editing."),400);
    }
    renderSyncBadge();
    return false;
  }

  /* E9 - nothing is written to this device. The change is still on screen, so the user can try
     again; if they navigate away it is gone, which is what "not saved" means. */
  if(still && c.ad.mirror) { try{ nativeSavePortfolio(doc); }catch(e2){} }   // iOS LAN sync only
  /* Say WHY, and do not tell someone to retry something retrying cannot fix (a misconfigured
     database will refuse every attempt identically). */
  /* NOT whyS.act - those are written for the READ path, where reloading is the right advice. On a
     failed save the edit exists only on screen, so telling the user to reload would discard the very
     thing that was not saved. */
  setTimeout(()=>toast("NOT saved - "+whyS.detail+" Your change is still on screen"+
    (whyS.ours ? "; this one is our fault." : " - try again, or reload to discard it and see what your account holds.")),400);
  renderSyncBadge();
  return false;                                  // C5
}

/* ======================================================================
   Market session - the ONE place that decides whether the market is open.
   renderStatus and the auto-refresh gate both read from here, so the label the user sees and
   the decision to send a request can never disagree.
   ====================================================================== */
const MKT_TZ="America/New_York";
const MKT_OPEN_MIN=9*60+30, MKT_CLOSE_MIN=16*60;   // regular session, 09:30-16:00 exchange time

/* Yahoo's own answer, from whichever holding reported it. null until a quote has been fetched. */
function marketState(){
  for(const s of membership()){ const q=state.quotes[s]; if(q&&q.marketState) return q.marketState; }
  return null;
}

/* Clock-only, in EXCHANGE time. Costs nothing and needs no request, which is the point: it rules
   out every night and weekend without asking Yahoo anything. Intl does the DST conversion, so
   this stays correct across the March/November shifts and wherever the user happens to be.
   It cannot know about holidays - marketState covers those, once we have a quote. */
function withinRegularHours(now){
  try{
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:MKT_TZ,weekday:"short",
      hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(now||new Date());
    const get=t=>(parts.find(x=>x.type===t)||{}).value;
    const wd=get("weekday");
    if(wd==="Sat"||wd==="Sun") return false;
    const mins=parseInt(get("hour"),10)*60+parseInt(get("minute"),10);
    return isNum(mins) && mins>=MKT_OPEN_MIN && mins<MKT_CLOSE_MIN;
  }catch(e){ return true; }   // fail OPEN: never silently stop updating a money display
}

/* No AUTOMATIC request while the market is shut. A tab left open over a weekend used to poll
   every 60 seconds for two days for data that cannot move - about 2,880 requests for nothing,
   and pointless traffic is exactly what gets an IP throttled.
   A manual Refresh is deliberately NOT gated: the user asked for that one explicitly. */
let _lastAutoPoll=0;
const CLOSED_PROBE_MS=10*60*1000;   // inside session hours but reported closed (a holiday): probe slowly
function autoPollAllowed(){
  if(!withinRegularHours()) return false;
  const st=marketState();
  if(st && st!=="REGULAR") return (Date.now()-_lastAutoPoll) >= CLOSED_PROBE_MS;
  return true;
}

/* ======================================================================
   Render: header / status
   ====================================================================== */
function renderStatus(){
  const st=marketState();
  const dot=$("#mktDot"), lab=$("#mktLabel");
  const map={REGULAR:["open","Market open"],PRE:["pre","Pre-market"],PREPRE:["pre","Pre-market (early)"],
    POST:["post","After hours"],POSTPOST:["post","After hours (late)"],CLOSED:["closed","Market closed"]};
  const m=map[st]||["closed", st?("Market "+st.toLowerCase()):"Status unknown"];
  dot.className="dot "+m[0]; lab.textContent=m[1];
  const anySeed=membership().some(s=>state.quotes[s]&&state.quotes[s].source==="seed");
  const t=state.asOf?new Date(state.asOf*1000):new Date();
  /* Without this the display just stops changing and looks broken. */
  const _sel=$("#refreshSel"), _autoOn=_sel&&parseInt(_sel.value,10)>0;
  const _paused=_autoOn && !autoPollAllowed();
  $("#updated").textContent="Updated "+t.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})
    +(anySeed?" · offline seed":"")+(_paused?" · auto-refresh paused (market closed)":"");
}

/* ======================================================================
   Render: PRICES view
   ====================================================================== */
/* ===== E5.1 Overview =====
   Value history is RECONSTRUCTED FROM REAL DATA ONLY — never estimated:
   each version snapshot holds the exact holdings + totalContributed at that
   checkpoint, and each transaction records the actual traded price per symbol.
   We carry the last traded price forward per symbol, and report a checkpoint's
   value ONLY when every holding at that point has a known traded price
   (otherwise the point is null and the line breaks). No interpolation, no
   synthetic prices. Between checkpoints untraded positions are held at their
   last traded price, which is why this is labelled "at traded prices". */
function valueHistory(){
  // Respect the active timeline: restoreVersion() only moves head, it never truncates versions
  // (that is what makes Redo work), so plotting the whole array would chart undone checkpoints.
  const _all=(typeof versions==="function")?versions():[];
  const _h=(typeof head==="function")?head():_all.length-1;
  const vs=_all.slice(0,Math.max(0,_h+1));
  const px={}, out=[];
  /* E10.1 - the window can open mid-life, because older checkpoints have been trimmed away and
     took their recorded prices with them. pushVersion stamps the last known price per symbol onto
     the oldest retained checkpoint so this reconstruction stays continuous; a checkpoint's own
     trades still overwrite the seed below, so newer prices always win. */
  if(vs.length && vs[0].pxSeed) Object.keys(vs[0].pxSeed).forEach(sym=>{
    if(isNum(vs[0].pxSeed[sym])) px[sym]=vs[0].pxSeed[sym]; });
  /* EQUAL-WEIGHT COUNTERFACTUAL (E5.6): the same money, the same names, the same dates — but every
     holding weighted equally. At each checkpoint the book is marked at that checkpoint's real traded
     prices, this checkpoint's new capital is added, and the whole thing is redistributed to EXACTLY
     equal weight across the names held then. Between checkpoints it simply drifts with prices, which
     mirrors the real portfolio (no rebalance happens unless the user rebalances). It therefore isolates
     the WEIGHTING model: same selection, same cash flows, same prices. All prices are recorded trade
     prices — nothing is estimated.
     ONE qualification since E10.1: if older checkpoints have been trimmed away, the series is
     re-anchored at the oldest kept checkpoint (it opens holding what the book was really worth) and
     the prices it starts from are carried across the trim in `pxSeed`. Those are still recorded
     trade prices, but the OPENING BALANCE is an anchor, not a reconstruction - the comparison is
     then over the kept window rather than since inception, which renderValueChart discloses. */
  let ewShares={};
  /* E10.1 - and it must OPEN holding whatever the book was already worth. vs[0] is no longer
     guaranteed to be the initial build: starting the counterfactual from zero capital there made
     it restart mid-life while `value` and `invested` stayed cumulative, so the Overview and the
     return chart reported an equal-weight return that never happened (a book worth $60,000 read as
     "equal weight -96%"). A genuine INITIAL build records valueBefore 0, so an untrimmed book is
     bit-for-bit unaffected. Only the TOTAL is needed - it is redistributed to equal weight
     immediately below, so the opening basket's composition never survives the first checkpoint. */
  const ewOpen=(vs.length&&isNum(vs[0].valueBefore))?vs[0].valueBefore:0;
  vs.forEach((v,vi)=>{
    (v.trades||[]).forEach(tr=>{ if(tr&&tr.sym&&isNum(tr.price)) px[tr.sym]=tr.price; });
    const snap=v.snapshot||{}, h=snap.holdings||{};
    let val=0, held=0, priced=0;
    Object.keys(h).forEach(sym=>{
      const sh=h[sym]?h[sym].shares:0; if(!isNum(sh)||sh<=0) return;
      held++; if(isNum(px[sym])){ priced++; val+=sh*px[sym]; }
    });
    // --- equal-weight book at this checkpoint ---
    const mem=Object.keys(h).filter(sym=>{ const sh=h[sym]?h[sym].shares:0; return isNum(sh)&&sh>0&&isNum(px[sym]); });
    let ewBefore=0; Object.keys(ewShares).forEach(sym=>{ if(isNum(px[sym])) ewBefore+=ewShares[sym]*px[sym]; });
    if(vi===0) ewBefore=ewOpen;                    // the window opens where the real book stood
    const ewAfter=ewBefore+(isNum(v.cashIn)?v.cashIn:0);
    if(mem.length&&ewAfter>0){ const slice=ewAfter/mem.length;
      ewShares={}; mem.forEach(sym=>{ ewShares[sym]=slice/px[sym]; }); }
    // Prefer the value RECORDED at the checkpoint (buildTxn stores plan.newTotal) — that's the
    // authoritative figure. The mark-to-last-traded-price reconstruction above is only a fallback
    // for older versions that predate it. (Cross-checked on the real book: the reconstruction
    // reproduces every recorded value to ~1e-9, so the fallback is trustworthy where it's needed.)
    const recorded=isNum(v.valueAfter)?v.valueAfter:null;
    out.push({ label:v.date||("#"+v.id), type:v.type||"",
      invested:isNum(snap.totalContributed)?snap.totalContributed:null,
      value: recorded!=null ? recorded : ((held>0&&priced===held)?val:null),
      ew: (mem.length&&ewAfter>0)?ewAfter:null,
      estimated: recorded==null });
  });
  if(isInit()){
    // "now" = mark both books to LIVE prices; no rebalance happens here (the user hasn't rebalanced)
    let ewNow=0, ewPriced=true;
    Object.keys(ewShares).forEach(sym=>{ const p=price(sym);
      if(isNum(p)) ewNow+=ewShares[sym]*p; else if(isNum(px[sym])) ewNow+=ewShares[sym]*px[sym]; else ewPriced=false; });
    out.push({ label:"now", type:"LIVE", invested:totalContributed(), value:curTotal(),
      ew: (Object.keys(ewShares).length&&ewPriced)?ewNow:null, live:true });
  }
  return out;
}
/* APP2.6 - one chart, three series, on the phone. Purely a visibility switch over the two charts
   that already exist: rendering is untouched, so every feature of both - the invested reference,
   the dashed equal-weight counterfactual, touch scrubbing from APP2.11 - is kept rather than
   reimplemented. The web is unaffected; .ovseg is display:none there. */
let _ovSeg='value';
function ovSegMount(){
  /* Move the return chart's three nodes into card 1, once, before the first paint. CSS alone cannot
     do this: two sibling cards are two boxes, and stripping one's border only made the chart appear
     to escape its card. Card 2 itself stays put - .card:nth-of-type(3) must still be Allocation. */
  const c1=document.querySelector('.ov-left>.card:nth-of-type(1)');
  if(!c1) return;
  ['ovRetHead','ovRetChart','ovRetLegend'].forEach(id=>{ const e=$('#'+id); if(e) c1.appendChild(e); });
}
function ovSegApply(){
  if(typeof NATIVE==='undefined' || !NATIVE) return;
  const root=document.documentElement;
  root.classList.toggle('ovseg-value', _ovSeg==='value');
  root.classList.toggle('ovseg-ret',   _ovSeg!=='value');
  $$('.ovseg button[data-ovseg]').forEach(b=>{
    const on=b.dataset.ovseg===_ovSeg;
    b.classList.toggle('on',on); b.setAttribute('aria-selected',String(on));
  });
}
function ovSegSet(v){
  if(v!=='value'&&v!=='pct'&&v!=='dol') return;
  _ovSeg=v; ovSegApply();
  /* setReturnUnit redraws the return chart AND keeps the hidden %/$ switch in step, so the two
     controls can never disagree about which unit is showing. */
  if(v!=='value') setReturnUnit(v==='dol'?'dol':'pct');
}
function setReturnUnit(u){
  RET_UNIT=(u==="dol")?"dol":"pct";
  const pc=$("#retPct"), dl=$("#retDol");
  if(pc){ pc.classList.toggle("on",RET_UNIT==="pct"); pc.setAttribute("aria-pressed",String(RET_UNIT==="pct")); }
  if(dl){ dl.classList.toggle("on",RET_UNIT==="dol"); dl.setAttribute("aria-pressed",String(RET_UNIT==="dol")); }
  try{ renderReturnChart(valueHistory()); }catch(e){ console.error("return chart",e); }
}
/* ===== E6.4 - account UI ==============================================================
   Deliberately additive: signed out, the app behaves exactly as before and keeps using
   local storage. Signing in switches the storage adapter and nothing else. */
/* ===== E6.8 - the gate ==================================================================
   Nobody reaches the app without a session. The safeguard that matters: a VALID STORED
   SESSION still opens the app, but E9 removed every local copy - so if the backend cannot be
   reached the app says so rather than showing stale data. The gate is there to keep strangers
   out; it is not what stops the portfolio loading during an outage. */
let gateSetMode=null;                       // assigned by wireGate so showGate can reset the form
function showGate(show){
  const g=$("#gate"); if(!g) return;
  const wasHidden=g.hidden!==false;
  g.hidden=!show;
  document.documentElement.classList.toggle("gated",!!show);
  /* E6 FIX - the gate was only a z-index cover. setupEvents() has already wired the app beneath
     it, so Tab walked straight off the gate's own controls into live buttons - including
     "Reset portfolio", and the account button, which opened a second, unguarded sign-in path. */
  const app=document.querySelector(".app");
  if(app){
    if(show){ app.setAttribute("inert",""); app.setAttribute("aria-hidden","true"); }
    else    { app.removeAttribute("inert"); app.removeAttribute("aria-hidden"); }
  }
  // Only reset on the way IN. A second lockOut while the user is typing must not blank the form.
  if(show){ try{ coachEnd(); }catch(e){} }     // never leave a tour running behind the gate
  if(show){ try{ captchaEnsure(); }catch(e){} }   // cheap and idempotent; the guard inside stops re-renders
  if(show && wasHidden){
    /* E6 FIX - the form is wiped on the way IN. It used to keep the previous user's email address
       on screen after a sign-out (disclosing who was last here on a shared machine), keep a stale
       error message, and keep `mode` on "signup" - so the next press of a button labelled
       "Sign in" actually attempted a registration. */
    const em=$("#gateEmail"), pw=$("#gatePass"), ms=$("#gateMsg"), b=$("#gateGo");
    if(em) em.value=""; if(pw) pw.value="";
    const p2=$("#gatePass2"); if(p2) p2.value="";
    if(ms){ ms.className="auth-msg"; ms.textContent=""; }
    /* The widget is rendered here as well as from the script's own onload, because either can
       happen first - the script is async. A fresh challenge per visit, so a token solved by the
       PREVIOUS person on a shared browser is never reused. */
    try{ captchaEnsure(); captchaReset(); }catch(e){}
    if(b){ b.disabled=false; }
    if(gateSetMode) gateSetMode("signin");
    setTimeout(()=>{ if(em) em.focus(); },40);
  }
}
/* Set the BUTTON LABEL without destroying the button. setMode and submit both used
   gateGo.textContent, which replaces every child - including the arrow span that E12 §4.8
   requires to sit flush right. The arrow silently vanished on the first render. */
function gateGoLabel(t){ const l=$("#gateGoLabel"); if(l) l.textContent=t; else { const b=$("#gateGo"); if(b) b.textContent=t; } }
function gateMsg(kind,text){
  const m=$("#gateMsg"); if(!m) return;
  m.className="auth-msg show "+(kind==="ok"?"ok":"err"); m.textContent=text;
}
function wireGate(){
  const g=$("#gate"); if(!g) return;
  let mode="signin";
  const setMode=m=>{ mode=m;
    $("#gateTitle").textContent = m==="signin"?"Sign in":"Create an account";
    $("#gateSub").textContent   = m==="signin"
      ? "Your portfolio and its rebalance history \u2014 kept to your account, and nowhere else."
      : "You will get an email to confirm the address before your first sign-in.";
    gateGoLabel(m==="signin"?"Sign in":"Create account");
    $("#gateToggle").textContent= m==="signin"?"Create an account":"I already have an account";
    $("#gatePass").setAttribute("autocomplete", m==="signin"?"current-password":"new-password");
    /* E12 §4.8: Confirm password and the captcha belong to create-account only. */
    const cw=$("#gateConfirmWrap");
    if(cw){ cw.hidden = (m!=="signup"); if(cw.hidden && $("#gatePass2")) $("#gatePass2").value=""; }
  };
  gateSetMode=setMode;                      // so showGate() can reset the form
  $("#gateToggle").addEventListener("click",()=>setMode(mode==="signin"?"signup":"signin"));
  $("#gateLegal").addEventListener("click",openLegal);
  $("#gateForgot").addEventListener("click",async()=>{
    const email=($("#gateEmail").value||"").trim();
    if(!email){ gateMsg("err","Enter your email address first, then press this again."); return; }
    try{ await sbRecover(email); gateMsg("ok","If that address has an account, a reset link is on its way."); }
    catch(e){ gateMsg("err",e.message||"Could not send the reset email."); }
    finally{ captchaReset(); }
  });
  const submit=async()=>{
    const email=($("#gateEmail").value||"").trim(), pass=$("#gatePass").value||"";
    if(!email||!pass){ gateMsg("err","Email and password are both required."); return; }
    /* Caught here rather than at Supabase: a typo in a NEW password is otherwise only
       discovered at the next sign-in, with no way to know what was actually stored. */
    if(mode==="signup"){
      const p2=$("#gatePass2")? ($("#gatePass2").value||"") : "";
      if(!p2){ gateMsg("err","Confirm your password."); return; }
      if(p2!==pass){ gateMsg("err","Those passwords do not match."); return; }
    }
    const b=$("#gateGo"); b.disabled=true; gateGoLabel("Working\u2026");
    try{
      if(mode==="signup"){
        const r=await sbSignUp(email,pass);
        if(r.needsConfirmation){
          b.disabled=false; setMode("signin"); captchaReset();
          gateMsg("ok","Account created. Confirm the link in your email, then sign in.");
          return;
        }
      } else { await sbSignIn(email,pass); }
      /* E6 FIX - dismissal is conditioned on an ACTUAL session, not merely on "nothing threw".
         sbAdoptSession returns null without throwing for any 2xx that carries no access_token,
         which would have dropped the gate for an unauthenticated visitor. */
      if(!signedIn()) throw new Error("Sign-in did not return a session. Please try again.");
      /* E6 FIX - start from nothing. Boot could previously leave a dead session's data hydrated in
         memory (lockOut fires mid-await, the rest of loadPortfolio carries on and repopulates), and
         the sign-in path never cleared it - so the next account inherited the previous one's
         presets, weights, penalty, cap, themes, membership and watchlist, and wrote them into its
         own row on the first save. */
      appLocked=false;
      try{ closeModal(); }catch(e){}     // nothing from the previous session may outlive the gate
      clearAccountState();
      $("#gatePass").value="";
      /* E6 FIX - the app is loaded BEFORE the gate comes down. Dropping it first meant the new
         user stared at the PREVIOUS user's holdings, totals and history - still painted in the
         DOM underneath - for the several seconds bootSignedIn spends on the network. */
      gateGoLabel("Loading your portfolio\u2026");
      try{ await bootSignedIn(); } finally{ booting=false; }
      /* E6 FIX - re-check AFTER the load. bootSignedIn swallows its own errors, so a session that
         died during it (raising the gate via lockOut) would otherwise have the gate torn straight
         back down here, leaving the app running unauthenticated with the price timer started. */
      if(!signedIn() || appLocked) throw new Error("Your session ended while loading. Please sign in again.");
      b.disabled=false; gateGoLabel("Sign in");
      showGate(false);
      setupAutoRefresh();                          // start the price timer only once past the gate
      startIdleWatch();                            // ...and the idle clock, on the same condition
      await postSignInPrompts();                   // only now can the user actually see a dialog
    }catch(e){
      b.disabled=false; setMode(mode);
      /* A solved token is single-use. Without this the SECOND attempt fails with a confusing
         captcha error instead of the real reason - a wrong password would read as a robot check. */
      captchaReset();
      gateMsg("err", e.message==="Invalid login credentials"
        ? "That email and password did not match an account."
        : (e.message||"Sign-in failed."));
    }
  };
  $("#gateGo").addEventListener("click",submit);
  // E6 FIX: Enter bypassed the button's disabled flag, so a held key started overlapping submits.
  ["gateEmail","gatePass"].forEach(id=>$("#"+id).addEventListener("keydown",e=>{
    if(e.key==="Enter" && !$("#gateGo").disabled) submit(); }));
  setMode("signin");
}
/* Load everything for a signed-in session. Used both on boot and right after signing in. */
async function bootSignedIn(){
  try{ await loadPortfolio(); }catch(e){ console.error("load failed",e); }
  rebuildThemeOf();
  /* Paint what we already know BEFORE waiting on prices. The portfolio is the thing the user came
     for; market data only decorates it. Awaiting both meant one wedged proxy request left the app
     showing empty chrome with no message at all. */
  renderAcctBtn(); renderSyncBadge(); renderAll();
  try{ await Promise.all([loadQuotes(), loadFundamentals(false), loadStatements()]); rebuildFundamentals(); }
  catch(e){ console.error(e); toast("Some market data failed to load - using fallback"); }
  renderAll();
}
/* E6 FIX - the modal prompts MUST NOT live inside bootSignedIn().
   The gate is opaque and sits at z-index 400; a modal renders at 80. bootSignedIn() is awaited by
   the gate submit WHILE THE GATE IS STILL UP, so awaiting a modal from in here meant waiting
   forever on a dialog painted underneath an opaque overlay - a permanent deadlock on the very
   path E6.6 exists for (first sign-in, empty account, a local book to import). Only a page reload
   escaped it. These now run after showGate(false), from both boot paths. */
async function postSignInPrompts(){
  if(!signedIn() || appLocked) return;
  /* "Empty account" means NO ROW, not "no holdings": an account undone back past its first
     checkpoint, or reset, was declared empty over a live row - and "Start fresh" then wrote an
     empty document over its entire checkpoint history on the next autosave. */
  if(state.cloudRowExists===false) await offerImportIfLocalExists();   // E6.6

}
/* E6.6 - the account is empty. Is there a portfolio on THIS MACHINE worth importing?
   The local store is only ever READ here. Three guards decide whether to even ask:

   1. The account must be CONFIRMED empty. A cloud read that FAILED is not an empty account -
      announcing "this account is empty" over a real book, on a paused project, pushed the user
      toward "Start fresh".
   2. The book must not already belong to somebody else. localStorage is per-browser, not
      per-user: without a claim, the second person to sign in on this machine was shown the
      first person's holdings, checkpoints and contributed dollars, and could upload them.
   3. The server-side portfolio.json is only consulted on a PRIVATE host. On a shared
      deployment /api/portfolio carries no user identity at all, so it is one file for
      everybody - never a candidate for "your" book. */
/* Two separate ideas, which one key used to conflate:
   OWNER  - somebody imported this device's book into their account, so it is now THEIR data and
            must never be shown to anyone else. Set only on a successful import.
   SEEN   - this particular user has already been asked and said no. Stops the nagging without
            claiming the book, so the machine's actual owner can still import it later.
   Conflating them meant a guest who sensibly declined ("that book isn't mine") permanently locked
   the real owner out of importing their own portfolio. */
const LOCAL_OWNER_KEY="pb_local_owner", LOCAL_CLAIM_KEY="pb_local_claim";
function localOwner(){
  try{ return localStorage.getItem(LOCAL_OWNER_KEY)||localStorage.getItem(LOCAL_CLAIM_KEY)||""; }catch(e){ return ""; }
}
function setLocalOwner(uid){ try{ if(uid) localStorage.setItem(LOCAL_OWNER_KEY,uid); }catch(e){} }
function importAsked(uid){ try{ return !!uid && localStorage.getItem("pb_import_asked_"+uid)==="1"; }catch(e){ return false; } }
function setImportAsked(uid){ try{ if(uid) localStorage.setItem("pb_import_asked_"+uid,"1"); }catch(e){} }
function isPrivateHost(){
  const h=(location.hostname||"").toLowerCase();
  return h===""||h==="localhost"||h==="127.0.0.1"||h==="[::1]"||h==="::1";
}
async function offerImportIfLocalExists(){
  if(!signedIn()) return;
  const uid=sbUserId();
  const own=localOwner();
  if(own && own!==uid) return;                     // guard 2: this device's book belongs to another account
  if(importAsked(uid)) return;                     // already asked this user; do not nag
  if(state.syncStatus!=="cloud" || state.cloudRowExists!==false){   // guard 1: a CONFIRMED empty account
    console.warn("skipping the import offer - the account was not confirmed empty ("+state.syncStatus+"/"+state.cloudRowExists+")");
    return;
  }
  /* Ask the RIGHT store first. On the web the book has always lived in portfolio.json on the
     machine, served by server.py - pb_portfolio_v1 is the iOS on-device store and, on a browser,
     is at best stale leftovers. Preferring it offered the wrong portfolio to import: exactly the
     one moment where getting it wrong means uploading the wrong book into a brand-new account. */
  let localP=null, src="";
  if(NATIVE){
    try{ localP=nativeLoadPortfolio(); if(localP) src="on this device"; }catch(e){}
  } else if(isPrivateHost()){                      // guard 3
    try{ localP=await webLoadPortfolio(); if(localP) src="on this computer"; }catch(e){}
    if(!localP){ try{ localP=nativeLoadPortfolio(); if(localP) src="in this browser"; }catch(e){} }
  }
  const n = localP && localP.holdings ? Object.keys(localP.holdings).length : 0;
  if(!n) return;                                   // nothing local worth importing
  /* AWAITED. openImportChoice used to return as soon as the modal was painted, so the stash
     prompt that runs next overwrote #modalRoot and the import offer was never seen - in exactly
     the situation (empty account + kept-aside work) the two were meant to cover together. */
  await openImportChoice(localP,src);
}

function renderAcctBtn(){
  const b=$("#acctBtn"); if(!b) return;
  if(signedIn()){ b.textContent="\u25CF " + (sbUserEmail()||"Account"); b.classList.add("on");
                  b.title="Signed in - your portfolio syncs to your account"; }
  else{ b.textContent="Sign in"; b.classList.remove("on");
        b.title="Sign in to sync this portfolio to your account"; }
}
/* E11.5 - the user's own copy of their own data. Also the honest counterpart to E9: nothing is
   kept on the device, so there must be a way to take it OFF the service deliberately. */
function exportMyData(){
  const doc=syncStateIntoDocument();
  if(!doc){ toast("Nothing to export yet"); return; }
  /* Exactly the document that WOULD BE SAVED, not a second view assembled for the occasion -
     otherwise the export quietly drifts from the thing it claims to be a copy of. */
  const payload=JSON.stringify({exportedAt:new Date().toISOString(), account:sbUserEmail()||null,
                                revision:state.baseRevision, portfolio:doc}, null, 2);
  const name="portfolio-"+todayISO()+".json";
  const url=URL.createObjectURL(new Blob([payload],{type:"application/json"}));
  const a=document.createElement("a"); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
  toast("Downloaded "+name);
}

/* Deletion runs through a SECURITY DEFINER function (sql/002_delete_own_account.sql) that can only
   ever delete its own caller. The alternative is the service role key, which carries BYPASSRLS and
   must never exist in a browser. */
async function deleteMyAccount(){
  const who=sbUserEmail()||"this account";
  if(!confirm("Permanently delete "+who+"?\n\nYour holdings, every checkpoint, your themes and "
    +"your watchlist are erased from the database immediately. This cannot be undone and there is "
    +"no backup you can restore from.\n\nIf you want a copy, cancel and use Download my data first.")) return;
  const btn=$("#acctDelete");
  if(btn){ btn.disabled=true; btn.textContent="Deleting\u2026"; }
  try{
    const r=await sbApi("/rest/v1/rpc/delete_own_account",
      {method:"POST", headers:{"Content-Type":"application/json"}, body:"{}"});
    if(!r.ok){ const t=await r.text(); throw new Error(t.slice(0,140)||("HTTP "+r.status)); }
    closeModal();
    try{ purgeLegacyLocalCopies(); }catch(e){}
    try{ await sbSignOut(); }catch(e){}      // the user no longer exists; local teardown still must run
    lockOut();
    toast("Account deleted");
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent="Delete my account"; }
    /* Say what actually happened. If the function has not been installed the account still exists,
       and reporting success would be a lie the user has no way to check. */
    toast("NOT deleted - "+((e&&e.message)||"the request failed"));
  }
}

/* E11.6 - the disclaimer and what is stored. Reachable BEFORE signing in (it is on the gate), so
   it carries .over-gate. Deliberately short: this is a free, non-commercial tool used by invited
   people, so it states the facts plainly rather than shipping a terms-of-service stack. */
/* E11.7 - feedback. Write-only by design: sql/003_feedback.sql grants INSERT and nothing else, so
   the client cannot read anyone's feedback back, including its own. That is also why this sends
   Prefer: return=minimal - asking PostgREST to return the row would fail on a table behaving
   exactly as intended. The owner reads it in the dashboard; there is no inbox and no SLA. */
async function sendFeedback(msg){
  const body=[{ user_id:sbUserId(), message:msg, app_version:(typeof APP_VERSION==='string'?APP_VERSION:null) }];
  const r=await sbApi('/rest/v1/feedback',{ method:'POST',
    headers:{ 'Content-Type':'application/json', 'Prefer':'return=minimal' },
    body:JSON.stringify(body) });
  if(!r.ok){ const t=await r.text(); const e=new Error(t.slice(0,160)||('HTTP '+r.status)); e.status=r.status; throw e; }
}

function openFeedback(){
  $("#modalRoot").innerHTML=`<div class="modal-backdrop" id="fbModal"><div class="modal-card card pad" style="max-width:460px">
    <h2 style="font-size:16px;margin:0">Send feedback</h2>
    <p class="small muted" style="margin:6px 0 10px">Goes straight to the developer with your build number. Nothing else about you is attached.</p>
    <textarea id="fbText" rows="6" placeholder="What happened, and what did you expect instead?"
      style="width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1px solid rgba(32,30,29,.13);border-radius:10px;background:var(--bg);color:var(--ink);resize:vertical"></textarea>
    <div id="fbMsg" class="xs" style="margin-top:8px;min-height:16px"></div>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px">
      <button class="btn" id="fbCancel">Cancel</button>
      <button class="btn primary" id="fbSend">Send</button>
    </div></div></div>`;
  const note=(cls,t)=>{ const el=$("#fbMsg"); if(el){ el.className='xs '+cls; el.textContent=t; } };
  $("#fbCancel").addEventListener("click",closeModal);
  $("#fbModal").addEventListener("click",e=>{ if(e.target.id==="fbModal")closeModal(); });
  $("#fbText").focus();
  $("#fbSend").addEventListener("click",async()=>{
    const b=$("#fbSend"), msg=($("#fbText").value||"").trim();
    if(!msg){ note('pen-ink','Write something first.'); return; }
    if(msg.length>4000){ note('pen-ink','That is longer than 4000 characters.'); return; }
    b.disabled=true; b.textContent='Sending…';
    try{
      await sendFeedback(msg);
      closeModal(); toast('Thanks - feedback sent');
    }catch(e){
      b.disabled=false; b.textContent='Send';
      /* Say what actually went wrong. Until sql/003_feedback.sql is applied this 404s, and
         reporting success there would be a lie the user has no way to check. */
      note('pen-ink', /relation|does not exist|42P01|404/i.test(e.message||'')
        ? 'Not sent - the feedback table has not been created yet.'
        : 'Not sent - '+((e&&e.message)||'the request failed'));
    }
  });
}

function openLegal(){
  $("#modalRoot").innerHTML=`<div class="modal-backdrop over-gate" id="legalModal"><div class="modal-card card pad" style="max-width:560px;max-height:86vh;overflow:auto">
    <h2 style="font-size:16px;margin:0">Before you use this</h2>

    <h3 style="font-size:13px;margin:16px 0 4px">This is not investment advice</h3>
    <p class="small muted" style="margin:0">Portfolio Builder is a personal tool for thinking about
      allocation. It is for information only. It is <b>not</b> investment, financial, tax or legal
      advice, and nothing in it is a recommendation, offer or solicitation to buy or sell any
      security. It is not a broker, and its author is not a registered investment adviser — using
      it creates no advisory relationship and no duty of any kind. Every decision, and every trade,
      is yours. Check the numbers against your broker before you act on them.</p>

    <h3 style="font-size:13px;margin:16px 0 4px">Market data</h3>
    <p class="small muted" style="margin:0">Prices and fundamentals come from third-party sources
      and are provided <b>as is</b>, with no warranty of accuracy, completeness or timeliness. They
      can be delayed, wrong, or missing. Do not rely on them as a record of what you own.</p>

    <h3 style="font-size:13px;margin:16px 0 4px">What is stored, and where</h3>
    <ul class="small muted" style="margin:0;padding-left:18px">
      <li>Your <b>email address</b> and a password you choose, handled by the authentication service.</li>
      <li>Your <b>portfolio</b> — holdings, checkpoints, portfolios, watchlist and settings — as a single
          record in a hosted Postgres database, one row per account.</li>
      <li><b>Only you can read it.</b> Access is enforced by the database itself, per row, not by
          this page.</li>
      <li><b>Nothing about your portfolio is kept on your device.</b> The only thing stored in your
          browser is a sign-in token so you stay signed in, and your light/dark preference.</li>
      <li><b>No analytics, no tracking, no advertising, no third-party scripts.</b> Market-data
          requests ask for a list of tickers and carry nothing that identifies you.</li>
    </ul>

    <h3 style="font-size:13px;margin:16px 0 4px">Your data is yours</h3>
    <p class="small muted" style="margin:0"><b>Account → Download my data</b> exports everything the
      account holds as JSON. <b>Account → Delete my account</b> erases it — immediately, permanently,
      and with no copy kept.</p>

    <div class="row" style="justify-content:flex-end;margin-top:18px">
      <button class="btn primary" id="legalClose">Close</button>
    </div></div></div>`;
  $("#legalClose").addEventListener("click",closeModal);
  $("#legalModal").addEventListener("click",e=>{ if(e.target.id==="legalModal")closeModal(); });
}

function openAccount(){
  /* E6 FIX: with a mandatory gate there is exactly one sign-in path. This used to render a second
     one, invisible BEHIND the gate but fully wired, which authenticated without ever clearing
     appLocked - leaving the user signed in with every save silently refused. That form, its
     adoptAccountPortfolio() flow and the authMsg() helper it used were deleted, not disabled. */
  if(appLocked || !signedIn()){ showGate(true); return; }
  {
    $("#modalRoot").innerHTML=`<div class="modal-backdrop" id="acctModal"><div class="modal-card card pad" style="max-width:420px">
      <h2 style="font-size:16px">Account</h2>
      <p class="small muted" style="margin:6px 0 0">Signed in as <b>${sbUserEmail()}</b></p>
      <p class="xs muted" style="margin:2px 0 0">Build ${APP_VERSION}</p>
      ${NATIVE?`<div class="acct-settings" id="acctSettings">
        <div class="ov-k" style="margin-bottom:8px">Settings</div>
        <div class="acct-srow"><span>Portfolio</span><span id="slotTheme"></span></div>
        <div class="acct-srow"><span>Auto-refresh prices</span><span id="slotRefresh"></span></div>
        <div class="acct-srow"><span>Guided tour</span><span id="slotTour"></span></div>
      </div>`:""}
      <p class="synced" style="margin-top:10px"><span class="dot2"></span>This portfolio lives only in your account &mdash; this app stores nothing about it on your device.</p>
      <button class="btn" id="acctExport" style="width:100%;margin-top:12px">\u2b07 Download my data</button>
      <p class="xs muted" style="margin:6px 0 0">Everything the account holds, as JSON &mdash; holdings, checkpoints, portfolios, watchlist and settings.</p>
      <div class="row" style="justify-content:space-between;margin-top:16px">
        <button class="btn" id="acctSignOut">Sign out</button>
        <button class="btn" id="acctClose">Close</button>
      </div>
      <button class="btn" id="acctFeedback" style="width:100%;margin-top:10px">✉ Send feedback</button>
      <p class="xs muted" style="margin:14px 0 0;text-align:center"><button class="linkish" id="acctLegal" type="button">Not investment advice &middot; what we store</button></p>
      <p class="xs muted" style="margin:18px 0 6px;border-top:1px solid rgba(32,30,29,.13);padding-top:12px">Delete this account and everything in it. This cannot be undone.</p>
      <button class="btn danger ghost" id="acctDelete" style="width:100%">Delete my account</button>
      </div></div>`;
    if(NATIVE) nativeAdoptChrome();
    $("#acctClose").addEventListener("click",closeModal);
    $("#acctExport").addEventListener("click",exportMyData);
    $("#acctLegal").addEventListener("click",openLegal);
    $("#acctFeedback").addEventListener("click",openFeedback);
    $("#acctDelete").addEventListener("click",deleteMyAccount);
    $("#acctModal").addEventListener("click",e=>{ if(e.target.id==="acctModal")closeModal(); });
    $("#acctSignOut").addEventListener("click",async()=>{
      const uid=sbUserId();
      await sbSignOut(); closeModal();
      /* E9 - nothing of this account may remain on the device. This also sweeps up anything an
         earlier version wrote before local copies were removed. */
      try{ purgeLegacyLocalCopies(); }catch(e){}
      lockOut();                            // E6.8: clears state, stops the timer, returns to the landing page
      toast("Signed out");
    });
    return;
  }
}
/* E6 FIX - the modal sign-in form and adoptAccountPortfolio() were DELETED here, not disabled.
   With a mandatory gate there is exactly one way into the app, and a second auth path that
   nothing could reach was pure hazard: it authenticated without clearing appLocked, without
   clearing the previous account's state, and without re-checking the session after loading -
   none of the safeguards the gate path carries. Two reviews flagged it as latent; latent code
   becomes live the moment somebody relaxes the gate. The account modal above (sign out / close)
   is all that remains. */
function openImportChoice(local,src){
 return new Promise(resolveChoice=>{
  // If anything else tears the modal down (lockOut calls closeModal), the awaiting caller must
  // still be released - otherwise bootSignedIn stays suspended for the rest of the page's life.
  _modalResolve=resolveChoice;
  const where=src||"on this computer";
  const h=Object.keys((local&&local.holdings)||{}).length;
  const v=((local&&local.versions)||[]).length;
  const contributed=(local&&isNum(local.totalContributed))?money(local.totalContributed,0):"-";
  $("#modalRoot").innerHTML=`<div class="modal-backdrop" id="impModal"><div class="modal-card card pad" style="max-width:460px">
    <h2 style="font-size:16px">This account is empty</h2>
    <p class="small muted" style="margin:6px 0 0">Signed in as <b>${sbUserEmail()}</b>. There is no portfolio
      stored against it yet. One was found ${where}:</p>
    <div class="card pad" style="margin:12px 0;background:var(--surface)">
      <div class="small"><b>${h}</b> holdings &middot; <b>${v}</b> checkpoint${v===1?"":"s"} &middot; ${contributed} contributed</div>
      <div class="xs muted" style="margin-top:4px">Its history comes with it; from then on the ${MAX_VERSIONS} most recent checkpoints are kept.</div>
    </div>
    <div id="impMsg" class="auth-msg"></div>
    <div class="row" style="gap:8px;margin-top:6px">
      <button class="btn primary" id="impYes" style="flex:1">Import it into my account</button>
      <button class="btn" id="impNo">Start fresh</button>
    </div>
    <p class="xs muted" style="margin:12px 0 0">Your local file is left exactly as it is either way &mdash; but this
      offer is only made once, so if you choose <b>Start fresh</b> you will not be asked again.</p>
  </div></div>`;
  const close=()=>{ closeModal(); };                    // closeModal resolves via _modalResolve
  $("#impNo").addEventListener("click",async()=>{
    /* E6 FIX - re-check, exactly as the import button does. Without it a modal that outlived its
       session could be answered against a DIFFERENT account, and this handler would overwrite
       that account's holdings and entire checkpoint history with an empty document. */
    let live=null;
    try{ live=await cloudLoadPortfolio(); }
    catch(e){ close(); toast("Could not confirm the account is empty - nothing was changed."); return; }
    if(live){ close(); toast("This account already has a portfolio - loaded that instead.");
      await bootSignedIn(); return; }
    /* NOTE: close() is deliberately NOT called here. It resolves the awaiting caller, which then
       paints the kept-aside-work prompt - and a restore from that prompt, landing while this
       INSERT was still in flight, made the blank document's own save drop the restored stash. */
    state.portfolio={holdings:{},totalContributed:0,versions:[],head:-1,createdAt:todayISO()};
    /* A BLANK board, not the five built-in themes with nothing in them. Leaving state.themes null
       MEANS "use the defaults", so "Start fresh" used to show the seed universe and a donut of
       target weights over themes the user had never chosen. */
    useNoThemes(); state.watchlist=[];      // E8: an empty board is just an empty list
    // A fresh account starts on the DEFAULTS, not on whatever the previous session left in memory.
    state.presets=[]; state.metrics=null; state.metricCfg=null; state.overrides={};
    state.weights=Object.assign({},DEFAULT_CONFIG.weights);
    state.penalty=Object.assign({},DEFAULT_CONFIG.penalty);
    state.cap=null; state.computeFromStatements=true;
    state.docSource="cloud"; state.docOwner=sbUserId();
    rebuildThemeOf(); rebuildFundamentals(); renderAll();
    // Actually create the row, rather than only claiming to have done so.
    const ok=await savePortfolio();
    if(ok) setImportAsked(sbUserId());   // only once it actually took: a failed write must be re-offerable
    close();                             // release the next prompt only now
    toast(ok ? "Started fresh - build your first theme on Model"
             : "Started fresh here, but the account could not be written yet - see the sync badge");
    /* Land them where the work actually starts, and walk them through it. Left on Overview a new
       user sees five empty cards and no obvious next move. */
    switchView("fundamentals");
    coachStart("fundamentals", true);
  });
  $("#impYes").addEventListener("click",async()=>{
    const b=$("#impYes"); b.disabled=true; b.textContent="Importing\u2026";
    try{
      /* Re-check: the row may have appeared since the prompt opened (another device, or a
         retry). A re-check that FAILS must abort - swallowing it treated "could not check" as
         "confirmed empty" and imported over a live account. */
      let existing=null;
      try{ existing=await cloudLoadPortfolio(); }
      catch(e){ throw new Error("could not confirm the account is empty ("+(e.message||"check failed")+")"); }
      if(existing){ close(); setImportAsked(sbUserId());
        await bootSignedIn();                     // load FIRST, then report - it can fail
        toast(state.cloudRowExists && state.syncStatus==="cloud"
                ? "This account already has a portfolio - loaded that instead of importing."
                : "This account already has a portfolio, but it could not be loaded just now.");
        return; }
      /* E6 FIX - go through the SAME hydration a normal load uses. Assigning state.portfolio
         directly skipped it, and savePortfolio then overwrote the document's config from the
         module defaults still sitting in state: the imported book arrived in the account with
         its themes, theme membership, watchlist, metric list, per-metric config, presets,
         overrides, cap, weights and penalty all wiped - and a legacy file never got its version
         history migrated, because migrateVersions() lives in that hydration too. */
      hydrateFromDocument(local);
      state.docSource="cloud"; state.docOwner=sbUserId();
      state.baseRevision=0;                       // confirmed no row: the first write becomes revision 1
      state.portfolio.revision=0;
      const ok=await savePortfolio();             // INSERTs the row
      if(!ok) throw new Error(state.syncError||"the write did not reach your account");
      setLocalOwner(sbUserId()); setImportAsked(sbUserId());   // now genuinely this account's data
      rebuildThemeOf(); rebuildFundamentals(); renderAll();
      close(); toast("Imported - "+h+" holdings and "+v+" checkpoint"+(v===1?"":"s")+" now in your account");
    }catch(e){
      console.error("import failed",e); b.disabled=false; b.textContent="Import it into my account";
      const m=$("#impMsg"); if(m){ m.className="auth-msg show err"; m.textContent="Import failed: "+(e.message||"unknown error")+". Your local copy is untouched."; }
    }
  });
  $("#impModal").addEventListener("click",e=>{ if(e.target.id==="impModal") close(); });
 });
}

/* ===== E12 4.2 Overview ======================================================================
   THE DAY IS THE ACCENT (rule 9). Derived from the day figure in ONE place and written to a root
   attribute, so no component rule branches on the day - if one did, the next component would
   forget to. Two things deliberately do NOT follow it: the portfolio ramp, which identifies a
   portfolio rather than measuring it, and the fixed gain/loss semantics, because a portfolio that
   is up prints green on a red day. */
function applyDayAccent(){
  var down=false;
  try{ down = isInit() && dayPL() < 0; }catch(e){}
  document.documentElement.setAttribute("data-day", down ? "down" : "up");
}

let EW_ON=true;
/* What the value chart was last drawn AT, and whether a scrub is in flight. Both exist for the
   resize watcher below - see the note there. */
let OV_W=0, OV_HT=0, OV_SCRUBBING=false;
let OV_RANGE="1D";

/* ===== 1D: the session view ===================================================================
   The spec left this open between accumulating ticks and adding a dsIntraday adapter. Ticks win on
   the owner's own constraint: a dsIntraday adapter means a SECOND Yahoo endpoint per symbol on every
   60s poll - roughly a doubling of the call rate against a free, unkeyed, rate-limited endpoint,
   which is the ban risk he flagged. This costs nothing: the poll already runs, and every tick is a
   value we have already paid for. It is a session view and says so - a reload starts it again.

   The day's opening basis is derived ONCE, from dayPL, as curTotal-dayPL. dayPL already accounts for
   what you actually held at the open and what you spent buying today; recomputing that here would be
   a second reader of one fact, which is how this codebase has broken before. */
function dayOpenValue(){ return curTotal()-dayPL(); }
let OV_TICKS=[];
function ovTick(){
  if(!isInit()) return;
  const v=curTotal(); if(!isNum(v)) return;
  const t=new Date();
  const label=t.getHours()+":"+String(t.getMinutes()).padStart(2,"0");
  const last=OV_TICKS[OV_TICKS.length-1];
  if(last&&last.label===label){ last.value=v; return; }   // one point per minute, not one per render
  OV_TICKS.push({ label:label, value:v, invested:totalContributed(), live:true });
  if(OV_TICKS.length>600) OV_TICKS.splice(0,OV_TICKS.length-600);
}
function ovIntraday(){
  if(!isInit()) return [];
  const open=dayOpenValue(); if(!isNum(open)) return [];
  const inv=totalContributed();
  return [{ label:"OPEN", value:open, invested:inv, type:"" }].concat(OV_TICKS);
}

const OV_RANGE_DAYS={"1D":1,"1W":7,"1M":31,"3M":93,"1Y":366,"ALL":null};

function ovSeries(){
  if(OV_RANGE==="1D") return ovIntraday();
  const H=valueHistory()||[];
  const days=OV_RANGE_DAYS[OV_RANGE];
  if(!days||H.length<2) return H;
  const cut=Date.now()-days*864e5;
  const within=H.filter(function(pt){ const t=Date.parse(pt.at||pt.date||""); return !isFinite(t)||t>=cut; });
  return within.length>=2 ? within : H.slice(-2);
}

/* THE PERIOD FIGURE IS A RETURN, NOT A VALUE DELTA. last-first books every deposit as gain, which
   over a full history overstates the return roughly threefold and contradicts the All-time gain
   cell three sections below on the same screen. Measure the gain at each end against invested. */
function ovPeriodReturn(H){
  if(!H||H.length<2) return null;
  const a=H[0], b=H[H.length-1];
  /* invested is null on any checkpoint whose snapshot predates it or was trimmed (E10.1). Reading
     null as 0 books the ENTIRE starting value as period gain: a book up 28.5% all-time printed
     -33.5% for the window, directly beside the +28.5% cell. Refuse the figure instead - one honest
     blank beats two numbers on one screen that cannot both be true. */
  if(!isNum(a.value)||!isNum(b.value)||!isNum(a.invested)||!isNum(b.invested)) return null;
  const gA=a.value-a.invested, gB=b.value-b.invested;
  return { abs:gB-gA, pct: b.invested>0 ? (gB-gA)/b.invested*100 : null,
           added:b.invested-a.invested };
}

/* The hero number is written in exactly one place so the scrub animation and the plain render can
   never fight over it. OV_SHOWN carries the value actually on screen, which is what a retarget has
   to ease FROM - reading it back out of the DOM would mean parsing formatted money. */
let OV_ANIM=null, OV_SHOWN=null;
function ovSetValue(n,anim){
  const el=$("#ovValue"); if(!el) return;
  if(OV_ANIM){ cancelAnimationFrame(OV_ANIM); OV_ANIM=null; }
  if(!isNum(n)){ el.textContent="\u2014"; OV_SHOWN=null; return; }
  if(!anim||!isNum(OV_SHOWN)||OV_SHOWN===n){ el.textContent=money(n,0); OV_SHOWN=n; return; }
  const from=OV_SHOWN, t0=(window.performance||Date).now();
  const step=function(t){
    const k=Math.min(1,(t-t0)/420), e=1-Math.pow(1-k,3);   /* cubic ease-out, 420ms */
    OV_SHOWN=from+(n-from)*e; el.textContent=money(OV_SHOWN,0);
    if(k<1) OV_ANIM=requestAnimationFrame(step); else { OV_SHOWN=n; OV_ANIM=null; }
  };
  OV_ANIM=requestAnimationFrame(step);
}

function ovHero(){
  const init=isInit(), total=curTotal(), inv=totalContributed(), gain=total-inv;
  const dpl=init?dayPL():0;
  const sgn=function(n){ return (n>=0?"+":"\u2212")+money(Math.abs(n),0); };
  const lbl=$("#ovHeroLabel"), val=$("#ovValue"), slots=$("#ovSub"), note=$("#ovHeroNote");
  if(lbl) lbl.textContent="TOTAL VALUE \u00b7 "+(OV_RANGE==="1D"?"TODAY, LIVE":OV_RANGE);
  ovSetValue(init?total:null,false);
  if(!slots) return;
  if(!init){ slots.innerHTML=""; if(note) note.textContent="Nothing tracked yet \u2014 "+firstStepHint()+"."; return; }
  const H=ovSeries(), pr=ovPeriodReturn(H);
  const cls=function(n){ return n>=0?"up":"down"; };
  /* The day basis is the value the book STARTED the day at, not what it is worth now. Dividing by
     the current total understates a gain and overstates a loss - the same denominator error the
     spec calls out for the period figure, one line further down the same row. */
  const dayOpen=dayOpenValue();
  const dayItem='<span class="s-lead '+cls(dpl)+'">'+(dpl>=0?"\u25b2":"\u25bc")+" "+sgn(dpl)+
    " \u00b7 "+signed(dayOpen>0?dpl/dayOpen*100:0,2)+'%</span>';
  const allItem='<span><span class="s-k">All-time</span> <b class="'+cls(gain)+'">'+sgn(gain)+
    " \u00b7 "+(inv>0?signed(gain/inv*100,1):"0.0")+'%</b></span>';
  const invItem='<span><span class="s-k">Invested</span> <b>'+money(inv,0)+"</b></span>";
  const periodItem=(pr&&isNum(pr.pct))
    ? '<span class="s-lead '+cls(pr.abs)+'">'+sgn(pr.abs)+" \u00b7 "+signed(pr.pct,1)+'%</span>' : "";
  /* No slot may state the same measurement twice: on 1D the selected period IS today, so the
     second slot carries all-time rather than repeating the day figure beside itself. */
  slots.innerHTML = (OV_RANGE==="1D" || !periodItem)
    ? [dayItem, allItem, invItem].join("")
    : [periodItem, dayItem, invItem].join("");
  if(note){
    if(OV_RANGE==="1D"){
      note.textContent="Today, since the open \u2014 measured against yesterday\u2019s close. All-time you are "+
        (gain>=0?"up ":"down ")+money(Math.abs(gain),0)+" \u2014 "+
        (inv>0?Math.abs(gain/inv*100).toFixed(1):"0.0")+"% on the "+money(inv,0)+" invested.";
    } else if(pr && Math.abs(pr.added)>0.5){
      note.textContent="Return over this window, measured against money invested \u2014 the "+
        money(Math.abs(pr.added),0)+" you added along the way is not counted as gain.";
    } else note.textContent="";
  }
}

function fmtDate(d){
  try{ const t=new Date(d); return isNaN(t)?String(d||"\u2014")
    : t.toLocaleDateString(undefined,{day:"2-digit",month:"short"}); }
  catch(e){ return String(d||"\u2014"); }
}

/* Five cells. The fifth is the one place the app says what to do next, and it must NOT render
   when drift is inside the band - an action cell that is always there stops being an action. */
function ovGrid(){
  const g=$("#ovGrid"); if(!g) return;
  const init=isInit(), total=curTotal(), inv=totalContributed(), gain=total-inv;
  let A=null; try{ A=computeAllocation(); }catch(e){}
  const rows=((A&&A.rows)||[]).filter(function(r){ return !r.empty; });
  const cvt=curValueByTheme();
  let worst=null;
  rows.forEach(function(r){
    if(!init||total<=0) return;
    const cur=(cvt[r.theme.key]||0)/total, d=cur-r.alloc;
    if(!worst||Math.abs(d)>Math.abs(worst.d)) worst={d:d,name:r.theme.name};
  });
  const cap=(A&&isNum(A.cap))?A.cap:null;
  const over=!!(worst&&cap!=null&&Math.abs(worst.d)>cap*0.5);
  const vs=versions()||[], h=head();
  const last=(vs.length&&h>=0)?vs[Math.min(h,vs.length-1)]:null;
  const cell=function(k,v,d,cls){
    return '<div class="ov3-cell '+(cls||"")+'"><div class="k">'+k+'</div><div class="v">'+v+
           '</div><div class="d">'+(d||"")+"</div></div>"; };
  let html="";
  html+=cell("All-time gain",
    init?'<span class="'+(gain>=0?"up":"down")+'">'+(gain>=0?"+":"\u2212")+money(Math.abs(gain),0)+"</span>":"\u2014",
    (init&&inv>0)?signed(gain/inv*100,1)+"% on invested":"");
  html+=cell("Portfolios", String(rows.length), membership().length+" names \u00b7 ranked within");
  html+=cell("Max drift", worst?signed(worst.d*100,1)+"pp":"\u2014",
    worst?esc(worst.name)+", "+(worst.d>=0?"overweight":"underweight"):"");
  html+=cell("Last checkpoint", last?fmtDate(last.date||last.at):"\u2014",
    last?esc(String(last.mode||last.type||""))+" \u00b7 "+((last.trades||[]).length)+" trades":"");
  html+= over
    ? '<button class="ov3-cell act" id="ovRebalance" type="button"><div class="k">Drift is past your band</div>'+
      '<div class="v">Rebalance \u2192</div><div class="d">'+esc(worst.name)+" is "+signed(worst.d*100,1)+"pp off target</div></button>"
    : cell("Nothing to do","In band","Every portfolio sits inside its cap","quiet");
  g.innerHTML=html;
  const rb=$("#ovRebalance"); if(rb) rb.addEventListener("click",function(){ switchView("calc"); });
}

/* Allocation: a stacked bar of CURRENT weights plus a per-portfolio drift legend. No donut - a
   donut cannot show target against current. Never renormalise to the assigned subtotal: value
   held outside a portfolio is its own explicit segment, or every slice inflates. */
function renderAllocationBar(){
  const bar=$("#ovAlloc"), leg=$("#ovAllocLegend"); if(!bar||!leg) return;
  let A=null; try{ A=computeAllocation(); }catch(e){}
  const rows=((A&&A.rows)||[]).filter(function(r){ return !r.empty; });
  if(!rows.length){
    bar.innerHTML="";
    leg.innerHTML='<div class="ov3-al"><div class="t">No portfolios yet \u2014 '+firstStepHint()+".</div></div>";
    return;
  }
  const total=curTotal(), cvt=curValueByTheme(), init=isInit();
  const seg=rows.map(function(r,i){
    const cur=(init&&total>0)?(cvt[r.theme.key]||0)/total:r.alloc;
    return { name:r.theme.name, cur:cur, target:r.alloc, colour:"var(--portfolio-"+((i%5)+1)+")" };
  });
  const assigned=seg.reduce(function(a,x){ return a+x.cur; },0);
  if(init && assigned<0.999)
    seg.push({ name:"Exiting / unassigned", cur:1-assigned, target:0, colour:"var(--ink-45)" });
  bar.innerHTML=seg.map(function(x){
    return '<span style="flex:'+Math.max(x.cur,0.001)+";background:"+x.colour+'"></span>'; }).join("");
  leg.innerHTML=seg.map(function(x){
    const d=x.cur-x.target, pp=d*100, capped=Math.max(-10,Math.min(10,pp)), w=Math.abs(capped)/10*50;
    const css=d>=0 ? "left:50%;width:"+w+"%;background:var(--pos)"
                   : "right:50%;width:"+w+"%;background:var(--neg)";
    return '<div class="ov3-al"><div class="n"><span class="sq" style="background:'+x.colour+'"></span>'+
      esc(x.name)+'</div><div class="p">'+pct(x.cur)+'</div><div class="t">target '+pct(x.target)+'</div>'+
      '<div class="ov3-drift"><span class="ov3-track"><i style="'+css+'"></i></span>'+
      '<span class="pp '+(d>=0?"up":"down")+'">'+signed(pp,1)+"pp</span></div></div>";
  }).join("");
}

function renderCheckpointStrip(){
  const el=$("#ovCheckpoints"); if(!el) return;
  const vs=versions()||[], h=head();
  if(!vs.length){
    el.innerHTML='<div class="ov3-cp"><div class="m">No checkpoints yet \u2014 they appear when you rebalance.</div></div>';
    return;
  }
  const start=Math.max(0,vs.length-4);
  el.innerHTML=vs.slice(start).map(function(v,i){
    const idx=start+i;
    const tag = idx===h ? '<span class="tag cur">CURRENT</span>'
              : idx<h  ? '<span class="tag">APPLIED</span>'
                       : '<span class="tag">REDOABLE</span>';
    return '<div class="ov3-cp">'+tag+'<div class="t">'+esc(String(v.label||v.mode||v.type||"Checkpoint"))+
      '</div><div class="m">'+fmtDate(v.date||v.at)+" \u00b7 "+((v.trades||[]).length)+" trades"+
      (isNum(v.valueAfter)?" \u00b7 "+money(v.valueAfter,0):"")+"</div></div>";
  }).join("");
}

function wireOvRange(){
  const r=$("#ovRange"); if(!r) return;
  r.addEventListener("click", function(e){
    const b=e.target.closest("button[data-range]"); if(!b) return;
    OV_RANGE=b.dataset.range;
    [].forEach.call(r.querySelectorAll("button"), function(x){ x.classList.toggle("on", x===b); });
    renderPrices();
  });
}

function renderOverview(){
  const svg=$("#ovChart"); if(!svg) return;
  if(accountUnreachable()){ unreachablePanel("view-prices"); return; }
  const init=isInit(), total=curTotal();
  /* E12 4.2: the hero, the five-cell grid and the checkpoint strip are their own renderers now.
     heroDefault stays as the point the chart scrub returns to on mouseleave. */
  applyDayAccent();
  const heroDefault=ovHero;
  heroDefault();
  ovGrid();
  renderCheckpointStrip();

  // ---- value chart (E12 4.2 item 2) ----
  const H=ovSeries();
  const legend=$("#ovChartLegend"), note=$("#ovChartNote"), from=$("#ovChartFrom");
  if(H.length<2){
    svg.innerHTML=""; svg.onmousemove=null; svg.onmouseleave=null; clearScrub(svg);   // else stale handlers keep reporting the OLD portfolio's dollars
    svg.classList.add("is-empty");
    if(legend)legend.innerHTML=""; if(from)from.textContent="";
    if(note)note.textContent=init?"One checkpoint so far \u2014 the curve appears once you have a second.":"";
    /* Render the return chart HERE too. This early return used to skip it entirely, so on a
       brand-new account it kept its full CSS height with nothing drawn in it - a tall empty card
       on the first screen anyone sees. Its own empty branch collapses it. */
    try{ renderReturnChart(valueHistory()); }catch(e){ console.error("return chart",e); }
    renderAllocationBar(); return;
  }
  svg.classList.remove("is-empty");
  // viewBox must match the CSS box's aspect, or the default preserveAspectRatio letterboxes the
  // drawing (it rendered in the middle ~61% of the card) AND the scrub maths goes out of register.
  const W=Math.max(320,Math.round(svg.clientWidth||620)), Ht=Math.max(80,Math.round(svg.clientHeight||170)),
        PB=Math.max(10,Math.round(Ht*0.11)), PT=Math.max(6,Math.round(Ht*0.06));
  svg.setAttribute("viewBox","0 0 "+W+" "+Ht);
  OV_W=W; OV_HT=Ht;
  const pr=ovPeriodReturn(H);
  /* The line takes the DAY sign on 1D and the PERIOD sign on every other range. A book can be down
     today and up over the year; the line must state the same figure the hero is stating. */
  const rising = OV_RANGE==="1D" ? !(init&&dayPL()<0) : !(pr&&pr.abs<0);
  const stroke = rising ? "var(--accent-700)" : "var(--neg)";
  const showInv = OV_RANGE!=="1D";     /* on 1D the basis is the previous close, not invested */
  const invLvl = showInv ? H.map(function(q){ return q.invested; }).filter(isNum).pop() : null;
  const vals=H.reduce(function(acc,q){ return acc.concat([q.value,q.ew]); },[]).filter(isNum);
  if(isNum(invLvl)) vals.push(invLvl);   // the reference line must sit inside the frame, not be clipped off it
  let lo=Math.min.apply(null,vals), hi=Math.max.apply(null,vals);
  if(!(isFinite(lo)&&isFinite(hi))||hi<=lo){ lo=(lo||0)*0.98; hi=(hi||1)*1.02+1; }
  const pad=(hi-lo)*0.12; lo-=pad; hi+=pad;
  const X=function(i){ return H.length<2?0:(i/(H.length-1))*(W-8)+4; };
  const Y=function(v){ return Ht-PB-((v-lo)/(hi-lo))*(Ht-PB-PT); };
  const path=function(key){ let d="",pen=false;
    H.forEach(function(q,i){ const v=q[key];
      if(!isNum(v)){ pen=false; return; }                 // gap: an unpriced checkpoint breaks the line
      d+=(pen?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1)+" "; pen=true; });
    return d.trim(); };
  const vPath=path("value"), ewPath=EW_ON?path("ew"):"";
  const lastV=H.slice().reverse().filter(function(q){ return isNum(q.value); })[0];
  const area=vPath?vPath+" L"+X(H.length-1).toFixed(1)+","+(Ht-PB).toFixed(1)+
                   " L"+X(0).toFixed(1)+","+(Ht-PB).toFixed(1)+" Z":"";
  svg.innerHTML=
    '<defs><linearGradient id="ovg" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+stroke+'" stop-opacity=".18"/>'+
      '<stop offset="100%" stop-color="'+stroke+'" stop-opacity="0"/></linearGradient></defs>'+
    [0.25,0.5,0.75].map(function(f){ const y=(PT+(Ht-PB-PT)*f).toFixed(1);
      return '<line class="gl" x1="0" y1="'+y+'" x2="'+W+'" y2="'+y+'" stroke-width="1"/>'; }).join("")+
    (area?'<path d="'+area+'" fill="url(#ovg)"/>':"")+
    (isNum(invLvl)?'<line x1="0" y1="'+Y(invLvl).toFixed(1)+'" x2="'+W+'" y2="'+Y(invLvl).toFixed(1)+
      '" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="7 5"/>':"")+
    (ewPath?'<path d="'+ewPath+'" fill="none" stroke="var(--ink-45)" stroke-width="1.5" stroke-linejoin="round"/>':"")+
    (vPath?'<path d="'+vPath+'" fill="none" stroke="'+stroke+'" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>':"")+
    (lastV?'<circle cx="'+X(H.indexOf(lastV)).toFixed(1)+'" cy="'+Y(lastV.value).toFixed(1)+'" r="3.5" fill="'+stroke+'"/>':"")+
    '<line id="ovScrubRule" x1="0" y1="0" x2="0" y2="'+Ht+'" stroke="rgba(32,30,29,.4)" stroke-width="1" visibility="hidden"/>'+
    '<rect id="ovScrubDot" width="9" height="9" fill="'+stroke+'" visibility="hidden"/>'+
    '<rect id="ovHit" x="0" y="0" width="'+W+'" height="'+Ht+'" fill="transparent"/>';
  if(from) from.textContent=H[0]?fmtDate(H[0].label).toUpperCase():"";
  if(legend) legend.innerHTML=
    (isNum(invLvl)?'<span><i style="border-top:1.5px dashed var(--ink)"></i>INVESTED '+money(invLvl,0)+"</span>":"")+
    (ewPath?'<span><i style="border-top:1.5px solid var(--ink-45)"></i>EQUAL WEIGHT</span>':"")+
    '<button type="button" id="ovEwToggle" class="ov3-ewbtn">'+(EW_ON?"HIDE":"SHOW")+' EQUAL WEIGHT</button>';
  const ewb=$("#ovEwToggle");
  if(ewb) ewb.addEventListener("click",function(){ EW_ON=!EW_ON; renderOverview(); });
  const gaps=H.filter(function(q){ return !isNum(q.value); }).length,
        est=H.filter(function(q){ return q.estimated&&isNum(q.value); }).length;
  const saves=H.filter(function(q){ return !q.live; }).length;   // the appended "now" point is live, not a saved checkpoint
  if(note) note.textContent = OV_RANGE==="1D"
    ? "TODAY \u00b7 SINCE THE OPEN \u00b7 ACCUMULATED THIS SESSION, NOT STORED"
    : "TODAY \u00b7 "+saves+" checkpoint"+(saves===1?"":"s")+
    /* E10.1 - once older checkpoints have been trimmed the equal-weight series is RE-ANCHORED at the
       oldest kept one, so it covers that window while "invested" is still cumulative from the start.
       The difference stays honest for the window, but the absolute figure is not a since-inception
       number and must not read as one. */
    (timelineTrimmed()?" \u00b7 equal weight over the kept checkpoints only":"")+
    (est?" \u00b7 "+est+" reconstructed from traded prices":"")+
    (gaps?" \u00b7 "+gaps+" not priced":"");
  // scrub
  svg.onmousemove=function(e){
    const r=svg.getBoundingClientRect(); if(!r.width) return;
    OV_SCRUBBING=true;
    // map through the SVG's own transform so the index matches the point actually drawn
    let ux=null;
    try{ const pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
      const m=svg.getScreenCTM(); if(m) ux=pt.matrixTransform(m.inverse()).x; }catch(err){}
    let i = (ux!=null && W>8) ? Math.round(((ux-4)/(W-8))*(H.length-1))
                              : Math.round(((e.clientX-r.left)/r.width)*(H.length-1));
    i=Math.max(0,Math.min(H.length-1,i)); const q=H[i];
    const rule=svg.querySelector("#ovScrubRule"), dot=svg.querySelector("#ovScrubDot");
    if(rule){ rule.setAttribute("x1",X(i).toFixed(1)); rule.setAttribute("x2",X(i).toFixed(1));
              rule.setAttribute("visibility","visible"); }
    if(dot){ if(isNum(q.value)){ dot.setAttribute("x",(X(i)-4.5).toFixed(1));
              dot.setAttribute("y",(Y(q.value)-4.5).toFixed(1)); dot.setAttribute("visibility","visible"); }
             else dot.setAttribute("visibility","hidden"); }
    const lbl=$("#ovHeroLabel");
    if(lbl) lbl.textContent=(q.live?"NOW":fmtDate(q.label).toUpperCase())+
      (q.type?" \u00b7 "+String(q.type).toUpperCase():"");
    ovSetValue(isNum(q.value)?q.value:null,true);
    const slots=$("#ovSub"), gain=(isNum(q.value)&&isNum(q.invested))?q.value-q.invested:null;
    const vsEw=(isNum(q.value)&&isNum(q.ew))?q.value-q.ew:null;
    if(slots) slots.innerHTML=
      '<span><span class="s-k">Invested</span> <b>'+(isNum(q.invested)?money(q.invested,0):"\u2014")+"</b></span>"+
      (gain!=null?'<span><span class="s-k">Gain</span> <b class="'+(gain>=0?"up":"down")+'">'+
        (gain>=0?"+":"\u2212")+money(Math.abs(gain),0)+"</b></span>":"")+
      (vsEw!=null?'<span><span class="s-k">'+(vsEw>=0?"Ahead of":"Behind")+' equal weight</span> <b>'+
        money(Math.abs(vsEw),0)+"</b></span>":"");
    const hn=$("#ovHeroNote"); if(hn) hn.textContent="";
  };
  svg.onmouseleave=function(){
    OV_SCRUBBING=false;
    const rule=svg.querySelector("#ovScrubRule"), dot=svg.querySelector("#ovScrubDot");
    if(rule) rule.setAttribute("visibility","hidden");
    if(dot) dot.setAttribute("visibility","hidden");
    heroDefault();
  };
  wireScrub(svg, svg.onmousemove, svg.onmouseleave);
  try{ renderReturnChart(valueHistory()); }catch(e){ console.error("return chart",e); }
  renderAllocationBar();
}
/* E5.6: return vs invested — our strategy against the equal-weight counterfactual.
   Toggle shows either % of invested capital or absolute dollars. Both series use identical
   cash flows on identical dates, so they are directly comparable. */
let RET_UNIT="pct";
/* APP2.11 - the charts were mouse-only (onmousemove / onmouseleave), and the scrub is the ONLY
   way to read any checkpoint but the last. On a phone that made every earlier checkpoint
   unreachable. These wire the same handlers to pointer events.

   Assigned as PROPERTIES, not addEventListener: a chart re-renders on every refresh, and
   addEventListener would stack a new set each time. Mouse pointers are skipped so the existing
   onmousemove is not fired twice. CSS gives the charts touch-action:pan-y, so a vertical drag
   still scrolls the page while a horizontal drag scrubs - and the pager already refuses swipes
   that begin on an svg, so scrubbing never flips the page. */
function wireScrub(svg, move, leave){
  if(!svg) return;
  svg.onpointerdown=e=>{ if(e.pointerType==="mouse") return;
    try{ svg.setPointerCapture(e.pointerId); }catch(err){} move(e); };
  svg.onpointermove=e=>{ if(e.pointerType==="mouse") return;
    if(!e.buttons && !e.pressure) return; move(e); };
  svg.onpointerup=e=>{ if(e.pointerType==="mouse") return; leave(); };
  svg.onpointercancel=()=>leave();
}
function clearScrub(svg){
  if(!svg) return;
  svg.onpointerdown=svg.onpointermove=svg.onpointerup=svg.onpointercancel=null;
}

function renderReturnChart(H){
  const svg=$("#ovRetChart"), leg=$("#ovRetLegend"), head=$("#ovRetHead"); if(!svg) return;
  const pts=(H||[]).filter(p=>isNum(p.invested)&&p.invested>0);
  const val=(p,k)=>{ const v=p[k]; if(!isNum(v)) return null;
    return RET_UNIT==="pct" ? (v-p.invested)/p.invested*100 : (v-p.invested); };
  if(pts.length<2){ svg.innerHTML=""; svg.onmousemove=null; svg.onmouseleave=null; clearScrub(svg);
    svg.classList.add("is-empty");
    if(leg)leg.innerHTML=""; if(head)head.textContent="Needs at least two checkpoints."; return; }
  svg.classList.remove("is-empty");
  const W=Math.max(240,Math.round(svg.clientWidth||520)), Ht=Math.max(70,Math.round(svg.clientHeight||96));
  const PB=Math.max(8,Math.round(Ht*0.12)), PT=Math.max(5,Math.round(Ht*0.08));
  svg.setAttribute("viewBox",`0 0 ${W} ${Ht}`);
  const series=["value","ew"];
  const all=pts.flatMap(p=>series.map(k=>val(p,k))).filter(isNum);
  let lo=Math.min(0,...all), hi=Math.max(0,...all);
  if(hi<=lo){ hi=lo+1; }
  const pad=(hi-lo)*0.15||1; lo-=pad; hi+=pad;
  const X=i=>pts.length<2?4:(i/(pts.length-1))*(W-8)+4;
  const Y=v=>Ht-PB-((v-lo)/(hi-lo))*(Ht-PB-PT);
  const path=k=>{ let d="",pen=false;
    pts.forEach((p,i)=>{ const v=val(p,k); if(!isNum(v)){ pen=false; return; }
      d+=(pen?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1)+" "; pen=true; });
    return d.trim(); };
  const zeroY=Y(0);
  svg.innerHTML=
    `<line class="zero" x1="0" y1="${zeroY.toFixed(1)}" x2="${W}" y2="${zeroY.toFixed(1)}" stroke-width="1" stroke-dasharray="3 3"/>`+
    (path("ew")?`<path d="${path("ew")}" fill="none" stroke="var(--portfolio-2)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>`:"")+
    (path("value")?`<path d="${path("value")}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`:"")+
    `<rect x="0" y="0" width="${W}" height="${Ht}" fill="transparent"/>`;
  if(leg) leg.innerHTML=
    `<span><i style="border-top:2.4px solid var(--accent)"></i>Our strategy</span>`+
    `<span><i style="border-top:2px dashed var(--portfolio-2)"></i>Equal weight</span>`;
  const fmt=v=>!isNum(v)?"—":(RET_UNIT==="pct"?signed(v,2)+"%":(v>=0?"+":"−")+money(Math.abs(v),0));
  const last=pts[pts.length-1], a=val(last,"value"), e=val(last,"ew");
  const setHead=(p)=>{ if(!head) return;
    const av=val(p,"value"), ev=val(p,"ew"), d=(isNum(av)&&isNum(ev))?av-ev:null;
    head.innerHTML=`<b class="${isNum(av)&&av>=0?'up':'down'}">${fmt(av)}</b> vs equal weight ${fmt(ev)}`+
      (d!=null?` · <span class="${d>=0?'up':'down'}">${d>=0?"ahead":"behind"} by ${RET_UNIT==="pct"?Math.abs(d).toFixed(2)+"pp":money(Math.abs(d),0)}</span>`:"")+
      /* Same re-anchoring as the value chart: once history has been trimmed the equal-weight figure
         covers the kept window, not the whole life of the book, and must not read as the latter.
         The value chart discloses it; printing the number here without the same note was the fix
         landing in one place and not the other. */
      (timelineTrimmed()?`<span class="muted"> · equal weight over the kept checkpoints</span>`:"")+
      `<span class="muted"> · ${p.live?"today":esc(p.label)}</span>`; };
  setHead(last);
  svg.onmousemove=ev2=>{
    const r=svg.getBoundingClientRect(); if(!r.width) return;
    let ux=null;
    try{ const pt=svg.createSVGPoint(); pt.x=ev2.clientX; pt.y=ev2.clientY;
      const m=svg.getScreenCTM(); if(m) ux=pt.matrixTransform(m.inverse()).x; }catch(err){}
    let i=(ux!=null&&W>8)?Math.round(((ux-4)/(W-8))*(pts.length-1))
                         :Math.round(((ev2.clientX-r.left)/r.width)*(pts.length-1));
    i=Math.max(0,Math.min(pts.length-1,i));
    setHead(pts[i]);
  };
  svg.onmouseleave=()=>setHead(last);
  wireScrub(svg, svg.onmousemove, ()=>setHead(last));
}

function renderPrices(){
  const cvt=curValueByTheme(), total=curTotal(), init=isInit();
  ovTick();                       // seed the session view; ovTick collapses repeats within a minute
  try{ renderOverview(); }catch(e){ console.error("overview",e); }   // E5.1 hero: never block the price tables
  const cl=function(n){ return n>=0?"up":"down"; };
  const sgn=function(n){ return (n>=0?"+":"\u2212")+money(Math.abs(n),0); };
  const dash='<span class="muted">\u2014</span>';

  /* HOLDINGS - one 6-column row per portfolio, expanding to its names. The header words are spelled
     out ("Profit or loss", not "P/L") because the owner rejected the abbreviations outright. */
  const grid=$("#priceGrid"); if(!grid) return;
  grid.innerHTML="";
  themes().forEach(function(t,i){
    const syms=tickersOf(t.key);
    const val=cvt[t.key]||0, w=total>0?val/total:0;
    const cost=syms.reduce(function(a,s){ const h=holdings()[s];
      return a+((h&&isNum(h.costBasis))?h.costBasis:0); },0);
    const pl=val-cost, plPct=cost>0?(pl/cost*100):null;
    const open=OPEN_THEMES.has(t.key);
    const sq="var(--portfolio-"+((i%5)+1)+")";
    const names=syms.map(function(s){
      const q=state.quotes[s]||{}, px=price(s), cp=q.changePct;
      const h=holdings()[s], sh=(h&&isNum(h.shares))?h.shares:null;
      const v=(isNum(sh)&&isNum(px))?sh*px:null;
      return '<button class="ov3-nrow" type="button" data-stock="'+esc(s)+'">'+
        '<span class="tk">'+esc(s)+"<i>"+esc(nameOf(s))+"</i></span>"+
        '<span class="num" data-k="Price">'+(isNum(px)?money(px,2):dash)+"</span>"+
        '<span class="num '+(isNum(cp)?cl(cp):"")+'" data-k="Today">'+
          (isNum(cp)?(cp>=0?"\u25b2 ":"\u25bc ")+Math.abs(cp).toFixed(2)+"%":dash)+"</span>"+
        '<span class="num" data-k="Shares">'+(isNum(sh)?sh.toFixed(2):dash)+"</span>"+
        '<span class="num" data-k="Value">'+(isNum(v)?money(v,0):dash)+"</span>"+
        '<span class="num" data-k="Weight">'+((init&&total>0&&isNum(v))?pct(v/total,1):dash)+"</span></button>";
    }).join("");
    grid.insertAdjacentHTML("beforeend",
      '<div class="thm'+(open?" open":"")+'" data-thmkey="'+esc(t.key)+'">'+
      '<button class="ov3-hrow" type="button" data-thmtoggle="'+esc(t.key)+'" aria-expanded="'+open+'">'+
        '<span class="nm"><span class="chev">\u25b6</span><span class="sq" style="background:'+sq+'"></span>'+
          "<span>"+esc(t.name)+"</span></span>"+
        '<span class="num" data-k="% of book">'+(init?pct(w,1):dash)+"</span>"+
        '<span class="num" data-k="Market value">'+(init?money(val,0):dash)+"</span>"+
        '<span class="num" data-k="Cost basis">'+(init?money(cost,0):dash)+"</span>"+
        '<span class="num" data-k="Profit or loss">'+
          ((init&&cost>0)?'<span class="'+cl(pl)+'">'+sgn(pl)+"</span>":dash)+"</span>"+
        '<span class="num" data-k="Return">'+
          ((init&&plPct!=null)?'<span class="'+cl(pl)+'">'+signed(plPct,1)+"%</span>":dash)+"</span>"+
      "</button>"+
      '<div class="thm-body ov3-hbody"'+(open?"":" hidden")+'>'+
        '<div class="ov3-nhead ov3-nrow"><span class="tk">Ticker</span><span class="num">Price</span>'+
        '<span class="num">Today</span><span class="num">Shares</span><span class="num">Value</span>'+
        '<span class="num">Weight</span></div>'+
        (names||'<div class="ov3-nrow"><span class="tk muted">No names yet \u2014 add them from Research.</span></div>')+
      "</div></div>");
  });
  if(!themes().length)
    grid.insertAdjacentHTML("beforeend",
      '<div class="ov3-nrow" style="padding-left:0"><span class="tk muted">No portfolios yet \u2014 '+
      firstStepHint()+".</span></div>");

  /* LIVE PRICES - every name across every portfolio, flat, with each portfolio's live value and
     weight beside its names. Collapsed by default: it is a reference block, not the headline. */
  const band=$("#priceBand"); if(!band) return;
  const all=membership();
  const cnt=$("#ovLiveCount"); if(cnt) cnt.textContent=all.length+" name"+(all.length===1?"":"s");
  const when=$("#ovLiveWhen"); if(when) when.textContent=($("#updated")||{}).textContent||"";
  band.innerHTML = themes().map(function(t,i){
    const syms=tickersOf(t.key); if(!syms.length) return "";
    const val=cvt[t.key]||0;
    const head='<div class="ov3-nhead ov3-nrow"><span class="tk">'+esc(t.name)+
      '</span><span class="num"></span><span class="num"></span><span class="num"></span>'+
      '<span class="num">'+(init?money(val,0):"")+'</span><span class="num">'+
      (init&&total>0?pct(val/total,1):"")+"</span></div>";
    return head+syms.map(function(s){
      const q=state.quotes[s]||{}, px=price(s), cp=q.changePct, ch=q.change;
      const h=holdings()[s], sh=(h&&isNum(h.shares))?h.shares:null;
      const v=(isNum(sh)&&isNum(px))?sh*px:null;
      return '<button class="ov3-nrow" type="button" data-stock="'+esc(s)+'">'+
        '<span class="tk">'+esc(s)+"<i>"+esc(nameOf(s))+"</i></span>"+
        '<span class="num" data-k="Price">'+(isNum(px)?money(px,2):dash)+"</span>"+
        '<span class="num '+(isNum(ch)?cl(ch):"")+'" data-k="Today">'+
          (isNum(ch)?signed(ch,2):dash)+"</span>"+
        '<span class="num '+(isNum(cp)?cl(cp):"")+'" data-k="Change">'+
          (isNum(cp)?signed(cp,2)+"%":dash)+"</span>"+
        '<span class="num" data-k="Value">'+(isNum(v)?money(v,0):dash)+"</span>"+
        '<span class="num" data-k="Weight">'+((init&&total>0&&isNum(v))?pct(v/total,1):dash)+"</span></button>";
    }).join("");
  }).join("") || '<div class="ov3-nrow"><span class="tk muted">No names yet.</span></div>';
}
let LIVE_OPEN=false;
function toggleLive(){
  LIVE_OPEN=!LIVE_OPEN;
  const b=$("#priceBand"), t=$("#ovLiveToggle");
  if(b) b.hidden=!LIVE_OPEN;
  if(t) t.setAttribute("aria-expanded",String(LIVE_OPEN));
}
/* which theme sections are expanded — module state so a price refresh doesn't collapse them */
const OPEN_THEMES=new Set();
function toggleTheme(key){
  if(OPEN_THEMES.has(key)) OPEN_THEMES.delete(key); else OPEN_THEMES.add(key);
  const box=document.querySelector(`.thm[data-thmkey="${CSS.escape(key)}"]`); if(!box) return;
  const open=OPEN_THEMES.has(key), body=box.querySelector(".thm-body"), head=box.querySelector(".thm-head");
  box.classList.toggle("open",open);
  if(body) body.hidden=!open;
  if(head) head.setAttribute("aria-expanded",String(open));
}
/* E5.2: the same, for the Model tab's per-theme metric tables (#fundGrid) */
const OPEN_FTHEMES=new Set();
function toggleFTheme(key){
  if(OPEN_FTHEMES.has(key)) OPEN_FTHEMES.delete(key); else OPEN_FTHEMES.add(key);
  applyFThemeOpen(key);
  syncFThemeAllBtn();
}
function applyFThemeOpen(key){
  const box=document.querySelector(`.thm[data-fthmkey="${CSS.escape(key)}"]`); if(!box) return;
  const open=OPEN_FTHEMES.has(key), body=box.querySelector(".thm-body"), head=box.querySelector(".thm-head");
  box.classList.toggle("open",open);
  if(body) body.hidden=!open;
  if(head) head.setAttribute("aria-expanded",String(open));
}
function syncFThemeAllBtn(){
  const b=$("#fundExpandAll"); if(!b) return;
  const all=themes().length && themes().every(t=>OPEN_FTHEMES.has(t.key));
  b.textContent = all ? "COLLAPSE ALL" : "EXPAND ALL";
  b.dataset.mode = all ? "collapse" : "expand";
}
function toggleAllFThemes(){
  const b=$("#fundExpandAll"), expand=!b||b.dataset.mode!=="collapse";
  themes().forEach(t=>{ if(expand) OPEN_FTHEMES.add(t.key); else OPEN_FTHEMES.delete(t.key); applyFThemeOpen(t.key); });
  syncFThemeAllBtn();
}

/* ======================================================================
   Render: FUNDAMENTALS view
   ====================================================================== */
// E2.3 catalog-cell formatter (used for the extended metrics; the 6 keep their bespoke rendering below).
function fmtVal(m,v){
  if(!isNum(v)) return '—';
  const k=m.fmt&&m.fmt.kind, dp=(m.fmt&&m.fmt.dp!=null)?m.fmt.dp:1;
  if(k==='money') return bil(v);
  if(k==='pct') return num(v*100,dp)+'%';
  return num(v,dp);
}
// E2.4 group-② per-metric exception-handling row.
function policyOptions(m){
  const cur=effBadData(m);
  const opts=[['penalize','Penalize (artificial value)'],['carry','Carry over (impute from quality)'],['exclude','Ignore (exclude the name)']];   // all 3 offered for EVERY metric, incl. the original 6
  return opts.map(o=>`<option value="${o[0]}"${o[0]===cur?' selected':''}>${o[1]}</option>`).join("");
}
/* E12 4.3: one row per metric - direction + name, the three policy chips inline beneath it, the
   weight bar, and the stepper. metricCfgRowHTML is kept because the tour and the catalog still
   describe policies in prose, but nothing renders a separate policy table any more. */
function metricRowHTML(m){
  const W=state.weights, MM=metrics();
  const sum=MM.reduce((a,x)=>a+(isNum(W[x.weightKey])?W[x.weightKey]:0),0);
  const w=isNum(W[m.weightKey])?W[m.weightKey]:0;
  const pc=sum>0?Math.round(w/sum*100):Math.round(100/MM.length);
  const arrow=effDirection(m)==='higher'?'\u2191':'\u2193';
  const pol=effBadData(m);
  const chip=(v,label)=>'<button type="button" data-mpolicy="'+m.key+'" data-pv="'+v+'"'+
    (pol===v?' class="on"':'')+' aria-pressed="'+(pol===v)+'">'+label+'</button>';
  /* An editable artificial value only makes sense for a lower-is-better metric: on a higher-better
     metric a bad reading is already the worst possible value, so there is nothing to substitute. */
  const showPen = pol==='penalize' && m.direction==='lower';
  const pen = showPen
    ? '<label class="md3-pen" title="Artificial value substituted for a negative or missing reading">value '+
      '<input type="number" data-mpen="'+m.key+'" value="'+(isNum(effPenalty(m))?effPenalty(m):'')+
      '" min="0" aria-label="'+esc(m.label)+' penalty value"></label>'
    : '';
  return '<div class="md3-m'+(m.valueKind==='momentum'?' is-mom':'')+'" data-mrow="'+m.key+'">'+
    '<div class="mn"><span class="dir" title="'+(effDirection(m)==='higher'?'Higher is better':'Lower is better')+
      '">'+arrow+'</span><b data-mkey="'+m.key+'" title="'+esc(m.formulaHint?m.label+' \u2014 '+m.formulaHint:m.label)+'">'+
      esc(m.label)+'</b>'+
      '<div><span class="md3-pol">'+chip('penalize','PENALIZE')+chip('carry','CARRY OVER')+chip('ignore','IGNORE')+
      '</span>'+pen+'</div></div>'+
    '<span class="md3-wbar"><i style="width:'+pc+'%"></i></span>'+
    '<span class="md3-step"><button type="button" data-wstep="'+m.key+'" data-d="-1" aria-label="Less weight on '+esc(m.label)+'">\u2212</button>'+
      '<span class="pc">'+pc+'%</span>'+
      '<button type="button" data-wstep="'+m.key+'" data-d="1" aria-label="More weight on '+esc(m.label)+'">+</button></span>'+
  '</div>';
}

function metricCfgRowHTML(m){
  const arrow=m.direction==='higher'?'↑':'↓';   // inline direction cue (works on touch/keyboard, unlike a hover tooltip)
  const dirTip=m.direction==='higher'?'↑ Higher is better (set automatically)':'↓ Lower is better (set automatically)';
  const showPen = effBadData(m)==='penalize' && m.direction==='lower';   // an editable artificial value only makes sense lower-better; higher-better bad values are treated as worst (0)
  const penVal = isNum(effPenalty(m))?effPenalty(m):'';
  const penCtl = showPen
    ? `<label class="muted xs" title="Artificial value substituted for a negative or missing reading"><input type="number" data-mpen="${m.key}" value="${penVal}" min="0" style="width:64px" aria-label="${esc(m.label)} penalty value"></label>`
    : '';
  return `<div class="cfg-row" data-mrow="${m.key}">
    <span class="cfg-name" title="${dirTip}"><span class="muted xs">${arrow}</span> ${esc(m.label)}</span>
    <select data-mpolicy="${m.key}">${policyOptions(m)}</select>
    <span class="cfg-val">${penCtl}</span></div>`;
}
function renderFundamentals(){
  const W=state.weights, MM=metrics();
  const wVal=m=>Math.round((isNum(W[m.weightKey])?W[m.weightKey]:m.defaultWeight)*100);
  /* ① One row per metric, carrying its weight AND its exception policy. The policy is a property
     of the metric, so it belongs in the metric's row; V2 kept a second table for it, which meant
     holding two lists in your head to answer one question about one metric.
     Rebuilt only when the active set or the policies change - a value-only refresh otherwise, so a
     focused penalty field is never yanked out from under the cursor mid-keystroke. */
  const wIn=$("#wInputs");
  const _wsum=MM.reduce((a,m)=>a+(isNum(W[m.weightKey])?W[m.weightKey]:0),0);
  const _pp=m=>_wsum>0?Math.round((isNum(W[m.weightKey])?W[m.weightKey]:0)/_wsum*100):Math.round(100/MM.length);
  if(wIn){
    const sig=MM.map(m=>m.key+":"+effBadData(m)).join(",");
    const _ae=document.activeElement;
    const typing=_ae&&_ae.matches&&_ae.matches('#wInputs input[data-mpen]');
    if(wIn.dataset.sig!==sig&&!typing){ wIn.innerHTML=MM.map(metricRowHTML).join(""); wIn.dataset.sig=sig; }
    else if(!typing) MM.forEach(m=>{
      const row=wIn.querySelector('.md3-m[data-mrow="'+m.key+'"]'); if(!row) return;
      const bar=row.querySelector(".md3-wbar i"), pc=row.querySelector(".pc");
      if(bar) bar.style.width=_pp(m)+"%";
      if(pc) pc.textContent=_pp(m)+"%";
    });
  }
  if($("#wEffNote")) $("#wEffNote").textContent="Normalised to "+MM.map(_pp).join("/")+"%.";
  if($("#mdCatCount")) $("#mdCatCount").textContent=MM.length+" OF "+METRIC_CATALOG.length;
  if($("#capPct")&&document.activeElement!==$("#capPct"))$("#capPct").value=Math.round((state.cap!=null?state.cap:defaultCap())*100);
  if(typeof renderPresetSelect==='function') renderPresetSelect();
  if($("#computeStmtToggle")) $("#computeStmtToggle").setAttribute("aria-checked",
    String(state.computeFromStatements!==false));
  if($("#srcCompareBtn")) $("#srcCompareBtn").disabled = state.computeFromStatements===false;   // E3.4: no computed values to compare when off   // E3.4
  if($("#stmtCoverageNote")){ const ms=membership(), cov=ms.filter(s=>{ const st=state.statements[s]; return st&&st.quarters&&st.quarters.length>=4; }).length;
    $("#stmtCoverageNote").textContent = state.computeFromStatements
      ? cov+"/"+ms.length+" names computed from statements; the rest fall back to pulled"
      : "using Yahoo's pulled metrics"; }
  const A=computeAllocation();
  /* The arithmetic is printed rather than left for the reader to reverse-engineer from a
     percentage - but it is printed from the formula the app ACTUALLY uses. The spec says
     "1.5 / portfolios"; the code says weightBounds(n).hi = 1 / (n - 1), which is the owner's own
     ceiling from E1.10 and postdates that sentence. Printing the spec's arithmetic would put a
     sum on screen that does not equal the number sitting beside it. */
  const capNow=isNum(A.cap)?A.cap:defaultCap(), nAll=themes().length;
  if($("#mdCapBar")) $("#mdCapBar").style.width=Math.min(100,capNow*100)+"%";
  if($("#mdCapSay")) $("#mdCapSay").textContent = nAll>1
    ? "The ceiling is 1 \u00f7 ("+nAll+" portfolios \u2212 1). The floor is 1 \u00f7 "+(2*nAll)+
      ", so nothing is squeezed out entirely. Excess is redistributed, repeatedly, until every portfolio fits."
    : "Excess is redistributed, repeatedly, until every portfolio fits.";

  // allocation bar + legend
  const bar=$("#allocBar"); bar.innerHTML="";
  A.rows.forEach((r,i)=>{ const sp=document.createElement("span");
    sp.style.flex=Math.max(r.alloc,0.001); sp.style.background="var(--portfolio-"+((i%5)+1)+")";
    sp.title=r.theme.name+" "+pct(r.alloc); bar.appendChild(sp); });
  $("#allocLegend").innerHTML=A.rows.map(r=>{ const cap=isNum(r.allocRaw)&&r.allocRaw>r.alloc+1e-6;
    return `<div class="it"><span class="swatch" style="background:${esc(r.theme.color)}"></span>
    ${esc(r.theme.name)} <b>${pct(r.alloc)}</b>${cap?` <span class="muted xs">(cap; raw ${pct(r.allocRaw)})</span>`:''}</div>`;}).join("");

  // drift table
  const cvt=curValueByTheme(), total=curTotal();
  const dr=$("#driftRows");
  if(dr) dr.innerHTML=A.rows.map((r,i)=>{
    const cw=total>0?cvt[r.theme.key]/total:null;
    const d=isNum(cw)?(cw-r.alloc):null;
    /* Green is ABOVE target and red is BELOW - the spec states it in words right under this table,
       and V2 had the two the other way round. */
    const dcls=isNum(d)?(Math.abs(d)<0.01?"muted":(d>=0?"up":"down")):"muted";
    return '<div class="md3-t"><span class="n"><span class="sq" style="background:var(--portfolio-'+((i%5)+1)+
      ')"></span><span>'+esc(r.theme.name)+'</span></span>'+
      '<span class="num">'+pct(r.alloc)+'</span>'+
      '<span class="num '+dcls+'">'+(isNum(d)?signed(d*100,1)+"pp":"\u2014")+'</span></div>';
  }).join("");

  // notes (E2.3: driven by metrics(); muted copy inside the collapsed <details>)
  const exM=metrics().filter(m=>m.valueKind==='themeMetric');
  const exNotes=A.rows.filter(r=>exM.some(m=>r[m.key]&&(((r[m.key].penalized||[]).length)||((r[m.key].excluded||[]).length)))).map(r=>{
    const bits=[], exl=new Set();
    exM.forEach(m=>{ const c=r[m.key]; if(!c)return;
      if((c.penalized||[]).length)bits.push(m.label+" penalized for "+c.penalized.join(", ")+" ("+effPenalty(m)+"×)");
      (c.excluded||[]).forEach(s=>exl.add(s)); });
    if(exl.size)bits.push("excluded as N/A: "+esc([...exl].join(", ")));
    return "<b>"+esc(r.theme.name)+":</b> "+bits.join("; ")+".";
  });
  const cappedThemes=A.rows.filter(r=>isNum(r.allocRaw)&&r.allocRaw>r.alloc+1e-6);
  const capNote=cappedThemes.length?(" Capped this run: "+cappedThemes.map(r=>r.theme.name+" "+pct(r.alloc)+" (from "+pct(r.allocRaw)+")").join(", ")+"."):"";
  const carried=Object.keys(A.carry||{});
  const carryNote=carried.length?("<b>Quality carry-over:</b> "+carried.map(s=>{const c=A.carry[s],p=[];if(isNum(c.ev))p.push("EV/EBITDA≈"+num(c.ev,1));if(isNum(c.dfcf))p.push("Debt/FCF≈"+num(c.dfcf,2));return "<b>"+esc(s)+"</b> "+p.join(", ");}).join("; ")+" — imputed from each name's standing on the factors it does report (banks don't publish these)."):"";
  const dirWord=m=>effDirection(m)==='higher'?'higher ⇒ better':'cheaper / lower ⇒ better';
  $("#allocNotes").innerHTML=`
    <p>For each portfolio we take a <b>market-cap-weighted</b> value of every active metric across the portfolio's names. On a
    <i>penalize</i> metric a name with a <b>reported negative</b> value is replaced by a <b>penalty multiple</b> so it drags
    the portfolio the wrong way; a value that's <b>not applicable</b> (e.g. a bank reports no EV/EBITDA or FCF) is either filled
    by <b>quality carry-over</b> — inheriting the name's standing on the factors it <i>does</i> report — or <b>excluded</b>.
    A Debt/FCF of <b>0</b> = debt-free = best.</p>
    <p>Each portfolio gets <b>${metrics().length}</b> scores, each normalized so the themes sum to 100%:
    ${metrics().map(m=>"<b>"+esc(m.label)+"</b> ("+dirWord(m)+")").join(", ")}. Blended by your weights
    (${metrics().map(m=>esc(m.label)+" "+Math.round((A.wByKey[m.key]||0)*100)).join(" / ")}%).</p>
    <p>Finally, <b>no portfolio may exceed ${Math.round((state.cap!=null?state.cap:defaultCap())*100)}%</b> — excess from a
    leading portfolio is spread across the others in proportion to their weights, repeated until every portfolio fits.${capNote}</p>
    <p><b>Per-portfolio tables (below):</b> each portfolio's names with their metrics. <b>Click any editable value</b>
    (blue dashed underline) to type your own number — saved, flagged <span class="tag ovr">ovr</span>, and used
    everywhere; click <b>↺</b> to revert. Use <b>✎ Choose metrics</b> to add or remove metrics from the model.</p>
    ${carryNote?("<p>"+carryNote+"</p>"):""}
    ${exNotes.length?("<p>"+exNotes.join("<br>")+"</p>"):""}`;

  // per-theme fundamentals tables (E2.3: columns driven by metrics(); Cap is a special always-second column)
  const grid=$("#fundGrid"); grid.innerHTML="";
  if(accountUnreachable()){ unreachablePanel("view-fundamentals"); return; }   // never invite a rebuild of a portfolio they already have
  if(!themes().length){                        // a genuinely empty board - not five themes with nothing in them
    grid.innerHTML=`<div class="empty-note">
      <h3>No portfolios yet</h3>
      <p>A portfolio is a basket you invest behind &mdash; &ldquo;Robotics&rdquo;, &ldquo;Payments&rdquo;, whatever your thesis is.
         The model allocates <b>between</b> portfolios and then ranks the names <b>inside</b> each one on the same
         metrics, so this is where a portfolio starts.</p>
      <div class="row" style="justify-content:center;gap:8px">
        <button class="btn primary" id="emptyNewTheme">\u2795 Create your first portfolio</button>
        <button class="linkish" id="emptyGuide">Show me how</button>
      </div></div>`;
    const nt=$("#emptyNewTheme"), gd=$("#emptyGuide");
    if(nt) nt.addEventListener("click",()=>{ const b=$("#newThemeBtn"); if(b) b.click(); });
    if(gd) gd.addEventListener("click",()=>coachStart("fundamentals",true));
    return;
  }
  const mcapOn=!!metricByKey('mcap'), cols=metrics().filter(m=>m.key!=='mcap');
  const OVR='<span class="tag ovr">ovr</span>';
  const pen=ti=>`<span class="tag pen" title="${ti}">prem</span>`, na=ti=>`<span class="tag na" title="${ti}">n/a</span>`,
        calc=ti=>`<span class="tag calc" title="${ti}">calc</span>`, qual=ti=>`<span class="tag qual" title="${ti}">qual</span>`;
  const bodyCell=(m,s,f,o,cy)=>{
    const rst=(field,live)=>isNum(o[field])?`<span class="reset" data-reset="${field}" data-sym="${esc(s)}" title="Reset to live (${live})">↺</span>`:'';
    if(m.key==='peg'){ const v=effPeg(s), tag=isNum(o.peg)?OVR:(!(isNum(v)&&v>0)?pen(`No/negative PEG → ${effPenalty(m)}×`):'');
      return `<td class="num"><span class="editable" data-edit="peg" data-sym="${esc(s)}" title="Click to type your own PEG">${num(v,2)}</span>${tag}${rst('peg',num(f.peg,2))}</td>`; }
    if(m.key==='ev'){ const v=effEv(s), evCarry=!isNum(v)&&isNum(cy.ev),
      tag=isNum(o.ev)?OVR:(isNum(v)&&v<=0?pen(`Negative EV/EBITDA → ${effPenalty(m)}×`):(evCarry?qual('EV/EBITDA carried over from this name’s standing on the factors it does report (banks don’t report it)'):(!isNum(v)?na('EV/EBITDA N/A → excluded'):(f.evCalc?calc('EV/EBITDA computed from TTM statements'):'')))),
      show=isNum(v)?num(v,1):(evCarry?num(cy.ev,1):'—');
      return `<td class="num"><span class="editable" data-edit="ev" data-sym="${esc(s)}" title="Click to type your own EV/EBITDA">${show}</span>${tag}${rst('ev',isNum(f.ev)?num(f.ev,1):'NM')}</td>`; }
    if(m.key==='dfcf'){ const v=effDfcf(s), dfCarry=!isNum(v)&&isNum(cy.dfcf),
      tag=isNum(o.dfcf)?OVR:(isNum(v)&&v<0?pen(`Negative FCF → ${effPenalty(m)}×`):(dfCarry?qual('Debt/FCF carried over from this name’s standing on the factors it does report'):(!isNum(v)?na('Debt/FCF N/A → excluded'):''))),
      show=isNum(v)?(v<0?'NM':num(v,2)):(dfCarry?num(cy.dfcf,2):'—');
      return `<td class="num"><span class="editable" data-edit="dfcf" data-sym="${esc(s)}" title="Click to type your own Total Debt / FCF">${show}</span>${tag}${rst('dfcf',isNum(f.dfcf)?(f.dfcf<0?'NM':num(f.dfcf,2)):'—')}</td>`; }
    if(m.key==='pe'){ const v=effPe(s), tag=isNum(o.pe)?OVR:(!(isNum(v)&&v>0)?pen(`No/negative earnings → ${effPenalty(m)}×`):(f.peCalc?calc('P/E computed from TTM statements: market cap ÷ net income'):''));
      return `<td class="num"><span class="editable" data-edit="pe" data-sym="${esc(s)}" title="Click to type your own P/E">${num(v,1)}</span>${tag}${rst('pe',isNum(f.pe)?num(f.pe,1):'NM')}</td>`; }
    if(m.key==='mom'){ const v=momOf(s), cls=isNum(v)?(v>=0?'up':'down'):''; return `<td class="num ${cls}">${isNum(v)?signed(v*100,1)+'%':'—'}</td>`; }
    const v=m.getter(s), edit=m.overridable?`<span class="editable" data-edit="${esc(m.overrideKey)}" data-sym="${esc(s)}" title="Click to type your own ${esc(m.label)}">${isNum(v)?fmtVal(m,v):'—'}</span>`:(isNum(v)?fmtVal(m,v):'—');   // generic catalog cell
    return `<td class="num">${edit}${m.overridable?rst(m.overrideKey,''):''}</td>`;
  };
  const footCell=(m,r)=>{
    if(m.key==='mom') return `<td class="num ${isNum(r.mom.value)?(r.mom.value>=0?'up':'down'):''}">${isNum(r.mom.value)?signed(r.mom.value*100,1)+'%':'—'}</td>`;
    if(m.key==='peg') return `<td class="num">${num(r.peg.value,2)}</td>`;
    if(m.key==='ev')  return `<td class="num">${num(r.ev.value,1)}</td>`;
    if(m.key==='dfcf')return `<td class="num">${isNum(r.dfcf.value)?num(r.dfcf.value,2):'—'}</td>`;
    if(m.key==='pe')  return `<td class="num">${num(r.pe.value,1)}</td>`;
    const c=r[m.key]; return `<td class="num">${c&&isNum(c.value)?fmtVal(m,c.value):'—'}</td>`;
  };
  A.rows.forEach(r=>{
    const t=r.theme;
    /* E1.13: the model ranks the names inside a portfolio, but until now that was only visible as
       dollars over on Rebalance - not here, where the metrics driving it are actually tuned. This
       column is the name's share OF THIS PORTFOLIO; multiply by the target pill in the header to
       get its share of the book, which the tooltip spells out. Names sitting on the owner's floor
       or ceiling are marked, because "why is this one not moving when I change the weights" is
       otherwise a genuinely confusing thing to hit. */
    const wIn=(A.within&&A.within[t.key])||{}, nIn=tickersOf(t.key).length, bIn=weightBounds(nIn);
    const wCell=s=>{
      const w=wIn[s];
      if(!isNum(w)) return '<td class="num">—</td>';
      const atHi=nIn>1 && w>=bIn.hi-1e-9, atLo=nIn>1 && w<=bIn.lo+1e-9;
      const tag=atHi?`<span class="tag" title="At the ceiling, 1/(n-1) = ${pct(bIn.hi)}">max</span>`
               :atLo?`<span class="tag" title="At the floor, 1/(2n) = ${pct(bIn.lo)}">min</span>`:'';
      return `<td class="num" title="${pct(r.alloc*w)} of the whole book">${pct(w)}${tag}</td>`;
    };
    const body=tickersOf(t.key).map(s=>{
      const f=state.fundamentals[s]||{}, o=state.overrides[s]||{}, cy=(A.carry&&A.carry[s])||{};
      return `<tr><td class="sym" data-stock="${esc(s)}" title="Open ${esc(s)} detail (statements + metrics)">${esc(s)}<button class="rmv-tkr" data-rmvtkr="${esc(s)}" data-theme="${esc(t.key)}" title="Remove ${esc(s)} from ${esc(t.name)}" aria-label="Remove ${esc(s)} from ${esc(t.name)}">×</button></td>${wCell(s)}${mcapOn?`<td class="num">${bil(effMcap(s))}</td>`:''}${cols.map(m=>bodyCell(m,s,f,o,cy)).join("")}</tr>`;
    }).join("");
    const srcTag = tickersOf(t.key).every(s=>(state.fundamentals[s]||{}).source==="live") ? '<span class="tag live">live</span>'
                 : (tickersOf(t.key).some(s=>(state.fundamentals[s]||{}).source==="live")?'':'<span class="tag seed">seed</span>');
    const thead=`<tr><th>Ticker</th><th title="Share of this portfolio's capital. The pill above gives the portfolio's share of the book.">Target</th>${mcapOn?'<th>Cap</th>':''}${cols.map(m=>`<th>${m.header}</th>`).join("")}</tr>`;
    const tfoot=`<tr><td>Portfolio</td><td class="num" title="the names always add up to the whole portfolio">100.0%</td>${mcapOn?`<td class="num" title="portfolio average market cap">${bil(r.mcap)}</td>`:''}${cols.map(m=>footCell(m,r)).join("")}</tr>`;
    // E5.2: same collapsible pattern as Overview — the old equal-height grid left dead space
    // under shorter portfolios. The header is a DIV, not a <button>, because it contains the
    // add/rename/delete buttons and nested buttons are invalid HTML.
    const fopen=OPEN_FTHEMES.has(t.key);
    grid.insertAdjacentHTML("beforeend",`
      <div class="thm ${fopen?"open":""}" data-fthmkey="${t.key}">
        <div class="thm-head" data-fthmtoggle="${t.key}" role="button" tabindex="0"
             aria-expanded="${fopen}" title="Show / hide ${esc(t.name)}'s metric table">
          <span class="chev">▶</span><span class="sw" style="background:${esc(t.color)}"></span>
          <span class="nm">${esc(t.name)}</span>${srcTag}
          <span class="theme-acts"><button class="addname-btn" data-addticker="${t.key}" data-lbl="Add ticker" title="Add a ticker to ${esc(t.name)}">＋<span class="lbl"> ticker</span></button>
          <button class="addname-btn" data-editth="${t.key}" data-lbl="Edit name" title="Rename / recolour ${esc(t.name)}">✎</button>
          <button class="addname-btn" data-delth="${t.key}" data-lbl="Delete" title="Delete ${esc(t.name)}">✕</button></span>
          <span class="pill" style="background:color-mix(in srgb,${esc(t.color)} 18%,var(--bg));color:color-mix(in srgb,${esc(t.color)} 50%,var(--ink))">target ${pct(r.alloc)}</span></div>
        <div class="thm-body" ${fopen?"":"hidden"}>
          <table><thead>${thead}</thead>
          <tbody>${body}</tbody>
          <tfoot>${tfoot}</tfoot>
          </table>
        </div>
      </div>`);
  });
  syncFThemeAllBtn();   // the theme set may have changed; keep the Expand/Collapse-all label honest
  // wire inline editors
  $$(".editable").forEach(el=>el.addEventListener("click",()=>startEdit(el)));
  $$(".reset").forEach(el=>el.addEventListener("click",async e=>{
    e.stopPropagation();
    const sym=el.dataset.sym, field=el.dataset.reset, o=state.overrides[sym];
    if(o){ delete o[field]; if(!Object.keys(o).length) delete state.overrides[sym]; }
    await savePortfolio(); renderFundamentals(); renderCalc();
  }));
}

function startEdit(el){
  const sym=el.dataset.sym, field=el.dataset.edit;
  const m=metrics().find(x=>x.overridable&&x.overrideKey===field);   // E2.3: resolve the editor's live value via the descriptor
  const cur=m?m.getter(sym):null;
  const inp=document.createElement("input"); inp.type="number"; inp.step="0.01"; inp.value=isNum(cur)?cur:"";
  inp.style.width="70px"; el.replaceWith(inp); inp.focus(); inp.select();
  const commit=async(save)=>{
    if(save){ const v=parseFloat(inp.value);
      state.overrides[sym]=state.overrides[sym]||{};
      if(isNum(v)) state.overrides[sym][field]=v; else delete state.overrides[sym][field];
      await savePortfolio(); }
    renderFundamentals();
  };
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter")commit(true); if(e.key==="Escape")commit(false); });
  inp.addEventListener("blur",()=>commit(true));
}

/* ======================================================================
   E2.4 — per-metric direction & bad-data config (state.metricCfg, pruned on default)
   E2.5 — presets / reset to the default 6
   ====================================================================== */
// The default model (kept in sync with the state literal for weights/penalty), used by reset + preset diffing.
const DEFAULT_CONFIG = {
  weights: (function(){ const w={}; DEFAULT_METRICS.forEach(m=>{ w[m.weightKey]=m.defaultWeight; }); return w; })(),
  penalty: {peg:10, ev:1000, dfcf:50, pe:200}
};
function backfillPenalty(){ ['peg','ev','dfcf','pe'].forEach(k=>{ if(!isNum(state.penalty[k])) state.penalty[k]=DEFAULT_CONFIG.penalty[k]; }); }   // restore any missing default-metric penalty after a wholesale replace
function pruneMetricCfg(key){
  if(!state.metricCfg) return;
  const e=state.metricCfg[key];
  if(e && !Object.keys(e).length) delete state.metricCfg[key];
  if(!Object.keys(state.metricCfg).length) state.metricCfg=null;
}
function setMetricPenalty(key,v){
  const m=catalogByKey(key); if(!m||!(isNum(v)&&v>=0)) return;
  if(m.penaltyKey){ state.penalty[m.penaltyKey]=v; return; }   // the 6 keep their single storage location (byte-identity)
  state.metricCfg=state.metricCfg||{}; state.metricCfg[key]=state.metricCfg[key]||{}; state.metricCfg[key].penalty=v; pruneMetricCfg(key);
}
function setMetricPolicy(key,policy){
  const m=catalogByKey(key); if(!m) return;
  state.metricCfg=state.metricCfg||{}; state.metricCfg[key]=state.metricCfg[key]||{};
  if(policy===m.badData) delete state.metricCfg[key].badData; else state.metricCfg[key].badData=policy;   // prune-on-default
  pruneMetricCfg(key);
}
// Replace the whole metric model (weights/penalty/metricCfg wholesale; metrics via validateMetrics). Cap is untouched.
function applyConfig(cfg){
  if(!cfg) return;
  if('metrics' in cfg) state.metrics=validateMetrics(cfg.metrics);       // null/[] => the default 6
  if(cfg.weights && Object.keys(cfg.weights).length) state.weights=deepCopy(cfg.weights);   // ignore an empty/malformed weights map (never wipe the live model)
  if(cfg.penalty && Object.keys(cfg.penalty).length){ state.penalty=deepCopy(cfg.penalty); backfillPenalty(); }
  if('metricCfg' in cfg) state.metricCfg=cfg.metricCfg?deepCopy(cfg.metricCfg):null;
}
async function resetToDefault6(){
  if(!confirm("Reset the metric model to the default 6 (PEG, EV/EBITDA, Debt/FCF, P/E, market cap, momentum) with default weights and exception handling?\n\nYour theme cap and your holdings are NOT changed."))return;
  state.metrics=null; state.metricCfg=null;
  state.weights=deepCopy(DEFAULT_CONFIG.weights); state.penalty=deepCopy(DEFAULT_CONFIG.penalty);
  const _ok=await savePortfolio(); renderFundamentals(); renderCalc(); toast(_ok?"Reset to the default 6 metrics":"Reset here, but NOT saved - see the sync badge");
}
function currentModelConfig(){
  return { metrics: state.metrics?state.metrics.map(m=>({key:m.key})):null,
    weights: deepCopy(state.weights), penalty: deepCopy(state.penalty),
    metricCfg: state.metricCfg?deepCopy(state.metricCfg):null };
}
async function saveCurrentPreset(){
  const name=(prompt("Save the current metric model as a preset.\nName:")||"").trim(); if(!name) return;
  state.presets=Array.isArray(state.presets)?state.presets:[];
  const cfg=currentModelConfig(), existing=state.presets.find(p=>p.name===name);
  if(existing) existing.config=cfg; else state.presets.push({name:name, config:cfg, savedAt:todayISO()});
  const _ok=await savePortfolio(); renderPresetSelect(); const sel=$("#presetSelect"); if(sel)sel.value=name; toast(_ok?'Preset "'+name+'" saved':'Saved here, but NOT written to your account - see the sync badge');
}
async function loadPreset(name){
  const p=(state.presets||[]).find(x=>x.name===name); if(!p||!p.config){ toast("Preset not found"); return; }
  applyConfig(p.config);
  const _ok=await savePortfolio(); renderFundamentals(); renderCalc(); toast(_ok?'Loaded "'+name+'"':'Loaded here, but NOT saved - see the sync badge');
}
async function deleteSelectedPreset(){
  const sel=$("#presetSelect"); const name=sel&&sel.value; if(!name){ toast("Pick a preset to delete"); return; }
  if(!confirm('Delete preset "'+name+'"?'))return;
  state.presets=(state.presets||[]).filter(p=>p.name!==name);
  const _ok=await savePortfolio(); renderPresetSelect(); toast(_ok?"Preset deleted":"Deleted here, but NOT saved - see the sync badge");
}
function renderPresetSelect(){
  const sel=$("#presetSelect"); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML="";
  const o0=document.createElement("option"); o0.value=""; o0.textContent="—"; sel.appendChild(o0);
  (state.presets||[]).forEach(p=>{ const o=document.createElement("option"); o.value=p.name; o.textContent=p.name; sel.appendChild(o); });
  const names=(state.presets||[]).map(p=>p.name);
  sel.value = names.indexOf(cur)>=0?cur:"";
}
// keep only structurally-valid presets on load (validateMetrics tolerates null => default 6)
function sanitizePreset(p){
  if(!p||typeof p!=='object'||typeof p.name!=='string'||!p.name||!p.config||typeof p.config!=='object') return null;
  const c=p.config;
  return { name:p.name, savedAt:p.savedAt||null, config:{
    metrics: Array.isArray(c.metrics)?c.metrics.filter(x=>x&&x.key).map(x=>({key:x.key})):null,
    weights: (c.weights&&typeof c.weights==='object')?c.weights:{},
    penalty: (c.penalty&&typeof c.penalty==='object')?c.penalty:{},
    metricCfg: (c.metricCfg&&typeof c.metricCfg==='object'&&!Array.isArray(c.metricCfg))?c.metricCfg:null } };
}

function metricDataCoverage(m){
  const syms=new Set(); themes().forEach(t=>tickersOf(t.key).forEach(s=>syms.add(s)));
  let have=0, total=0; syms.forEach(s=>{ total++; if(isNum(m.getter(s)))have++; });
  return {have, total};
}
/* E12 4.3 catalog modal. All 27 in one three-column grid rather than seven stacked group lists:
   the group is a tag on the row, so the reader scans one grid instead of seven. */
const METRIC_GROUP_TAGS = {value:'VAL', quality:'QUAL', growth:'GROW', income:'INC',
                           risk:'LEV', size:'SIZE', momentum:'MKT'};
function openMetricPicker(){
  const activeKeys=new Set(metrics().map(m=>m.key));
  const hasData=Object.keys(state.fundamentals||{}).length>0;
  const cells=METRIC_CATALOG.map(m=>{
    const on=activeKeys.has(m.key);
    const cov=hasData?metricDataCoverage(m):null;
    /* A metric with no data for YOUR book scores nothing for anybody, so say so on the row rather
       than letting it be picked and quietly do nothing. */
    const badge=cov?(cov.have===0?'<span class="mp-nd">NO DATA</span>':'<span class="mp-cov">'+cov.have+"/"+cov.total+"</span>"):"";
    return '<button type="button" class="mp-i'+(on?" on":"")+'" data-mpick="'+m.key+'" aria-pressed="'+on+'">'+
      '<span class="mp-box"></span>'+
      '<span class="mp-n">'+esc(m.label)+(m.formulaHint?'<i>'+esc(m.formulaHint)+"</i>":"")+"</span>"+
      badge+'<span class="mp-g">'+(METRIC_GROUP_TAGS[m.group]||"")+"</span></button>";
  }).join("");
  $("#modalRoot").innerHTML=
    '<div class="modal-backdrop mp-back" id="mpModal"><div class="mp-card">'+
      '<div class="mp-head"><h2>Metric catalog</h2><span class="mp-count" id="mpCount"></span>'+
        '<button class="mp-x" id="mpClose2" type="button" aria-label="Close">\u00d7</button></div>'+
      '<div class="mp-grid">'+cells+"</div>"+
      '<div class="mp-foot"><span>Direction is set for you: cheaper is better on a valuation metric, '+
        'higher is better on a quality or growth one.'+
        (hasData?"":" Refresh fundamentals to see per-metric coverage for your book.")+"</span>"+
        '<button class="mp-done" id="mpClose" type="button">DONE</button></div>'+
    "</div></div>";
  const count=()=>{ const n=$$('#mpModal .mp-i.on').length;
    const c=$("#mpCount"); if(c) c.textContent=n+" of "+METRIC_CATALOG.length+" active"; };
  count();
  const apply=async()=>{
    const picked=[]; $$('#mpModal .mp-i.on').forEach(b=>picked.push(b.dataset.mpick));
    if(!picked.length){ toast("Keep at least one metric"); return false; }
    const list=METRIC_CATALOG.filter(m=>picked.indexOf(m.key)>=0).map(m=>({key:m.key}));   // stable catalog order (6 first)
    const nm=validateMetrics(list);
    state.metrics=(nm&&nm.length===DEFAULT_METRICS.length&&nm.every((m,i)=>m===DEFAULT_METRICS[i]))?null:nm;   // exactly the default 6 => null
    metrics().forEach(m=>{ if(!isNum(state.weights[m.weightKey])) state.weights[m.weightKey]=m.defaultWeight; });   // seed new weights (absent only)
    await savePortfolio(); renderFundamentals(); renderCalc();
    return true;
  };
  $("#mpModal").addEventListener("click",async e=>{
    const b=e.target.closest(".mp-i");
    if(b){ const was=b.classList.contains("on");
      b.classList.toggle("on",!was); b.setAttribute("aria-pressed",String(!was));
      const ok=await apply();
      if(!ok){ b.classList.toggle("on",was); b.setAttribute("aria-pressed",String(was)); }
      count(); return; }
    if(e.target.closest("#mpClose,#mpClose2")||e.target.id==="mpModal") closeModal();
  });
}

/* ======================================================================
   Render: CALCULATOR view
   ====================================================================== */
function renderCalc(){
  /* E8 - no themes means no targets, and with no targets a rebalance would compute "sell
     everything" for a book that still holds real positions. That must never be presented as the
     ordinary flow, whether or not the account already has holdings. */
  if(accountUnreachable()){ unreachablePanel("view-calc"); return; }
  if(!themes().length){
    const held=holdingSyms().length;
    $("#calcMain").innerHTML="";
    $("#calcUninit").innerHTML=`<div class="empty-note">
      <h3>${held?"No portfolios to rebalance towards":"Build your portfolios first"}</h3>
      <p>${held
        ? "You still hold <b>"+held+"</b> position"+(held===1?"":"s")+", but every portfolio has been deleted — so there are no target weights to aim at, and rebalancing now would simply sell everything. Recreate a portfolio on <b>Model</b> and put those names back in it."
        : "Rebalance turns target weights into share counts, and those targets come from your portfolios. Create a portfolio on <b>Model</b>, add some names, and come back."}</p>
      <button class="btn primary" id="emptyGoModel">Go to Model</button></div>`;
    const g=$("#emptyGoModel");
    if(g) g.addEventListener("click",()=>{ switchView("fundamentals"); coachStart("fundamentals",true); });
    return;
  }
  if(!isInit()){ renderCalcInit(); $("#calcMain").innerHTML=""; }
  else { $("#calcUninit").innerHTML=""; renderCalcMain(); }
}

/* "$X ea" was honest only while the names inside a theme were equal-weighted. They are not any
   more, so show the SPREAD the model is actually asking for rather than an average that no name
   receives. */
function perNameRange(A, row, book){
  const w=(A.within&&A.within[row.theme.key])||{};
  const vals=tickersOf(row.theme.key).map(s=>row.alloc*book*(isNum(w[s])?w[s]:0));
  if(!vals.length) return "—";
  const lo=Math.min(...vals), hi=Math.max(...vals);
  return (hi-lo < 1) ? money(hi,0) : money(lo,0)+" – "+money(hi,0);
}
/* The starting capital the user has TYPED but not yet built with.
   It lives here rather than only in the DOM because renderCalcInit() rewrites #calcUninit wholesale
   and the input carried a hardcoded value="80000". Any renderAll() - a live quote refresh is enough -
   therefore destroyed the input and silently restored the default, so a user who typed 50,000 and was
   refreshed before clicking Build spent 80,000 instead. CI caught it as a flake in journey.spec.js;
   on a slow machine the refresh lands mid-test, and on a slow connection it lands mid-user. */
let initCapitalDraft=80000;

/* Only the preview half, so typing can refresh the numbers WITHOUT rebuilding the input and taking
   the caret with it. */
function calcInitPreview(cap){
  const A=computeAllocation();
  const rows=A.rows.map(r=>`<tr>
      <td class="sym"><span class="swatch" style="display:inline-block;background:${esc(r.theme.color)}"></span> ${esc(r.theme.name)}</td>
      <td class="num">${pct(r.alloc)}</td>
      <td class="num">${money(r.alloc*cap,0)}</td>
      <td class="num muted">${perNameRange(A, r, cap)}</td></tr>`).join("");
  return `<h3 style="font-size:14px">Preview @ ${money(cap,0)}</h3>
        <div class="tscroll"><table style="margin-top:6px"><thead><tr><th>Portfolio</th><th>Weight</th><th>Capital</th><th>Per name</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`;
}

function renderCalcInit(){
  const cap=(isNum(initCapitalDraft)&&initCapitalDraft>0)?initCapitalDraft:80000;
  if(!themes().length){                        // nothing to allocate between yet
    $("#calcUninit").innerHTML=`<div class="empty-note">
      <h3>Build your portfolios first</h3>
      <p>Rebalance turns target weights into share counts, and those targets come from your portfolios.
         Create a portfolio or two on <b>Model</b>, add some names, and come back.</p>
      <button class="btn primary" id="emptyGoModel">Go to Model</button></div>`;
    const g=$("#emptyGoModel");
    if(g) g.addEventListener("click",()=>{ switchView("fundamentals"); coachStart("fundamentals",true); });
    return;
  }
  $("#calcUninit").innerHTML=`
    ${(versions().length && canRedo())?`<div class="vbanner warn" style="margin-bottom:14px">
      <div>You undid your portfolio build — <b>${versions().length-1-head()}</b> version(s) can be restored.</div>
      <div class="row" style="gap:8px">${undoRedoButtons()}</div></div>`:''}
    <div class="grid2">
      <div class="card pad">
        <h2 style="font-size:16px">Get started</h2>
        <p class="small muted">Enter your starting capital. We'll split it across your
          ${themes().length} theme${themes().length===1?"":"s"} by the model weights, then equal-weight the names
          inside each theme, and convert to share counts at live prices.</p>
        <div class="row" style="align-items:flex-end;margin-top:8px">
          <div class="field"><label>Starting capital (USD)</label>
            <input type="number" id="initCapital" value="${cap}" step="1000" style="width:160px"></div>
          <button id="buildBtn" class="btn primary">Build initial portfolio →</button>
        </div>
        <p class="note">This is saved to your account and is the starting point
          for every future rebalance.</p>
      </div>
      <div class="card pad" id="calcInitPreview">${calcInitPreview(cap)}</div>
    </div>`;
  $("#buildBtn").addEventListener("click",doBuildInitial);
  const inp=$("#initCapital");
  if(inp) inp.addEventListener("input",()=>{
    const v=parseFloat(inp.value);
    /* Remember only a usable figure. A half-typed "5" must not overwrite the draft with 5 and then
       have a re-render put 5 back into the box under the user's cursor. */
    if(isNum(v)&&v>0) initCapitalDraft=v;
    const pv=$("#calcInitPreview");
    if(pv) pv.innerHTML=calcInitPreview((isNum(v)&&v>0)?v:0);
  });
}

async function doBuildInitial(){
  const cap=parseFloat($("#initCapital").value);
  if(!isNum(cap)||cap<=0){ toast("Enter a positive amount"); return; }
  if(!membership().length){                       // themes exist but none has any names in it
    toast("Add some tickers to your themes first - there is nothing to buy yet"); return; }
  if(membership().some(s=>!isNum(price(s)))){ toast("Waiting for prices… try Refresh"); return; }
  const plan=planTrades(cap,"full"); // from zero -> all buys
  const h={};
  plan.universe.forEach(s=>{ h[s]={shares:plan.sharesD[s]||0, costBasis:plan.trade[s]||0}; });
  if(!state.portfolio) state.portfolio={createdAt:todayISO(), versions:[], head:-1};
  if(!state.portfolio.createdAt) state.portfolio.createdAt=todayISO();
  state.portfolio.holdings=h;
  state.portfolio.totalContributed=cap;
  pushVersion(buildTxn("INITIAL","full",cap,0,plan));   // forks the timeline if you'd undone a prior build
  const _ok=await savePortfolio();
  toast(_ok ? "Portfolio initialized with "+money(cap,0)
            : "Built on screen, but NOT saved to your account - see the badge in the header");
  renderAll();
  switchView("calc");
}

function buildTxn(type,mode,cashIn,valueBefore,plan){
  const trades=plan.universe.filter(s=>Math.abs(plan.trade[s]||0)>=0.005).map(s=>({
    sym:s, theme:themeOfSym(s).key, amount:plan.trade[s], shares:plan.sharesD[s], price:price(s),
    before:plan.cv[s], after:plan.target[s] }));
  const allocOut={}; plan.alloc.rows.forEach(r=>allocOut[r.theme.key]=r.alloc);
  return {date:todayISO(), type, mode, cashIn, valueBefore, valueAfter:plan.newTotal,
    weights:{peg:state.weights.peg, ev:state.weights.ev}, alloc:allocOut, trades};
}

/* ===== E12 4.4 Trade =========================================================================
   The mode is the thing V2 got wrong: three bare buttons ("Calculate", "Realign only", and a
   two-option select) with no statement of what each one DOES. They are one radio list now, each
   with the consequence written under it, because the consequence is the whole choice.
   The plan is live - change the cash or the mode and it re-flows - so there is no "Calculate"
   button to press and no state in which the screen shows a plan for inputs you have since changed. */
const TRADE_MODES=[
  { v:"full",    t:"Full rebalance",
    d:"Move every position to its new model target. Buys and sells; the net is exactly your new cash." },
  { v:"cash",    t:"Deploy new cash only",
    d:"Steer the new money into the most underweight names. No sells, no tax events." },
  { v:"realign", t:"Realign only \u00b7 no new money",
    d:"Re-align the whole book to today's targets at the current value. Use it after you change the model." }];
let TRADE_MODE="full", TRADE_CASH=4000;

function tradePlan(){
  /* "Realign" is a full rebalance with no new cash - one mode in the UI, the same two arguments
     underneath. Keeping it as a third planTrades mode would mean a third code path computing the
     same thing. */
  const mode = TRADE_MODE==="realign" ? "full" : TRADE_MODE;
  const cash = TRADE_MODE==="realign" ? 0 : TRADE_CASH;
  return planTrades(cash, mode);
}

function renderCalcMain(){
  const total=curTotal(), cost=totalCostBasis(), unreal=total-cost;
  const sgn=n=>(n>=0?"+":"\u2212")+money(Math.abs(n),0);
  const el=$("#calcMain"); if(!el) return;
  el.innerHTML=`
    <div class="tr3">
      <div class="tr3-l">
        <div class="tr3-vbanner ${canRedo()?'warn':''}">
          <span>Last saved <b>${versionLabel(currentVersion())}</b>${currentVersion()?(' \u00b7 '+esc(currentVersion().date)):''}${canRedo()?(' \u00b7 <b>'+(versions().length-1-head())+'</b> newer redoable'):''}</span>
          <span class="tr3-undo">${undoRedoButtons()}</span>
        </div>

        <div class="tr3-lbl">CASH YOU&rsquo;RE ADDING</div>
        <div class="tr3-cash">
          <button type="button" id="cashDown" aria-label="One thousand less">\u2212</button>
          <span class="tr3-amt">$<input type="number" id="addCash" step="500" min="0"
            value="${Math.round(TRADE_CASH)}" aria-label="Cash you are adding"></span>
          <button type="button" id="cashUp" aria-label="One thousand more">+</button>
        </div>

        <div class="tr3-modes" id="tradeModes" role="radiogroup" aria-label="Rebalance mode">
          ${TRADE_MODES.map(m=>`<button type="button" class="tr3-mode${TRADE_MODE===m.v?' on':''}"
             data-mode="${m.v}" role="radio" aria-checked="${TRADE_MODE===m.v}">
             <span class="mk"></span><span class="mt"><b>${m.t}</b><i>${m.d}</i></span></button>`).join("")}
        </div>

        <div class="tr3-plan">
          <div class="tr3-phead"><h2>The plan</h2><span id="planSay"></span></div>
          <div class="tr3-prows" id="rebOut"></div>
        </div>
      </div>

      <div class="tr3-r">
        <div class="tr3-lbl">WHERE IT LANDS</div>
        <div class="md3-stack" id="tradeAfterBar"></div>
        <div class="tr3-lands" id="tradeLands"></div>
        <p class="tr3-cap">Portfolio / now \u2192 after</p>

        <div class="tr3-lbl">BOOK</div>
        <div class="tr3-book">
          <div><i>Book start date</i><b>${esc(String((state.portfolio&&state.portfolio.createdAt)||"\u2014"))}</b></div>
          <div><i>Total invested</i><b>${money(totalContributed(),0)}</b></div>
          <div><i>Unrealised gain</i><b class="${unreal>=0?'up':'down'}">${sgn(unreal)}</b></div>
          <div><i>After this trade</i><b id="tradeAfterTotal">\u2014</b></div>
        </div>

        <!-- The commit block sits at the top level of the column, outside every nested scroll
             (E5's rule). It is the one button in this app you must never have to hunt for. -->
        <div class="tr3-commit">
          <button class="tr3-apply" id="applyBtn" type="button">
            <span>APPLY &amp; SAVE CHECKPOINT</span><i>undoable</i></button>
          <p class="tr3-acct" id="tradeAcct">Saving writes one checkpoint to your account. If it
            can&rsquo;t reach your account it is not saved, and this screen tells you so.</p>
        </div>

        <div class="tr3-lbl tr3-hold">CURRENT HOLDINGS</div>
        ${holdingsTable()}
      </div>
    </div>`;

  const cashIn=$("#addCash");
  const reflow=()=>{ TRADE_CASH=Math.max(0,parseFloat(cashIn.value)||0); renderTradePlan(); };
  cashIn.addEventListener("input",reflow);
  /* The steppers are the coarse control and typing is the fine one - both must work, so the
     stepper writes the field and the field is the single source of the number. */
  $("#cashUp").addEventListener("click",()=>{ cashIn.value=String(Math.max(0,(parseFloat(cashIn.value)||0)+1000)); reflow(); });
  $("#cashDown").addEventListener("click",()=>{ cashIn.value=String(Math.max(0,(parseFloat(cashIn.value)||0)-1000)); reflow(); });
  $("#tradeModes").addEventListener("click",e=>{
    const b=e.target.closest("[data-mode]"); if(!b) return;
    TRADE_MODE=b.dataset.mode;
    $$("#tradeModes .tr3-mode").forEach(x=>{ const on=x.dataset.mode===TRADE_MODE;
      x.classList.toggle("on",on); x.setAttribute("aria-checked",String(on)); });
    /* Realign means "no new money", so the cash figure has to go to zero on screen too - leaving
       $4,000 sitting above a plan that spends none of it is the screen contradicting itself. */
    if(TRADE_MODE==="realign") cashIn.value="0";
    TRADE_CASH=Math.max(0,parseFloat(cashIn.value)||0);
    renderTradePlan();
  });
  $("#applyBtn").addEventListener("click",()=>{ if(lastPlan) applyRebalance(lastPlan); });
  renderTradePlan();
}

function renderTradePlan(){
  if(!$("#rebOut")) return;
  if(membership().some(s=>!isNum(price(s)))){
    lastPlan=null;
    $("#rebOut").innerHTML='<p class="tr3-none">Waiting for prices \u2014 press Refresh in the header.</p>';
    const a=$("#applyBtn"); if(a) a.disabled=true;
    return;
  }
  const plan=tradePlan(); lastPlan=plan;
  const a=$("#applyBtn"); if(a) a.disabled=false;
  renderRebalanceOutput(plan);
}
function holdingsTable(){
  const cv=curValueBySym(), total=curTotal(), h=holdings();
  const rows=themes().map(t=>{
    const tv=tickersOf(t.key).reduce((a,s)=>a+(cv[s]||0),0);
    const inner=tickersOf(t.key).map(s=>{
      const sh=h[s]?h[s].shares:0, p=price(s), v=cv[s], cb=h[s]?h[s].costBasis:0;
      const gl=v-cb;
      return `<tr><td class="sym">${esc(s)} <button class="rmv-tkr" data-rmvtkr="${esc(s)}" data-theme="${esc(t.key)}" title="Remove ${esc(s)} from ${esc(t.name)}">✕</button></td><td class="num">${num(sh,3)}</td><td class="num">${money(p,2)}</td>
        <td class="num">${money(v,0)}</td><td class="num">${total>0?pct(v/total):"—"}</td>
        <td class="num ${gl>=0?'up':'down'}">${signed(gl,0).replace(/^([+-])/,'$1$')}</td></tr>`;}).join("");
    return `<tr class="theme-row"><td class="sym" colspan="3"><span class="swatch" style="display:inline-block;background:${esc(t.color)}"></span> <b>${esc(t.name)}</b></td>
      <td class="num"><b>${money(tv,0)}</b></td><td class="num"><b>${total>0?pct(tv/total):"—"}</b></td><td></td></tr>${inner}`;
  }).join("");
  return `<div class="tscroll"><table style="margin-top:6px"><thead><tr><th>Holding</th><th>Shares</th><th>Price</th><th>Value</th><th>Weight</th><th>Gain</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total</td><td></td><td></td><td class="num">${money(total,0)}</td><td class="num">100%</td>
      <td class="num ${total-totalCostBasis()>=0?'up':'down'}">${signed(total-totalCostBasis(),0).replace(/^([+-])/,'$1$')}</td></tr></tfoot></table></div>`;
}

let lastPlan=null;
function renderRebalanceOutput(plan){
  const out=$("#rebOut"); if(!out) return;
  const buys=[], sells=[];
  plan.universe.forEach(s=>{ const amt=plan.trade[s]||0; if(amt>0.005)buys.push(s); else if(amt<-0.005)sells.push(s); });
  const sumBuy=buys.reduce((a,s)=>a+plan.trade[s],0);
  const sumSell=sells.reduce((a,s)=>a+plan.trade[s],0);
  const n=buys.length+sells.length;

  const say=$("#planSay");
  if(say) say.textContent = n
    ? n+" trade"+(n===1?"":"s")+" \u00b7 net "+money(plan.addCash,0)+" \u00b7 nothing is sent to a broker"
    : "Nothing to do \u2014 the book already sits on its targets.";

  /* E1.6: a name that has left every portfolio is sold to zero. Say so before it happens, not in
     the checkpoint afterwards. */
  const M=membership();
  const exiting=plan.universe.filter(s=> !M.includes(s) && (plan.cv[s]||0)>0.5 && (plan.target[s]||0)<0.5);
  const warn = exiting.length
    ? '<p class="tr3-warn"><b>'+exiting.length+" name"+(exiting.length>1?"s":"")+
      " will be sold to $0</b> \u2014 no longer in any portfolio: "+esc(exiting.join(", "))+".</p>"
    : "";
  const miss = plan.missing.length
    ? '<p class="tr3-warn">No live price for '+esc(plan.missing.join(", "))+" \u2014 excluded from this plan.</p>"
    : "";

  const rows=plan.universe.map(s=>{
    const amt=plan.trade[s]||0, sh=plan.sharesD[s];
    if(Math.abs(amt)<=0.005) return "";
    const buy=amt>0;
    return '<div class="tr3-t">'+
      '<span class="chip '+(buy?"b":"s")+'">'+(buy?"BUY":"SELL")+"</span>"+
      '<span class="tk">'+esc(s)+"<i>"+esc(themeOfSym(s).name||"no portfolio")+"</i></span>"+
      '<span class="num">'+(isNum(sh)?signed(sh,3):"\u2014")+"</span>"+
      '<span class="num amt '+(buy?"b":"s")+'">'+(buy?"+":"\u2212")+money(Math.abs(amt),0)+"</span></div>";
  }).join("");

  out.innerHTML = warn + miss + (rows
    ? '<div class="tr3-thead"><span></span><span>Ticker</span><span class="num">Shares</span>'+
      '<span class="num">Amount</span></div>'+rows
    : '<p class="tr3-none">No trades in this plan.</p>');

  // ---- right column: where it lands, and the resulting total
  const bar=$("#tradeAfterBar"), lands=$("#tradeLands");
  const T=themes();
  if(bar){ bar.innerHTML=T.map((t,i)=>{
      const after=tickersOf(t.key).reduce((a,x)=>a+(plan.target[x]||0),0);
      const w=plan.newTotal>0?after/plan.newTotal:0;
      return '<span title="'+esc(t.name)+' '+pct(w)+'" style="flex:'+Math.max(w,0.001)+
             ';background:var(--portfolio-'+((i%5)+1)+')"></span>';
    }).join(""); }
  if(lands){ lands.innerHTML=T.map((t,i)=>{
      const before=tickersOf(t.key).reduce((a,x)=>a+(plan.cv[x]||0),0);
      const after=tickersOf(t.key).reduce((a,x)=>a+(plan.target[x]||0),0);
      const wB=plan.cur0>0?before/plan.cur0:0, wA=plan.newTotal>0?after/plan.newTotal:0;
      const d=after-before;
      return '<div class="tr3-land"><span class="n"><span class="sq" style="background:var(--portfolio-'+
        ((i%5)+1)+')"></span><span>'+esc(t.name)+'</span></span>'+
        '<span class="num">'+pct(wB,0)+" \u2192 "+pct(wA,0)+"</span>"+
        '<span class="num '+(d>=0?"up":"down")+'">'+(d>=0?"+":"\u2212")+money(Math.abs(d),0)+"</span></div>";
    }).join(""); }
  const at=$("#tradeAfterTotal"); if(at) at.textContent=money(plan.newTotal,0);
}

async function applyRebalance(plan){
  const h=holdings();
  plan.universe.forEach(s=>{
    const cur=h[s]||{shares:0,costBasis:0};
    const dShares=plan.sharesD[s]||0, dCash=plan.trade[s]||0;
    cur.shares=(cur.shares||0)+dShares;
    cur.costBasis=(cur.costBasis||0)+dCash; // net invested basis
    if(cur.shares<1e-9)cur.shares=0;
    h[s]=cur;
  });
  // drop fully-liquidated positions no longer in any theme (e.g. a swapped-out name)
  Object.keys(h).forEach(s=>{ if((h[s].shares||0)<1e-9 && !membership().includes(s)) delete h[s]; });
  state.portfolio.holdings=h;
  state.portfolio.totalContributed=totalContributed()+plan.addCash;
  pushVersion(buildTxn("REBALANCE",plan.mode,plan.addCash,plan.cur0,plan));
  const _saved=await savePortfolio();
  lastPlan=null;
  toast(_saved ? "Rebalance applied & saved"
              : "Rebalance applied on screen - NOT saved to your account. See the sync badge in the header.");
  renderAll();
  /* Baseline section 9 rule 1: when the save fails the sentence under the button is REPLACED by the
     failure, in place, and the user's change stays on screen. A toast that fades is not a report -
     the user can look away for two seconds and never learn their checkpoint did not persist.
     Set after renderAll, which rebuilt the element this writes into. */
  const acct=$("#tradeAcct");
  if(acct && !_saved){
    acct.classList.add("bad");
    acct.textContent="This checkpoint was NOT saved to your account. It is applied on screen only \u2014 "+
      "check the sync badge in the header and try again before you close this tab.";
  }
}

/* ======================================================================
   Render: HISTORY view
   ====================================================================== */
function renderHistory(){
  if(accountUnreachable()){ unreachablePanel("view-history"); return; }
  const body=$("#historyBody"), ctl=$("#histControls");
  const vs=versions(), h=head();
  if(ctl) ctl.innerHTML=syncCardHTML();
  const trim=$("#histTrim");
  if(trim) trim.textContent = timelineTrimmed()
    ? "Only the "+MAX_VERSIONS+" most recent checkpoints are kept \u2014 older ones have been dropped."
    : "";
  $$('.hi3-acts [data-vaction="undo"]').forEach(function(b){ b.disabled=!canUndo(); });
  $$('.hi3-acts [data-vaction="redo"]').forEach(function(b){ b.disabled=!canRedo(); });
  /* E7.4 - "clears every holding and the whole timeline" is the most alarming thing on the screen,
     and on a brand-new account it is also a no-op. Offer it once there is something to lose. */
  const rb=$("#resetBtn"); if(rb) rb.hidden=!(vs.length||isInit());
  if(!body) return;
  try{ renderHistChart(); }catch(e){ console.error("hist chart",e); }
  if(!vs.length){
    body.innerHTML='<p class="hi3-empty">No checkpoints yet. Build your portfolio on the '+
      "<b>Trade</b> lane \u2014 every build and rebalance is saved here as a checkpoint you can undo, "+
      "redo, or revert to. The "+MAX_VERSIONS+" most recent are kept.</p>";
    const sel=$("#histSelected"); if(sel) sel.innerHTML="";
    return;
  }
  body.innerHTML=vs.map(function(_,i){ return i; }).reverse().map(function(i){
    const tx=vs[i], isCur=(i===h), isFut=(i>h);
    const delta=(isNum(tx.valueAfter)&&isNum(tx.valueBefore))?tx.valueAfter-tx.valueBefore:null;
    const tag = isCur ? '<span class="tag calc">CURRENT</span>'
              : isFut ? '<span class="tag na">REDOABLE</span>'
                      : '<span class="tag">APPLIED</span>';
    return '<button type="button" class="hi3-row'+(isCur?" cur":"")+(isFut?" fut":"")+
      (String(tx.id)===String(HIST_SEL)?" on":"")+'" data-vsel="'+esc(String(tx.id))+'">'+
      '<span class="mk"></span>'+
      '<span class="t"><b>'+esc(versionTitle(tx))+"</b><i>"+esc(String(tx.date||""))+" \u00b7 "+
        esc(tx.mode==="full"?"full rebalance":(tx.mode?"cash deploy":String(tx.type||"")))+" \u00b7 "+
        ((tx.trades||[]).length)+" trades</i></span>"+
      tag+
      '<span class="v">'+(isNum(tx.valueAfter)?money(tx.valueAfter,0):"\u2014")+
        (delta!=null?'<i class="'+(delta>=0?"up":"down")+'">'+(delta>=0?"+":"\u2212")+
          money(Math.abs(delta),0)+"</i>":"")+"</span></button>";
  }).join("");
  renderHistSelected();
}

/* Which checkpoint the right column is showing. Null means "the current one" - resolved at read
   time rather than stored, so an undo moves the selection with it instead of leaving the panel
   describing a checkpoint the user has just stepped away from. */
let HIST_SEL=null;
function histSelected(){
  const vs=versions(); if(!vs.length) return null;
  if(HIST_SEL!=null){ const hit=vs.find(function(v){ return String(v.id)===String(HIST_SEL); }); if(hit) return hit; }
  return vs[Math.min(Math.max(0,head()),vs.length-1)];
}
function renderHistSelected(){
  const el=$("#histSelected"); if(!el) return;
  const tx=histSelected(); if(!tx){ el.innerHTML=""; return; }
  const vs=versions(), i=vs.indexOf(tx), h=head(), isCur=(i===h), isFut=(i>h);
  const mode=tx.mode==="full"?"FULL REBALANCE":(tx.mode==="cash"?"DEPLOY NEW CASH":String(tx.type||"CHECKPOINT"));
  const seg=themes().map(function(t,k){
    return { n:t.name, a:(tx.alloc&&isNum(tx.alloc[t.key]))?tx.alloc[t.key]:null, k:k };
  }).filter(function(x){ return isNum(x.a)&&x.a>0; });
  const alloc = seg.length
    ? '<div class="md3-stack">'+seg.map(function(x){
        return '<span title="'+esc(x.n)+" "+pct(x.a)+'" style="flex:'+x.a+
               ';background:var(--portfolio-'+((x.k%5)+1)+')"></span>'; }).join("")+"</div>"
    : '<p class="hi3-note">This checkpoint did not record a target allocation.</p>';
  const trades=(tx.trades||[]).map(function(tr){
    const buy=tr.amount>0;
    return '<div class="hi3-t"><span class="chip '+(buy?"b":"s")+'">'+(buy?"BUY":"SELL")+"</span>"+
      '<span class="tk">'+esc(tr.sym)+"</span>"+
      '<span class="num">'+(isNum(tr.shares)?signed(tr.shares,3):"\u2014")+"</span>"+
      '<span class="num">'+(isNum(tr.price)?money(tr.price,2):"\u2014")+"</span>"+
      '<span class="num amt '+(buy?"b":"s")+'">'+(buy?"+":"\u2212")+money(Math.abs(tr.amount||0),0)+
      "</span></div>";
  }).join("");
  el.innerHTML='<div class="hi3-sel">'+
    '<div class="hi3-lbl acc">SELECTED \u00b7 '+esc(mode)+"</div>"+
    '<div class="hi3-selmeta">'+esc(versionLabel(tx))+" \u00b7 "+esc(String(tx.date||""))+
      (isNum(tx.valueBefore)&&isNum(tx.valueAfter)
        ? " \u00b7 "+money(tx.valueBefore,0)+" \u2192 "+money(tx.valueAfter,0) : "")+"</div>"+
    alloc+
    (trades
      ? '<div class="hi3-thead"><span></span><span>Ticker</span><span class="num">Shares</span>'+
        '<span class="num">Price</span><span class="num">Amount</span></div>'+trades
      : '<p class="hi3-note">No trades recorded in this checkpoint.</p>')+
    (isCur ? '<p class="hi3-note">This is where you are now.</p>'
           : '<button type="button" class="hi3-revert" data-vaction="revert" data-vid="'+esc(String(tx.id))+'">'+
             (isFut?"REDO TO HERE":"REVERT TO HERE")+"</button>")+
  "</div>";
}

function renderHistChart(){
  const svg=$("#histChart"), note=$("#histChartNote"); if(!svg) return;
  const vs=versions(), h=head();
  if(vs.length<1){ svg.innerHTML=""; svg.classList.add("is-empty"); if(note)note.textContent=""; return; }
  const W=Math.max(240,Math.round(svg.clientWidth||540)), H=240, PB=26, PT=10;
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  const vals=vs.map(v=>isNum(v.valueAfter)?v.valueAfter:null).filter(isNum);
  if(!vals.length){ svg.innerHTML=""; svg.classList.add("is-empty");
    if(note)note.textContent="No recorded values yet."; return; }
  svg.classList.remove("is-empty");
  let lo=Math.min(...vals), hi=Math.max(...vals);
  if(hi<=lo){ lo=lo*0.98; hi=hi*1.02+1; }
  const bw=Math.max(6,Math.min(46,(W-8)/vs.length-6));
  svg.innerHTML=vs.map((v,i)=>{
    const val=isNum(v.valueAfter)?v.valueAfter:null;
    const x=(i*((W-8)/vs.length))+4, isCur=(i===h), isFut=(i>h);
    if(val==null) return "";
    const bh=Math.max(2,((val-lo)/(hi-lo))*(H-PB-PT-6)+6), y=H-PB-bh;
    /* Three states, three treatments: the selected bar is solid ink, an applied one is ink at 30%,
       and a REDOABLE FUTURE is outlined and dashed - a future is not a thing that happened, and
       filling it the same as the past is the chart asserting that it did. */
    const sel=(String(v.id)===String((histSelected()||{}).id));
    const fill = isFut ? "none" : (sel ? "var(--ink)" : "rgba(32,30,29,.3)");
    return `<g><title>${esc(versionLabel(v))} — ${money(val,0)}</title>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}"
        fill="${fill}"${isFut?' stroke="var(--ink-45)" stroke-width="1.4" stroke-dasharray="5 4"':""}></rect>
      <text x="${(x+bw/2).toFixed(1)}" y="${(H-PB+13).toFixed(1)}" text-anchor="middle"
        font-size="10" fill="var(--ink-45)">${esc(String(v.date||"").slice(5,10))}</text></g>`;
  }).join("")+
   `<line x1="0" y1="${H-PB}" x2="${W}" y2="${H-PB}" stroke="rgba(32,30,29,.3)" stroke-width="1"/>`;
  const futures=vs.length-1-h;
  if(note) note.textContent=`${vs.length} checkpoint${vs.length===1?'':'s'} · solid = current & past`+
    (futures>0?` · ${futures} dashed = redoable future`:"");
}

/* ---- recommendations for the flat Screener (E1.9): curated universe for the original themes; live
        keyword (theme name) + peers (of the theme's current picks) for custom themes. ---- */
function isCuratedTheme(key){ return !!((state.universe&&state.universe.themes||[]).some(u=>u.key===key)); }
async function buildThemeRecos(theme){
  const exclude=new Set([...tickersOf(theme.key), ...holdingSyms()]);
  const cands=[];
  // keyword queries from the theme name: the whole name, its words, and de-pluralized forms (Yahoo search is picky)
  const words=(theme.name||"").split(/[^A-Za-z]+/).filter(w=>w.length>=3);
  const qset=new Set([theme.name, ...words]);
  words.forEach(w=>{ if(w.length>4 && /s$/i.test(w)) qset.add(w.replace(/s$/i,"")); });
  for(const qy of [...qset].slice(0,4)){ try{ (await dsSearch(qy)).forEach(x=>cands.push(x.symbol)); }catch(e){} }
  for(const m of tickersOf(theme.key)){ try{ (await dsPeers(m)).forEach(s=>cands.push(s)); }catch(e){} }   // peers of its picks
  const seen=new Set(), out=[];
  for(const s of cands){ if(!s||seen.has(s)||exclude.has(s))continue; seen.add(s); out.push(s); if(out.length>=15)break; }
  return out;
}

function renderScreener(){
  if(accountUnreachable()){ unreachablePanel("view-screener"); return; }
  renderWatchlist();
  const wl=(state.watchlist||[]).filter(w=>w&&w.sym&&!themeOf[w.sym]);
  const st=$("#resStats");
  if(st) st.textContent = wl.length
    ? wl.length+" name"+(wl.length===1?"":"s")+" you are weighing up \u2014 none of them touch your portfolio"
    : "nothing here yet";
  const body=$("#screenerBody");
  if(body) body.innerHTML = wl.length ? "" :
    '<p class="rs3-empty">Search above for any listed name, including ones outside your portfolios. '+
    'Adding one parks it here so you can weigh it up before it ever touches your book.</p>';
}

/* E12 4.4b. Four interactions hang off this lane and all four already existed in V2, so all four
   have to survive: search, results, the watchlist, and the route into the book.
   The row itself opens the stock panel; only the button adds to the watchlist. Reading a company's
   financials must not require adding it to anything - the spec calls this the single most
   droppable interaction in the migration, and V2 had it the other way round. */
let _rsTimer=null, _rsSeq=0;
function wireResearchSearch(){
  const q=$("#resQuery"), res=$("#resResults"), clr=$("#resClear");
  if(!q||!res) return;
  const rowHTML=function(r){
    const sym=r.symbol, held=!!themeOf[sym];
    const watched=(state.watchlist||[]).some(w=>w&&w.sym===sym);
    const quote=state.quotes[sym]||{}, px=price(sym), cp=quote.changePct;
    const tag = held ? '<span class="rs3-tag held">HELD</span>'
              : watched ? '<span class="rs3-tag">WATCHING</span>' : "";
    return '<div class="rs3-row" data-rssym="'+esc(sym)+'">'+
      '<button type="button" class="rs3-open" data-stock="'+esc(sym)+'">'+
        '<span class="s">'+esc(sym)+"</span><span class=\"n\">"+esc(r.name||nameOf(sym))+"</span></button>"+
      '<span class="x">'+esc((r.type&&r.type!=="EQUITY")?r.type:(r.exchange||""))+"</span>"+
      '<span class="num">'+(isNum(px)?money(px,2):"\u2014")+"</span>"+
      '<span class="num '+(isNum(cp)?(cp>=0?"up":"down"):"")+'">'+
        (isNum(cp)?signed(cp,2)+"%":"\u2014")+"</span>"+
      tag+
      '<button type="button" class="rs3-add" data-rsadd="'+esc(sym)+'"'+(held||watched?" disabled":"")+'>'+
        (held?"IN YOUR BOOK":watched?"ON THE LIST":"ADD TO WATCHLIST")+"</button></div>";
  };
  const run=()=>{
    clearTimeout(_rsTimer);
    const term=q.value.trim();
    if(clr) clr.hidden=!term;
    if(!term){ res.innerHTML=""; return; }
    res.innerHTML='<p class="rs3-note">Searching\u2026</p>';
    _rsTimer=setTimeout(async()=>{
      const seq=++_rsSeq;
      let list=[]; try{ list=await dsSearch(term); }catch(e){}
      /* Stale-response guard. A slower earlier request must never overwrite a faster later one -
         and the sequence number covers the case the text check misses, where the user types back
         to a term they already searched. */
      if(seq!==_rsSeq || q.value.trim()!==term) return;
      if(!list.length){ res.innerHTML='<p class="rs3-note">No matches \u2014 try another symbol or name.</p>'; return; }
      list=list.slice(0,8);
      res.innerHTML='<div class="rs3-rhead"><span>Result</span><span>Listing</span><span class="num">Last</span>'+
        '<span class="num">Today</span><span></span><span></span></div>'+list.map(rowHTML).join("");
      /* ONE batched quote call per settled search - not one per keystroke, and not one per row.
         The debounce means a completed search costs a single request, well under the 60s poll the
         app already runs, so this cannot move the needle on rate limiting. */
      const need=list.map(r=>r.symbol).filter(sym=>!isNum(price(sym)));
      if(!need.length) return;
      try{
        /* dsQuotes returns {quotes, asOf} - NOT the map itself. Treating the envelope as the map
           writes state.quotes.quotes and state.quotes.asOf and leaves every price blank. Every
           other caller in this file reads d.quotes; this one has to as well. */
        const got=((await dsQuotes(need))||{}).quotes;
        if(seq!==_rsSeq) return;
        state.quotes=mergeFeed(state.quotes, got);
        res.innerHTML='<div class="rs3-rhead"><span>Result</span><span>Listing</span><span class="num">Last</span>'+
          '<span class="num">Today</span><span></span><span></span></div>'+list.map(rowHTML).join("");
      }catch(e){}
    },250);
  };
  q.addEventListener("input",run);
  if(clr) clr.addEventListener("click",()=>{ q.value=""; run(); q.focus(); });
  res.addEventListener("click",e=>{
    const add=e.target.closest("[data-rsadd]");
    if(add){ addToWatchlist(add.dataset.rsadd, null); return; }
    // the row itself is the panel; main's delegated handler catches button[data-stock]
  });
}

async function ensureScreener(){ renderScreener(); }   // E4.4: Screener = search box + watchlist (no recommendations)

/* E12 4.4b item 4, and the E4.4 flow it replaces are the SAME dialog: pick a portfolio, then say
   whether this is a new name or a swap for one already in it. themeKey may be null - the watchlist
   route does not pre-pick a portfolio, so the dialog asks. Confirming does not trade: it stages the
   change and leaves the resulting plan on Rebalance. */
function openSwap(newSym, themeKey){
  const T=themes();
  if(!T.length){ toast("Create a portfolio first \u2014 there is nothing to add it to"); return; }
  if(!isInit()){ toast("Build your portfolio first (Rebalance tab)"); return; }
  // Refuse here too, so the user is not walked through a whole modal for something setMembership
  // is going to reject anyway. setMembership stays the authority; this is only courtesy.
  if(!isEquity(newSym)){ toast(notEquityNote(newSym)); return; }
  let key = (themeKey && themeByKey(themeKey)) ? themeKey : T[0].key;
  if(tickersOf(key).includes(newSym) && themeKey){
    toast(newSym+" is already in "+themeByKey(key).name); return; }
  const opts=T.map(function(t){ return '<option value="'+esc(t.key)+'"'+(t.key===key?" selected":"")+
    ">"+esc(t.name)+"</option>"; }).join("");
  $("#modalRoot").innerHTML=
    '<div class="modal-backdrop mp-back" id="swapModal"><div class="mp-card" style="width:min(500px,94vw)">'+
      '<div class="mp-head"><h2>Add '+esc(newSym)+'</h2><span class="mp-count">'+esc(nameOf(newSym))+"</span>"+
        '<button class="mp-x" id="swapCancel" type="button" aria-label="Close">\u00d7</button></div>'+
      '<div class="ap-body">'+
        '<label class="ap-l">Portfolio</label>'+
        '<select id="apTheme" class="ap-sel">'+opts+"</select>"+
        '<label class="ap-l">How</label>'+
        '<div class="ap-how" id="apHow">'+
          '<button type="button" class="ap-opt on" data-how="new"><span class="mk"></span>'+
            '<span><b>Add as a new name</b><i id="apNewSay"></i></span></button>'+
          '<button type="button" class="ap-opt" data-how="swap"><span class="mk"></span>'+
            "<span><b>Swap for a holding</b><i>Replaces one name with this one. The name you swap out is sold to zero on the next rebalance.</i></span></button>"+
        "</div>"+
        '<div id="apSwapWrap" hidden><label class="ap-l">Swap out</label>'+
          '<div class="ap-list" id="apSwap"></div></div>'+
        '<p class="ap-note">Confirming does not trade. It stages the change and shows you the '+
          'resulting plan on Rebalance, where <b>Apply &amp; save</b> commits it as a normal checkpoint.</p>'+
      "</div>"+
      '<div class="mp-foot"><span>Nothing is sent to a broker, ever.</span>'+
        '<button class="mp-done" id="apGo" type="button">CONFIRM</button></div>'+
    "</div></div>";
  let HOW="new";
  const pick=function(h){ HOW=h;
    $$("#apHow .ap-opt").forEach(function(b){ b.classList.toggle("on",b.dataset.how===h); });
    const w=$("#apSwapWrap"); if(w) w.hidden=(h!=="swap"); };
  const fill=function(){
    key=$("#apTheme").value;
    const cur=tickersOf(key), cv=curValueBySym();
    $("#apNewSay").textContent="The portfolio grows to "+(cur.length+1)+
      " names. Names inside a portfolio are equal-weighted, so each one's share falls a little.";
    $("#apSwap").innerHTML = cur.length
      ? cur.map(function(x){ return '<label class="ap-r"><input type="radio" name="swapTarget" value="'+esc(x)+
          '"><span class="s">'+esc(x)+'</span><span class="n">'+esc(nameOf(x))+
          '</span><span class="num">'+money(cv[x]||0,0)+"</span></label>"; }).join("")
      : '<p class="ap-note">This portfolio has no names yet.</p>';
    /* A portfolio with nothing in it has nothing to swap FOR, so the option cannot be offered - it
       would confirm into a no-op and read as the app losing the request. */
    const empty=!cur.length, sw=$('#apHow [data-how="swap"]');
    if(sw) sw.disabled=empty;
    if(empty && HOW==="swap") pick("new");
    // already-in-this-portfolio is only reachable once the picker can change the portfolio
    const dupe=cur.includes(newSym), go=$("#apGo");
    if(go){ go.disabled=dupe; go.textContent=dupe?"ALREADY IN THIS PORTFOLIO":"CONFIRM"; }
  };
  $("#apTheme").addEventListener("change",fill);
  $("#apHow").addEventListener("click",function(e){
    const b=e.target.closest("[data-how]"); if(b&&!b.disabled) pick(b.dataset.how); });
  $("#swapCancel").addEventListener("click",closeModal);
  $("#swapModal").addEventListener("click",function(e){ if(e.target.id==="swapModal") closeModal(); });
  $("#apGo").addEventListener("click",function(){
    if(HOW==="swap"){
      const sel=$("input[name=swapTarget]:checked");
      if(!sel){ toast("Pick a holding to replace"); return; }
      closeModal(); doSwap(key, sel.value, newSym);
    } else { closeModal(); addTicker(key, newSym); }
  });
  fill();
}
/* ===== E7 - guided tour ===================================================================
   One short tour per view, shown the first time an account lands on that view, replayable from
   the ? button in the header. Anchored to real controls: if a control is not on screen (an empty
   board hides some), that step is skipped rather than pointing at nothing.

   Persistence is per USER and per VIEW (`pb_tour_<uid>_<view>`), so a second person signing in on
   the same browser gets their own walkthrough rather than inheriting "already seen". */
const TOURS = {
  fundamentals: { name:"Model", steps:[
    { sel:"#newThemeBtn", title:"Start with a theme",
      body:"A theme is a basket - \u201cRobotics\u201d, \u201cPayments\u201d, whatever you are investing behind. The model allocates between themes, so this is the first thing to create." },
    { sel:"#fundGrid,#driftRows", title:"Add tickers to it",
      body:"Open your new theme and add the names that belong in it. Inside a theme the names are equal-weighted, so you are choosing the basket, not the individual sizes." },
    { sel:"#chooseMetricsBtn", title:"Choose how themes are judged",
      body:"Six metrics are on by default (PEG, EV/EBITDA, Debt/FCF, P/E, size and momentum) with 21 more in the catalogue. These decide which theme looks cheap or strong." },
    { sel:"#wGroup", title:"Weight the metrics",
      body:"Say how much each metric matters. The weights are normalised for you, so they do not need to add to 100." },
    { sel:"#wGroup", title:"Decide what happens to bad data",
      body:"Some companies genuinely have no P/E or no EV/EBITDA. Per metric you can penalise them, carry over their standing on the metrics they do report, or ignore the metric for them." },
    { sel:"#capPct", title:"Cap any single theme",
      body:"Nothing may exceed this share of the book; the excess spills to the others. It defaults to 1.5 \u00f7 (number of themes)." },
    { sel:"#driftRows,#allocBar", title:"These are your targets",
      body:"Target weight per theme, and - once you hold something - how far you have drifted from it. Next stop is Rebalance, which turns these targets into trades." } ] },

  calc: { name:"Rebalance", steps:[
    { sel:"#addCash", title:"How much are you adding?",
      body:"Enter the new money going in. Building the portfolio for the first time? Put the whole starting amount here." },
    { sel:"#tradeModes", title:"Full rebalance, or cash only",
      body:"Full rebalance buys AND sells to hit the targets, funding itself. Cash-only spends the new money on whatever is underweight and never sells." },
    { sel:"#applyBtn", title:"Nothing is committed until you press this",
      body:"The plan above updates as you change the cash or the mode. Applying it writes one checkpoint to your account, and every checkpoint can be undone." } ] },

  prices: { name:"Overview", steps:[
    { sel:"#ovAlloc", title:"Where the money is",
      body:"Your target allocation across themes. It fills in as soon as you have themes with names in them." },
    { sel:"#ovChart", title:"Value over time",
      body:"Every rebalance writes a checkpoint, and this tracks the book against an equal-weight version of the same holdings - so you can see whether the model is actually earning its keep." },
    { sel:"#ovRetChart", title:"Return, in $ or %",
      body:"The same comparison expressed as return. Use the toggle to switch units." },
    { sel:"#priceGrid", title:"Live prices by theme",
      body:"Expand a theme for its names, day change, value and weight." } ] },

  screener: { name:"Research", steps:[
    { sel:"#resQuery", title:"Look up any listed name",
      body:"Search the whole market by symbol or company name, not just what you hold. Clicking a result opens its financials - reading a company does not require adding it to anything." },
    { sel:"#watchlist", title:"Park candidates on the watchlist",
      body:"A staging area. Nothing here touches your portfolio until you deliberately add it to a theme." } ] },

  history: { name:"History", steps:[
    { sel:"#histChart", title:"Every checkpoint",
      body:`Each build and rebalance is saved with a snapshot of the holdings and settings that produced it. The ${MAX_VERSIONS} most recent are kept; older ones are dropped.` },
    { sel:"#historyBody", title:"Undo, redo, or revert to any kept point",
      body:"Rebalancing from an earlier point forks the timeline, like git - the abandoned future is dropped rather than silently merged." } ] }
};

let _coach=null, _coachStarting=null;                                   // {view, i, steps, els}
/* No uid means nothing can be remembered, so treat the guide as already seen rather than writing
   it under a shared "anon" key that the next real sign-in would not match - which would show the
   guide once more to somebody who had already dismissed it. Fail closed: never nag. */
function tourKey(view){ const u=(typeof sbUserId==="function"&&sbUserId())||""; return u?("pb_tour_"+u+"_"+view):null; }
function tourSeen(view){ const k=tourKey(view); if(!k) return true;
  try{ return localStorage.getItem(k)==="1"; }catch(e){ return true; } }
function markTourSeen(view){ const k=tourKey(view); if(!k) return;
  try{ localStorage.setItem(k,"1"); }catch(e){} }

function coachEnd(){
  if(!_coach) return;
  /* Nothing is credited here. The flag means "this account has been SHOWN this guide", and it is
     written by coachStart the moment the bubble goes up - see the note there. */
  try{ if(_coach.mo) _coach.mo.disconnect(); }catch(e){}
  ["ring","bubble","scrim"].forEach(k=>{ const el=_coach[k]; if(el&&el.parentNode) el.parentNode.removeChild(el); });
  window.removeEventListener("resize",coachPlace); window.removeEventListener("scroll",coachPlace,true);
  _coach=null;
}
/* Skips forward over steps whose anchor is not on screen, so a tour written for a full board
   still reads correctly on an empty one. */
/* `dir` is +1 when moving forward and -1 when going back: scanning forward on Back returned the
   same step, so Back was a permanent no-op the moment any step was skipped. An anchor also has to
   have SIZE - an empty watchlist leaves a laid-out zero-height div, which would ring nothing. */
function coachVisible(sel){
  return sel.split(",").map(x=>$(x.trim()))
    .find(x=>x && x.offsetParent!==null && (x.offsetWidth>0 || x.offsetHeight>0));
}
function coachResolve(from, dir){
  if(!_coach) return -1;
  const step=(dir===-1)?-1:1;
  for(let i=from; i>=0 && i<_coach.steps.length; i+=step){
    const el=coachVisible(_coach.steps[i].sel);
    if(el){ _coach.el=el; return i; }
  }
  return -1;
}
function coachPlace(){
  if(!_coach||!_coach.el) return;
  const r=_coach.el.getBoundingClientRect(), sx=window.scrollX, sy=window.scrollY, pad=6;
  const ring=_coach.ring, b=_coach.bubble;
  ring.style.left=(r.left+sx-pad)+"px";  ring.style.top=(r.top+sy-pad)+"px";
  ring.style.width=(r.width+pad*2)+"px"; ring.style.height=(r.height+pad*2)+"px";
  const bw=b.offsetWidth||300, bh=b.offsetHeight||140, gap=14;
  let top=r.bottom+sy+gap, below=true;
  if(r.bottom+gap+bh>window.innerHeight && r.top-gap-bh>0){ top=r.top+sy-bh-gap; below=false; }
  let left=r.left+sx+r.width/2-bw/2;
  left=Math.max(sx+10, Math.min(left, sx+window.innerWidth-bw-10));
  b.style.top=top+"px"; b.style.left=left+"px";
  const ar=_coach.arrow;
  if(ar){ ar.style.left=Math.max(12,Math.min(r.left+sx+r.width/2-left-5, bw-22))+"px";
          ar.style.top=below?"-6px":(bh-5)+"px";
          ar.style.transform=below?"rotate(45deg)":"rotate(225deg)"; }
}
function coachRender(){
  const st=_coach.steps[_coach.i], n=_coach.steps.length;
  const dots=_coach.steps.map((_,k)=>`<span class="c-dot${k===_coach.i?" on":""}"></span>`).join("");
  const last=_coach.i>=n-1;
  _coach.bubble.innerHTML=
    `<div class="coach-arrow"></div>
     <div class="c-step">${esc(_coach.title)} &middot; step ${_coach.i+1} of ${n}</div>
     <div class="c-title">${esc(st.title)}</div>
     <div class="c-body">${st.body}</div>
     <div class="c-row"><span class="c-dots">${dots}</span>
       ${_coach.i>0?'<button class="linkish" data-c="back">Back</button>':'<button class="linkish" data-c="skip">Skip</button>'}
       <button class="btn primary" data-c="next">${last?"Done":"Next"}</button>
     </div>`;
  _coach.arrow=_coach.bubble.querySelector(".coach-arrow");
  try{ _coach.el.scrollIntoView({block:"center",behavior:"smooth"}); }catch(e){}
  setTimeout(coachPlace,60); coachPlace();
}
function coachGo(delta){
  if(!_coach) return;
  const from=_coach.i+delta;
  if(from<0){ coachEnd(); return; }
  const next=coachResolve(from, delta<0?-1:1);
  if(next<0){ coachEnd(); return; }     // ran off either end - close; being shown is already recorded
  _coach.i=next; coachRender();
}
function coachStart(view, force){
  _coachStarting=view;            // claim it BEFORE coachEnd nulls _coach, so maybeCoach stands down
  coachEnd();
  const t=TOURS[view]; if(!t){ _coachStarting=null; return; }
  if(!force && tourSeen(view)){ _coachStarting=null; return; }
  if(typeof appLocked!=="undefined" && appLocked){ _coachStarting=null; return; }
  if(typeof signedIn==="function" && !signedIn()){ _coachStarting=null; return; }
  /* The account failed to load, so every anchor on the board is hidden. Without this the tour
     resolves no anchor and concludes "nothing built yet" - blaming the user for an empty board
     while the real reason is printed on the same screen. */
  if(typeof accountUnreachable==="function" && accountUnreachable()){
    _coachStarting=null;
    if(force) toast("Your portfolio has not loaded yet - see the message on this page");
    return;
  }
  _coach={ view, title:t.name, steps:t.steps, i:0 };
  const first=coachResolve(0,1);
  if(first<0){                                     // nothing on this board to point at yet
    _coach=null; _coachStarting=null;
    if(force) toast("Nothing to show here yet - build a theme on Model first");
    return;
  }
  _coach.i=first;
  const scrim=document.createElement("div"); scrim.className="coach-scrim";
  const ring=document.createElement("div");  ring.className="coach-ring";
  const b=document.createElement("div");     b.className="coach";
  document.body.appendChild(scrim); document.body.appendChild(ring); document.body.appendChild(b);
  _coach.scrim=scrim; _coach.ring=ring; _coach.bubble=b;
  /* Credit it HERE, now that the bubble is actually on screen - not when the last step is reached.
     The flag used to mean "finished the tour", so every other way out (switching tab, a modal
     opening, the gate going up at sign-out, stepping back off step one) wrote nothing and the
     guide returned at the next sign-in, forever, for anyone who did not click Done through every
     step of every tab. What we actually want to remember is that we have shown it. Replay is the
     Help button's job. */
  markTourSeen(view);
  b.addEventListener("click",e=>{
    const a=e.target.closest("[data-c]"); if(!a) return;
    const act=a.dataset.c;
    if(act==="next") coachGo(1);
    else if(act==="back") coachGo(-1);
    else coachEnd();
  });
  _coachStarting=null;
  window.addEventListener("resize",coachPlace); window.addEventListener("scroll",coachPlace,true);
  /* The bubble sits above every modal (301 vs 80) and takes pointer events, so a step that says
     "click New portfolio" would have its own bubble covering the dialog that opens. Rather than fight
     the stacking order, stand down as soon as any modal appears. */
  try{
    const mr=$("#modalRoot");
    if(mr && window.MutationObserver){
      _coach.mo=new MutationObserver(()=>{ if(mr.children.length) coachEnd(); });
      _coach.mo.observe(mr,{childList:true});
    }
  }catch(e){}
  coachRender();
}
/* Offer the tour when an account first lands on a view. Never while the gate is up, never mid-boot. */
function maybeCoach(view){
  if(_coach || _coachStarting===view) return;   // already running, or being started by an explicit call
  if(typeof booting!=="undefined" && booting) return;
  if(typeof signedIn!=="function" || !signedIn()) return;
  if(tourSeen(view)) return;
  setTimeout(()=>{ if(curView===view) coachStart(view,false); },420);   // let the view paint first
}

/* E6 FIX - a modal that something ELSE tears down must still release whoever is awaiting its
   answer. lockOut() calls closeModal(), so an import prompt closed by a mid-flight session death
   would otherwise leave bootSignedIn suspended for the rest of the page's life. */
let _modalResolve=null;
/* APP2.2c - on the phone the header keeps only what you act on constantly: the account and
   Refresh. The tour button, the theme switch and the auto-refresh interval move INTO the Account
   sheet. They are MOVED, not duplicated - every one of them is wired by element, so relocating the
   real node keeps its handler and its state; a copy would have needed both mirrored. */
let _chromeHome=null;
function nativeAdoptChrome(){
  const tour=$("#tourBtn"), sw=document.querySelector(".themesw"), sel=$("#refreshSel");
  const ctrls=document.querySelector(".ctrls");
  if(!ctrls||!tour||!sw||!sel) return;
  if(!_chromeHome) _chromeHome=[[tour,tour.nextSibling],[sw,sw.nextSibling],[sel,sel.nextSibling]];
  const put=(id,el)=>{ const slot=$("#"+id); if(slot) slot.appendChild(el); };
  put("slotTour",tour); put("slotTheme",sw); put("slotRefresh",sel);
}
function nativeReturnChrome(){
  if(!_chromeHome) return;
  const ctrls=document.querySelector(".ctrls"); if(!ctrls) return;
  _chromeHome.forEach(([el,next])=>{
    if(el.parentElement===ctrls) return;
    if(next&&next.parentElement===ctrls) ctrls.insertBefore(el,next); else ctrls.appendChild(el);
  });
}

function closeModal(){
  const m=$("#modalRoot"); if(m)m.innerHTML="";
  if(_modalResolve){ const r=_modalResolve; _modalResolve=null; try{ r(); }catch(e){} }
}

/* ---- membership editing: shared primitive for swap / add / remove (E1.2) ----------------------
   Apply a new ticker list to ONE theme. Enforces one-theme-per-ticker (a newly-present name is pulled
   out of any other theme it was in). Fetch data for any new names, then preview a full realign that the
   user reviews + applies via "Apply & save" — the same undoable version rail a swap uses. */
async function setMembership(themeKey, newArr, fetchSyms, doneMsg){
  /* E11.9 - REFUSE BEFORE ANY MUTATION. Every membership change routes through here (addTicker,
     removeTicker, doSwap), so the rule lives here and not at each caller. A newly-typed symbol has
     no quote yet, so its type is fetched FIRST and the decision made before state.themeTickers is
     written five lines below: a refusal that has already mutated is not a refusal, and this project
     has shipped that exact mistake four times. */
  const incoming=(fetchSyms||[]).filter(s=>!tickersOf(themeKey).includes(s));
  if(incoming.length){
    const unknown=incoming.filter(s=>quoteTypeOf(s)===null);
    if(unknown.length){
      try{ const d=await dsQuotes(unknown); state.quotes=mergeFeed(state.quotes, d&&d.quotes); }catch(e){}
    }
    const blocked=incoming.filter(s=>!isEquity(s));
    if(blocked.length){ toast(notEquityNote(blocked[0])); return; }
  }
  const map={}; themes().forEach(t=>{ map[t.key]=tickersOf(t.key).slice(); });   // seed the live map from every theme
  const want=[...new Set(newArr)];
  want.forEach(s=>{ Object.keys(map).forEach(k=>{ if(k!==themeKey) map[k]=map[k].filter(x=>x!==s); }); });   // one theme per ticker
  map[themeKey]=want;
  state.themeTickers=map;
  rebuildThemeOf();
  closeModal();
  if(fetchSyms&&fetchSyms.length){
    toast("Fetching "+fetchSyms.join(", ")+"…");
    try{ const d=await dsQuotes(fetchSyms); state.quotes=mergeFeed(state.quotes, d&&d.quotes); }catch(e){}
    try{ const f=await dsFundamentals(fetchSyms,false); state.pulled=mergeFeed(state.pulled, f); }catch(e){}   // E3: pulled base (rebuildFundamentals derives state.fundamentals from it)
    try{ await loadStatements(fetchSyms); }catch(e){}   // E3: load statements so the new names join the computed overlay
    rebuildFundamentals();
  }
  /* E8 - membership is DATA and must survive a reload. It used to be persisted only as a side
     effect of some later unrelated save, so "Added AMD to Semiconductors" was lost if the tab was
     closed. The ALLOCATION still only applies on the next Build/rebalance - that is what the
     "will apply" wording means - but the membership itself is saved now. */
  const _saved=await savePortfolio();
  if(!_saved) doneMsg += " (NOT saved - see the sync badge)";
  if(isInit()){
    /* USER-FOUND 2026-08-27: adding a name to a portfolio threw you out of the tab you were adding
       it on. The refresh was implemented AS a navigation - switchView("calc") - and then scrolled
       you to the plan and told you to review it, three separate yanks in the middle of an edit you
       had not finished. Keeping Rebalance CURRENT is the real goal and needs no navigation:
       renderAll() repaints every view including the hidden ones, so the plan is ready and correct
       whenever the user chooses to go and look at it. */
    renderAll();
    TRADE_MODE="realign"; TRADE_CASH=0;
    renderCalcMain();
    toast(doneMsg+" · Rebalance updated");
  } else { renderAll(); toast(doneMsg+" · will apply on your next Build"); }
}

async function addTicker(themeKey, sym){
  const t=themeByKey(themeKey); if(!t) return;
  const cur=tickersOf(themeKey);
  if(cur.includes(sym)){ toast(sym+" is already in "+t.name); return; }
  const from=themeOf[sym];
  const msg=(from&&from.key!==themeKey)?("Moved "+sym+" from "+from.name+" → "+t.name):("Added "+sym+" to "+t.name);
  await setMembership(themeKey, [...cur, sym], [sym], msg);
}

async function removeTicker(themeKey, sym){
  const t=themeByKey(themeKey); if(!t) return;
  const cur=tickersOf(themeKey); if(!cur.includes(sym)) return;
  const next=cur.filter(x=>x!==sym);
  if(!next.length && !confirm(t.name+" will have no names left (≈0% weight). Remove "+sym+" anyway?")) return;
  await setMembership(themeKey, next, [], "Removed "+sym+" from "+t.name);
}

async function doSwap(themeKey, oldSym, newSym){
  const cur=tickersOf(themeKey).slice(); const i=cur.indexOf(oldSym);
  if(i<0){ toast("Holding not found"); return; }
  cur[i]=newSym;
  await setMembership(themeKey, cur, [newSym], "Swapped "+oldSym+" → "+newSym);
}

/* ---- create a theme (E1.4) -------------------------------------------------------------------
   Materialize the live list (defaults -> concrete on first create) and append {key,name,color}.
   The new theme starts empty -> 0% of the allocation until names are added (see computeAllocation). */
function slugifyThemeKey(name){
  let base=String(name||"").toLowerCase().replace(/[^a-z0-9]+/g,"").slice(0,24) || "theme";
  const used=new Set(themes().map(t=>t.key)); let key=base, n=2;
  while(used.has(key)){ key=base+"-"+n; n++; }
  return key;
}
async function createTheme(name, color){
  name=String(name||"").trim();
  if(!name){ toast("Give the theme a name"); return false; }
  if(themes().length>=12){ toast("Maximum 12 themes — delete one first"); return false; }
  const list=themes().map(t=>({key:t.key,name:t.name,color:t.color}));   // null/defaults -> concrete list
  list.push({key:slugifyThemeKey(name), name, color:color||THEME_PALETTE[list.length%THEME_PALETTE.length]});
  state.themes=list; rebuildThemeOf();
  closeModal();
  const ok=await savePortfolio();
  renderAll();
  toast(ok ? "Created “"+name+"” — add names from the Screener"
           : "Created “"+name+"” on screen, but it was NOT saved — see the sync badge");
  return true;
}
function openCreateTheme(){
  const swatches=THEME_PALETTE.map((c,i)=>`<button type="button" class="ct-sw${i===0?' sel':''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join("");
  $("#modalRoot").innerHTML=`<div class="modal-backdrop" id="ctModal"><div class="modal-card card pad">
      <h2 style="font-size:16px">New portfolio</h2>
      <p class="small muted">Create a portfolio, then fill it from the Screener (tap a stock → Add). It starts
        empty — 0% of the book until it has names.</p>
      <label class="small" style="display:block;margin:10px 0 4px">Name</label>
      <input type="text" id="ctName" placeholder="e.g. Semiconductors" autocomplete="off"
        style="width:100%;padding:9px;border:1px solid rgba(32,30,29,.13);border-radius:8px;font-size:14px">
      <label class="small" style="display:block;margin:14px 0 6px">Colour</label>
      <div class="ct-swatches">${swatches}</div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:18px">
        <button class="btn" id="ctCancel">Cancel</button>
        <button class="btn primary" id="ctCreate">Create portfolio</button>
      </div></div></div>`;
  let color=THEME_PALETTE[0];
  $$(".ct-sw").forEach(b=>b.addEventListener("click",()=>{ color=b.dataset.color;
    $$(".ct-sw").forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); }));
  $("#ctCancel").addEventListener("click",closeModal);
  $("#ctModal").addEventListener("click",e=>{ if(e.target.id==="ctModal")closeModal(); });
  $("#ctName").addEventListener("keydown",e=>{ if(e.key==="Enter")createTheme($("#ctName").value,color); });
  $("#ctCreate").addEventListener("click",()=>createTheme($("#ctName").value,color));
  const n=$("#ctName"); if(n)n.focus();
}

/* ---- rename / recolour a theme (E1.5): key stays fixed, so membership/universe/history are unaffected ---- */
async function renameTheme(key, name, color){
  name=String(name||"").trim();
  if(!name){ toast("Give the theme a name"); return false; }
  const list=themes().map(t=>({key:t.key,name:t.name,color:t.color}));   // materialize defaults -> concrete
  const t=list.find(x=>x.key===key); if(!t){ toast("Theme not found"); return false; }
  t.name=name; if(color)t.color=color;                                   // KEY unchanged
  state.themes=list; rebuildThemeOf();
  closeModal();
  const _ok=await savePortfolio();
  renderAll();
  toast(_ok?"Updated “"+name+"”":"Renamed on screen, but NOT saved — see the badge in the header");
  return true;
}
function openEditTheme(key){
  const th=themeByKey(key); if(!th){ toast("Theme not found"); return; }
  const cur=(th.color||"").toLowerCase();
  const swatches=THEME_PALETTE.map(c=>`<button type="button" class="ct-sw${c.toLowerCase()===cur?' sel':''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join("");
  $("#modalRoot").innerHTML=`<div class="modal-backdrop" id="etModal"><div class="modal-card card pad">
      <h2 style="font-size:16px">Edit portfolio</h2>
      <p class="small muted">Rename or recolour this portfolio — it updates everywhere. Its stocks and history are unaffected.</p>
      <label class="small" style="display:block;margin:10px 0 4px">Name</label>
      <input type="text" id="etName" autocomplete="off"
        style="width:100%;padding:9px;border:1px solid rgba(32,30,29,.13);border-radius:8px;font-size:14px">
      <label class="small" style="display:block;margin:14px 0 6px">Colour</label>
      <div class="ct-swatches">${swatches}</div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:18px">
        <button class="btn" id="etCancel">Cancel</button>
        <button class="btn primary" id="etSave">Save</button>
      </div></div></div>`;
  let color=th.color;
  $("#etName").value=th.name;                                            // via property (no HTML-attr injection)
  $$(".ct-sw").forEach(b=>b.addEventListener("click",()=>{ color=b.dataset.color;
    $$(".ct-sw").forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); }));
  $("#etCancel").addEventListener("click",closeModal);
  $("#etModal").addEventListener("click",e=>{ if(e.target.id==="etModal")closeModal(); });
  $("#etName").addEventListener("keydown",e=>{ if(e.key==="Enter")renameTheme(key,$("#etName").value,color); });
  $("#etSave").addEventListener("click",()=>renameTheme(key,$("#etName").value,color));
  const n=$("#etName"); if(n){ n.focus(); n.select(); }
}

/* ---- delete a theme (E1.6; E8: deleting the LAST one is allowed) ---- */
async function deleteTheme(key){
  const t=themeByKey(key); if(!t) return;
  const live=themes();
  // E8: no "restore the defaults" to fall back on, and an empty board is a valid state - so the
  // last theme is deletable like any other. The Model view explains what to do next.
  const held=tickersOf(key).filter(s=>holdingSyms().includes(s));
  const msg = held.length
    ? ("Delete “"+t.name+"”?\n\nIts "+held.length+" held name(s) — "+held.slice(0,5).join(", ")+(held.length>5?"…":"")+" — will be SOLD to $0 on your next rebalance (they'll no longer belong to any theme).")
    : ("Delete “"+t.name+"”?");
  if(!confirm(msg)) return;
  state.themes = live.map(x=>({key:x.key,name:x.name,color:x.color})).filter(x=>x.key!==key);
  if(state.themeTickers){ const m=Object.assign({},state.themeTickers); delete m[key]; state.themeTickers=m; }
  rebuildThemeOf();
  const _ok=await savePortfolio();
  renderAll();
  toast((_ok?"Deleted “"+t.name+"”":"Deleted on screen, but NOT saved — see the badge")+(held.length?" — its names will sell on the next rebalance":""));
}
/* E8 - restoreDefaultThemes() and its button were DELETED. There is no default theme set
   any more: every account builds its own, so "restore the five I happened to start with" is
   not a meaningful action for anybody but the original author. */

/* ---- search any ticker and add it to a theme (E1.3) ------------------------------------------
   Inline from the Fundamentals legend (scoped to a theme) and from the Screener (with a theme picker). */
let _tsTimer=null;
function openTickerSearch(themeKey, direct){
  const scoped=!!(themeKey && themeByKey(themeKey));
  const tName=(themeByKey(themeKey)||{name:""}).name;
  const title= direct ? ("Add a ticker to "+tName) : (scoped?("Find a name for "+tName):"Search & watchlist a ticker");
  $("#modalRoot").innerHTML=`<div class="modal-backdrop" id="tsModal"><div class="modal-card card pad">
      <h2 style="font-size:16px">${esc(title)}</h2>
      <p class="small muted">${direct
        ? "Search any symbol or company (incl. off-Screener names like AMD, TSM). Pick one to <b>add it to "+tName+"</b> — the book then rebalances to the model."
        : "Search any symbol or company (incl. off-Screener names like AMD, TSM). Pick one to add it to your <b>watchlist</b> — it <b>won't touch your portfolio</b> until you add it to a portfolio from there."}</p>
      <label class="small" style="display:block;margin:10px 0 4px">Search</label>
      <input type="text" id="tsQuery" placeholder="e.g. AMD or Advanced Micro" autocomplete="off"
        style="width:100%;padding:9px;border:1px solid rgba(32,30,29,.13);border-radius:8px;font-size:14px">
      <div id="tsResults" class="ts-results"></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="tsCancel">Close</button></div>
    </div></div>`;
  $("#tsCancel").addEventListener("click",closeModal);
  $("#tsModal").addEventListener("click",e=>{ if(e.target.id==="tsModal")closeModal(); });
  const q=$("#tsQuery"), res=$("#tsResults");
  q.addEventListener("input",()=>{
    clearTimeout(_tsTimer); const term=q.value.trim();
    if(!term){ res.innerHTML=""; return; }
    res.innerHTML=`<div class="muted xs" style="padding:7px">Searching…</div>`;
    _tsTimer=setTimeout(async()=>{
      let list=[]; try{ list=await dsSearch(term); }catch(e){}
      if(q.value.trim()!==term) return;   // a newer keystroke superseded this one
      if(!list.length){ res.innerHTML=`<div class="muted xs" style="padding:7px">No matches — try a different symbol or name.</div>`; return; }
      res.innerHTML=list.slice(0,8).map(r=>`<button type="button" class="ts-row" data-sym="${esc(r.symbol)}">
        <span class="sym">${esc(r.symbol)}</span><span class="muted small ts-nm">${esc(r.name)}</span>
        <span class="muted xs ts-ex">${esc(r.exchange||r.type||"")}</span></button>`).join("");
      $$(".ts-row").forEach(b=>b.addEventListener("click",()=> direct ? addTicker(themeKey, b.dataset.sym) : addToWatchlist(b.dataset.sym, themeKey||null)));
    },250);
  });
  q.focus();
}

/* ---- Watchlist (E1.3): searched names land HERE (in the Screener), never the portfolio. From the
        watchlist you add one to a theme — that's the only step that previews a rebalance & touches the book. */
async function addToWatchlist(sym, theme){
  if(themeOf[sym]){ toast(sym+" is already in "+themeOf[sym].name); closeModal(); return; }
  if(!Array.isArray(state.watchlist)) state.watchlist=[];
  if(state.watchlist.some(w=>w&&w.sym===sym)){ toast(sym+" is already on your watchlist"); closeModal(); return; }
  state.watchlist.push({sym, theme: theme||null});
  closeModal();
  toast("Fetching "+sym+"…");
  try{ const d=await dsQuotes([sym]); state.quotes=mergeFeed(state.quotes, d&&d.quotes); }catch(e){}
  try{ const f=await dsFundamentals([sym],false); state.pulled=mergeFeed(state.pulled, f); }catch(e){}   // E3: pulled base, not the derived state.fundamentals
  try{ await loadStatements([sym]); }catch(e){}   // E3: statements so a watchlisted name can be computed too
  rebuildFundamentals();
  await savePortfolio();
  switchView("screener"); renderScreener();
  toast(sym+" added to your watchlist — add it to a theme when you're ready");
}
async function removeFromWatchlist(sym){
  state.watchlist=(state.watchlist||[]).filter(w=>!(w&&w.sym===sym));
  await savePortfolio(); renderScreener();
}
function renderWatchlist(){
  const el=$("#watchlist"); if(!el) return;
  let list=(state.watchlist||[]).filter(w=>w&&w.sym&&!themeOf[w.sym]);   // drop any that are now in a theme
  state.watchlist=list;                                                  // self-heal
  if(!list.length){ el.innerHTML=""; return; }
  const head='<div class="rs3-whead"><span>Name</span><span class="num">Last</span><span class="num">Today</span>'+
    '<span>52-week range</span><span class="num">Volume</span><span class="num">Avg volume</span>'+
    '<span class="num">P/E</span><span>Then what</span><span></span></div>';
  el.innerHTML=head+list.map(function(w){
    const sym=w.sym, q=state.quotes[sym]||{}, px=price(sym), cp=q.changePct;
    const lo=q.low52, hi=q.high52;
    /* The 52-week range is a position, not two numbers to subtract in your head: a track with the
       price's own tick on it. Only drawn when all three figures are real - a tick placed from a
       missing low is a tick in the wrong place, which is worse than no tick. */
    const range=(isNum(lo)&&isNum(hi)&&isNum(px)&&hi>lo)
      ? '<span class="rs3-52"><span class="tr"><i style="left:'+
        (Math.max(0,Math.min(1,(px-lo)/(hi-lo)))*100).toFixed(1)+'%"></i></span>'+
        '<span class="lh">'+money(lo,2)+'<b>'+money(hi,2)+"</b></span></span>"
      : '<span class="rs3-52 muted">\u2014</span>';
    const pe=(state.fundamentals[sym]&&isNum(state.fundamentals[sym].pe))?num(state.fundamentals[sym].pe,1):"\u2014";
    /* "Then what" states where this name stands relative to the book. A watchlisted name never
       touches the portfolio - the watchlist is storage, not intent - so the only tag it can carry
       here is the portfolio it is EARMARKED for, if the user picked one. */
    const earmark=w.portfolio&&themeByKey(w.portfolio);
    const tag = earmark ? '<span class="rs3-tag mark">'+esc(earmark.name)+"</span>"
                        : '<span class="rs3-tag none">NO PORTFOLIO</span>';
    return '<div class="rs3-w">'+
      '<button type="button" class="rs3-open" data-stock="'+esc(sym)+'">'+
        '<span class="s">'+esc(sym)+'</span><span class="n">'+esc(nameOf(sym))+"</span></button>"+
      '<span class="num">'+(isNum(px)?money(px,2):"\u2014")+"</span>"+
      '<span class="num '+(isNum(cp)?(cp>=0?"up":"down"):"")+'">'+
        (isNum(cp)?signed(cp,2)+"%":"\u2014")+"</span>"+
      range+
      '<span class="num">'+volFmt(q.vol)+"</span>"+
      '<span class="num">'+volFmt(q.avgVol)+"</span>"+
      '<span class="num">'+pe+"</span>"+
      '<span class="rs3-then">'+tag+
        '<button type="button" class="rs3-add" data-wladd="'+esc(sym)+'">ADD TO PORTFOLIO</button></span>'+
      '<button type="button" class="rs3-del" data-wlsym="'+esc(sym)+'" aria-label="Remove '+esc(sym)+
        ' from the watchlist">\u00d7</button></div>';
  }).join("");
}

/* ======================================================================
   iOS LAN sync UI (native only) — connect the app to the home computer
   so both read/write the same portfolio.json.
   ====================================================================== */
function syncCardHTML(){
  if(!NATIVE) return "";
  const connected=!!serverBase(), ok=state.syncStatus==="remote";
  const dot = !connected? "#b6b6b6" : (ok? "#2bb673" : "var(--portfolio-4)");
  const label = !connected? "On this iPhone only" : (ok? "Synced with your computer" : "Computer set — not reachable now");
  return `<div class="card pad" style="margin-bottom:14px">
    <div class="row" style="justify-content:space-between;align-items:center;gap:10px">
      <div><div class="small" style="font-weight:650">Data sync</div>
        <div class="small muted" style="margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:6px;vertical-align:middle"></span>${esc(label)}${connected?(" · "+serverBase().replace(/^https?:\/\//,"")):""}</div></div>
      <button class="btn sm" data-vaction="sync">${connected?"Change":"Set up sync"}</button>
    </div></div>`;
}
function openSyncSheet(){
  const cur=serverBase();
  $("#modalRoot").innerHTML=`<div class="modal-backdrop" id="syncModal"><div class="modal-card card pad">
    <h2 style="font-size:16px">Sync with your computer</h2>
    <p class="small muted">On the computer running Portfolio Builder, the server window shows an address like
      <code class="mono">http://192.168.1.50:8765</code> (the “iPhone app sync” line). Enter it below. Your phone and
      computer must be on the same Wi-Fi, with the app running on the computer. Connecting adopts your
      computer's portfolio as the shared one.</p>
    <div class="field" style="margin-top:10px"><label>Computer address</label>
      <input type="url" id="syncUrl" placeholder="http://192.168.1.50:8765" value="${cur}" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url" style="width:100%"></div>
    <div id="syncMsg" class="small" style="margin-top:8px;min-height:18px"></div>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:6px;flex-wrap:wrap">
      ${cur?'<button class="btn" id="syncOff">Use this iPhone only</button>':""}
      <button class="btn" id="syncCancel">Cancel</button>
      <button class="btn primary" id="syncConnect">Connect →</button>
    </div></div></div>`;
  $("#syncCancel").addEventListener("click",closeModal);
  $("#syncModal").addEventListener("click",e=>{ if(e.target.id==="syncModal")closeModal(); });
  if($("#syncOff")) $("#syncOff").addEventListener("click",syncDisconnect);
  $("#syncConnect").addEventListener("click",syncConnect);
}
async function syncConnect(){
  let url=($("#syncUrl").value||"").trim().replace(/\/+$/,"");
  if(!url){ $("#syncMsg").innerHTML='<span class="down">Enter your computer’s address.</span>'; return; }
  if(!/^https?:\/\//i.test(url)) url="http://"+url;
  $("#syncMsg").textContent="Connecting…";
  try{
    const Http=capHttp(); const r=await Http.request({url:url+"/api/portfolio", method:"GET"});
    const d=jsonOf(r.data);
    if(!d || !("portfolio" in d)) throw new Error("not the Portfolio Builder server");
    state.serverUrl=url; try{ localStorage.setItem(SRV_KEY,url); }catch(e){}
    closeModal();
    await loadPortfolio(); await Promise.all([loadQuotes(), loadFundamentals(false), loadStatements()]); rebuildFundamentals();
    state.screenerLoaded=false;
    renderAll();
    toast("Connected — now syncing with your computer");
  }catch(e){ $("#syncMsg").innerHTML='<span class="down">Couldn’t reach that address. Check the Wi-Fi, the address, and that the app is running on the computer.</span>'; }
}
async function syncDisconnect(){
  state.serverUrl=""; try{ localStorage.removeItem(SRV_KEY); }catch(e){}
  state.syncStatus="local"; closeModal();
  await loadPortfolio(); renderAll(); toast("Now using this iPhone only");
}

/* ======================================================================
   Orchestration
   ====================================================================== */
/* ===== Sortable tables (owner request 2026-08-27) ============================================
   Click any header to sort by it; click again to reverse. Two things make this less trivial than
   it looks, and both would have shown up as "the sort randomly undoes itself":

   1. Tables are rebuilt by innerHTML on every render, and the price auto-refresh re-renders every
      60 seconds. A sort applied to the DOM alone would silently vanish while the user watched. So
      the chosen column is remembered against a key derived from the table's own header text -
      which survives the rebuild, needs no ids added to markup, and is stable per table - and
      re-applied after each render.
   2. Cells are FORMATTED: "$14,838", "▼ 0.89%", "−$3,000", "—". Sorted as text, $9 beats $10,000.
      Numbers are parsed out, ▼ read as negative, − (the real minus sign this app prints) read as a
      minus, and an em dash treated as ABSENT rather than zero - so "no data" sorts last in BOTH
      directions instead of masquerading as the smallest value.

   Grouped tables are skipped: the holdings table puts a portfolio header row above its own names,
   and reordering rows would tear each holding away from the portfolio it belongs to. Detected by
   looking for such a row rather than by a hard-coded list, so it stays true if another is added. */
const SORT_STATE={};
function sortKeyOf(t){ return [...t.querySelectorAll("thead th")].map(h=>h.textContent.trim()).join("|"); }
function sortNum(txt){
  if(txt==null) return null;
  const raw=String(txt).trim();
  if(!raw || /^[—–-]$/.test(raw)) return null;            // em dash etc = no value
  let v=raw.replace(/−/g,"-").replace(/▼/g,"-").replace(/▲/g,"");
  v=v.replace(/[^0-9.+-]/g,"");
  const m=v.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function sortableTables(){
  return [...document.querySelectorAll("table")].filter(t =>
    t.tHead && t.tBodies.length && t.tBodies[0].rows.length>1 && !t.querySelector("tr.theme-row"));
}
function applySort(t){
  const key=sortKeyOf(t), st=SORT_STATE[key];
  const ths=[...t.querySelectorAll("thead th")];
  ths.forEach((h,i)=>{ h.classList.add("sortable");
    if(st && st.i===i) h.setAttribute("aria-sort", st.dir>0?"ascending":"descending");
    else h.removeAttribute("aria-sort"); });
  if(!st) return;
  const body=t.tBodies[0], rows=[...body.rows];
  const cell=r=>{ const c=r.cells[st.i]; return c?c.textContent.trim():""; };
  const parsed=rows.map(r=>sortNum(cell(r)));
  const numeric=parsed.filter(n=>n!==null).length >= Math.ceil(rows.length/2);
  rows.forEach((r,i)=>{ r._ord=i; });                              // keep equal rows in their original order
  rows.sort((a,b)=>{
    if(numeric){
      const x=sortNum(cell(a)), y=sortNum(cell(b));
      /* Blanks last in BOTH directions - these returns skip the dir multiply on purpose. A row
         with no data is not "the smallest", it is missing, and flipping it to the top on the
         first click reads as a bug. */
      if(x===null && y===null) return a._ord-b._ord;
      if(x===null) return 1;
      if(y===null) return -1;
      return (x-y)*st.dir || a._ord-b._ord;
    }
    return cell(a).localeCompare(cell(b), undefined, {numeric:true, sensitivity:"base"})*st.dir
           || a._ord-b._ord;
  });
  rows.forEach(r=>body.appendChild(r));
}
function resortAll(){ try{ sortableTables().forEach(applySort); }catch(e){ console.error("sort",e); } }
function wireSorting(){
  document.addEventListener("click", e=>{
    const th=e.target.closest && e.target.closest("thead th"); if(!th) return;
    const t=th.closest("table"); if(!t || !sortableTables().includes(t)) return;
    const i=[...th.parentNode.children].indexOf(th);
    const key=sortKeyOf(t), st=SORT_STATE[key];
    SORT_STATE[key] = (st && st.i===i) ? {i, dir:-st.dir} : {i, dir:1};
    applySort(t);
  });
}
function renderAll(){
  if(!accountUnreachable()) clearUnreachablePanels();   // recovery must be total, and automatic
  /* renderScreener belongs here: renderAll is the repaint-everything entry point, and leaving the
     screener out meant ANY state change left Research stale until the next tab switch - recovery
     from an unreachable account just made it visible, by un-hiding a section nothing repopulated.
     It writes only #watchlist, #screenerBody and #resStats, never the search box or its results,
     so repainting cannot disturb typing. */
  renderStatus(); renderContext(); renderPrices(); renderFundamentals(); renderCalc(); renderHistory(); renderScreener();
  renderFirstRun(); applyFirstRun();
  resortAll();          // the tables were just rebuilt - put the user's chosen sort back
}

/* E12 §3: the four lanes, and which view each of the five sections belongs to. */
const LANE_OF={prices:"prices", fundamentals:"fundamentals", calc:"calc", screener:"calc", history:"history"};
/* Clicking the Trade lane returns to whichever half of Trade you were last on. */
let lastTradeView="calc";
/* A brand-new account has no portfolios and nothing funded, so the four lanes have nothing to
   show. One clear instruction beats four empty screens. This is derived, never stored: the moment
   a portfolio exists the poster stops applying, with no flag to get out of step. */
function isFirstRun(){ return !themes().length && !isInit(); }

/* USER-FOUND CLASS, 2026-09-01. This wrote its markup on EVERY render, including renders where the
   poster is not the screen anyone is looking at. It also carried a "ready" branch offering
   #initCapital and #buildBtn - the same two ids renderCalcInit puts on the Trade lane.

   In the state "portfolios exist with names, nothing funded yet" BOTH rendered, so those two ids
   existed TWICE. $("#x") returns the first in document order, and #view-first precedes #view-calc,
   so every lookup resolved to the HIDDEN poster. Measured consequence: a user on Trade typed 50,000
   into the field in front of them, pressed the button in front of them, and got a portfolio funded
   with 80,000 - the hidden field's default. Their stated starting capital was silently discarded at
   the single most consequential action in the app.

   The "ready" branch was also unreachable by construction: isFirstRun() requires zero portfolios,
   zero portfolios means zero membership, so ready could never be true while the poster was the
   screen. It is gone. Funding lives on Trade, in one place, with one pair of ids. */
function renderFirstRun(){
  const go=$("#frGo"); if(!go) return;
  if(!isFirstRun()){ go.innerHTML=""; return; }   // never leave ids behind on a screen nobody is on
  go.innerHTML =
    '<button class="fr3-primary" id="frCreate" type="button">CREATE YOUR FIRST PORTFOLIO</button>'+
    '<p class="fr3-hint">Name a thesis and add a few tickers, then fund it on the Trade lane.</p>';
  const c=$("#frCreate");
  if(c) c.addEventListener("click",function(){ switchView("fundamentals"); openCreateTheme(); });
}

/* USER-FOUND CLASS, 2026-09-01, by walking the whole journey through real controls.
   switchView used to begin with

       if(v==="calc" && curView==="screener" && lastTradeView==="screener") v="screener";

   whose intent was "clicking the Trade LANE returns you to whichever half of Trade you were last
   on". It achieved the opposite of that intent, twice over, because switchView cannot tell a lane
   click from a sub-tab click - both arrive as the string "calc".

     - The Rebalance SUB-TAB was dead from Research. Its handler calls switchView("calc"), and the
       guard fired on exactly that case and sent the user straight back to Research. Measured:
       click Research, then click Rebalance, then click it again - still on Research, both times.
       The only way out was to leave for another lane and come back.
     - And the lane tab did NOT return you to Research from elsewhere, because the guard required
       curView to already BE "screener".

   The two intents are now separated: switchView goes exactly where it is told, and the LANE tab
   resolves the last-used half of Trade before calling it. */
function switchView(v){
  if(v==="calc"||v==="screener") lastTradeView=v;
  const changed=(curView!==v);
  curView=v;
  if(changed && typeof coachEnd==="function") coachEnd();   // a tour belongs to the view that started it
  /* E12 §3: FOUR lanes over FIVE views. Research is a sub-tab of Trade, so both
     `calc` and `screener` light the Trade lane. LANE_OF is the single place that
     mapping lives - a second copy is how the two chromes drifted in V2. */
  const lane=LANE_OF[v]||v;
  $$("#tabs button").forEach(b=>b.classList.toggle("active",b.dataset.view===lane));
  $$(".view").forEach(sec=>sec.classList.toggle("active",sec.id==="view-"+v));
  /* Trade's sub-tabs appear only on Trade, and mark whichever half is showing. */
  const st=$("#subtabs");
  if(st){ st.hidden = (lane!=="calc");
    $$("#subtabs button").forEach(b=>b.classList.toggle("active",b.dataset.sub===v)); }
  /* §3: the context bar is absent on Overview, where the hero IS the context - the
     total value must never render twice on one screen. */
  const cx=$("#ctxKpis");
  if(cx) cx.hidden = (v==="prices"||v==="first");
  if(v==="screener") ensureScreener();
  /* The tour explains lanes the poster is standing in front of, so it waits. */
  if(changed && v!=="first") maybeCoach(v);
}

/* The chrome the poster does without: the lane tabs, the sub-tabs and the context bar all describe
   places a brand-new account cannot usefully go. Applied from ONE place, keyed off isFirstRun, so
   the chrome and the routing can never disagree about which state the app is in. */
/* The poster is where a brand-new account LANDS, not somewhere it is held. Landing is decided
   once, on the first paint that sees an empty account, and never re-asserted - so the four lanes
   and their guided tours stay reachable, which matters most for exactly this user. The moment a
   portfolio exists the poster stops applying and anyone still on it is moved along. */
let _firstLanded=false;
function applyFirstRun(){
  const on=isFirstRun();
  document.documentElement.classList.toggle("firstrun",on);
  if(on && !_firstLanded){ _firstLanded=true; switchView("first"); return; }
  if(!on && curView==="first") switchView("prices");
}

/* ===== E5.0 theme (☀ light / ☾ dark) ===== */
const THEME_KEY="pb_theme";
function setTheme(t,persist){
  const el=document.documentElement, light=(t!=="dark");
  el.classList.add("theme-switching");
  el.setAttribute("data-theme",light?"light":"dark");
  void el.offsetWidth;                                   // flush the restyle with transitions off
  clearTimeout(setTheme._t);                             // timer, NOT rAF: rAF is paused in background
  setTheme._t=setTimeout(()=>el.classList.remove("theme-switching"),60);   // tabs and would stick forever
  const lb=$("#tLight"), db=$("#tDark");
  if(lb){ lb.classList.toggle("on",light);  lb.setAttribute("aria-pressed",String(light)); }
  if(db){ db.classList.toggle("on",!light); db.setAttribute("aria-pressed",String(!light)); }
  if(persist){ try{ localStorage.setItem(THEME_KEY,light?"light":"dark"); }catch(e){} }
}
function initTheme(){
  let saved=null; try{ saved=localStorage.getItem(THEME_KEY); }catch(e){}
  // The iOS app ships its own light-tuned native skin (APP2 will revisit dark there),
  // so on native we never auto-follow the OS — only an explicit choice applies.
  const os = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;   // APP2.2: the phone follows the OS too
  setTheme(saved || (os?"dark":"light"), false);
  if(window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change",e=>{
    let s=null; try{ s=localStorage.getItem(THEME_KEY); }catch(err){}
    if(!s) setTheme(e.matches?"dark":"light",false);     // follow the OS only until they choose
  });
}

/* ===== E5.0 context bar — portfolio numbers on every view ===== */
/* E9 - "we could not read your account" and "you have not built anything yet" look identical once
   there is no cached copy to fall back on: both leave state.portfolio null and themes empty. Telling
   a user with a real portfolio that they have none - and inviting them to create their first theme -
   is the failure this codebase already fixed once for the import prompt. Distinguish them. */
/* One panel, one wording, used by EVERY view. The E9 fix was applied to Model, Rebalance and the
   context bar but not to Overview, History or Research - so three views still told a user with a
   real portfolio that they had nothing. */
/* HIDES the view's own content and shows the panel beside it - it must never REPLACE it. Writing
   innerHTML into a structural container destroyed static markup that no renderer recreates
   (#ovChart and friends), which killed the Overview view for the life of the page - including
   after this panel's own Try again had successfully reloaded the portfolio. */
function unreachablePanel(viewId){
  const sec=document.getElementById(viewId); if(!sec) return;
  let host=sec.querySelector(":scope > .unreach-host");
  if(!host){ host=document.createElement("div"); host.className="unreach-host"; sec.insertBefore(host, sec.firstChild); }
  const why=state.syncFailure||describeCloudFailure(null);
  host.innerHTML=`<div class="empty-note">
    <h3>Your portfolio could not be loaded</h3>
    <p><b>${why.detail}</b><br>${why.act}</p>
    <p class="xs muted" style="margin-top:-4px">Your data is safe in your account.${why.ours?" This one is our fault, not yours.":""}</p>
    <button class="btn primary" data-unreach-retry>Try again</button></div>`;
  sec.classList.add("unreachable");
  const b=host.querySelector("[data-unreach-retry]");
  if(b) b.addEventListener("click",async()=>{ await loadPortfolio(); rebuildThemeOf(); rebuildFundamentals(); renderAll(); });
}
/* Called on every good render, so recovery is automatic and total. */
function clearUnreachablePanels(){
  document.querySelectorAll(".view.unreachable").forEach(sec=>{
    sec.classList.remove("unreachable");
    const h=sec.querySelector(":scope > .unreach-host"); if(h) h.remove();
  });
}
function accountUnreachable(){
  /* Specifically: the account could not be READ, so there is nothing to show. A failed SAVE also
     stamps "<adapter>-failed", but there the portfolio IS loaded and the honest message is a
     different one ("your change did not reach your account"), so both must be required here. */
  return typeof state.syncStatus==="string" && state.syncStatus.indexOf("-failed")>0
         && !state.portfolio && !isNum(state.baseRevision);
}
function renderContext(){
  const box=$("#ctxKpis"); if(!box) return;
  if(accountUnreachable()){
    const why=state.syncFailure||describeCloudFailure(null);
    box.innerHTML='<span class="small pen-ink">Portfolio not loaded \u2014 '+why.detail+' '+why.act+'</span>';
    return; }
  if(!isInit()){ box.innerHTML='<span class="small muted">Nothing built yet — '+firstStepHint()+'.'+'</span>';
    return; }
  const total=curTotal();                                  // reuse the app's own value helpers
  const invested=(state.portfolio&&isNum(state.portfolio.totalContributed))?state.portfolio.totalContributed:0;
  const pl=total-invested, plPct=invested>0?(pl/invested*100):0;
  // today's move = Σ shares × today's per-share change
  let day=0; const h=holdings();
  Object.keys(h).forEach(s=>{ const q=(state.quotes||{})[s]; const sh=h[s]?h[s].shares:0;
    if(q&&isNum(q.change)&&isNum(sh)) day+=q.change*sh; });
  const prev=total-day, dayPct=prev>0?(day/prev*100):0;
  let drift=null;                                          // biggest |current − target| across themes
  try{ const A=computeAllocation(), cvt=curValueByTheme();
    if(A&&A.rows&&total>0){ let mx=0;
      A.rows.forEach(r=>{ const cw=cvt[r.theme.key]/total; if(isNum(cw)) mx=Math.max(mx,Math.abs(cw-r.alloc)*100); });
      drift=mx; }
  }catch(e){ /* model not computable yet — just omit the KPI */ }
  const sgn=n=>(n>=0?"+":"−")+money(Math.abs(n));
  box.innerHTML=
    kpi("Total value",money(total))+
    kpi("Today",`<span class="${day>=0?'up':'down'}">${sgn(day)} · ${day>=0?'+':'−'}${Math.abs(dayPct).toFixed(2)}%</span>`)+
    kpi("Invested",money(invested))+
    kpi("Gain",`<span class="${pl>=0?'up':'down'}">${sgn(pl)} · ${pl>=0?'+':'−'}${Math.abs(plPct).toFixed(1)}%</span>`)+
    (drift!=null?kpi("Max drift",drift.toFixed(1)+"pp"):"");
}
function kpi(k,v){ return `<span class="kpi"><span class="k">${k}</span><span class="v num">${v}</span></span>`; }
/* E6 FIX - a failed cloud save used to be a toast that vanished. The state has to stay visible,
   because "did my rebalance actually save?" is not a question a toast can answer. */
function renderSyncBadge(){
  const b=$("#syncBadge"); if(!b) return;
  if(!signedIn()){ b.hidden=true; return; }
  /* A read failure and a save failure are different things and must not share wording: telling a
     user "the last change did not reach your account" when they made no change is just confusing. */
  if(accountUnreachable()){
    const why=state.syncFailure||describeCloudFailure(null);
    b.hidden=false; b.className="tag pen"; b.textContent=why.short;
    b.title=why.detail+" "+why.act;
    return; }
  if(state.syncError){ b.hidden=false; b.className="tag pen"; b.textContent="not synced";
    b.title="The last change did not reach your account: "+state.syncError; return; }
  /* E6 FIX - syncError is only set by SAVES. After a failed READ the badge happily read "synced"
     while the user was looking at the offline mirror and every save was being refused. */
  if(state.syncStatus!=="cloud" || !isNum(state.baseRevision)){
    b.hidden=false; b.className="tag pen"; b.textContent="not connected";
    b.title="Your account could not be read, so nothing is shown and changes cannot be saved. Reload when your connection is back.";
    return;
  }
  b.hidden=false; b.className="tag live"; b.textContent="synced";
  b.title="Saved to your account (revision "+state.baseRevision+")";
}

async function refreshPrices(showToast){
  if(appLocked || !signedIn()) return;            // E6 FIX: nothing runs behind the gate
  $("#refreshBtn").disabled=true;
  try{ await loadQuotes(); ovTick(); renderStatus(); renderContext(); renderPrices(); renderFundamentals(); if(isInit())renderCalcMain(); if(showToast)toast("Prices updated"); }   // E5 fix: the context bar is on the refresh path, else it shows stale money beside live money
  catch(e){ toast("Price refresh failed"); }
  finally{ $("#refreshBtn").disabled=false; }
}

let _autoRefreshWired=false;
/* ======================================================================
   E11.13 - sign out after IDLE_MS with no USER activity.
   ====================================================================== */
const IDLE_MS = 5*60*1000;      // owner, 2026-08-18
const IDLE_WARN_MS = 30*1000;   // the last 30s are spent warning, not acting
let _idleLast=0, _idleTimer=null, _idleBar=null;

/* Genuine user input only. Deliberately NOT 'scroll': the app scrolls ITSELF - renderRebalanceOutput
   calls scrollIntoView - so counting it would let the app keep its own session alive, which is the
   same mistake as counting the 60-second price poll. */
const IDLE_EVENTS = ['pointerdown','pointermove','keydown','touchstart','wheel'];

function idleExpired(){ return _idleLast>0 && (Date.now()-_idleLast) >= IDLE_MS; }

/* Once the deadline has passed the session is over, and no amount of later activity may undo that.
   Without this guard the feature defeats itself: leave the tab for ten minutes, come back, and the
   pointermove from reaching for the window fires BEFORE the next tick and resets the clock. */
function idleBump(){
  if(!_idleTimer || idleExpired()) return;
  _idleLast=Date.now();
  if(_idleBar) idleHideWarn();
}

function idleShowWarn(secs){
  if(!_idleBar){
    _idleBar=document.createElement('div');
    _idleBar.className='idle-warn';
    _idleBar.innerHTML='<span>Signing out in <b id="idleSecs"></b>s — you have been inactive.</span>'
      +'<button class="btn sm primary" id="idleStay">Stay signed in</button>';
    document.body.appendChild(_idleBar);
    $('#idleStay').addEventListener('click',()=>{ _idleLast=Date.now(); idleHideWarn(); });
  }
  const el=$('#idleSecs'); if(el) el.textContent=String(secs);
}
function idleHideWarn(){ if(_idleBar){ _idleBar.remove(); _idleBar=null; } }

function idleTick(){
  if(!signedIn() || appLocked){ stopIdleWatch(); return; }
  const idle=Date.now()-_idleLast;
  if(idle>=IDLE_MS){
    stopIdleWatch();
    lockOut('Signed out after '+Math.round(IDLE_MS/60000)+' minutes of inactivity.');
    return;
  }
  if(idle>=IDLE_MS-IDLE_WARN_MS) idleShowWarn(Math.ceil((IDLE_MS-idle)/1000));
  else if(_idleBar) idleHideWarn();
}

/* A hidden tab still counts down - an unattended screen is the whole risk - and background timers
   are throttled, so re-check the moment it comes back rather than waiting for the next tick. */
function idleVisibility(){ if(document.visibilityState==='visible' && _idleTimer) idleTick(); }

function startIdleWatch(){
  stopIdleWatch();
  _idleLast=Date.now();
  IDLE_EVENTS.forEach(e=>document.addEventListener(e, idleBump, {passive:true}));
  document.addEventListener('visibilitychange', idleVisibility);
  _idleTimer=setInterval(idleTick, 1000);
}
function stopIdleWatch(){
  if(_idleTimer){ clearInterval(_idleTimer); _idleTimer=null; }
  IDLE_EVENTS.forEach(e=>document.removeEventListener(e, idleBump));
  document.removeEventListener('visibilitychange', idleVisibility);
  idleHideWarn();
  _idleLast=0;
}

function setupAutoRefresh(){
  const sel=$("#refreshSel");
  /* The timer keeps ticking and the GATE decides - rather than re-arming on session changes,
     which would need something to notice the change in the first place. A tick costs nothing;
     the request is what costs. This also self-corrects at the open without any extra machinery. */
  function arm(){ if(timer){clearInterval(timer);timer=null;} const s=parseInt(sel.value,10);
    if(s>0)timer=setInterval(()=>{
      if(!autoPollAllowed()){ try{ renderStatus(); }catch(e){} return; }   // keep the label honest
      _lastAutoPoll=Date.now(); refreshPrices(false);
    },s*1000); }
  if(!_autoRefreshWired){ sel.addEventListener("change",arm); _autoRefreshWired=true; }   // once, not once per sign-in
  arm();
}

function setupEvents(){
  $("#tabs").addEventListener("click",e=>{ const b=e.target.closest("button[data-view]"); if(!b) return;
    /* The LANE tab is the one that remembers. A sub-tab says exactly where to go and is obeyed. */
    const v=b.dataset.view;
    switchView(v==="calc" ? lastTradeView : v); });
  /* E12: the rail is deleted; the lanes in the top bar are the only web nav. */
  const _st=$("#subtabs");
  if(_st) _st.addEventListener("click",e=>{ const b=e.target.closest("button[data-sub]"); if(b)switchView(b.dataset.sub); });
  if($("#acctBtn")) $("#acctBtn").addEventListener("click",openAccount);
  if($("#tourBtn")) $("#tourBtn").addEventListener("click",()=>coachStart(curView,true));   // replay, any time
  if($("#retPct")) $("#retPct").addEventListener("click",()=>setReturnUnit("pct"));
  if($("#retDol")) $("#retDol").addEventListener("click",()=>setReturnUnit("dol"));
  $$('.ovseg button[data-ovseg]').forEach(b=>b.addEventListener("click",()=>ovSegSet(b.dataset.ovseg)));  // APP2.6
  if($("#tLight")) $("#tLight").addEventListener("click",()=>setTheme("light",true));
  if($("#tDark"))  $("#tDark").addEventListener("click",()=>setTheme("dark",true));
  document.addEventListener("keydown",e=>{
    if(e.metaKey||e.ctrlKey||e.altKey) return;
    const t=e.target, tag=(t&&t.tagName)||"";
    if(tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA"||(t&&t.isContentEditable)) return;   // never steal typing
    if($("#modalRoot") && $("#modalRoot").children.length) return;                          // not while a modal is open
    /* §3: 1-4, matching the four lanes. 5 is gone with the fifth lane. */
    const v={"1":"prices","2":"fundamentals","3":"calc","4":"history"}[e.key];
    if(v) switchView(v);
  });
  $("#refreshBtn").addEventListener("click",()=>refreshPrices(true));
  $("main").addEventListener("click",e=>{ const b=e.target.closest("[data-vaction]"); if(!b||b.disabled)return;
    const a=b.dataset.vaction; if(a==="undo")undo(); else if(a==="redo")redo(); else if(a==="revert")revertTo(b.dataset.vid); else if(a==="sync")openSyncSheet(); });
  $("main").addEventListener("click",e=>{ const b=e.target.closest("button[data-rmvtkr]"); if(!b)return;
    e.preventDefault(); removeTicker(b.dataset.theme, b.dataset.rmvtkr); });   // E1.2: remove a name from its theme
  if($("#newThemeBtn")) $("#newThemeBtn").addEventListener("click",openCreateTheme);   // E1.4: create a theme
  if($("#screenerSearch")) $("#screenerSearch").addEventListener("click",()=>openTickerSearch());   // E1.3: search (Screener)
  wireResearchSearch();                                                                             // E5.4: inline search box
  $("main").addEventListener("click",e=>{ const b=e.target.closest("button[data-addticker]"); if(b) openTickerSearch(b.dataset.addticker, true); });   // E4.3: '＋ ticker' in a theme section — add DIRECTLY (rebalance)
  $("main").addEventListener("click",e=>{ const b=e.target.closest("button[data-editth]"); if(b) openEditTheme(b.dataset.editth); });   // E1.5: rename / recolour a theme
  $("main").addEventListener("click",e=>{ const b=e.target.closest("button[data-delth]"); if(b) deleteTheme(b.dataset.delth); });   // E1.6: delete a theme
  $("main").addEventListener("click",e=>{ const b=e.target.closest("button[data-wladd]"); if(b) openSwap(b.dataset.wladd, null); });   // E1.3 / E12 4.4b: watchlist -> into the book
  $("main").addEventListener("click",e=>{ const b=e.target.closest("button[data-wlsym]"); if(b) removeFromWatchlist(b.dataset.wlsym); });   // E1.3: drop from watchlist
  $("#refreshFundBtn").addEventListener("click",async()=>{ $("#refreshFundBtn").disabled=true;
    try{ await Promise.all([loadFundamentals(true), loadStatements(membership(),true)]); rebuildFundamentals(); renderFundamentals(); renderCalc(); toast("Fundamentals refreshed"); }
    catch(e){ toast("Fundamentals refresh failed"); } finally{ $("#refreshFundBtn").disabled=false; } });
  // ① weights — MUTATE state.weights over metrics() (never reassign, so activated catalog keys survive); delegated on the stable #wGroup wrapper
  /* E12 4.3: weights and exception policies now share one row per metric, so they share one
     delegated listener on #wGroup - the wrapper, which is never itself replaced.
     The stepper moves the RAW weight by 5 points; the figure it prints is the NORMALISED share,
     which is what actually reaches computeAllocation. Never let it reach zero across the board:
     an all-zero model is a zero-sum book, which liquidates everything. */
  const WSTEP=0.05;
  function stepWeight(key,dir){
    const m=metrics().find(x=>x.key===key); if(!m) return false;
    const cur=isNum(state.weights[m.weightKey])?state.weights[m.weightKey]:(m.defaultWeight||0);
    const next=Math.max(0,Math.round((cur+dir*WSTEP)*100)/100);
    if(next===cur) return false;
    const sum=metrics().reduce((a,x)=>a+(x===m?next:(isNum(state.weights[x.weightKey])?state.weights[x.weightKey]:0)),0);
    if(sum<=0) return false;                       // refuse the step that would zero the whole model
    state.weights[m.weightKey]=next; return true;
  }
  if($("#wGroup")){
    $("#wGroup").addEventListener("click",async e=>{
      const st=e.target.closest("button[data-wstep]");
      if(st){ if(stepWeight(st.dataset.wstep, Number(st.dataset.d))){
        renderFundamentals(); renderCalc(); await savePortfolio(); } return; }
      const pol=e.target.closest("button[data-mpolicy]");
      if(pol){ setMetricPolicy(pol.dataset.mpolicy, pol.dataset.pv);
        renderFundamentals(); renderCalc(); await savePortfolio(); }
    });
    // the penalty value is a live field: apply as it is typed, persist when it is committed
    $("#wGroup").addEventListener("input",e=>{ const pen=e.target.closest('input[data-mpen]');
      if(pen){ setMetricPenalty(pen.dataset.mpen, parseFloat(pen.value)); renderFundamentals(); } });
    $("#wGroup").addEventListener("change",async e=>{ const pen=e.target.closest('input[data-mpen]');
      if(pen){ setMetricPenalty(pen.dataset.mpen, parseFloat(pen.value));
        renderFundamentals(); renderCalc(); await savePortfolio(); } });
  }
  if($("#chooseMetricsBtn")) $("#chooseMetricsBtn").addEventListener("click",openMetricPicker);   // E2.3: choose active metrics
  if($("#reset6Btn")) $("#reset6Btn").addEventListener("click",resetToDefault6);                  // E2.5: reset the model
  if($("#savePresetBtn")) $("#savePresetBtn").addEventListener("click",saveCurrentPreset);        // E2.5: save preset
  if($("#delPresetBtn")) $("#delPresetBtn").addEventListener("click",deleteSelectedPreset);       // E2.5: delete preset
  if($("#presetSelect")) $("#presetSelect").addEventListener("change",e=>{ if(e.target.value)loadPreset(e.target.value); });   // E2.5: load preset
  if($("#computeStmtToggle")) $("#computeStmtToggle").addEventListener("click",async e=>{   // E3.4: data-source toggle
    state.computeFromStatements = state.computeFromStatements===false;
    rebuildFundamentals(); renderAll(); await savePortfolio(); });
  if($("#srcCompareBtn")) $("#srcCompareBtn").addEventListener("click",openSourceCompare);   // E3.4: computed-vs-pulled compare
  // E5.1: expand/collapse a theme. Delegated on #priceGrid, which is never itself replaced,
  // so it survives every re-render of its children.
  if($("#priceGrid")) $("#priceGrid").addEventListener("click",e=>{
    const b=e.target.closest("[data-thmtoggle]"); if(b) toggleTheme(b.dataset.thmtoggle); });
  // E5.2: same for the Model tab. The header holds the add/rename/delete buttons and the
  // inline editors, so only toggle when the click wasn't on one of those.
  if($("#fundGrid")) $("#fundGrid").addEventListener("click",e=>{
    if(e.target.closest(".theme-acts,button,.editable,.reset")) return;
    const h=e.target.closest("[data-fthmtoggle]"); if(h) toggleFTheme(h.dataset.fthmtoggle); });
  if($("#fundGrid")) $("#fundGrid").addEventListener("keydown",e=>{        // header is a div: keyboard-operable
    if(e.key!=="Enter"&&e.key!==" ") return;
    // Same guard as the click handler. Without it, preventDefault() below cancels the UA's
    // activation of a focused add/rename/delete button, so keyboard users could never press them.
    if(e.target.closest(".theme-acts,button,.editable,.reset")) return;
    const h=e.target.closest("[data-fthmtoggle]"); if(!h) return;
    e.preventDefault(); toggleFTheme(h.dataset.fthmtoggle); });
  if($("#fundExpandAll")) $("#fundExpandAll").addEventListener("click",toggleAllFThemes);
  // E12 4.5: selecting a checkpoint fills the right column rather than expanding the row.
  const _hb=$("#historyBody");
  if(_hb) _hb.addEventListener("click",e=>{
    if(e.target.closest("[data-vaction]")) return;    // else Enter on a revert button is swallowed
    const r=e.target.closest("[data-vsel]"); if(!r) return;
    HIST_SEL=r.dataset.vsel;
    $$("#historyBody .hi3-row").forEach(x=>x.classList.toggle("on",x===r));
    renderHistSelected(); });
  $("main").addEventListener("click",e=>{   // E3.3: click a ticker -> stock detail (guard interactive controls)
    /* E12 4.2: an Overview name row IS a button, so this must run BEFORE the guard below - which
       exists to stop a click on a control from also opening a panel. Spec 4.6: the stock panel is
       reachable from every place a ticker appears, and a holdings row is one of the five. */
    const rb=e.target.closest("button[data-stock]"); if(rb){ openStockDetail(rb.dataset.stock); return; }
    if(e.target.closest("button,select,input,a,.editable,.reset,.swatch"))return;
    const c=e.target.closest("td.sym[data-stock]"); if(c) openStockDetail(c.dataset.stock); });
  if($("#ovLiveToggle")) $("#ovLiveToggle").addEventListener("click",toggleLive);
  /* 4.2 item 6: "a flush-right ALL HISTORY - UNDO -> that switches to lane 4". The button was
     built and never wired, so it rendered, invited a click and did nothing - a control that lies
     about being a control. Found 2026-09-01 by scanning for element ids nothing references. */
  if($("#ovAllHistory")) $("#ovAllHistory").addEventListener("click",()=>switchView("history"));
  $("#capPct").addEventListener("change",async()=>{ const v=parseFloat($("#capPct").value); if(isNum(v)&&v>0)state.cap=clamp(v,1,100)/100; renderFundamentals(); renderCalc(); await savePortfolio(); });
  $("#resetBtn").addEventListener("click",async()=>{
    /* The refusal comes FIRST. It sat below the assignment, so "try again in a moment"
       was printed AFTER the book had already been replaced in memory - and once booting
       cleared, every guard passed and the next autosave wrote that blank document over
       the account, the mirror and the whole checkpoint history. */
    if(booting){ toast("Still loading your account - try again in a moment"); return; }
    /* A reset we cannot PERSIST must not happen at all. The assignment below is what stops the
       save's own "have we read this account?" guard from firing - that guard tests
       !state.portfolio, and this hands it a document. The write is still refused further down
       (C3, baseRevision is null), but by then the book is blank in memory AND state.portfolio is
       truthy, which flips accountUnreachable() off and replaces every honest "could not be
       loaded" panel with an empty board over a live account. Ask the question only when the
       answer can be honoured. */
    if(storageAdapter().name==="cloud" && (accountUnreachable() || !isNum(state.baseRevision))){
      /* An account with no row yet still loads with revision 0 (loadPortfolio's meta default), so
         isNum() holds and this cannot fire for a brand-new account. The only way here is an account
         that was never successfully read - so name that, rather than hedging. */
      toast("Your account has not loaded, so a reset could not be saved - nothing was changed"); return; }
    if(!confirm("Reset the portfolio? This clears ALL holdings and version history (your weights, penalty & overrides are kept). This cannot be undone."))return;
    state.portfolio={holdings:{},totalContributed:0,versions:[],head:-1,createdAt:todayISO(),
      weights:state.weights,overrides:state.overrides,penalty:state.penalty};
      const ok=await savePortfolio(); toast(ok?"Portfolio reset":"Reset here, but it was NOT saved - see the sync badge");
    renderAll(); switchView("calc");
  });
}

async function init(){
  if(NATIVE){ try{ document.documentElement.classList.add('native'); }catch(e){} try{ state.serverUrl=localStorage.getItem(SRV_KEY)||""; }catch(e){} }
  if(NATIVE){ ovSegMount(); ovSegApply(); }               // APP2.6: one chart card, series chosen, before first paint
  initTheme();                                            // E5.0: before first paint, so there's no flash
  purgeLegacyLocalCopies();                               // E9: remove any portfolio copies an earlier version left here
  /* A link's session WINS over the cached one, and suppresses it entirely - see sbConsumeAuthLink. */
  if(!await sbConsumeAuthLink()) sbLoadSession();          // E6.4: restore a signed-in session before any load
  /* Pasting the link into a tab that is ALREADY on this page changes only the fragment, which is a
     same-document navigation - init() does not run again. Clicking the link from an email is a full
     load and does, but the paste case is plausible during a demo, so catch it too. Adoption strips
     the fragment, so the reload cannot re-enter this. */
  window.addEventListener("hashchange",()=>{
    sbConsumeAuthLink().then(ok=>{
      if(!ok) return;
      /* Only reload when a session was actually ADOPTED - a reload is how the app boots cleanly as
         that user. Reloading on the failure path would throw away the reason we just worked out
         and leave a bare gate with no explanation. */
      if(_authLinkError){ try{ gateMsg("err",_authLinkError); }catch(e){} _authLinkError=null; return; }
      location.reload();
    }).catch(()=>{});
  });
  wireGate();                                             // E6.8
  captchaBoot();                                          // E11.4b: render the challenge, whenever the script lands
  wireSorting();
  wireOvRange();                                          // E12 4.2 range strip                                          // delegated, so it survives every re-render
  // Raise the gate BEFORE any await: setupEvents() wires every handler, and the pre-paint script
  // only sets `gated` (mouse), so keyboard focus could reach the app during dsLoadUniverse().
  if(!signedIn()){ appLocked=true; showGate(true); }
  if(_authLinkError){ try{ gateMsg("err",_authLinkError); }catch(e){} _authLinkError=null; }
  setupEvents();
  try{ state.universe = await dsLoadUniverse(); }catch(e){ console.error("universe load failed", e); }
  // E6.8: no session -> stop here and show the landing page. A stored session continues, even if
  // the backend then turns out to be unreachable - in which case the app says so (E9: no local copy).
  /* E6 FIX - appLocked, not just the overlay. Without it a signed-out boot left every save guard
     disarmed (docSource is null when nothing was ever loaded), so a keyboard-reachable
     "Reset portfolio" behind the gate could POST an empty document over the server's real file. */
  if(!signedIn()){ appLocked=true; showGate(true); booting=false; return; }
  appLocked=false;
  showGate(false);
  /* E6 FIX - ONE signed-in boot path. init() used to repeat bootSignedIn()'s sequence inline,
     so the two drifted: reloading the page skipped the sync badge, the import offer and the
     kept-aside-work prompt, all of which only ran when you signed in through the gate. */
  try{ await bootSignedIn(); }
  finally{ booting=false; }
  // The same post-load re-check the gate path does: bootSignedIn swallows its own errors, so a
  // session that died during it must not be followed by a price timer running behind the gate.
  if(!signedIn() || appLocked){ showGate(true); return; }
  setupAutoRefresh();
  startIdleWatch();
  await postSignInPrompts();
}
/* E5 fix: the value chart's viewBox is built from its measured box, so re-render it when that box
   changes (window resize, or the rail collapsing at 900px) instead of leaving stale W/Ht. */
(function watchChartSize(){
  const els=["ovChart","ovRetChart"].map(id=>document.getElementById(id)).filter(Boolean);
  if(!els.length) return;
  /* This redraw exists ONLY because renderOverview builds the viewBox from the measured box, so it
     must fire when that box changes - and for no other reason. Unguarded it also fired on changes
     the chart itself had caused: scrubbing rewrites the hero slots row, that reflows the page, the
     page gains or loses a scrollbar, the chart's width changes by the scrollbar, and 120ms later
     this redrew the SVG - wiping the scrub marker and firing mouseleave. The scrub destroyed
     itself, on a real screen, about a tenth of a second after the user started it.
     Two guards, because they cover different cases: the dimension check kills the ordinary loop,
     and the scrub check covers a resize that IS genuine but arrives mid-gesture. */
  let t=null; const redraw=()=>{ clearTimeout(t); t=setTimeout(()=>{
    if(OV_SCRUBBING) return;
    const c=document.getElementById("ovChart");
    if(c && c.clientWidth===OV_W && c.clientHeight===OV_HT) return;
    try{ renderOverview(); }catch(e){} },120); };
  if(window.ResizeObserver){ try{ const ro=new ResizeObserver(redraw); els.forEach(e=>ro.observe(e)); return; }catch(e){} }
  window.addEventListener("resize",redraw);
})();

/* ======================================================================
   APP2.2b - in-tab paging (native only).
   Overview and Model run to ~2.3 screens on a phone. Rather than one long
   scroll, each long tab becomes a few pages you swipe or tap between.

   The seams are the desktop two-column boundaries, because those already
   express the grouping. The hard rule is WORKFLOW COHERENCE: a single
   action must complete on a single page. So the entire rebalance
   transaction stays on the Plan page, and holdings sit on their own page
   as reference; anything not listed in a manifest (the version banner,
   for instance) stays visible on every page of its tab.

   Nothing is moved in the DOM - members are just marked .pg-off - so a
   partial re-render cannot break the structure, and it self-heals.
   ====================================================================== */
const PG_MANIFEST = {
  prices:[
    ["Value",      [".ov-left > .card:nth-of-type(1)"]],   // APP2.6 emptied card 2 into card 1
    ["Allocation", [".ov-left > .card:nth-of-type(3)", "#priceBand"]],
    ["Holdings",   [".ov-right"]]],
  fundamentals:[
    ["Targets",    [".grid2 > .card:nth-of-type(1)"]],
    ["Model",      [".grid2 > .card:nth-of-type(2)"]],
    ["Themes",     [".fund-gridhead", "#fundGrid"]]],
  calc:[
    ["Plan",       [".calc-plan"]],          /* capital -> mode -> Calculate -> plan -> Apply & save */
    ["Holdings",   [".calc-holdings"]]],
  history:[
    ["Timeline",   [".hist-side"]],
    ["Checkpoints",[".hist-list"]]],
};
const pgState={};
let _pgObs=null;

function pgViewEl(){ return document.querySelector(".view.active"); }
function pgId(el){ return el ? (el.id||"").replace("view-","") : ""; }

function pgApply(){
  if(!NATIVE) return;
  const view=pgViewEl(); if(!view) return;
  const id=pgId(view), man=PG_MANIFEST[id];
  if(_pgObs) _pgObs.disconnect();                      // never observe our own writes
  view.querySelectorAll(".pg-off").forEach(e=>e.classList.remove("pg-off"));
  let bar=view.querySelector(":scope > .pgbar");
  if(!man){ if(bar) bar.remove(); pgObserve(view); return; }
  const active=Math.max(0,Math.min(pgState[id]||0, man.length-1));
  pgState[id]=active;
  man.forEach((pg,i)=>{ if(i===active) return;
    pg[1].forEach(sel=>{ view.querySelectorAll(sel).forEach(el=>el.classList.add("pg-off")); }); });
  if(!bar){ bar=document.createElement("div"); bar.className="pgbar"; bar.setAttribute("role","tablist");
    view.insertBefore(bar, view.firstChild); }
  const html=man.map((pg,i)=>'<button type="button" role="tab" data-pgi="'+i+'" aria-current="'+
    (i===active)+'">'+pg[0]+'</button>').join("");
  if(bar.innerHTML!==html) bar.innerHTML=html;
  pgObserve(view);
}
function pgObserve(view){
  if(!("MutationObserver" in window)) return;
  if(!_pgObs) _pgObs=new MutationObserver(muts=>{
    // a re-render replaced content: re-tag. Ignore our own bar.
    if(muts.every(m=>m.target.classList&&m.target.classList.contains("pgbar"))) return;
    clearTimeout(pgObserve._t); pgObserve._t=setTimeout(pgApply,40);   // timer, not rAF: rAF is paused in a background tab
  });
  _pgObs.observe(view,{childList:true,subtree:true});
}
function pgGo(id,i,dir){
  const man=PG_MANIFEST[id]; if(!man) return;
  const next=Math.max(0,Math.min(i,man.length-1));
  if(next===pgState[id]) return;
  pgState[id]=next; pgApply();
  const view=pgViewEl();
  if(view){ view.style.setProperty("--pg-dir",(dir<0?-14:14)+"px");
    man[next][1].forEach(sel=>view.querySelectorAll(sel).forEach(el=>{
      el.classList.remove("pgwrap"); void el.offsetWidth; el.classList.add("pgwrap"); })); }
  const sc=document.scrollingElement||document.documentElement; sc.scrollTop=0;
}
if(NATIVE){
  /* the sheet is torn down with innerHTML="", which would take the relocated controls with it,
     so they must go home first - on every dismissal path, not just the Close button */
  const _closeModal=closeModal;
  closeModal=function(){ try{ nativeReturnChrome(); }catch(e){} return _closeModal.apply(this,arguments); };
  document.addEventListener("click",e=>{
    const b=e.target.closest(".pgbar button[data-pgi]"); if(!b) return;
    const view=pgViewEl(); if(!view) return;
    const i=+b.dataset.pgi; pgGo(pgId(view), i, i-(pgState[pgId(view)]||0));
  });
  /* swipe between pages - but never steal a gesture that began inside something which itself
     scrolls sideways (the per-theme metric tables and the watchlist do). */
  let sx=0, sy=0, sOK=false;
  const scrollsX=el=>{ for(let a=el; a && a!==document.body; a=a.parentElement){
      const cs=getComputedStyle(a);
      if((cs.overflowX==="auto"||cs.overflowX==="scroll") && a.scrollWidth>a.clientWidth+2) return true; }
    return false; };
  document.addEventListener("touchstart",e=>{
    if(e.touches.length!==1){ sOK=false; return; }
    const t=e.touches[0]; sx=t.clientX; sy=t.clientY;
    sOK=!!pgViewEl() && !!PG_MANIFEST[pgId(pgViewEl())] && !scrollsX(e.target) &&
        !e.target.closest("input,select,textarea,.modal-backdrop,svg");
  },{passive:true});
  document.addEventListener("touchend",e=>{
    if(!sOK) return; sOK=false;
    const t=e.changedTouches&&e.changedTouches[0]; if(!t) return;
    const dx=t.clientX-sx, dy=t.clientY-sy;
    if(Math.abs(dx)<56 || Math.abs(dx)<Math.abs(dy)*1.6) return;
    const view=pgViewEl(), id=pgId(view), cur=pgState[id]||0;
    pgGo(id, cur+(dx<0?1:-1), dx<0?1:-1);
  },{passive:true});
  const _renderAll=renderAll, _switchView=switchView;
  renderAll=function(){ _renderAll.apply(this,arguments); pgApply(); };
  switchView=function(v){ _switchView.apply(this,arguments); pgApply(); };
}

init();
