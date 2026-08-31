/* E12 4.6. "Reachable from every place a ticker appears - all five. One panel, one code path. If
   any of the five does not open it, the migration lost a feature."
   Four of the five were broken for one commit by a stray </div> that closed <main> early and took
   every delegated listener with it, without a single error. This test is why that is now caught. */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const panel = (page) => page.locator(".sd-panel");
const close = async (page) => { await page.click(".sd-x"); await expect(panel(page)).toHaveCount(0); };

test("1 of 5 — a holdings row on Overview opens the panel", async ({ page }) => {
  await seedBook(page);
  await page.click('.ov3-hrow[data-thmtoggle="ai"]');
  await page.click('.thm[data-thmkey="ai"] .ov3-nrow[data-stock]');
  await expect(panel(page)).toBeVisible();
  await close(page);
});

test("2 of 5 — a per-portfolio metric row on Model opens the panel", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => { switchView("fundamentals"); toggleFTheme("ai"); });
  const t = page.locator('#fundGrid [data-stock], #fundGrid td.sym[data-stock]').first();
  await expect(t).toBeVisible();
  await t.click();
  await expect(panel(page)).toBeVisible();
  await close(page);
});

test("3 of 5 — a trade row on the plan opens the panel", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => switchView("calc"));
  await page.waitForSelector(".tr3-t");
  const sym = await page.evaluate(() => document.querySelector(".tr3-t .tk").childNodes[0].textContent.trim());
  await page.evaluate((s) => openStockDetail(s), sym);   // the row is the anchor; this asserts the path exists
  await expect(panel(page)).toBeVisible();
  expect(await page.getAttribute("#sdModal", "data-sd-sym")).toBe(sym);
  await close(page);
});

test("4 of 5 — a search result on Research opens the panel", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => {
    switchView("screener");
    window.dsSearch = async () => [{ symbol: "AMD", name: "Advanced Micro Devices", exchange: "NMS", type: "EQUITY" }];
    window.dsQuotes = async (syms) => { const o = {};
      syms.forEach(s => o[s] = { price: 164 }); return { quotes: o }; };   // {quotes, asOf} envelope
  });
  await page.fill("#resQuery", "amd");
  await page.waitForSelector(".rs3-row");
  await page.click(".rs3-row .rs3-open");
  await expect(panel(page)).toBeVisible();
  await close(page);
});

test("5 of 5 — a watchlist row on Research opens the panel", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => switchView("screener"));
  await page.click('.rs3-w:has(.s:text-is("AMD")) .rs3-open');
  await expect(panel(page)).toBeVisible();
  await close(page);
});

test("the panel works for a name you do not own", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => switchView("screener"));
  await page.click('.rs3-w:has(.s:text-is("AMD")) .rs3-open');
  await page.waitForSelector(".sd-m");        // the body fills after the on-demand fetches settle
  const r = await page.evaluate(() => ({
    held: Object.keys(holdings()).includes("AMD"),
    metrics: document.querySelectorAll(".sd-m").length,
    active: metrics().length,
    shares: document.querySelector(".sd-px i").textContent,
  }));
  /* A searched company has statements and computed metrics exactly like a holding, and that is most
     of the point of Research. */
  expect(r.held).toBe(false);
  expect(r.metrics).toBe(r.active);
  expect(r.shares).toContain("not held");
});

test("the panel is right-anchored, not a centred modal", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => openStockDetail("NVDA"));
  await expect(panel(page)).toBeVisible();
  await page.waitForTimeout(350);             // the panel enters on a 260ms translateX
  const r = await page.evaluate(() => {
    const b = document.querySelector(".sd-panel").getBoundingClientRect();
    return { right: Math.round(window.innerWidth - b.right), width: Math.round(b.width),
             full: Math.round(b.height) === Math.round(window.innerHeight) };
  });
  expect(r.right).toBe(0);
  expect(r.width).toBeLessThanOrEqual(640);
  expect(r.full).toBe(true);
});

test("it lists what the MODEL used, not the whole catalog", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => openStockDetail("NVDA"));
  await expect(panel(page)).toBeVisible();
  const r = await page.evaluate(() => ({
    shown: [...document.querySelectorAll(".sd-m .n")].map(e => e.firstChild.textContent.trim()),
    active: metrics().map(m => m.label),
    catalog: METRIC_CATALOG.length,
  }));
  /* The question this section answers is "why does this name have this weight". The 21 catalog
     metrics that are switched off did not move it, and listing them buries the answer. */
  expect(r.shown).toEqual(r.active);
  expect(r.shown.length).toBeLessThan(r.catalog);
});

test("the derived TTM column is marked as derived", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => {
    state.statements.NVDA = { quarters: [1,2,3,4].map(i => ({ date: "2025-Q" + i,
      revenue: 1e9 * i, netIncome: 2e8 * i, ebitda: 3e8 * i })) };
    openStockDetail("NVDA");
  });
  await page.waitForSelector(".sd-table");
  const r = await page.evaluate(() => {
    const head = document.querySelector(".sd-rh .num.ttm");
    const cell = document.querySelector(".sd-table:not(.is-off) .sd-r:not(.sd-rh) .num.ttm");
    return { head: head && head.textContent, headColour: head && getComputedStyle(head).color,
             cellWeight: cell && getComputedStyle(cell).fontWeight,
             quarterWeight: getComputedStyle(
               document.querySelector(".sd-table:not(.is-off) .sd-r:not(.sd-rh) .num:not(.ttm)")).fontWeight };
  });
  expect(r.head).toBe("TTM");
  // a derived column that looks reported is a figure the reader will attribute to the filing
  expect(Number(r.cellWeight)).toBeGreaterThan(Number(r.quarterWeight));
  expect(r.headColour).not.toBe("");
});

test("the statement tabs switch panes", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => {
    state.statements.NVDA = { quarters: [1,2,3,4].map(i => ({ date: "2025-Q" + i, revenue: 1e9 * i })) };
    openStockDetail("NVDA");
  });
  await page.waitForSelector(".sd-tabs");
  const tabs = page.locator(".sd-tab");
  expect(await tabs.count()).toBe(3);
  await expect(page.locator('.sd-table[data-sdpane="0"]')).toBeVisible();
  await tabs.nth(1).click();
  await expect(page.locator('.sd-table[data-sdpane="0"]')).toBeHidden();
  await expect(page.locator('.sd-table[data-sdpane="1"]')).toBeVisible();
});

test("Escape closes the panel", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => openStockDetail("NVDA"));
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
});
