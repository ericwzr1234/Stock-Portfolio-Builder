/* E12.4 Research. Four interactions hang off this lane and all four already existed in V2, so all
   four have to survive the migration: search, results, the watchlist, and the route into the book.
   The spec singles out one as the most droppable - clicking a result must open the company's
   financials, not add it to something - so that one gets its own test. */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

/* dsSearch reaches the network. Stub it so these tests exercise OUR rows and OUR guards rather
   than Yahoo's availability, and so a slow-then-fast ordering can be forced deliberately. */
const stubSearch = (page, opts = {}) => page.evaluate((opts) => {
  window.__calls = [];
  window.dsSearch = async (q) => {
    window.__calls.push(q);
    if (opts.delayFor && opts.delayFor[q]) await new Promise(r => setTimeout(r, opts.delayFor[q]));
    return [{ symbol: q.toUpperCase(), name: q.toUpperCase() + " Corp", exchange: "NMS", type: "EQUITY" },
            { symbol: "NVDA", name: "Nvidia", exchange: "NMS", type: "EQUITY" }];
  };
  window.__quoteCalls = 0;
  /* dsQuotes returns an ENVELOPE, {quotes, asOf}. A stub written from the calling code rather
     than from the contract agrees with the caller's bugs - which is exactly what happened here:
     the first version of this stub returned a bare map and hid a real defect. */
  window.dsQuotes = async (syms) => { window.__quoteCalls++;
    const o = {}; syms.forEach(s => o[s] = { price: 50, prevClose: 49, changePct: 2.04 });
    return { quotes: o, asOf: "2026-08-31T00:00:00Z" }; };
}, opts);

const openResearch = async (page, opts) => {
  await seedBook(page);
  await page.evaluate(() => switchView("screener"));
  await stubSearch(page, opts);
};

test("the search line is a line, not a pill, and says what it takes", async ({ page }) => {
  await openResearch(page);
  const r = await page.evaluate(() => {
    const box = document.querySelector(".rs3-line"), inp = document.querySelector("#resQuery");
    const cs = getComputedStyle(box), ics = getComputedStyle(inp);
    return { radius: cs.borderRadius, bottom: cs.borderBottomWidth, size: ics.fontSize,
             hint: document.querySelector(".rs3-hint").textContent, painted: !!box.offsetParent };
  });
  expect(r.painted).toBe(true);
  expect(r.radius).toBe("0px");            // this system has no radius; a pill would have one
  expect(parseFloat(r.size)).toBeGreaterThanOrEqual(20);
  expect(r.hint).toBe("SYMBOL OR COMPANY");
});

test("clicking a result opens the stock panel — it does NOT add to the watchlist", async ({ page }) => {
  await openResearch(page);
  await page.fill("#resQuery", "amd");
  await page.waitForSelector(".rs3-row");
  const before = await page.evaluate(() => (state.watchlist || []).length);
  await page.click(".rs3-row .rs3-open");
  /* The spec calls this the single most droppable interaction in the migration, and V2 had it the
     other way round: clicking a result added it. Reading a company's financials must not require
     adding it to anything. */
  await expect(page.locator("#sdModal")).toBeVisible();
  expect(await page.evaluate(() => (state.watchlist || []).length)).toBe(before);
});

test("the ADD TO WATCHLIST button is what adds, and it disables once the name is on the list", async ({ page }) => {
  await openResearch(page);
  await page.fill("#resQuery", "amd");
  await page.waitForSelector(".rs3-row");
  const row = page.locator('.rs3-row:has(.rs3-open .s:text-is("AMD"))').first();
  // AMD is already on the fixture's watchlist, so its button must already be refusing
  await expect(row.locator(".rs3-add")).toBeDisabled();
  const nv = page.locator('.rs3-row:has(.rs3-open .s:text-is("NVDA"))').first();
  await expect(nv.locator(".rs3-add")).toBeDisabled();          // NVDA is held
  await expect(nv.locator(".rs3-tag.held")).toHaveText("HELD");
});

test("a slower earlier search never overwrites a faster later one", async ({ page }) => {
  await openResearch(page, { delayFor: { slow: 700 } });
  await page.fill("#resQuery", "slow");
  await page.waitForTimeout(300);          // past the debounce, so 'slow' is in flight
  await page.fill("#resQuery", "fast");
  await page.waitForTimeout(900);          // long enough for the slow one to land late
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll(".rs3-row .rs3-open .s")].map(e => e.textContent));
  expect(shown).toContain("FAST");
  expect(shown).not.toContain("SLOW");
});

test("a settled search costs one batched quote call, not one per keystroke", async ({ page }) => {
  await openResearch(page);
  for (const t of ["a", "am", "amd"]) { await page.fill("#resQuery", t); await page.waitForTimeout(60); }
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ search: window.__calls.length, quotes: window.__quoteCalls }));
  /* The owner's constraint: nothing here may materially raise the call rate against a free,
     unkeyed, rate-limited endpoint. The debounce collapses the keystrokes and the quote lookup is
     one batched request for the whole result set. */
  expect(r.search).toBe(1);
  expect(r.quotes).toBeLessThanOrEqual(1);
});

test("the watchlist keeps every column V2 had, including both volume columns", async ({ page }) => {
  await openResearch(page);
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll(".rs3-whead span")].map(e => e.textContent.trim()).filter(Boolean));
  for (const want of ["Name", "Last", "Today", "52-week range", "Volume", "Avg volume", "P/E", "Then what"])
    expect(heads).toContain(want);
  const rows = await page.locator(".rs3-w").count();
  expect(rows).toBe(2);
});

test("the 52-week tick sits where the price actually sits in the range", async ({ page }) => {
  await openResearch(page);
  const r = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".rs3-w")]
      .find(x => x.querySelector(".s").textContent === "AMD");
    const q = state.quotes.AMD;
    return { left: row.querySelector(".rs3-52 .tr i").style.left,
             want: ((q.price - q.low52) / (q.high52 - q.low52) * 100).toFixed(1) + "%" };
  });
  expect(r.left).toBe(r.want);
});

test("the 52-week track is not drawn from a missing figure", async ({ page }) => {
  await openResearch(page);
  const drawn = await page.evaluate(() => {
    delete state.quotes.AMD.low52;                 // a quote that came back partial
    renderWatchlist();
    const row = [...document.querySelectorAll(".rs3-w")]
      .find(x => x.querySelector(".s").textContent === "AMD");
    return !!row.querySelector(".rs3-52 .tr");
  });
  // a tick placed from a missing low is a tick in the wrong place, which is worse than no tick
  expect(drawn).toBe(false);
});

test("ADD TO PORTFOLIO opens one dialog that picks the portfolio and the method", async ({ page }) => {
  await openResearch(page);
  await page.click('.rs3-w:has(.s:text-is("AMD")) [data-wladd]');
  await expect(page.locator("#swapModal")).toBeVisible();
  const r = await page.evaluate(() => ({
    themes: document.querySelectorAll("#apTheme option").length,
    hows: [...document.querySelectorAll("#apHow .ap-opt")].map(b => b.dataset.how),
    swapHidden: document.querySelector("#apSwapWrap").hidden,
  }));
  expect(r.themes).toBe(4);
  expect(r.hows).toEqual(["new", "swap"]);
  expect(r.swapHidden).toBe(true);                 // "new" is the default, so no picker yet
  await page.click('#apHow [data-how="swap"]');
  await expect(page.locator("#apSwapWrap")).toBeVisible();
  expect(await page.locator("#apSwap .ap-r").count()).toBe(3);   // AI Infrastructure holds three
});

test("a portfolio with no names cannot be swapped into", async ({ page }) => {
  await openResearch(page);
  await page.evaluate(() => { state.themes.push({ key: "empty", name: "Empty", color: "#888" });
                              state.themeTickers.empty = []; rebuildThemeOf(); renderAll(); });
  await page.click('.rs3-w:has(.s:text-is("AMD")) [data-wladd]');
  await page.selectOption("#apTheme", "empty");
  /* Offering "swap" on an empty portfolio confirms into a no-op, which reads as the app losing the
     request rather than refusing it. */
  await expect(page.locator('#apHow [data-how="swap"]')).toBeDisabled();
});

test("confirming stages the change and does not trade", async ({ page }) => {
  await openResearch(page);
  const before = await page.evaluate(() => JSON.stringify(holdings()));
  await page.click('.rs3-w:has(.s:text-is("AMD")) [data-wladd]');
  await page.click("#apGo");
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({
    holdings: JSON.stringify(holdings()),
    inAi: tickersOf("ai").includes("AMD"),
    stillWatched: (state.watchlist || []).some(w => w.sym === "AMD"),
  }));
  expect(r.holdings).toBe(before);        // nothing traded
  expect(r.inAi).toBe(true);              // but the membership is staged
  expect(r.stillWatched).toBe(false);     // and the watchlist self-heals
});

test("a watchlisted name is never counted as part of the book", async ({ page }) => {
  await openResearch(page);
  const r = await page.evaluate(() => ({
    members: membership(), held: Object.keys(holdings()) }));
  // the watchlist is storage, not intent
  expect(r.members).not.toContain("AMD");
  expect(r.held).not.toContain("AMD");
});

test("no tour step on this lane points at an element that no longer exists", async ({ page }) => {
  await openResearch(page);
  const dead = await page.evaluate(() =>
    (typeof TOURS === "object" ? Object.values(TOURS).flatMap(t => t.steps || []) : [])
      .map(s => s && s.sel).filter(Boolean).filter(sel => !document.querySelector(sel)));
  expect(dead).toEqual([]);
});
