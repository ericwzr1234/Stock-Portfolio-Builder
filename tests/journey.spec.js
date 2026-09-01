/* The whole journey, through real controls only.
 *
 * WHY THIS EXISTS. Every lane is well covered on its own. The SEAMS between them are not, and the
 * seams are where state gets out of step - the duplicate #initCapital that silently replaced a
 * user's 50,000 with 80,000 lived in exactly such a seam, between the first-run poster and the
 * Trade lane, and no single-lane test could see it.
 *
 * The rule here: NO direct state writes except seeding prices, because there is no network in a
 * test. Everything else is clicked and typed the way a person does it. If a step cannot be done
 * through a control, that is itself the finding.
 */
const { test, expect } = require("@playwright/test");

const PRICES = { NVDA: 100, MSFT: 200, ABBV: 50 };

async function freshAccount(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  await page.evaluate((PRICES) => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "u1", email: "x@y.z" } }));
    sbLoadSession(); appLocked = false; showGate(false);
    window.savePortfolio = async () => true;                       // no account to write to
    /* The only seeding allowed: prices and fundamentals, which would come from the network.
       dsSearch is stubbed for the same reason - the ticker dialog queries it live. */
    state.quotes = {}; state.fundamentals = {};
    Object.entries(PRICES).forEach(([s, p], i) => {
      state.quotes[s] = { price: p, prevClose: p, change: 0, changePct: 0, name: s + " Inc",
                          marketCap: 1e11 * (i + 1), marketState: "REGULAR" };
      state.fundamentals[s] = { peg: 1 + i * 0.2, ev: 10 + i, dfcf: 5 + i, pe: 20 + i,
                                marketCap: 1e11 * (i + 1), name: s + " Inc" };
    });
    window.dsSearch = async (t) => Object.keys(PRICES)
      .filter((s) => s.startsWith(String(t).toUpperCase()))
      .map((s) => ({ symbol: s, name: s + " Inc", exchange: "NMS", type: "EQUITY" }));
    window.dsQuotes = async (syms) => {
      const q = {}; syms.forEach((s) => { if (state.quotes[s]) q[s] = state.quotes[s]; });
      return { quotes: q };
    };
    /* The guided tour is chrome, not the journey, and it has its own suite (tour.spec.js). Its
       coach mark animates over a modal the moment a lane is first opened, which makes a click on a
       freshly-opened dialog non-deterministic. Mark every lane's tour as already seen - which is
       exactly what a returning user's browser holds. */
    ["prices","fundamentals","calc","screener","history"].forEach(v =>
      localStorage.setItem("pb_tour_u1_" + v, "1"));
    state.themes = []; state.themeTickers = {}; state.watchlist = [];
    state.portfolio = { holdings: {}, versions: [], head: -1 };
    rebuildThemeOf(); renderAll();
  }, PRICES);
}

async function createPortfolio(page, name) {
  await page.click("#newThemeBtn");
  await page.waitForSelector("#ctModal");
  await page.fill("#ctName", name);
  await page.click("#ctCreate");
  await page.waitForTimeout(250);
}

async function addTicker(page, themeKey, sym) {
  await page.click(`[data-addticker="${themeKey}"]`);
  await page.waitForSelector("#tsModal");
  await page.fill("#tsQuery", sym);
  await page.waitForSelector(".ts-row", { timeout: 5000 });
  await page.click(`.ts-row[data-sym="${sym}"]`);
  await page.waitForTimeout(350);
}

test("a new user can go from nothing to a funded, rebalanced, undone book", async ({ page }) => {
  await freshAccount(page);

  // --- 1. lands on the poster, and the only thing offered is the thing that works
  expect(await page.evaluate(() => curView)).toBe("first");
  await expect(page.locator("#frCreate")).toBeVisible();
  await page.click("#frCreate");
  await expect(page.locator("#ctModal")).toBeVisible();
  await page.fill("#ctName", "AI Infrastructure");
  await page.click("#ctCreate");
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => themes().length)).toBe(1);

  // --- 2. a second portfolio, so the model has something to allocate BETWEEN
  await page.evaluate(() => switchView("fundamentals"));
  await createPortfolio(page, "Healthcare");
  const keys = await page.evaluate(() => themes().map((t) => t.key));
  expect(keys.length).toBe(2);

  // --- 3. names inside them, through the real search dialog
  await addTicker(page, keys[0], "NVDA");
  await addTicker(page, keys[0], "MSFT");
  await addTicker(page, keys[1], "ABBV");
  expect(await page.evaluate(() => membership().sort())).toEqual(["ABBV", "MSFT", "NVDA"]);

  // --- 4. fund it, with a figure that is NOT the default
  await page.evaluate(() => switchView("calc"));
  await page.waitForSelector("#initCapital");
  await page.fill("#initCapital", "50000");
  await page.click("#buildBtn");
  await page.waitForTimeout(600);
  const built = await page.evaluate(() => ({
    init: isInit(), invested: Math.round(totalContributed()),
    total: Math.round(curTotal()), versions: versions().length, head: head(),
  }));
  expect(built.init).toBe(true);
  expect(built.invested).toBe(50000);                 // the figure the user typed, not the default
  expect(Math.abs(built.total - 50000)).toBeLessThan(1);   // spent, not lost
  expect(built.versions).toBe(1);

  // --- 5. the book the user now sees agrees with the book that exists
  await page.evaluate(() => switchView("prices"));
  await page.waitForTimeout(200);
  const shown = await page.textContent("#ovValue");
  expect(shown.replace(/[^0-9]/g, "")).toBe(String(built.total));

  // --- 6. rebalance with new cash, through the real controls
  await page.evaluate(() => switchView("calc"));
  await page.waitForSelector("#addCash");
  await page.fill("#addCash", "10000");
  await page.waitForTimeout(250);
  await page.click("#applyBtn");
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    invested: Math.round(totalContributed()), total: Math.round(curTotal()),
    versions: versions().length, head: head(),
  }));
  expect(after.invested).toBe(60000);                  // 50,000 + 10,000, exactly
  expect(Math.abs(after.total - 60000)).toBeLessThan(1);
  expect(after.versions).toBe(2);

  // --- 7. undo, and the book must go back to precisely where it was
  await page.evaluate(() => switchView("history"));
  await page.waitForSelector(".hi3-row");
  await page.click('.hi3-acts [data-vaction="undo"]');
  await page.waitForTimeout(500);
  const undone = await page.evaluate(() => ({
    invested: Math.round(totalContributed()), total: Math.round(curTotal()), head: head(),
    versions: versions().length,
  }));
  expect(undone.invested).toBe(50000);
  expect(Math.abs(undone.total - built.total)).toBeLessThan(1);
  expect(undone.head).toBe(0);
  expect(undone.versions).toBe(2);                     // undo moves head, it never truncates

  // --- 8. and redo puts it back
  await page.click('.hi3-acts [data-vaction="redo"]');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => Math.round(totalContributed()))).toBe(60000);
});

test("a name added from Research reaches the book through a normal rebalance", async ({ page }) => {
  await freshAccount(page);
  await page.evaluate(() => switchView("fundamentals"));
  await createPortfolio(page, "AI");
  const key = await page.evaluate(() => themes()[0].key);
  await addTicker(page, key, "NVDA");

  await page.evaluate(() => switchView("calc"));
  await page.waitForSelector("#initCapital");
  await page.fill("#initCapital", "20000");
  await page.click("#buildBtn");
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => Object.keys(holdings()))).toEqual(["NVDA"]);

  // now find a name on Research and stage it into the portfolio
  await page.evaluate(() => switchView("screener"));
  await page.fill("#resQuery", "MSFT");
  await page.waitForSelector(".rs3-row");
  await page.click('.rs3-row [data-rsadd="MSFT"]');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (state.watchlist || []).map((w) => w.sym))).toContain("MSFT");

  await page.click('[data-wladd="MSFT"]');
  await page.waitForSelector("#swapModal");
  await page.click("#apGo");
  await page.waitForTimeout(600);

  /* Confirming does NOT trade - it stages the membership and leaves the plan on Rebalance. */
  expect(await page.evaluate(() => tickersOf(themes()[0].key).sort())).toEqual(["MSFT", "NVDA"]);
  expect(await page.evaluate(() => Object.keys(holdings()).sort())).toEqual(["NVDA"]);

  /* A user reaches Rebalance from Research by clicking the sub-tab. switchView("calc") would be
     redirected straight back to Research on purpose: E12 section 3 keeps the Trade lane on
     whichever half you were last on, and E5 established that staging a name must NOT yank you out
     of the tab you are working in. So drive the control a person actually uses. */
  await page.click('#subtabs button[data-sub="calc"]');
  await page.waitForSelector("#applyBtn");
  await page.fill("#addCash", "0");
  await page.waitForTimeout(250);
  await page.click("#applyBtn");
  await page.waitForTimeout(600);
  const end = await page.evaluate(() => ({
    held: Object.keys(holdings()).sort(),
    invested: Math.round(totalContributed()),
    total: Math.round(curTotal()),
  }));
  expect(end.held).toEqual(["MSFT", "NVDA"]);
  expect(end.invested).toBe(20000);                    // a realign adds no money
  expect(Math.abs(end.total - 20000)).toBeLessThan(1); // and loses none
});
