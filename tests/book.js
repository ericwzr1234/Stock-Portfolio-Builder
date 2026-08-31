/* A realistic signed-in book, shared by the E12 specs and the screenshot harness.
   It writes the REAL state keys - state.themeTickers, state.quotes, state.fundamentals, and
   versions carrying v.snapshot - because a fixture that writes keys the app never reads is a test
   that passes against an empty account while claiming to test a full one. */
const SYMS = [
  ["NVDA","Nvidia","ai",3.1e12,171,168],   ["MSFT","Microsoft","ai",3.0e12,412,415],
  ["AVGO","Broadcom","ai",7.4e11,239,236], ["ISRG","Intuitive","rob",1.6e11,498,505],
  ["ABBV","AbbVie","hc",3.2e11,196,194],   ["LLY","Eli Lilly","hc",8.1e11,762,770],
  ["ETN","Eaton","el",1.4e11,312,309],     ["NEE","NextEra","el",1.5e11,72,73],
  ["FANUY","Fanuc","rob",2.9e10,14.6,14.4]];

async function seedBook(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  await page.evaluate((SYMS) => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token:"T", refresh_token:"r", user:{ id:"u1", email:"eric@example.com" }}));
    sbLoadSession(); appLocked = false; showGate(false);
    state.themes = [
      { key:"ai",  name:"AI Infrastructure", color:"#2f9e8f" },
      { key:"rob", name:"Robotics",          color:"#3b6ea5" },
      { key:"hc",  name:"Healthcare",        color:"#8a9a5b" },
      { key:"el",  name:"Electrification",   color:"#a8763e" }];
    state.themeTickers = { ai:[], rob:[], hc:[], el:[] };
    state.quotes = {}; state.fundamentals = {};
    SYMS.forEach(([s,n,th,mc,px,pc], i) => {
      state.themeTickers[th].push(s);
      state.quotes[s] = { price:px, prevClose:pc, change:px-pc, changePct:(px-pc)/pc*100,
                          name:n, marketCap:mc, marketState:"REGULAR" };
      state.fundamentals[s] = { peg:1+i*0.15, ev:9+i, dfcf:8+i*1.4, pe:18+i*2, marketCap:mc, name:n };
    });
    state.overrides = {}; state.metrics = null; state.metricCfg = null;
    /* Watchlist entries are objects, not bare symbols - renderWatchlist reads w.sym. Quotes and
       fundamentals too, or the 52-week track and the P/E column have nothing to draw. */
    state.watchlist = [{ sym:"AMD" }, { sym:"TSM", portfolio:"ai" }];
    state.quotes.AMD = { price:164, prevClose:161, change:3, changePct:1.86, name:"Advanced Micro Devices",
                         marketCap:2.6e11, marketState:"REGULAR", low52:94, high52:227, vol:41e6, avgVol:52e6 };
    state.quotes.TSM = { price:181, prevClose:183, change:-2, changePct:-1.09, name:"Taiwan Semiconductor",
                         marketCap:9.3e11, marketState:"REGULAR", low52:102, high52:212, vol:12e6, avgVol:15e6 };
    state.fundamentals.AMD = { pe:41.2, peg:1.9, ev:34, dfcf:2.1, marketCap:2.6e11, name:"Advanced Micro Devices" };
    state.fundamentals.TSM = { pe:26.8, peg:1.1, ev:14, dfcf:0.9, marketCap:9.3e11, name:"Taiwan Semiconductor" };
    state.cap = null;
    state.weights = Object.assign({}, DEFAULT_CONFIG.weights);
    state.penalty = Object.assign({}, DEFAULT_CONFIG.penalty);

    const held = { NVDA:180, MSFT:70, AVGO:95, ISRG:40, ABBV:110, LLY:26, ETN:60, NEE:210, FANUY:900 };
    const all = Object.keys(held);
    const mk = (syms, frac) => syms.map(s => ({ sym:s, shares:held[s]*frac,
      price:state.quotes[s].prevClose*0.72, amount:held[s]*frac*state.quotes[s].prevClose*0.72 }));
    const H = {}; all.forEach(s => H[s] = { shares:held[s],
      costBasis:held[s]*state.quotes[s].prevClose*0.78 });
    const inv = all.reduce((a,s)=>a+H[s].costBasis, 0);
    const snap = (frac) => { const o={}; all.forEach(s => o[s] = { shares:held[s]*frac,
      costBasis:H[s].costBasis*frac }); return o; };
    state.portfolio = { createdAt:"2024-11-04", holdings:H, totalContributed:inv,
      head:2, versions:[
      { id:1, date:"2024-11-04", type:"INITIAL",    label:"Initial build", valueBefore:0,
        valueAfter:inv*0.62, cashIn:inv*0.62, trades:mk(all.slice(0,5),0.6),
        snapshot:{ holdings:snap(0.6),  totalContributed:inv*0.62 } },
      { id:2, date:"2025-03-18", type:"CONTRIBUTE", label:"Added 40,000",  valueBefore:inv*0.70,
        valueAfter:inv*0.88, cashIn:inv*0.24, trades:mk(all.slice(5),0.4),
        snapshot:{ holdings:snap(0.85), totalContributed:inv*0.86 } },
      { id:3, date:"2025-07-22", type:"REBALANCE",  label:"Rebalance",     valueBefore:inv*0.96,
        valueAfter:inv, cashIn:inv*0.14, trades:mk(all,0.15),
        snapshot:{ holdings:H,          totalContributed:inv } }]};
    rebuildThemeOf(); renderAll();
  }, SYMS);
}

module.exports = { seedBook, SYMS };
