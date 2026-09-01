/* E12.1 Overview. These assert what PAINTS, not what a property says: twice in this epic a probe
   read a property that was true while the element was invisible (the sub-tab row, the sort arrow),
   and the screenshot caught what the probe did not. */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const setRange = (page, r) => page.evaluate((r) => {
  document.querySelector(`#ovRange button[data-range="${r}"]`).click();
}, r);

test("the ALL-range hero return equals the All-time gain cell exactly", async ({ page }) => {
  await seedBook(page);
  await setRange(page, "ALL");
  const r = await page.evaluate(() => ({
    hero: document.querySelector("#ovSub .s-lead").textContent.trim(),
    cell: [...document.querySelectorAll(".ov3-cell")]
            .find(c => /All-time gain/i.test(c.textContent)).querySelector(".v").textContent.trim(),
  }));
  /* Spec 4.2: the period figure is a RETURN, not last-first. Over the whole history that return IS
     the all-time gain, so the two must agree to the dollar - they sit three sections apart on one
     screen, and it was reading -33.5% beside +28.5% before the missing-invested guard went in. */
  expect(r.hero).toContain(r.cell.replace("+", ""));
});

test("a window that lacks an invested figure prints no return rather than a wrong one", async ({ page }) => {
  await seedBook(page);
  const out = await page.evaluate(() => {
    const H = [{ label:"a", value:100000, invested:null }, { label:"b", value:190000, invested:148000 }];
    return ovPeriodReturn(H);
  });
  // reading the null as 0 books the entire starting value as period gain
  expect(out).toBeNull();
});

test("the invested reference line is drawn on ALL and hidden on 1D", async ({ page }) => {
  await seedBook(page);
  const dashed = () => page.evaluate(() =>
    [...document.querySelectorAll("#ovChart line")].filter(l => l.getAttribute("stroke-dasharray")).length);
  await setRange(page, "ALL");
  expect(await dashed()).toBeGreaterThan(0);
  await setRange(page, "1D");
  // on 1D the basis is the previous close, so an invested line would be measuring the wrong thing
  expect(await dashed()).toBe(0);
});

test("scrubbing the chart moves the marker and retargets the hero number", async ({ page }) => {
  await seedBook(page);
  await setRange(page, "ALL");
  const before = await page.textContent("#ovValue");
  const box = await page.locator("#ovChart").boundingBox();
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2);
  await page.waitForTimeout(500);   // the retarget eases over 420ms
  const r = await page.evaluate(() => ({
    value: document.querySelector("#ovValue").textContent,
    label: document.querySelector("#ovHeroLabel").textContent,
    rule:  document.querySelector("#ovScrubRule").getAttribute("visibility"),
    dot:   document.querySelector("#ovScrubDot").getAttribute("visibility"),
  }));
  /* This is the regression that shipped silently: the scrub called setHero(), a V2 helper deleted
     with the V2 hero, so every mousemove threw a ReferenceError and the chart looked inert. */
  expect(r.rule).toBe("visible");
  expect(r.dot).toBe("visible");
  expect(r.value).not.toBe(before);
  expect(r.label).not.toMatch(/TOTAL VALUE/);
  await page.mouse.move(box.x + box.width / 2, box.y - 60);
  await page.waitForTimeout(100);
  expect(await page.textContent("#ovValue")).toBe(before);       // mouseleave returns to live
  expect(await page.getAttribute("#ovScrubRule", "visibility")).toBe("hidden");
});

test("the holdings rows paint as one 6-column grid, not as stacked label pairs", async ({ page }) => {
  await seedBook(page);
  const r = await page.evaluate(() => {
    const row = document.querySelector(".ov3-hrow[data-thmtoggle]");
    const cs = getComputedStyle(row);
    return { cols: cs.gridTemplateColumns.split(" ").length,
             painted: !!row.offsetParent,
             kids: row.children.length };
  });
  expect(r.painted).toBe(true);
  expect(r.cols).toBe(6);
  expect(r.kids).toBe(6);
});

test("a portfolio expands to its names, and a name row opens the stock panel", async ({ page }) => {
  await seedBook(page);
  await page.click('.ov3-hrow[data-thmtoggle="ai"]');
  const names = page.locator('.thm[data-thmkey="ai"] .ov3-nrow[data-stock]');
  await expect(names.first()).toBeVisible();
  await names.first().click();
  // spec 4.6: the stock panel is reachable from every place a ticker appears, and this is one
  await expect(page.locator("#sdModal")).toBeVisible();
});

test("the LIVE PRICES block survives a price re-render once opened", async ({ page }) => {
  await seedBook(page);
  await page.click("#ovLiveToggle");
  await expect(page.locator("#priceBand")).toBeVisible();
  await page.evaluate(() => renderPrices());
  /* Open state is module state, not DOM state: a 60s refresh must never collapse what the user
     opened. This is the same trap the theme accordion hit in E5.1. */
  await expect(page.locator("#priceBand")).toBeVisible();
});

test("the day figure is measured against the open, not against the current total", async ({ page }) => {
  await seedBook(page);
  const r = await page.evaluate(() => {
    const dpl = dayPL(), open = dayOpenValue(), total = curTotal();
    const shown = document.querySelector("#ovSub .s-lead").textContent;
    return { dpl, open, total, shown };
  });
  expect(r.open).toBeCloseTo(r.total - r.dpl, 6);
  // dividing by the current total understates a gain and overstates a loss
  const want = (r.dpl / r.open * 100).toFixed(2);
  expect(r.shown.replace(/−/g, "-")).toContain(want);
});

test("Overview carries no donut, and the tour step that pointed at one has a target", async ({ page }) => {
  await seedBook(page);
  const r = await page.evaluate(() => ({
    donut: !!document.querySelector("#ovDonut, .ov-donut, .ov-donutwrap"),
    steps: (typeof TOUR === "object" ? Object.values(TOUR).flat() : [])
             .map(s => s && s.sel).filter(Boolean)
             .filter(sel => !document.querySelector(sel)),
  }));
  expect(r.donut).toBe(false);
  expect(r.steps).toEqual([]);   // a tour step whose anchor is gone is silently skipped
});

test("every control on this lane actually does something", async ({ page }) => {
  await seedBook(page);
  /* ALL HISTORY - UNDO -> rendered and invited a click while having no handler at all (spec 4.2
     item 6 says it switches to lane 4). Found by scanning for element ids nothing references.
     A control that does nothing is worse than a missing one: it teaches the user the app is broken. */
  await page.click("#ovAllHistory");
  await expect(page.locator("#view-history")).toBeVisible();
  expect(await page.evaluate(() => curView)).toBe("history");
});
