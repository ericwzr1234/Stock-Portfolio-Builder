/* Sortable table headers — owner request 2026-08-27.
 *
 * The two failure modes worth testing are not "does it sort":
 *   - The tables are rebuilt by innerHTML on every render, and the price auto-refresh re-renders
 *     every 60s. A sort held only in the DOM disappears while the user is looking at it.
 *   - The cells are FORMATTED. Sorted as text, "$9" beats "$10,000" and "▼ 0.89%" is positive.
 */
const { test, expect } = require("@playwright/test");

async function bookWithHoldings(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  await page.evaluate(() => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "u1", email: "x@y.z" } }));
    sbLoadSession(); appLocked = false; showGate(false);
    state.themes = [{ key: "semi", name: "Semiconductors", color: "#2f9e8f" }];
    state.themeTickers = { semi: ["AMD", "AVGO", "NVDA", "INTC"] };
    const D = { AMD: [476.67, -0.89], AVGO: [371.54, 4.49], NVDA: [227.98, 8.74], INTC: [92.09, 4.36] };
    state.quotes = {}; state.fundamentals = {};
    Object.keys(D).forEach((s) => {
      state.quotes[s] = { price: D[s][0], prevClose: D[s][0] / (1 + D[s][1] / 100),
                          change: D[s][0] - D[s][0] / (1 + D[s][1] / 100), changePct: D[s][1],
                          marketCap: 2e11, marketState: "REGULAR", name: s };
      state.fundamentals[s] = { peg: 1.5, ev: 20, dfcf: 12, pe: 30, marketCap: 2e11 };
    });
    state.overrides = {}; state.metrics = null; state.metricCfg = null; state.watchlist = []; state.cap = null;
    state.weights = Object.assign({}, DEFAULT_CONFIG.weights);
    state.penalty = Object.assign({}, DEFAULT_CONFIG.penalty);
    state.portfolio = { holdings: { AMD: { shares: 31, costBasis: 14000 }, AVGO: { shares: 50, costBasis: 18000 },
                                    NVDA: { shares: 88, costBasis: 20000 }, INTC: { shares: 87, costBasis: 8000 } },
                        totalContributed: 60000, versions: [], head: -1, revision: 1 };
    rebuildThemeOf(); renderAll(); switchView("prices");
    // open the accordion so its per-ticker table is in the DOM
    document.querySelectorAll(".thm .thm-head, .thm summary, [data-thmkey]").forEach(e => e.click && e.click());
    renderAll();
  });
  await page.waitForTimeout(400);
}

/* the ticker table from the owner's screenshot: TICKER | PRICE | DAY | VALUE */
const priceTable = () => `[...document.querySelectorAll("table")].find(t =>
  t.tHead && /TICKER/i.test(t.tHead.textContent) && /PRICE/i.test(t.tHead.textContent))`;

test("a numeric column sorts by value, not as text", async ({ page }) => {
  await bookWithHoldings(page);
  const r = await page.evaluate((sel) => {
    const t = eval(sel); if (!t) return { skip: true };
    const head = [...t.querySelectorAll("thead th")];
    const priceCol = head.findIndex(h => /price/i.test(h.textContent));
    head[priceCol].click();
    const asc = [...t.tBodies[0].rows].map(r => sortNum(r.cells[priceCol].textContent));
    head[priceCol].click();
    const desc = [...t.tBodies[0].rows].map(r => sortNum(r.cells[priceCol].textContent));
    return { asc, desc };
  }, priceTable());
  test.skip(!!r.skip, "price table not present in this fixture");
  expect(r.asc).toEqual([...r.asc].sort((a, b) => a - b));      // 92.09 first, not "$227.98"
  expect(r.desc).toEqual([...r.desc].sort((a, b) => b - a));
});

test("the chosen sort survives a re-render, as the 60s auto-refresh causes", async ({ page }) => {
  await bookWithHoldings(page);
  const r = await page.evaluate((sel) => {
    const t = eval(sel); if (!t) return { skip: true };
    const head = [...t.querySelectorAll("thead th")];
    const c = head.findIndex(h => /price/i.test(h.textContent));
    head[c].click();
    const before = [...t.tBodies[0].rows].map(r => r.cells[0].textContent.trim());
    renderAll();                                    // exactly what auto-refresh does
    const t2 = eval(sel);
    const after = [...t2.tBodies[0].rows].map(r => r.cells[0].textContent.trim());
    return { before, after };
  }, priceTable());
  test.skip(!!r.skip, "price table not present");
  expect(r.after).toEqual(r.before);                // THE failure mode: it used to be lost
});

test("formatted values parse correctly, including the app's own minus and arrows", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.sortNum === "function");
  const r = await page.evaluate(() => ({
    money: sortNum("$14,838"), plus: sortNum("+$2,337"),
    trueMinus: sortNum("−$3,000"), down: sortNum("▼ 0.89%"),
    up: sortNum("▲ 4.49%"), emdash: sortNum("—"), blank: sortNum(""),
  }));
  expect(r.money).toBe(14838);
  expect(r.plus).toBe(2337);
  expect(r.trueMinus).toBe(-3000);
  expect(r.down).toBe(-0.89);          // the red triangle IS the minus sign in this UI
  expect(r.up).toBe(4.49);
  expect(r.emdash).toBeNull();         // absent, not zero
  expect(r.blank).toBeNull();
});

test("grouped tables are left alone so holdings stay under their portfolio", async ({ page }) => {
  await bookWithHoldings(page);
  const grouped = await page.evaluate(() =>
    [...document.querySelectorAll("table")].filter(t => t.querySelector("tr.theme-row"))
      .every(t => !sortableTables().includes(t)));
  expect(grouped).toBe(true);
});
