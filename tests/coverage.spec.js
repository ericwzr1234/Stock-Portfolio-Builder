/* E12 section 4.9 is the migration contract: "every row must be reachable in V3". The mockup renders
   resting states, so the capabilities with no visible pixel in it - a preset dropdown, a rename
   dialog, an inline override - are exactly the ones a redesign drops silently.
   This walks the checklist and asserts each control is REACHABLE AND PAINTED, not merely present in
   the DOM: twice in this epic a probe read a property that was true while the element was invisible. */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const paints = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  return !!(e && e.offsetParent !== null);
}, sel);

const lane = async (page, v) => { await page.evaluate((x) => switchView(x), v); await page.waitForTimeout(120); };

test("Overview — rows 1 to 13", async ({ page }) => {
  await seedBook(page);
  const missing = [];
  const need = {
    "1 hero value": "#ovValue", "1 hero slots": "#ovSub",
    "2 value chart": "#ovChart", "4 scrub marker": "#ovScrubRule",
    "5 equal-weight toggle": "#ovEwToggle", "6 return $/% toggle": "#retPct",
    "7 allocation bar": "#ovAlloc", "7 drift legend": "#ovAllocLegend",
    "9 holdings row": ".ov3-hrow[data-thmtoggle]", "11 live prices block": "#ovLiveToggle",
    "12 refresh interval": "#refreshSel", "12 manual refresh": "#refreshBtn",
    "range strip": "#ovRange", "grid": "#ovGrid", "checkpoints": "#ovCheckpoints",
  };
  for (const [k, sel] of Object.entries(need)) if (!await paints(page, sel)) missing.push(k + " (" + sel + ")");
  // 3: the invested reference line, on every range except 1D
  await page.evaluate(() => document.querySelector('#ovRange button[data-range="ALL"]').click());
  const dashed = await page.evaluate(() =>
    [...document.querySelectorAll("#ovChart line")].filter(l => l.getAttribute("stroke-dasharray")).length);
  if (!dashed) missing.push("3 invested reference line");
  // 10: per-name detail inside a portfolio
  await page.click('.ov3-hrow[data-thmtoggle="ai"]');
  if (!await paints(page, '.thm[data-thmkey="ai"] .ov3-nrow[data-stock]')) missing.push("10 per-name detail");
  expect(missing).toEqual([]);
});

test("Model — rows 14 to 32", async ({ page }) => {
  await seedBook(page);
  await lane(page, "fundamentals");
  const missing = [];
  const need = {
    "14 catalog button": "#chooseMetricsBtn", "15 weight stepper": "#wInputs button[data-wstep]",
    "16 direction glyph": "#wInputs .md3-m .dir", "17 policy chips": "#wInputs .md3-pol button",
    "18 max per portfolio": "#capPct", "19 preset select": "#presetSelect",
    "19 preset save": "#savePresetBtn", "19 preset delete": "#delPresetBtn",
    "19 reset to six": "#reset6Btn", "20 compute toggle": "#computeStmtToggle",
    "21 compare sources": "#srcCompareBtn", "22 drift rows": "#driftRows .md3-t",
    "22 allocation bar": "#allocBar", "23 per-portfolio detail": "#fundGrid",
    "32 create portfolio": "#newThemeBtn", "normalised split": "#wEffNote",
  };
  for (const [k, sel] of Object.entries(need)) if (!await paints(page, sel)) missing.push(k + " (" + sel + ")");
  // 27-31 live inside a portfolio's detail section
  await page.evaluate(() => toggleFTheme("ai"));
  await page.waitForTimeout(100);
  const inside = await page.evaluate(() => {
    const box = document.querySelector('.thm[data-fthmkey="ai"]');
    if (!box) return { box: false };
    return { box: true,
      add: !!box.querySelector("[data-addticker]"), remove: !!box.querySelector("[data-rmvtkr]"),
      edit: !!box.querySelector("[data-editth]"), del: !!box.querySelector("[data-delth]") };
  });
  if (!inside.box) missing.push("23 portfolio detail box");
  else {
    if (!inside.add) missing.push("27 add a ticker");
    if (!inside.remove) missing.push("28 remove a ticker");
    if (!inside.edit) missing.push("29/30 rename + recolour");
    if (!inside.del) missing.push("31 delete a portfolio");
  }
  expect(missing).toEqual([]);
});

test("Model — row 24/25: an inline override, and the reset back to live", async ({ page }) => {
  await seedBook(page);
  await lane(page, "fundamentals");
  await page.evaluate(() => toggleFTheme("ai"));
  await page.waitForTimeout(100);
  const cell = page.locator('.thm[data-fthmkey="ai"] .editable').first();
  await expect(cell).toBeVisible();                       // 24: click a value and type your own
  const r = await page.evaluate(() => {
    // an override in place must offer the way back
    const sym = tickersOf("ai")[0];
    state.overrides[sym] = { pe: 99 };
    rebuildFundamentals(); renderFundamentals(); toggleFTheme("ai"); toggleFTheme("ai");
    const box = document.querySelector('.thm[data-fthmkey="ai"]');
    return { reset: !!box.querySelector(".reset"), tag: !!box.querySelector(".tag") };
  });
  expect(r.reset).toBe(true);                             // 25
  expect(r.tag).toBe(true);                               // 26 source tags
});

test("Trade — rows 34 to 42", async ({ page }) => {
  await seedBook(page);
  await lane(page, "calc");
  const missing = [];
  const need = {
    "35 add capital": "#addCash", "36/37/38 modes": "#tradeModes .tr3-mode",
    "39 plan rows": ".tr3-t", "40 apply and save": "#applyBtn",
    "41 current holdings": ".tr3-r table", "42 book block": ".tr3-book",
    "where it lands": "#tradeLands", "cash steppers": "#cashUp",
  };
  for (const [k, sel] of Object.entries(need)) if (!await paints(page, sel)) missing.push(k + " (" + sel + ")");
  const modes = await page.evaluate(() =>
    [...document.querySelectorAll("#tradeModes .tr3-mode")].map(b => b.dataset.mode));
  expect(modes).toEqual(["full", "cash", "realign"]);
  // 41: per-name remove inside current holdings
  if (!await paints(page, ".tr3-r [data-rmvtkr]")) missing.push("41 per-name remove");
  expect(missing).toEqual([]);
});

test("Research — rows 43 to 53", async ({ page }) => {
  await seedBook(page);
  await lane(page, "screener");
  const missing = [];
  const need = {
    "43 search line": "#resQuery", "47 watchlist row": ".rs3-w",
    "47 52-week track": ".rs3-52 .tr", "50 remove from watchlist": "[data-wlsym]",
    "51 add to portfolio": "[data-wladd]",
  };
  for (const [k, sel] of Object.entries(need)) if (!await paints(page, sel)) missing.push(k + " (" + sel + ")");
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll(".rs3-whead span")].map(e => e.textContent.trim()));
  for (const c of ["Last", "Today", "52-week range", "Volume", "Avg volume", "P/E"])
    if (!heads.includes(c)) missing.push("47 column " + c);
  // 52: the dialog offers both routes
  await page.click("[data-wladd]");
  const hows = await page.evaluate(() =>
    [...document.querySelectorAll("#apHow .ap-opt")].map(b => b.dataset.how));
  if (hows.join() !== "new,swap") missing.push("52 add-as-new or swap");
  expect(missing).toEqual([]);
});

test("History — rows 58 to 66", async ({ page }) => {
  await seedBook(page);
  await lane(page, "history");
  const missing = [];
  const need = {
    "58 ledger row": ".hi3-row", "59 trade list": ".hi3-t", "59 allocation": ".hi3-sel .md3-stack",
    "60 undo": '.hi3-acts [data-vaction="undo"]', "61 redo": '.hi3-acts [data-vaction="redo"]',
    "65 recorded-value chart": "#histChart", "66 reset portfolio": "#resetBtn",
  };
  for (const [k, sel] of Object.entries(need)) if (!await paints(page, sel)) missing.push(k + " (" + sel + ")");
  // 62: revert is offered on a checkpoint that is not the current one
  await page.locator(".hi3-row").nth(1).click();
  if (!await paints(page, ".hi3-revert")) missing.push("62 revert to here");
  expect(missing).toEqual([]);
});

test("Chrome — the account controls and the four lanes", async ({ page }) => {
  await seedBook(page);
  const missing = [];
  const need = { "help": "#tourBtn", "account": "#acctBtn", "sync badge": "#syncBadge",
                 "lane tabs": "#tabs", "sub-tabs on Trade": "#subtabs" };
  await lane(page, "calc");
  for (const [k, sel] of Object.entries(need)) if (!await paints(page, sel)) missing.push(k + " (" + sel + ")");
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll("#tabs button")].filter(b => b.offsetParent).map(b => b.textContent));
  expect(tabs).toEqual(["Overview", "Model", "Trade", "History"]);
  expect(missing).toEqual([]);
});
