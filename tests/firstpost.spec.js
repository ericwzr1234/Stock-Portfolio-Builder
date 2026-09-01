/* E12.6 First run - "the one poster moment the design system allows".
   The judgement worth holding: it is where a new account LANDS, not somewhere it is held. The
   guided tours behind the four lanes are what teach a new user how this app works, and the Model
   tour - the one that says "start with a portfolio" - is the most useful thing in the app for
   exactly the person this screen addresses. An earlier version of this card routed every
   navigation back to the poster and made that tour unreachable. */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

async function emptyAccount(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  await page.evaluate(() => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "u1", email: "x@y.z" } }));
    sbLoadSession(); appLocked = false; showGate(false);
    state.themes = []; state.themeTickers = {}; state.watchlist = [];
    state.portfolio = { holdings: {}, versions: [], head: -1 };
    renderAll();
  });
}

test("a brand-new account lands on the poster", async ({ page }) => {
  await emptyAccount(page);
  await expect(page.locator("#view-first")).toBeVisible();
  const r = await page.evaluate(() => ({ first: isFirstRun(), view: curView }));
  expect(r.first).toBe(true);
  expect(r.view).toBe("first");
});

test("but it does not trap them — every lane stays reachable", async ({ page }) => {
  await emptyAccount(page);
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll("#tabs button")].filter(b => b.offsetParent).map(b => b.dataset.view));
  /* Four lanes, and all four live. Section 3 caps the count at four - the most a phone tab bar
     holds without a More item - so the poster does not get a tab of its own either. */
  expect(tabs).toEqual(["prices", "fundamentals", "calc", "history"]);
  await page.click('#tabs button[data-view="fundamentals"]');
  await expect(page.locator("#view-fundamentals")).toBeVisible();
  expect(await page.evaluate(() => curView)).toBe("fundamentals");
});

test("the poster offers the button that can actually work", async ({ page }) => {
  await emptyAccount(page);
  /* With no portfolios there is nothing to spend capital on, and Build would answer "add some
     tickers first" - a button that cannot work is worse than no button. */
  await expect(page.locator("#frCreate")).toBeVisible();
  expect(await page.locator("#buildBtn").count()).toBe(0);
  expect(await page.locator("#initCapital").count()).toBe(0);
});

test("the poster never carries the funding controls - they live on Trade, once", async ({ page }) => {
  await emptyAccount(page);
  await page.evaluate(() => {
    state.themes = [{ key: "t", name: "Thesis", color: "#2f9e8f" }];
    state.themeTickers = { t: ["X"] };
    state.quotes = { X: { price: 10, prevClose: 10, marketCap: 1e11, marketState: "REGULAR" } };
    state.fundamentals = { X: { peg: 1, ev: 10, dfcf: 10, pe: 10, marketCap: 1e11 } };
    rebuildThemeOf(); renderAll();
  });
  /* This replaced a test asserting the poster shows a capital field "once a portfolio has names".
     That branch was unreachable by construction - isFirstRun() requires zero portfolios, and zero
     portfolios means zero names - and worse, rendering it put #initCapital and #buildBtn into the
     DOM a SECOND time alongside Trade's. $("#x") returns the first, #view-first precedes
     #view-calc, so a user typing 50,000 on Trade got a book funded with the hidden poster's
     80,000. One funding surface, one pair of ids. */
  const n = await page.evaluate(() => ({
    cap: document.querySelectorAll("#initCapital").length,
    build: document.querySelectorAll("#buildBtn").length,
    inPoster: !!document.querySelector("#view-first #initCapital"),
  }));
  expect(n.cap).toBe(1);
  expect(n.build).toBe(1);
  expect(n.inPoster).toBe(false);
});

test("the starting capital the user types is the capital that gets built", async ({ page }) => {
  await emptyAccount(page);
  await page.evaluate(() => {
    window.savePortfolio = async () => true;
    state.themes = [{ key: "t", name: "Thesis", color: "#2f9e8f" }];
    state.themeTickers = { t: ["X"] };
    state.quotes = { X: { price: 100, prevClose: 99, marketCap: 1e11, marketState: "REGULAR" } };
    state.fundamentals = { X: { peg: 1, ev: 10, dfcf: 10, pe: 10, marketCap: 1e11 } };
    rebuildThemeOf(); renderAll(); switchView("calc");
  });
  await page.waitForTimeout(150);
  await page.fill("#initCapital", "50000");
  await page.click("#buildBtn");
  await page.waitForTimeout(500);
  /* The defect this guards: 50,000 typed, 80,000 built. Money mis-stated at the most consequential
     action in the app, silently, because a hidden duplicate won the id lookup. */
  const r = await page.evaluate(() => ({ init: isInit(), contributed: Math.round(totalContributed()) }));
  expect(r.init).toBe(true);
  expect(r.contributed).toBe(50000);
});

test("the poster stops applying the moment there is a book, and moves you along", async ({ page }) => {
  await emptyAccount(page);
  expect(await page.evaluate(() => curView)).toBe("first");
  await page.evaluate(() => {
    state.themes = [{ key: "t", name: "Thesis", color: "#2f9e8f" }];
    state.themeTickers = { t: ["X"] };
    rebuildThemeOf(); renderAll();
  });
  // derived from state, never stored, so it can never get out of step with the account
  expect(await page.evaluate(() => isFirstRun())).toBe(false);
  expect(await page.evaluate(() => curView)).not.toBe("first");
});

test("an account that already has a book never sees the poster", async ({ page }) => {
  await seedBook(page);
  const r = await page.evaluate(() => ({ first: isFirstRun(), view: curView,
    painted: !!document.getElementById("view-first").offsetParent }));
  expect(r.first).toBe(false);
  expect(r.view).toBe("prices");
  expect(r.painted).toBe(false);
});

test("the poster drops the chrome that would be lying", async ({ page }) => {
  await emptyAccount(page);
  const r = await page.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!(e && e.offsetParent); };
    return { kpis: vis("ctxKpis"), refresh: vis("refreshBtn"), mkt: vis("mktLabel"),
             help: vis("tourBtn"), brand: !!document.querySelector(".brand").offsetParent };
  });
  /* A context bar restating a zero total, and a Refresh offering to update prices for a book with
     no names in it, are both the screen claiming something it cannot mean. */
  expect(r.kpis).toBe(false);
  expect(r.refresh).toBe(false);
  expect(r.mkt).toBe(false);
  expect(r.help).toBe(true);            // but the way to ask for help stays
  expect(r.brand).toBe(true);
});

test("the three steps say what the app actually does", async ({ page }) => {
  await emptyAccount(page);
  const steps = await page.evaluate(() =>
    [...document.querySelectorAll(".fr3-step")].map(s => ({
      n: s.querySelector("b").textContent, h: s.querySelector("h2").textContent })));
  expect(steps.map(s => s.n)).toEqual(["1", "2", "3"]);
  expect(steps[0].h).toBe("Build your portfolios");
  // E8: there are no default portfolios, and the poster must not imply otherwise
  const copy = await page.textContent(".fr3-step p");
  expect(copy).toContain("no default portfolios");
});
