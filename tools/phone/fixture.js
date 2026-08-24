/* shared fixture, so every harness seeds identically */
const THEMES = [
  ["stablecoin","Stablecoin","#13605C",[["CRCL",65.45,17.4e9],["MA",535.78,474e9],["V",356.29,680e9],["COIN",167.81,44e9],["JPM",347.23,928e9]]],
  ["personalai","Personal AI","#3A6EA5",[["AAPL",312.20,4560e9],["AMZN",241.60,2740e9],["META",712.40,1720e9],["GOOGL",224.15,4520e9],["IBM",286.90,200e9]]],
  ["enterpriseai","Enterprise AI","#6B5B8C",[["NOW",1042.30,216e9],["PLTR",182.55,432e9],["MSFT",548.70,4080e9],["CRM",268.40,256e9],["PATH",14.62,8e9]]],
  ["robotics","Robotics","#4D7C6F",[["ISRG",612.80,218e9],["ROK",368.15,42e9],["NVDA",214.90,5210e9],["SYM",52.30,30e9],["TSLA",438.60,1460e9]]],
  ["data","Data Providers","#A4683C",[["SNOW",238.45,79e9],["SPGI",584.20,178e9],["MCO",512.75,92e9],["MSCI",628.40,49e9],["RDDT",196.30,36e9]]],
];

module.exports.seed = async (page) => {
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
    const mk = (date, type, mode, cashIn, before, after, contributed) => ({
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
    renderAll();
  }, THEMES);
};
