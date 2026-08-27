/* Day P/L must measure the move over the period you actually OWNED the shares.
 *
 * USER-FOUND 2026-08-27. It was Sum(shares x today's change), which credits you with the WHOLE
 * day's move on a position you bought minutes ago. The owner built a book at the close and was
 * shown +$2,337 for the day while its ALL-TIME gain was +$112 — impossible, and that impossibility
 * is the sharpest test available: nothing bought today can have gained more TODAY than it has
 * gained in TOTAL.
 */
const { test, expect } = require("@playwright/test");

/* price 110, previous close 100 -> the stock is up 10 today. Buying at 110 today means you have
   captured NONE of that move. */
async function book(page, { boughtToday, buyPrice = 110 }) {
  await page.goto("/");
  /* Wait on something that exists in BOTH versions. Waiting for dayPL itself makes this suite
     HANG rather than fail against the pre-fix code, which turns a mutation check into a timeout. */
  await page.waitForFunction(() => typeof window.curTotal === "function");
  return page.evaluate(([boughtToday, buyPrice]) => {
    state.themes = [{ key: "t", name: "T", color: "#111" }];
    state.themeTickers = { t: ["X"] };
    state.quotes = { X: { price: 110, prevClose: 100, change: 10, marketCap: 1e11, marketState: "REGULAR" } };
    state.fundamentals = { X: { peg: 1, ev: 10, dfcf: 10, pe: 20, marketCap: 1e11 } };
    state.overrides = {}; state.metrics = null; state.metricCfg = null; state.watchlist = []; state.cap = null;
    state.weights = Object.assign({}, DEFAULT_CONFIG.weights);
    state.penalty = Object.assign({}, DEFAULT_CONFIG.penalty);
    const shares = 100;
    const version = {
      date: boughtToday ? todayISO() : "2020-01-02",
      type: "INITIAL", valueAfter: shares * buyPrice, valueBefore: 0, cashIn: shares * buyPrice,
      trades: [{ sym: "X", shares: shares, amount: shares * buyPrice, price: buyPrice }],
    };
    state.portfolio = {
      holdings: { X: { shares: shares, costBasis: shares * buyPrice } },
      totalContributed: shares * buyPrice, versions: [version], head: 0, revision: 1,
    };
    rebuildThemeOf();
    return { dayPL: dayPL(), total: curTotal(), invested: totalContributed() };
  }, [boughtToday, buyPrice]);
}

test("a position bought TODAY at 110 shows no day gain — you were not there for the move", async ({ page }) => {
  const r = await book(page, { boughtToday: true, buyPrice: 110 });
  expect(r.dayPL).toBeCloseTo(0, 6);          // THE BUG: this used to report 100 x 10 = 1000
});

test("day P/L cannot exceed the all-time gain when everything was bought today", async ({ page }) => {
  const r = await book(page, { boughtToday: true, buyPrice: 110 });
  const allTime = r.total - r.invested;
  expect(r.dayPL).toBeCloseTo(allTime, 6);    // the owner's exact symptom: $2,337 vs $112
});

test("bought today at 105, so only the 5 since purchase counts", async ({ page }) => {
  const r = await book(page, { boughtToday: true, buyPrice: 105 });
  expect(r.dayPL).toBeCloseTo(100 * (110 - 105), 6);
  expect(r.dayPL).toBeCloseTo(r.total - r.invested, 6);
});

test("a position held since BEFORE today still earns the whole day's move", async ({ page }) => {
  const r = await book(page, { boughtToday: false, buyPrice: 60 });
  expect(r.dayPL).toBeCloseTo(100 * 10, 6);   // unchanged behaviour where it was already right
});

test("an undone checkpoint is not a trade you made", async ({ page }) => {
  /* Each test gets a fresh page, so this has to build its own book - relying on the previous
     test's state is how a test passes for the wrong reason. */
  await book(page, { boughtToday: true, buyPrice: 110 });
  const r = await page.evaluate(() => {
    state.portfolio.head = -1;          // today's checkpoint is undone
    state.portfolio.holdings = {};      // and with it, the position it created
    rebuildThemeOf();
    return dayPL();
  });
  expect(r).toBeCloseTo(0, 6);          // nothing held and no trade counted: no day P/L to report
});
