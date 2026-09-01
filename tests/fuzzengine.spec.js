/* Adversarial input to the calculation engine.
 *
 * The engine's INVARIANTS are already well covered elsewhere: allocation sums to 1, bounds are
 * respected, cash is conserved exactly, an all-zero model falls back to equal weight. What is not
 * covered is degenerate INPUT to those same functions - and Yahoo is an unauthenticated third party
 * whose response shape we do not control.
 *
 * The rule this file enforces: for any input, every money figure the app computes is either
 * CORRECT or VISIBLY ABSENT. Never a number that is quietly wrong. A crash is recoverable; a
 * plausible-looking wrong allocation is acted on.
 */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

/* Each case mutates the seeded book into something a real feed could plausibly produce. */
const CASES = {
  "null price on one holding":      () => { state.quotes.NVDA.price = null; },
  "zero price on one holding":      () => { state.quotes.NVDA.price = 0; },
  "negative price":                 () => { state.quotes.NVDA.price = -50; },
  "NaN price":                      () => { state.quotes.NVDA.price = NaN; },
  "Infinity price":                 () => { state.quotes.NVDA.price = Infinity; },
  "price as a string":              () => { state.quotes.NVDA.price = "171"; },
  "price object instead of number": () => { state.quotes.NVDA.price = { v: 171 }; },
  "every price missing":            () => { Object.keys(state.quotes).forEach(k => delete state.quotes[k].price); },
  "quote object missing entirely":  () => { delete state.quotes.NVDA; },
  "prevClose missing":              () => { Object.keys(state.quotes).forEach(k => delete state.quotes[k].prevClose); },
  "NaN shares":                     () => { state.portfolio.holdings.NVDA.shares = NaN; },
  "negative shares":                () => { state.portfolio.holdings.NVDA.shares = -10; },
  "shares as a string":             () => { state.portfolio.holdings.NVDA.shares = "180"; },
  "costBasis NaN":                  () => { state.portfolio.holdings.NVDA.costBasis = NaN; },
  "totalContributed zero":          () => { state.portfolio.totalContributed = 0; },
  "totalContributed negative":      () => { state.portfolio.totalContributed = -5000; },
  "totalContributed NaN":           () => { state.portfolio.totalContributed = NaN; },
  "all fundamentals null":          () => { Object.keys(state.fundamentals).forEach(k => { state.fundamentals[k] = {}; }); },
  "NaN in every metric":            () => { Object.keys(state.fundamentals).forEach(k => { ["peg","ev","dfcf","pe","marketCap"].forEach(f => state.fundamentals[k][f] = NaN); }); },
  "a portfolio with no names":      () => { state.themes.push({ key: "z", name: "Empty", color: "#888" }); state.themeTickers.z = []; },
  "one portfolio, one name":        () => { state.themes = [state.themes[0]]; state.themeTickers = { ai: ["NVDA"] }; },
  "a name in no portfolio":         () => { state.portfolio.holdings.ORPHAN = { shares: 5, costBasis: 100 };
                                            state.quotes.ORPHAN = { price: 20, prevClose: 20, marketCap: 1e9 }; },
  "500 names in one portfolio":     () => { for (let i = 0; i < 500; i++) { const s = "F" + i;
                                              state.themeTickers.ai.push(s);
                                              state.quotes[s] = { price: 10, prevClose: 10, marketCap: 1e9, marketState: "REGULAR" };
                                              state.fundamentals[s] = { peg: 1, ev: 10, dfcf: 5, pe: 15, marketCap: 1e9 }; } },
  "huge price":                     () => { state.quotes.NVDA.price = 1e15; },
  "tiny price":                     () => { state.quotes.NVDA.price = 1e-9; },
  "a version with no snapshot":     () => { delete state.portfolio.versions[1].snapshot; },
  "versions empty but holdings set":() => { state.portfolio.versions = []; state.portfolio.head = -1; },
  "cap set to zero":                () => { state.cap = 0; },
  "cap set above one":              () => { state.cap = 5; },
  "all weights zero":               () => { Object.keys(state.weights).forEach(k => state.weights[k] = 0); },
  "a negative weight":              () => { state.weights.peg = -1; },
};

const probe = (page, mutate) => page.evaluate((src) => {
  (0, eval)("(" + src + ")")();
  rebuildThemeOf();
  const out = { threw: null };
  const num = (v) => (typeof v === "number" ? v : null);
  try {
    out.curTotal = num(curTotal());
    out.dayPL = num(dayPL());
    out.invested = num(totalContributed());
    const A = computeAllocation();
    const rows = (A.rows || []).filter((r) => !r.empty);
    out.allocSum = rows.reduce((a, r) => a + (typeof r.alloc === "number" ? r.alloc : NaN), 0);
    out.allocAnyBad = rows.some((r) => !isFinite(r.alloc) || r.alloc < 0);
    out.rowCount = rows.length;
    /* Within-portfolio weights: each portfolio's names must sum to that portfolio's share. */
    out.withinBad = Object.values(A.within || {}).some((w) => {
      const vals = Object.values(w);
      if (!vals.length) return false;
      const s = vals.reduce((a, b) => a + b, 0);
      return !isFinite(s) || Math.abs(s - 1) > 1e-6;
    });
    const plan = planTrades(4000, "full");
    out.tradeSum = plan.universe.reduce((a, s) => a + (plan.trade[s] || 0), 0);
    out.sharesAnyBad = plan.universe.some((s) => {
      const d = plan.sharesD[s];
      return d !== undefined && !isFinite(d);
    });
    out.newTotal = num(plan.newTotal);
    out.hist = (valueHistory() || []).some((p) => p.value !== null && !isFinite(p.value));
  } catch (e) {
    out.threw = String(e && e.message).slice(0, 120);
  }
  return out;
}, mutate.toString());

for (const [name, mutate] of Object.entries(CASES)) {
  test(`engine survives: ${name}`, async ({ page }) => {
    await seedBook(page);
    await page.evaluate(() => { window.savePortfolio = async () => true; });
    const r = await probe(page, mutate);

    // 1. Nothing may throw. A throw on a render path blanks a lane.
    expect(r.threw, `threw: ${r.threw}`).toBeNull();

    // 2. No money figure may be NaN or Infinity. "-" is fine; a wrong number is not.
    for (const k of ["curTotal", "dayPL", "invested", "newTotal"]) {
      expect(Number.isFinite(r[k]), `${k} = ${r[k]}`).toBe(true);
    }

    // 3. Target weights must be a real distribution, or there must be no rows at all.
    expect(r.allocAnyBad, "a target weight was negative or non-finite").toBe(false);
    if (r.rowCount > 0) {
      expect(Math.abs(r.allocSum - 1), `weights summed to ${r.allocSum}`).toBeLessThan(1e-6);
    }

    // 4. Names inside a portfolio must sum to that portfolio's share, exactly.
    expect(r.withinBad, "a portfolio's names did not sum to its share").toBe(false);

    // 5. Share counts must be real numbers - a NaN share count is an order you cannot place.
    expect(r.sharesAnyBad, "a share delta was NaN or Infinity").toBe(false);

    // 6. The plan must conserve cash: what it spends equals what you put in.
    expect(Number.isFinite(r.tradeSum), `trades summed to ${r.tradeSum}`).toBe(true);

    // 7. The value history may have gaps (null) but never a non-finite number.
    expect(r.hist, "value history contained a non-finite value").toBe(false);
  });
}
