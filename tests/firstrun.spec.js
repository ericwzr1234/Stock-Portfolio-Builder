/* What a brand-new invited account sees on the Overview.
 *
 * WHY THIS EXISTS. Now that people can be invited, the empty board is the first thing they meet,
 * and it told them two different things at once. The context bar correctly said "create a theme on
 * Model" until a theme existed; the Overview hero said "build a portfolio on the Rebalance tab"
 * unconditionally — and Rebalance, with no themes, only answers "build your themes first". Two
 * answers to one question, on one screen, pointing at different tabs.
 *
 * The fix was to give both callers ONE function, so the interesting assertion is not the wording
 * but that the two AGREE. It also collapses the empty drawing areas: a new account opened on about
 * 900px of blank cards, because an empty chart still reserved its full height.
 */
const { test, expect } = require("@playwright/test");

/* Signed in, with a CONFIRMED-empty account — not merely a page that has not loaded yet. */
async function newAccount(page, themes) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  await page.evaluate((t) => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "newuser", email: "invited@example.com" } }));
    sbLoadSession(); appLocked = false;
    state.cloudRowExists = false; state.syncStatus = "cloud";
    if (t) { state.themes = [{ key: "rob", name: "Robotics", color: "#2f9e8f" }];
             state.membership = { rob: ["AAA"] };
             state.data = { AAA: { price: 10, name: "Acme", marketCap: 1e11, peg: 1, ev: 10, dfcf: 10, pe: 10 } }; }
    rebuildThemeOf(); showGate(false); renderAll();
  }, themes);
  await page.waitForTimeout(300);
}

/* E12 4.2 split the hero into a label, a value, a slot row and a note. The first-step hint now
   lives in the note rather than in #ovSub, so read the whole hero band - the invariant is what the
   user is TOLD, not which element carries it. */
const hero = (page) => page.textContent(".ov3-hero");
const ctx  = (page) => page.textContent("#ctxKpis");

test("with no themes, the first step offered is Model — not Rebalance", async ({ page }) => {
  await newAccount(page, false);
  const h = await hero(page);
  expect(h).toContain("Model");
  expect(h).not.toContain("Rebalance");     // THE BUG: it used to say Rebalance here
});

test("once a theme exists, the first step becomes Rebalance", async ({ page }) => {
  await newAccount(page, true);
  expect(await hero(page)).toContain("Rebalance");
});

test("the Overview and the context bar never disagree about the first step", async ({ page }) => {
  for (const themes of [false, true]) {
    await newAccount(page, themes);
    const step = (await ctx(page)).includes("Model") ? "Model" : "Rebalance";
    expect(await hero(page)).toContain(step);   // one question, one answer
  }
});

test("a brand-new account is not shown tall empty cards", async ({ page }) => {
  await newAccount(page, false);
  const empties = await page.evaluate(() =>
    [...document.querySelector(".view.active").querySelectorAll(".card")]
      .filter(c => c.getBoundingClientRect().height > 120 &&
                   c.textContent.replace(/\s+/g, "").length < 50)
      .map(c => c.textContent.replace(/\s+/g, " ").trim().slice(0, 40)));
  expect(empties).toEqual([]);
});

test("a populated account still draws its charts — the collapse must not overreach", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  const r = await page.evaluate(() => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "u1", email: "x@y.z" } }));
    sbLoadSession(); appLocked = false; showGate(false);
    state.themes = [{ key: "rob", name: "Robotics", color: "#2f9e8f" }];
    /* The real state keys. This fixture used to write state.membership / state.data, which the app
       has never read - so "a populated account" was in fact an empty one, and the donut assertion
       it carried passed on a theme with no names in it. */
    state.themeTickers = { rob: ["AAA"] };
    state.quotes = { AAA: { price: 12, prevClose: 12, marketCap: 1e11, marketState: "REGULAR" } };
    state.fundamentals = { AAA: { peg: 1, ev: 10, dfcf: 10, pe: 10, marketCap: 1e11 } };
    rebuildThemeOf(); renderAll();
    /* The donut is deleted (E12 section 6). The allocation is now a stacked bar plus a drift
       legend, which is what actually answers "target against current". */
    const bar = document.querySelector("#ovAlloc");
    const leg = document.querySelector("#ovAllocLegend");
    return { segments: bar ? bar.children.length : 0,
             legendRows: leg ? leg.querySelectorAll(".ov3-al").length : 0 };
  });
  expect(r.segments).toBeGreaterThan(0);      // portfolios exist, so the bar has something to show
  expect(r.legendRows).toBeGreaterThan(0);
});

/* The Danger zone offers to clear "every holding and the whole checkpoint timeline". On a
   brand-new account that is both the most alarming thing on the screen and a no-op — there is
   nothing to clear. It should appear once there is something to lose, and not before.
   isInit() reads state.portfolio.holdings, NOT state.holdings — a fixture that sets the latter
   looks populated and is not, which is how I nearly recorded a false pass here. */
async function withDoc(page, portfolio) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  return page.evaluate((doc) => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "u1", email: "x@y.z" } }));
    sbLoadSession(); appLocked = false; showGate(false);
    state.portfolio = doc;
    renderAll(); switchView("history");
    /* E12 4.5 folded the danger-zone card into the three-button group; the invariant is the same
       (E7.4: never offer a destructive action that would do nothing) so this now asks whether the
       reset PAINTS, which is what the user can actually reach. */
    return { danger: !!document.getElementById("resetBtn").offsetParent,
             isInit: isInit(), versions: versions().length,
             histChartH: Math.round(document.getElementById("histChart").getBoundingClientRect().height) };
  }, portfolio);
}

test("a brand-new account is not offered a reset that would do nothing", async ({ page }) => {
  const r = await withDoc(page, { holdings: {}, versions: [], head: -1 });
  expect(r.isInit).toBe(false);
  expect(r.danger).toBe(false);
  expect(r.histChartH).toBe(0);          // and the empty chart does not reserve height
});

test("the reset appears as soon as there are holdings to clear", async ({ page }) => {
  const r = await withDoc(page, { holdings: { AAA: { shares: 100 } }, versions: [], head: -1 });
  expect(r.isInit).toBe(true);
  expect(r.danger).toBe(true);
});

test("with a checkpoint, the reset shows and the history chart draws", async ({ page }) => {
  const r = await withDoc(page, { holdings: { AAA: { shares: 100 } }, head: 0,
    versions: [{ id: 1, at: "2026-01-02T00:00:00Z", label: "build", valueAfter: 1200,
                 holdings: { AAA: { shares: 100 } } }] });
  expect(r.danger).toBe(true);
  expect(r.histChartH).toBeGreaterThan(0);
});
