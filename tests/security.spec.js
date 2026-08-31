/* E6.7 — output escaping.
 *
 * WHY THIS EXISTS. Before the fix, a theme name of <img src=x onerror=...> executed SEVEN times
 * per render, and the Supabase session token sits in localStorage where any injected script can
 * read it. The app had no escaping helper at all; 49 template interpolations dropped free text
 * straight into innerHTML.
 *
 * Two things must hold together, and testing only one of them is how escaping bugs ship:
 *   1. hostile markup must NOT execute, and
 *   2. ordinary names containing & " ' < > must still READ BACK EXACTLY — an over-eager or
 *      double-applied escape shows users "Robotics &amp; AI", which is a real defect too.
 */
const { test, expect } = require("@playwright/test");

const PAYLOAD = '<img src=x onerror="window.__PWNED=(window.__PWNED||0)+1">';

async function boot(page, mutate) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  await page.evaluate((src) => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "u1", email: "x@y.z" } }));
    sbLoadSession(); appLocked = false; showGate(false);
    /* THE REAL STATE KEYS. This fixture wrote state.membership, state.data, state.holdings and
       state.cash - none of which the app has ever read; it reads state.themeTickers, state.quotes,
       state.fundamentals and state.portfolio.holdings. So the hostile COMPANY NAME and hostile
       SYMBOL never reached the DOM at all, and those two tests passed without exercising a single
       escape. Both cover data that arrives from Yahoo, which is the least trusted input the app
       has. Found 2026-08-31, the same defect that was in the firstrun fixture. */
    state.themes = [{ key: "t1", name: "Robotics", color: "#3aa" }];
    state.themeTickers = { t1: ["AAA"] };
    state.quotes = { AAA: { price: 10, prevClose: 9, change: 1, changePct: 11.1, name: "Acme",
                            marketCap: 1e11, marketState: "REGULAR",
                            low52: 5, high52: 15, vol: 1e6, avgVol: 2e6 } };
    state.fundamentals = { AAA: { name: "Acme", price: 10, marketCap: 1e11, peg: 1, ev: 10,
                                  dfcf: 10, pe: 10 } };
    state.pulled = {}; state.statements = {}; state.overrides = {};
    state.watchlist = [{ sym: "AAA" }];
    state.portfolio = { createdAt: "2024-01-02", totalContributed: 1000,
      holdings: { AAA: { shares: 100, costBasis: 900 } }, head: 0,
      versions: [{ id: 1, date: "2024-01-02", type: "INITIAL", mode: "full", cashIn: 1000,
                   valueBefore: 0, valueAfter: 1000, alloc: { t1: 1 },
                   trades: [{ sym: "AAA", shares: 100, price: 9, amount: 900 }],
                   snapshot: { holdings: { AAA: { shares: 100, costBasis: 900 } },
                               totalContributed: 1000 } }] };
    (0, eval)("(" + src + ")")();
    rebuildThemeOf();
    try {
      renderAll();
      ["calc", "prices", "fundamentals", "screener", "history"].forEach(switchView);
      /* V3 surfaces that render only on demand. Every one of them interpolates a name or a symbol,
         so leaving them out would repeat exactly the mistake this fixture already made. */
      themes().forEach(t => { toggleTheme(t.key); toggleFTheme(t.key); });
      if (typeof toggleLive === "function") toggleLive();
      renderAll();
      openStockDetail("AAA");
      renderHistory();
      document.querySelectorAll(".hi3-row").forEach(r => r.click());
    } catch (e) { /* a render throw is caught by the assertions below, not hidden */ }
  }, mutate.toString());
  await page.waitForTimeout(400);
}
const fired = (page) => page.evaluate(() => window.__PWNED || 0);

test("a hostile THEME NAME does not execute", async ({ page }) => {
  await boot(page, () => { state.themes[0].name = "Robotics" + '<img src=x onerror="window.__PWNED=(window.__PWNED||0)+1">'; });
  expect(await fired(page)).toBe(0);
});

test("a hostile COMPANY NAME from the proxy does not execute", async ({ page }) => {
  await boot(page, () => { state.quotes.AAA.name = state.fundamentals.AAA.name = "Acme " + '<img src=x onerror="window.__PWNED=(window.__PWNED||0)+1">'; });
  expect(await fired(page)).toBe(0);
});

test("a hostile SYMBOL from search or the ticker directory does not execute", async ({ page }) => {
  await boot(page, () => {
    const P = '<img src=x onerror="window.__PWNED=(window.__PWNED||0)+1">';
    state.quotes[P] = Object.assign({}, state.quotes.AAA);
    state.fundamentals[P] = Object.assign({}, state.fundamentals.AAA);
    state.themeTickers.t1.push(P);
    state.portfolio.holdings[P] = { shares: 10, costBasis: 90 };
  });
  expect(await fired(page)).toBe(0);
});

test("ordinary names with & and quotes read back exactly, and nothing is double-escaped", async ({ page }) => {
  await boot(page, () => {
    state.themes[0].name = "Robotics & AI";
    state.quotes.AAA.name = state.fundamentals.AAA.name = "AT&T Inc.";
  });
  const r = await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let stray = 0;
    for (let n; (n = w.nextNode());)
      if (n.parentElement.tagName !== "SCRIPT" && /&(amp|lt|gt|quot|#39);/.test(n.nodeValue)) stray++;
    return { reads: document.body.textContent.includes("Robotics & AI"), stray };
  });
  expect(r.reads).toBe(true);      // not "Robotics &amp; AI"
  expect(r.stray).toBe(0);
});

test("esc() escapes every character that can break out of markup", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.esc === "function");
  expect(await page.evaluate(() => esc(`<a href="x" title='y'>&</a>`)))
    .toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  // & must be escaped FIRST, or the & it introduces would be escaped again
  expect(await page.evaluate(() => esc("&lt;"))).toBe("&amp;lt;");
  expect(await page.evaluate(() => esc(null))).toBe("");
});

/* THE GUARD THAT SHOULD HAVE EXISTED.
 *
 * Every test above is worthless if the hostile value never reaches the DOM. That is exactly how
 * two of them passed for weeks: the fixture wrote state.membership / state.data / state.holdings,
 * keys this app has never read, so the payload was never rendered and nothing was ever escaped.
 * "No payload fired" and "no payload was present" are indistinguishable from the outside.
 *
 * This asserts the setup is real: the hostile string must be PRESENT in the markup, and present
 * only in its escaped form. If a future fixture drifts onto a dead key again, this fails loudly
 * instead of going quietly green.
 */
test("the hostile fixture actually reaches the DOM — these tests are not vacuous", async ({ page }) => {
  await boot(page, () => {
    state.themes[0].name = "Robotics" + '<img src=x onerror="window.__PWNED=(window.__PWNED||0)+1">';
    state.quotes.AAA.name = state.fundamentals.AAA.name = "Acme " + '<img src=x onerror="window.__PWNED=1">';
    const P = '<img src=x onerror="window.__PWNED=1">';
    state.quotes[P] = Object.assign({}, state.quotes.AAA);
    state.fundamentals[P] = Object.assign({}, state.fundamentals.AAA);
    state.themeTickers.t1.push(P);
    state.portfolio.holdings[P] = { shares: 10, costBasis: 90 };
  });
  const r = await page.evaluate(() => {
    const html = document.body.innerHTML;
    return {
      escapedPresent: html.includes("&lt;img src=x"),   // the payload is rendered, safely
      liveImgs: document.querySelectorAll('img[src="x"]').length,
      fired: window.__PWNED || 0,
    };
  });
  expect(r.escapedPresent).toBe(true);   // if this is false the fixture is writing keys nobody reads
  expect(r.liveImgs).toBe(0);            // and it is present as TEXT, never as an element
  expect(r.fired).toBe(0);
});
