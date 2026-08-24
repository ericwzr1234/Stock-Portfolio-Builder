/* APP2 phone-UI verification harness.
 *
 * The engine tests keep the login gate up because they only call pure functions. To verify the
 * VIEW layer I have to get past it - without ever handling a real password. So: load the real
 * page from the real dev server, inject a synthetic portfolio into `state` exactly as the engine
 * tests do, drop the gate with the app's own showGate(false), render, and screenshot at iPhone
 * size. Nothing here ships; it is a verification tool.
 *
 *   node phoneshots.js <baseUrl> <outDir> <tag> [theme]
 */
const { chromium } = require("@playwright/test");
const path = require("path");

const BASE = process.argv[2] || "http://127.0.0.1:8768";
const OUT  = process.argv[3] || ".";
const TAG  = process.argv[4] || "shot";
const THEME= process.argv[5] || "dark";

/* the owner's real theme/ticker structure, with plausible prices so every number reads true */
const THEMES = [
  ["stablecoin","Stablecoin","#13605C",[["CRCL",65.45,17.4e9],["MA",535.78,474e9],["V",356.29,680e9],["COIN",167.81,44e9],["JPM",347.23,928e9]]],
  ["personalai","Personal AI","#3A6EA5",[["AAPL",312.20,4560e9],["AMZN",241.60,2740e9],["META",712.40,1720e9],["GOOGL",224.15,4520e9],["IBM",286.90,200e9]]],
  ["enterpriseai","Enterprise AI","#6B5B8C",[["NOW",1042.30,216e9],["PLTR",182.55,432e9],["MSFT",548.70,4080e9],["CRM",268.40,256e9],["PATH",14.62,8e9]]],
  ["robotics","Robotics","#4D7C6F",[["ISRG",612.80,218e9],["ROK",368.15,42e9],["NVDA",214.90,5210e9],["SYM",52.30,30e9],["TSLA",438.60,1460e9]]],
  ["data","Data Providers","#A4683C",[["SNOW",238.45,79e9],["SPGI",584.20,178e9],["MCO",512.75,92e9],["MSCI",628.40,49e9],["RDDT",196.30,36e9]]],
];
const VIEWS = (process.env.ONLY||"prices,fundamentals,calc,screener,history").split(",");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 402, height: 874 },   // iPhone 17 logical points
    deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
    colorScheme: THEME === "dark" ? "dark" : "light",
  });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0,160)); });

  /* Be the native app for real, not just its CSS class: stub Capacitor BEFORE the page script
     runs, so NATIVE is true, the app sets html.native itself pre-paint, and native-only JS
     (the pager) actually executes. Nothing calls the network here - state is injected. */
  await page.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" };
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.renderAll === "function" && typeof window.showGate === "function");

  await page.evaluate((T) => {
    state.themes = T.map(t => ({ key: t[0], name: t[1], color: t[2] }));
    state.themeTickers = {}; state.quotes = {}; state.fundamentals = {}; state.pulled = {};
    const holdings = {};
    T.forEach(t => {
      state.themeTickers[t[0]] = t[3].map(h => h[0]);
      t[3].forEach((h, i) => {
        const [sym, px, mc] = h;
        const day = ((i * 7919) % 900) / 100 - 3.5;                  // deterministic spread of movers
        state.quotes[sym] = { price: px, marketCap: mc, marketState: "REGULAR",
          name: sym + " Inc.", change: px * day / 100, changePct: day, prevClose: px / (1 + day/100),
          high52: px * 1.28, low52: px * 0.62, vol: 12.3e6 + i * 1e6, avgVol: 15.1e6, source: "live" };
        const f = { peg: 1.1 + (i % 5) * 0.42, ev: 14 + (i % 6) * 4.2, dfcf: 0.3 + (i % 4) * 1.1,
                    pe: 18 + (i % 7) * 5.5, mom: day * 2.4, marketCap: mc, price: px, source: "live" };
        state.fundamentals[sym] = f; state.pulled[sym] = Object.assign({}, f);
        holdings[sym] = { shares: Math.round((92000 / 25) / px * 1000) / 1000, costBasis: 3400 + i * 90 };
      });
    });
    state.overrides = {}; state.metrics = null; state.metricCfg = null; state.watchlist = [{ sym: "AMD", theme: null }];
    state.quotes.AMD = { price: 529.14, marketCap: 860e9, name: "Advanced Micro Devices", change: -19,
      changePct: -3.46, high52: 584.73, low52: 149.22, vol: 27.7e6, avgVol: 36.6e6, source: "live", marketState:"REGULAR" };
    state.cap = null;
    state.weights = Object.assign({}, DEFAULT_CONFIG.weights);
    state.penalty = Object.assign({}, DEFAULT_CONFIG.penalty);

    // seven recorded checkpoints so the Overview/History charts have a real series to draw
    // each checkpoint needs snap.totalContributed - that is where valueHistory() reads ,
    // and without it the return chart correctly reports it has fewer than two usable points
    let _vid = 0;
    const mk = (date, type, mode, cashIn, before, after, contributed) => ({
      id: ++_vid,                             // else the version banner renders "#undefined"
      date, type, mode, cashIn, valueBefore: before, valueAfter: after,
      snapshot: { totalContributed: contributed, holdings },
      weights: { peg: 20, ev: 20 },
      alloc: T.reduce((a, t, i) => (a[t[0]] = 0.22 - i * 0.012, a), {}),
      trades: T.slice(0, 3).map((t, i) => ({ sym: t[3][i][0], theme: t[0],
        amount: (i % 2 ? 1 : -1) * (400 + i * 260), shares: (i % 2 ? 1 : -1) * (2 + i),
        price: t[3][i][1], before: 3000 + i * 100, after: 3400 + i * 120 })),
    });
    state.portfolio = {
      holdings, totalContributed: 95000, revision: 19, head: 6,
      versions: [
        mk("2026-02-14","initial build","full",80000,0,80000,80000),
        mk("2026-03-28","rebalance","full",0,82900,82760,80000),
        mk("2026-04-30","cash deploy","cash",5000,84100,89100,85000),
        mk("2026-05-29","rebalance","full",0,91400,91180,85000),
        mk("2026-06-30","cash deploy","cash",10000,93600,103600,95000),
        mk("2026-07-31","rebalance","full",0,104900,104700,95000),
        mk("2026-08-21","rebalance","full",0,106100,105950,95000),
      ],
    };
    rebuildThemeOf();
    if (typeof rebuildFundamentals === "function") rebuildFundamentals();
    showGate(false);                       // the app's own function, not a CSS hack
    // Signed OUT the account button reads a short "Sign in" and hides the real overflow. Put the
    // signed-in label in place so the header is measured as the user actually sees it.
    const ab = document.getElementById("acctBtn");
    if (ab) { ab.textContent = "\u25CF test-a@example.com"; ab.classList.add("on"); }
    renderAll();
  }, THEMES);

  const results = [];
  const measure = async () => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    /* Measure overflow BEFORE clipping. body/html now clip on native, so scrollWidth reads clean
       even when content is too wide - the guard was masking the very bug it exists to catch.
       Instead walk the tree and ask: is any element wider than the screen while NOT sitting
       inside something that legitimately scrolls sideways itself? */
    const inScroller = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && a.scrollWidth > a.clientWidth + 2) return true; }
      return false; };
    const over = [];
    document.querySelectorAll("body *").forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.width > vw + 1 && !inScroller(el) && getComputedStyle(el).position !== "fixed")
        over.push(el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
          (el.className ? "." + el.className.toString().trim().split(/\s+/)[0] : "") +
          " w=" + Math.round(b.width));
    });
    return {
      tooWide: over.slice(0, 4),
      canPan: (() => { window.scrollTo(999, window.scrollY); const m = window.scrollX > 0;
                       window.scrollTo(0, window.scrollY); return m; })(),
      scrollH: document.documentElement.scrollHeight,
      tiny: [...document.querySelectorAll("input,textarea")].filter(e =>
        parseFloat(getComputedStyle(e).fontSize) < 16 &&
        !["checkbox","radio","range","color","submit","button"].includes(e.type)).length,
    };
  });

  for (const v of VIEWS) {
    await page.evaluate(x => switchView(x), v);
    await page.waitForTimeout(280);
    const pages = await page.evaluate(() => {
      const vw = document.querySelector(".view.active");
      const bar = vw && vw.querySelector(":scope > .pgbar");
      return bar ? [...bar.querySelectorAll("button")].map(b => b.textContent) : [null]; });
    for (let i = 0; i < pages.length; i++) {
      if (pages[i] !== null) { await page.evaluate(k => document.querySelector(".view.active > .pgbar")
          .querySelectorAll("button")[k].click(), i);
        await page.waitForTimeout(260); }
      const m = await measure();                      // EVERY page, not just the first
      const label = pages[i] === null ? v : `${v}:${pages[i]}`;
      results.push({ page: label, ...m });
      await page.screenshot({ path: path.join(OUT,
        `${TAG}-${THEME}-${v}${pages[i] === null ? "" : (i + 1)}.png`) });
    }
  }
  console.log(JSON.stringify({ theme: THEME, results, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
