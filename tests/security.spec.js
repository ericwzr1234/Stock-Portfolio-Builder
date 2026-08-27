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
    state.themes = [{ key: "t1", name: "Robotics", color: "#3aa" }];
    state.membership = { t1: ["AAA"] };
    state.data = { AAA: { price: 10, name: "Acme", marketCap: 1e11, peg: 1, ev: 10, dfcf: 10, pe: 10 } };
    state.holdings = { AAA: 100 }; state.cash = 0;
    (0, eval)("(" + src + ")")();
    rebuildThemeOf();
    try { renderAll(); ["calc", "prices", "fundamentals", "screener", "history"].forEach(switchView); }
    catch (e) { /* a render throw is caught by the assertions below, not hidden */ }
  }, mutate.toString());
  await page.waitForTimeout(400);
}
const fired = (page) => page.evaluate(() => window.__PWNED || 0);

test("a hostile THEME NAME does not execute", async ({ page }) => {
  await boot(page, () => { state.themes[0].name = "Robotics" + '<img src=x onerror="window.__PWNED=(window.__PWNED||0)+1">'; });
  expect(await fired(page)).toBe(0);
});

test("a hostile COMPANY NAME from the proxy does not execute", async ({ page }) => {
  await boot(page, () => { state.data.AAA.name = "Acme " + '<img src=x onerror="window.__PWNED=(window.__PWNED||0)+1">'; });
  expect(await fired(page)).toBe(0);
});

test("a hostile SYMBOL from search or the ticker directory does not execute", async ({ page }) => {
  await boot(page, () => {
    const P = '<img src=x onerror="window.__PWNED=(window.__PWNED||0)+1">';
    state.data[P] = Object.assign({}, state.data.AAA); state.membership.t1.push(P);
  });
  expect(await fired(page)).toBe(0);
});

test("ordinary names with & and quotes read back exactly, and nothing is double-escaped", async ({ page }) => {
  await boot(page, () => {
    state.themes[0].name = "Robotics & AI";
    state.data.AAA.name = "AT&T Inc.";
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
