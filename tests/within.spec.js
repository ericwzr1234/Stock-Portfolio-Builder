/* Within-theme allocation — owner's extension, 2026-08-27.
 *
 * Capital used to be split EQUALLY between the names inside a theme, which discarded the very
 * judgement the model applies between themes: two names rated PEG 0.6 and PEG 3.5 received
 * identical money. Each name is now scored on its own metric values by the same weights and
 * bounded by the same rule (floor 1/(2n), ceiling 1/(n-1)).
 *
 * These are invariants, not golden numbers. What must hold: a better name never gets less money
 * than a worse one in the same theme, no name escapes the bounds, the names in a theme still add
 * up to exactly that theme's share, and the whole plan still conserves cash.
 */
const { test, expect } = require("@playwright/test");

const FIXTURE = {
  themes: [
    { key: "alpha", syms: ["A1", "A2", "A3", "A4"] },   // n=4 -> floor 12.5%, ceiling 33.3%
    { key: "beta", syms: ["B1", "B2"] },
    { key: "solo", syms: ["S1"] },                      // n=1 -> must take 100%, not divide by zero
  ],
  data: {
    A1: { price: 100, marketCap: 8.0e11, peg: 0.6, ev: 8,  dfcf: 5,  pe: 12 },   // clearly best
    A2: { price: 50,  marketCap: 2.0e11, peg: 1.4, ev: 18, dfcf: 20, pe: 25 },
    A3: { price: 80,  marketCap: 3.0e11, peg: 2.2, ev: 26, dfcf: 33, pe: 40 },
    A4: { price: 25,  marketCap: 6.0e10, peg: 3.5, ev: 34, dfcf: 48, pe: 60 },   // clearly worst
    B1: { price: 200, marketCap: 5.0e11, peg: 0.9, ev: 12, dfcf: 18, pe: 22 },
    B2: { price: 25,  marketCap: 6.0e10, peg: 2.5, ev: 30, dfcf: 45, pe: 55 },
    S1: { price: 40,  marketCap: 1.0e11, peg: 1.5, ev: 20, dfcf: 22, pe: 30 },
  },
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.computeAllocation === "function");
  await page.evaluate((F) => {
    state.themes = F.themes.map((t) => ({ key: t.key, name: t.key, color: "#111" }));
    state.themeTickers = {};
    F.themes.forEach((t) => { state.themeTickers[t.key] = t.syms.slice(); });
    state.quotes = {}; state.fundamentals = {};
    Object.keys(F.data).forEach((s) => {
      const d = F.data[s];
      state.quotes[s] = { price: d.price, marketCap: d.marketCap, marketState: "REGULAR" };
      state.fundamentals[s] = { peg: d.peg, ev: d.ev, dfcf: d.dfcf, pe: d.pe, marketCap: d.marketCap };
    });
    state.overrides = {}; state.metrics = null; state.metricCfg = null; state.watchlist = [];
    state.cap = null;
    state.weights = Object.assign({}, DEFAULT_CONFIG.weights);
    state.penalty = Object.assign({}, DEFAULT_CONFIG.penalty);
    state.portfolio = { holdings: {}, totalContributed: 0, versions: [], head: -1, revision: 1 };
    rebuildThemeOf();
  }, FIXTURE);
});

test("names inside a theme are no longer equal-weighted", async ({ page }) => {
  const w = await page.evaluate(() => computeAllocation().within.alpha);
  const vals = Object.values(w);
  expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.01);   // it actually tilts
  expect(vals.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);             // and still adds up
});

test("a better name never receives less than a worse one in the same theme", async ({ page }) => {
  const w = await page.evaluate(() => computeAllocation().within.alpha);
  // A1 is best on every value metric, A4 worst on every one
  expect(w.A1).toBeGreaterThan(w.A4);
  expect(w.A1).toBeGreaterThanOrEqual(w.A2);
  expect(w.A3).toBeGreaterThanOrEqual(w.A4);
});

test("no name escapes the floor or the ceiling of its own theme", async ({ page }) => {
  const r = await page.evaluate(() => {
    const A = computeAllocation();
    const out = [];
    Object.keys(A.within).forEach((k) => {
      const w = A.within[k], n = Object.keys(w).length;
      if (!n) return;
      const b = weightBounds(n);
      Object.keys(w).forEach((s) => {
        if (w[s] < b.lo - 1e-9) out.push({ k, s, w: w[s], lo: b.lo, why: "below floor" });
        if (w[s] > b.hi + 1e-9) out.push({ k, s, w: w[s], hi: b.hi, why: "above ceiling" });
      });
    });
    return out;
  });
  expect(r).toEqual([]);
});

test("a theme holding one name gives it everything, and does not divide by zero", async ({ page }) => {
  const w = await page.evaluate(() => computeAllocation().within.solo);
  expect(w.S1).toBe(1);
});

test("each theme's names still sum to exactly that theme's share of the book", async ({ page }) => {
  const r = await page.evaluate(() => {
    const P = planTrades(100000, "full");
    const A = P.alloc;
    return A.rows.filter(x => !x.empty).map((row) => {
      const k = row.theme.key;
      const named = tickersOf(k).reduce((a, s) => a + P.target[s], 0);
      return { k, themeShare: row.alloc * P.newTotal, named };
    });
  });
  r.forEach((x) => expect(x.named).toBeCloseTo(x.themeShare, 6));
});

test("the plan still conserves cash exactly, with the tilt applied", async ({ page }) => {
  const r = await page.evaluate(() => {
    const P = planTrades(100000, "full");
    return { traded: P.universe.reduce((a, s) => a + P.trade[s], 0), added: P.addCash };
  });
  expect(r.traded).toBeCloseTo(r.added, 6);
});
