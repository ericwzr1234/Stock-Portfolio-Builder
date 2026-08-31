/* The per-name target weight, shown on the Model tab where the metrics are tuned.
 *
 * E1.10 made the model rank names INSIDE a portfolio, but the result was only visible as dollars
 * over on Rebalance - not here, where you change the weights that cause it. The column closes that
 * loop. What must hold: it agrees with the engine, it always adds to 100% of the portfolio, and a
 * name pinned by the owner's floor or ceiling says so, because "why won't this one move when I
 * change the weights" is otherwise a confusing thing to hit.
 */
const { test, expect } = require("@playwright/test");

async function modelView(page, tickers) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.computeAllocation === "function");
  await page.evaluate((tk) => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "u1", email: "x@y.z" } }));
    sbLoadSession(); appLocked = false; showGate(false);
    state.themes = [{ key: "semi", name: "Semiconductors", color: "#2f9e8f" }];
    state.themeTickers = { semi: tk.map(t => t[0]) };
    state.quotes = {}; state.fundamentals = {};
    tk.forEach(([s, peg]) => {
      state.quotes[s] = { price: 100, prevClose: 100, change: 0, marketCap: 2e11, marketState: "REGULAR", name: s };
      state.fundamentals[s] = { peg: peg, ev: 20, dfcf: 10, pe: 30, marketCap: 2e11, source: "live" };
    });
    state.overrides = {}; state.metrics = null; state.metricCfg = null; state.watchlist = []; state.cap = null;
    state.weights = Object.assign({}, DEFAULT_CONFIG.weights);
    state.penalty = Object.assign({}, DEFAULT_CONFIG.penalty);
    state.portfolio = { holdings: {}, totalContributed: 0, versions: [], head: -1, revision: 1 };
    rebuildThemeOf(); renderAll(); switchView("fundamentals");
    document.querySelectorAll("[data-fthmtoggle]").forEach(e => e.click());
    renderAll();
  }, tickers);
  await page.waitForTimeout(300);
}

const read = (page) => page.evaluate(() => {
  const t = document.querySelector("#fundGrid table");
  const head = [...t.querySelectorAll("thead th")].map(h => h.textContent.trim());
  const col = head.indexOf("Target");
  return {
    col, head,
    /* Read the ticker from data-stock, not from the cell's text: the cell also carries the
       per-name remove control (4.9 row 28), so its textContent is "AAA<remove glyph>". */
    rows: [...t.tBodies[0].rows].map(r => ({ sym: r.cells[0].dataset.stock,
                                             txt: r.cells[col].textContent.trim() })),
    foot: t.tFoot.rows[0].cells[col].textContent.trim(),
    engine: computeAllocation().within.semi,
  };
});

test("the column exists and shows what the engine actually decided", async ({ page }) => {
  await modelView(page, [["AAA", 0.9], ["BBB", 2.4], ["CCC", 3.6], ["DDD", 1.3]]);
  const r = await read(page);
  expect(r.col).toBeGreaterThan(-1);
  r.rows.forEach(row => {
    const shown = parseFloat(row.txt);                 // "33.3%max" -> 33.3
    expect(shown).toBeCloseTo(r.engine[row.sym] * 100, 1);
  });
});

test("the names always add up to the whole portfolio", async ({ page }) => {
  await modelView(page, [["AAA", 0.9], ["BBB", 2.4], ["CCC", 3.6], ["DDD", 1.3]]);
  const r = await read(page);
  expect(r.foot).toBe("100.0%");
  const sum = Object.values(r.engine).reduce((a, b) => a + b, 0);
  expect(sum).toBeCloseTo(1, 9);
});

test("a better name is never shown less than a worse one", async ({ page }) => {
  await modelView(page, [["AAA", 0.9], ["BBB", 2.4], ["CCC", 3.6], ["DDD", 1.3]]);
  const r = await read(page);
  const w = s => r.engine[s];
  expect(w("AAA")).toBeGreaterThan(w("CCC"));          // PEG 0.9 beats PEG 3.6
  expect(w("DDD")).toBeGreaterThan(w("BBB"));          // PEG 1.3 beats PEG 2.4
});

test("a name pinned at the ceiling says so", async ({ page }) => {
  await modelView(page, [["AAA", 0.05], ["BBB", 9], ["CCC", 9], ["DDD", 9]]);   // one runaway winner
  const r = await read(page);
  const top = r.rows.find(x => x.sym === "AAA");
  expect(top.txt.toLowerCase()).toContain("max");
  expect(parseFloat(top.txt)).toBeCloseTo(100 / 3, 1);  // ceiling at n=4 is 1/(4-1)
});

test("a single-name portfolio takes all of it, and does not divide by zero", async ({ page }) => {
  await modelView(page, [["AAA", 1.2]]);
  const r = await read(page);
  expect(r.rows).toHaveLength(1);
  expect(parseFloat(r.rows[0].txt)).toBeCloseTo(100, 6);
  expect(r.foot).toBe("100.0%");
});
