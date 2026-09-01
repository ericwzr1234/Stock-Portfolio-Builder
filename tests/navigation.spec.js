/* Editing a portfolio must not move you off the tab you are editing on.
 *
 * USER-FOUND 2026-08-27: adding a ticker to an existing portfolio jumped straight to Rebalance,
 * mid-edit, before the user had finished adding names. The refresh had been implemented AS a
 * navigation - switchView("calc") - and then also scrolled to the plan and toasted "review the
 * plan, then Apply". Three yanks out of an unfinished edit.
 *
 * Keeping Rebalance CURRENT is the real goal and needs no navigation: renderAll() repaints hidden
 * views too, so the plan is right whenever the user chooses to go and look.
 */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

async function bookWithThemes(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.setMembership === "function");
  await page.evaluate(() => {
    state.themes = [{ key: "a", name: "Alpha", color: "#111" }, { key: "b", name: "Beta", color: "#222" }];
    state.themeTickers = { a: ["A1", "A2"], b: ["B1"] };
    state.quotes = {}; state.fundamentals = {};
    ["A1", "A2", "A3", "B1"].forEach((s, i) => {
      state.quotes[s] = { price: 10 + i, marketCap: 1e11, marketState: "REGULAR", quoteType: "EQUITY" };
      state.fundamentals[s] = { peg: 1 + i * 0.3, ev: 10 + i, dfcf: 10, pe: 20, marketCap: 1e11 };
    });
    state.overrides = {}; state.metrics = null; state.metricCfg = null; state.watchlist = []; state.cap = null;
    state.weights = Object.assign({}, DEFAULT_CONFIG.weights);
    state.penalty = Object.assign({}, DEFAULT_CONFIG.penalty);
    // an INITIALISED book - this is the branch that used to navigate
    state.portfolio = { holdings: { A1: { shares: 10 }, A2: { shares: 5 }, B1: { shares: 3 } },
                        totalContributed: 1000, versions: [], head: -1, revision: 1 };
    state.baseRevision = 1; state.syncStatus = "cloud"; state.cloudRowExists = true;
    appLocked = false; showGate(false);
    rebuildThemeOf(); renderAll();
    switchView("fundamentals");                    // the user is editing on Model
  });
  await page.waitForTimeout(200);
}

test("adding a ticker leaves you on the tab you were editing", async ({ page }) => {
  await bookWithThemes(page);
  expect(await page.evaluate(() => curView)).toBe("fundamentals");
  await page.evaluate(() => setMembership("a", ["A1", "A2", "A3"], null, "Added A3"));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => curView)).toBe("fundamentals");   // THE BUG: this became "calc"
});

test("removing a ticker also leaves you where you are", async ({ page }) => {
  await bookWithThemes(page);
  await page.evaluate(() => setMembership("a", ["A1"], null, "Removed A2"));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => curView)).toBe("fundamentals");
});

test("Rebalance is still brought up to date, just not jumped to", async ({ page }) => {
  await bookWithThemes(page);
  const r = await page.evaluate(async () => {
    await setMembership("a", ["A1", "A2", "A3"], null, "Added A3");
    return { view: curView, planCoversNewName: !!(lastPlan && lastPlan.target && "A3" in lastPlan.target) };
  });
  expect(r.view).toBe("fundamentals");     // did not move
  expect(r.planCoversNewName).toBe(true);  // but the plan already knows about the new name
});

test("creating a portfolio does not navigate either", async ({ page }) => {
  await bookWithThemes(page);
  await page.evaluate(() => createTheme("Gamma", "#333"));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => curView)).toBe("fundamentals");
});

/* USER-FOUND CLASS 2026-09-01, by walking the whole journey through real controls.
 *
 * switchView began with a guard whose intent was "clicking the Trade LANE returns you to whichever
 * half of Trade you were last on". It achieved the opposite twice over, because switchView cannot
 * tell a lane click from a sub-tab click - both arrive as the string "calc":
 *   - the Rebalance SUB-TAB was dead from Research; clicking it left you on Research, every time,
 *     so the only way back was to leave for another lane and return;
 *   - and the lane tab did NOT return you to Research from elsewhere, because the guard required
 *     you to already be there.
 */
test("the Rebalance sub-tab works from Research, and the lane tab remembers where you were", async ({ page }) => {
  await seedBook(page);
  const at = () => page.evaluate(() => curView);

  await page.click('#tabs button[data-view="calc"]');
  expect(await at()).toBe("calc");

  await page.click('#subtabs button[data-sub="screener"]');
  expect(await at()).toBe("screener");

  // the sub-tab says exactly where to go, and is obeyed
  await page.click('#subtabs button[data-sub="calc"]');
  expect(await at()).toBe("calc");

  // the LANE tab is the one that remembers
  await page.click('#subtabs button[data-sub="screener"]');
  await page.click('#tabs button[data-view="history"]');
  expect(await at()).toBe("history");
  await page.click('#tabs button[data-view="calc"]');
  expect(await at()).toBe("screener");

  // ...and having gone back to Rebalance, that is what it remembers next time
  await page.click('#subtabs button[data-sub="calc"]');
  await page.click('#tabs button[data-view="prices"]');
  await page.click('#tabs button[data-view="calc"]');
  expect(await at()).toBe("calc");
});
