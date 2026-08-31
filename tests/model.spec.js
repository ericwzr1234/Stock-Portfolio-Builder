/* E12.2 Model. The change worth defending is that a metric's exception policy lives in the
   metric's own row: V2 kept it in a second table, so answering one question about one metric meant
   holding two lists in your head. These tests hold that structure in place. */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const openModel = async (page) => {
  await seedBook(page);
  await page.evaluate(() => switchView("fundamentals"));
};

test("every metric row carries its own weight AND its own exception policy", async ({ page }) => {
  await openModel(page);
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#wInputs .md3-m")];
    return {
      count: rows.length,
      metrics: metrics().length,
      allHavePolicy: rows.every(x => x.querySelectorAll(".md3-pol button").length === 3),
      allHaveStepper: rows.every(x => x.querySelectorAll("button[data-wstep]").length === 2),
      allPainted: rows.every(x => !!x.offsetParent),
      // the separate policy table is gone, not merely hidden
      legacyTable: !!document.querySelector("#metricCfgRows, #driftTable"),
    };
  });
  expect(r.count).toBe(r.metrics);
  expect(r.allHavePolicy).toBe(true);
  expect(r.allHaveStepper).toBe(true);
  expect(r.allPainted).toBe(true);
  expect(r.legacyTable).toBe(false);
});

test("the stepper moves the weight and the printed split follows it", async ({ page }) => {
  await openModel(page);
  const read = () => page.evaluate(() => ({
    peg: state.weights[metrics()[0].weightKey],
    pc: document.querySelector('#wInputs .md3-m .pc').textContent,
    norm: document.querySelector("#wEffNote").textContent,
    bar: document.querySelector("#wInputs .md3-m .md3-wbar i").style.width,
  }));
  const before = await read();
  await page.click('#wInputs .md3-m button[data-wstep][data-d="1"]');
  const after = await read();
  expect(after.peg).toBeGreaterThan(before.peg);
  expect(after.pc).not.toBe(before.pc);
  expect(after.norm).not.toBe(before.norm);
  expect(after.bar).toBe(after.pc);          // the bar states the same share the number does
});

test("the stepper refuses the move that would zero the whole model", async ({ page }) => {
  await openModel(page);
  const survived = await page.evaluate(() => {
    metrics().forEach(m => state.weights[m.weightKey] = 0);
    state.weights[metrics()[0].weightKey] = 0.05;
    renderFundamentals();
    document.querySelector('#wInputs .md3-m button[data-wstep][data-d="-1"]').click();
    return metrics().reduce((a,m) => a + (state.weights[m.weightKey]||0), 0);
  });
  /* An all-zero model is a zero-sum book, and computeAllocation would fall back to equal weight
     while the screen still showed 0% everywhere - the numbers and the behaviour would disagree. */
  expect(survived).toBeGreaterThan(0);
});

test("clicking a policy chip changes that metric's policy and nothing else's", async ({ page }) => {
  await openModel(page);
  const r = await page.evaluate(async () => {
    const key = metrics()[0].key, other = metrics()[1].key;
    const beforeOther = effBadData(metrics()[1]);
    document.querySelector(`.md3-m[data-mrow="${key}"] button[data-pv="ignore"]`).click();
    await new Promise(r => setTimeout(r, 60));
    return { now: effBadData(metrics()[0]), other: effBadData(metrics()[1]), beforeOther,
             on: document.querySelector(`.md3-m[data-mrow="${key}"] button[data-pv="ignore"]`).classList.contains("on") };
  });
  expect(r.now).toBe("ignore");
  expect(r.other).toBe(r.beforeOther);
  expect(r.on).toBe(true);
});

test("the penalty field only appears where an artificial value means anything", async ({ page }) => {
  await openModel(page);
  const r = await page.evaluate(() => metrics().map(m => ({
    key: m.key, dir: m.direction, pol: effBadData(m),
    hasPen: !!document.querySelector(`.md3-m[data-mrow="${m.key}"] input[data-mpen]`),
  })));
  /* On a higher-is-better metric a bad reading is already the worst possible value, so there is
     nothing for a substitute value to do. */
  for (const m of r) expect(m.hasPen).toBe(m.pol === "penalize" && m.dir === "lower");
});

test("the cap sentence states the arithmetic the app actually performs", async ({ page }) => {
  await openModel(page);
  const r = await page.evaluate(() => ({
    say: document.querySelector("#mdCapSay").textContent,
    shown: Number(document.querySelector("#capPct").value),
    n: themes().length,
    real: Math.round(defaultCap() * 100),
  }));
  expect(r.shown).toBe(r.real);
  // 1/(n-1) is the owner's ceiling from E1.10; the spec's "1.5 / portfolios" predates it
  expect(r.say).toContain(`1 ÷ (${r.n} portfolios`);
  expect(Math.round(1 / (r.n - 1) * 100)).toBe(r.shown);
});

test("drift colours run green above target and red below, matching the sentence under them", async ({ page }) => {
  await openModel(page);
  const rows = await page.evaluate(() => [...document.querySelectorAll("#driftRows .md3-t")].map(x => {
    const d = x.querySelector(".num:last-child");
    return { txt: d.textContent, cls: d.className };
  }));
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    if (r.txt.startsWith("+")) expect(r.cls).toContain("up");
    if (r.txt.startsWith("−") || r.txt.startsWith("-")) expect(r.cls).toContain("down");
  }
});

test("the catalog opens as one grid of all 27 and toggling a row survives", async ({ page }) => {
  await openModel(page);
  await page.click("#chooseMetricsBtn");
  await expect(page.locator("#mpModal")).toBeVisible();
  const r = await page.evaluate(() => ({
    cells: document.querySelectorAll("#mpModal .mp-i").length,
    catalog: METRIC_CATALOG.length,
    cols: getComputedStyle(document.querySelector(".mp-grid")).gridTemplateColumns.split(" ").length,
    active: document.querySelectorAll("#mpModal .mp-i.on").length,
    label: document.querySelector("#mdCatCount").textContent,
  }));
  expect(r.cells).toBe(r.catalog);
  expect(r.cols).toBe(3);
  expect(r.active).toBe(6);
  expect(r.label).toBe(`6 OF ${r.catalog}`);
  const off = await page.evaluate(async () => {
    const b = [...document.querySelectorAll("#mpModal .mp-i:not(.on)")][0];
    b.click(); await new Promise(r => setTimeout(r, 80));
    return { on: b.classList.contains("on"), n: metrics().length };
  });
  expect(off.on).toBe(true);
  expect(off.n).toBe(7);
});

test("the catalog refuses to leave the model with no metrics at all", async ({ page }) => {
  await openModel(page);
  await page.click("#chooseMetricsBtn");
  const n = await page.evaluate(async () => {
    const on = [...document.querySelectorAll("#mpModal .mp-i.on")];
    for (const b of on) { b.click(); await new Promise(r => setTimeout(r, 40)); }
    return metrics().length;
  });
  expect(n).toBeGreaterThan(0);
});

test("compute-from-statements is a switch that states its own position", async ({ page }) => {
  await openModel(page);
  const t = page.locator("#computeStmtToggle");
  await expect(t).toHaveAttribute("aria-checked", "true");
  await t.click();
  await expect(t).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => state.computeFromStatements)).toBe(false);
  await t.click();
  await expect(t).toHaveAttribute("aria-checked", "true");
});

test("no tour step on this lane points at an element that no longer exists", async ({ page }) => {
  await openModel(page);
  const dead = await page.evaluate(() =>
    (typeof TOUR === "object" ? Object.values(TOUR).flat() : [])
      .map(s => s && s.sel).filter(Boolean).filter(sel => !document.querySelector(sel)));
  expect(dead).toEqual([]);
});
