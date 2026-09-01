/* Nothing may throw, anywhere, on any screen.
 *
 * Every lane, every modal, both accounts. Three of this epic's worst bugs were silent: the scrub
 * called a deleted helper and threw on every mousemove; a stray </div> killed four lanes' event
 * handlers; a CSS pruner dropped live rules. Two of those three produced console noise nobody was
 * listening for. This listens.
 *
 * It fails on an uncaught exception, on console.error, and on a failed same-origin request.
 */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

/* Yahoo is not reachable from CI and is not what this measures, so a fetch to the proxy that fails
   is expected. Anything else that 4xx/5xx on our own origin is a real defect. */
const EXPECTED_NET = /\/api\/(quotes|fundamentals|statements|search|portfolio)/;

function collect(page) {
  const errs = [];
  page.on("pageerror", (e) => errs.push("UNCAUGHT: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    /* A failed fetch logs a console error of its own; the request listener already judges those. */
    if (/Failed to load resource|net::ERR|ERR_/.test(t)) return;
    errs.push("CONSOLE: " + t);
  });
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (EXPECTED_NET.test(u)) return;
    if (!u.includes("127.0.0.1") && !u.includes("localhost")) return;   // third parties are not ours
    errs.push("REQUEST FAILED: " + u + " (" + (r.failure() || {}).errorText + ")");
  });
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() < 400) return;
    if (EXPECTED_NET.test(u)) return;
    if (!u.includes("127.0.0.1") && !u.includes("localhost")) return;
    errs.push("HTTP " + r.status() + ": " + u);
  });
  return errs;
}

test("nothing throws on any screen of a populated account", async ({ page }) => {
  const errs = collect(page);
  await seedBook(page);
  await page.evaluate(() => { window.savePortfolio = async () => true; });

  // Overview: every range, the accordions, the live-prices block, the return-chart units
  for (const r of ["1D", "1W", "1M", "3M", "1Y", "ALL"]) {
    await page.evaluate((x) => document.querySelector(`#ovRange button[data-range="${x}"]`).click(), r);
  }
  await page.evaluate(() => { themes().forEach(t => toggleTheme(t.key)); toggleLive(); });
  /* E14 removed the %/$ switch - this chart is absolute dollars only. Exercise the range chips
     instead, which is the control that now changes what the benchmark draws. */
  await page.evaluate(() => { document.querySelector('[data-range="1M"]').click(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.querySelector('[data-range="ALL"]').click(); });
  await page.evaluate(() => { const b = document.querySelector("#ovEwToggle"); if (b) b.click(); });

  // the chart scrub, which threw on every mousemove for one commit
  const box = await page.locator("#ovChart").boundingBox();
  for (const f of [0.1, 0.4, 0.9]) {
    await page.mouse.move(box.x + box.width * f, box.y + box.height / 2);
  }
  await page.mouse.move(box.x + box.width / 2, box.y - 80);

  // Model: the accordions, a stepper, every policy chip, the catalog
  await page.evaluate(() => switchView("fundamentals"));
  await page.evaluate(() => themes().forEach(t => toggleFTheme(t.key)));
  await page.click('#wInputs button[data-wstep][data-d="1"]');
  await page.waitForTimeout(120);
  for (const v of ["ignore", "carry", "penalize"]) {
    await page.evaluate((x) => { const b = document.querySelector(`#wInputs button[data-pv="${x}"]`); if (b) b.click(); }, v);
    await page.waitForTimeout(90);
  }
  await page.click("#chooseMetricsBtn");
  await page.waitForSelector("#mpModal");
  await page.evaluate(() => closeModal());

  // Trade: all three modes and the cash steppers
  await page.evaluate(() => switchView("calc"));
  for (const m of ["cash", "realign", "full"]) {
    await page.evaluate((v) => document.querySelector(`[data-mode="${v}"]`).click(), m);
    await page.waitForTimeout(90);
  }
  await page.click("#cashUp"); await page.click("#cashDown");

  // Research: search, the result rows, the add-to-portfolio dialog
  await page.evaluate(() => {
    switchView("screener");
    window.dsSearch = async () => [{ symbol: "AMD", name: "AMD", exchange: "NMS", type: "EQUITY" }];
    window.dsQuotes = async (s) => { const o = {}; s.forEach(x => o[x] = { price: 1 }); return { quotes: o }; };
  });
  await page.fill("#resQuery", "amd");
  await page.waitForSelector(".rs3-row");
  await page.evaluate(() => document.querySelector("[data-wladd]").click());
  await page.waitForSelector("#swapModal");
  await page.evaluate(() => { const b = document.querySelector('#apHow [data-how="swap"]'); if (b) b.click(); });
  await page.evaluate(() => closeModal());

  // the stock panel and its tabs
  await page.evaluate(() => {
    state.statements.NVDA = { quarters: [1,2,3,4].map(i => ({ date: "2025-Q"+i, revenue: 1e9*i, ebitda: 2e8*i })) };
    openStockDetail("NVDA");
  });
  await page.waitForSelector(".sd-m");
  for (const i of [1, 2, 0]) {
    await page.evaluate((n) => { const t = document.querySelectorAll(".sd-tab")[n]; if (t) t.click(); }, i);
  }
  await page.keyboard.press("Escape");

  // History: select each checkpoint, undo, redo
  await page.evaluate(() => switchView("history"));
  await page.waitForSelector(".hi3-row");
  const rows = await page.locator(".hi3-row").count();
  for (let i = 0; i < rows; i++) await page.locator(".hi3-row").nth(i).click();
  await page.click('.hi3-acts [data-vaction="undo"]'); await page.waitForTimeout(200);
  await page.click('.hi3-acts [data-vaction="redo"]'); await page.waitForTimeout(200);

  // the guided tour, on every lane
  for (const v of ["prices", "fundamentals", "calc", "screener", "history"]) {
    await page.evaluate((x) => { switchView(x); coachStart(x, true); }, v);
    await page.waitForTimeout(220);
    await page.evaluate(() => coachEnd());
  }

  expect(errs).toEqual([]);
});

test("nothing throws on a brand-new account, on any lane", async ({ page }) => {
  const errs = collect(page);
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  await page.evaluate(() => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "u1", email: "x@y.z" } }));
    sbLoadSession(); appLocked = false; showGate(false);
    window.savePortfolio = async () => true;
    state.themes = []; state.themeTickers = {}; state.watchlist = [];
    state.portfolio = { holdings: {}, versions: [], head: -1 };
    rebuildThemeOf(); renderAll();
  });
  /* An empty account is where the empty branches live, and they are the least-walked code in the
     app - every "no checkpoints yet" / "no portfolios yet" path renders here. */
  for (const v of ["first", "prices", "fundamentals", "calc", "screener", "history"]) {
    await page.evaluate((x) => switchView(x), v);
    await page.waitForTimeout(140);
  }
  expect(errs).toEqual([]);
});

test("nothing throws on the sign-in gate, in any mode", async ({ page }) => {
  const errs = collect(page);
  await page.goto("/");
  await page.waitForFunction(() => typeof window.showGate === "function");
  /* setMode is module-scoped, not a global - drive the real controls, which is what a user does
     and what actually proves the modes work. */
  await page.click("#gateToggle");                     // sign in -> create an account
  await page.waitForTimeout(140);
  await page.click("#gateToggle");                     // and back
  await page.waitForTimeout(140);
  await page.click("#gateForgot");                     // -> password recovery
  await page.waitForTimeout(140);
  expect(errs).toEqual([]);
});
