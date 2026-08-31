/* E12.5 History. The ledger on the left, the recorded values and the selected checkpoint on the
   right. The load-bearing distinction is between what HAPPENED and what is merely REDOABLE: a
   future that has been undone is not a fact, and the screen must not draw it like one. */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const openHistory = async (page) => {
  await seedBook(page);
  /* undo/redo await savePortfolio, which reaches the network. These tests are about what the
     TIMELINE does, so stub the write - otherwise every click waits out the cloud timeout. */
  await page.evaluate(() => { window.savePortfolio = async () => true; switchView("history"); });
  await page.waitForSelector(".hi3-row");
};

// data-vaction="undo" also appears in Trade's version banner, so scope to this lane's control group
const UNDO = '.hi3-acts [data-vaction="undo"]';
const REDO = '.hi3-acts [data-vaction="redo"]';

test("the ledger lists every checkpoint, newest first", async ({ page }) => {
  await openHistory(page);
  const r = await page.evaluate(() => ({
    rows: [...document.querySelectorAll(".hi3-row")].map(x => x.dataset.vsel),
    ids: versions().map(v => String(v.id)).reverse(),
  }));
  expect(r.rows).toEqual(r.ids);
});

test("the row title does not repeat the type that sits under it", async ({ page }) => {
  await openHistory(page);
  const r = await page.evaluate(() => {
    const row = document.querySelector(".hi3-row");
    return { title: row.querySelector("b").textContent, meta: row.querySelector("i").textContent };
  });
  // it read "Rebalance REBALANCE +$20,759" while the meta line below already said REBALANCE
  expect(r.title).toBe("Rebalance");
  expect(r.meta).toContain("2025-07-22");
});

test("current, applied and redoable are three visibly different things", async ({ page }) => {
  await openHistory(page);
  await page.click(UNDO);
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => [...document.querySelectorAll(".hi3-row")].map(x => {
    const mk = getComputedStyle(x.querySelector(".mk"));
    return { id: x.dataset.vsel, cls: x.className,
             tag: x.querySelector(".tag").textContent,
             bg: mk.backgroundColor, border: mk.borderTopWidth };
  }));
  const fut = r.find(x => x.cls.includes("fut"));
  const cur = r.find(x => x.cls.includes("cur"));
  const past = r.find(x => !x.cls.includes("fut") && !x.cls.includes("cur"));
  expect(fut.tag).toBe("REDOABLE");
  expect(cur.tag).toBe("CURRENT");
  expect(past.tag).toBe("APPLIED");
  /* A redoable future has not happened, so its marker is an outline rather than a fill. Filling it
     like the past is the screen asserting that it did happen. */
  expect(fut.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(parseFloat(fut.border)).toBeGreaterThan(0);
  expect(past.bg).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});

test("the chart draws redoable futures dashed and unfilled", async ({ page }) => {
  await openHistory(page);
  await page.click(UNDO);
  await page.waitForTimeout(200);
  const bars = await page.evaluate(() => [...document.querySelectorAll("#histChart rect")].map(r => ({
    fill: r.getAttribute("fill"), dash: r.getAttribute("stroke-dasharray") })));
  expect(bars.length).toBe(3);
  expect(bars.filter(b => b.fill === "none" && b.dash).length).toBe(1);   // one undone future
});

test("the chart plots each version's RECORDED value, never a re-derivation", async ({ page }) => {
  await openHistory(page);
  const r = await page.evaluate(() => {
    const bars = [...document.querySelectorAll("#histChart rect")];
    const vals = versions().map(v => v.valueAfter);
    // bar heights must be monotonic in the recorded values, which a re-derivation would not be
    const hs = bars.map(b => parseFloat(b.getAttribute("height")));
    return { vals, hs };
  });
  const order = (a) => a.map((_, i) => i).sort((x, y) => a[x] - a[y]).join(",");
  expect(order(r.hs)).toBe(order(r.vals));
});

test("selecting a checkpoint fills the right column without expanding the row", async ({ page }) => {
  await openHistory(page);
  const rows = page.locator(".hi3-row");
  await rows.nth(2).click();                       // the oldest
  const r = await page.evaluate(() => ({
    meta: document.querySelector(".hi3-selmeta").textContent,
    trades: document.querySelectorAll(".hi3-t").length,
    on: document.querySelectorAll(".hi3-row.on").length,
    revert: !!document.querySelector(".hi3-revert"),
  }));
  expect(r.meta).toContain("2024-11-04");
  expect(r.trades).toBe(5);                        // the initial build made five
  expect(r.on).toBe(1);
  expect(r.revert).toBe(true);                     // it is not the current one
});

test("the current checkpoint offers no revert, because there is nowhere to go", async ({ page }) => {
  await openHistory(page);
  await page.locator(".hi3-row").first().click();
  const r = await page.evaluate(() => ({
    revert: !!document.querySelector(".hi3-revert"),
    note: document.querySelector(".hi3-sel .hi3-note") &&
          document.querySelector(".hi3-sel .hi3-note").textContent }));
  expect(r.revert).toBe(false);
  expect(r.note).toContain("where you are now");
});

test("the selection follows an undo instead of describing where you no longer are", async ({ page }) => {
  await openHistory(page);
  const before = await page.textContent(".hi3-selmeta");
  await page.click(UNDO);
  await page.waitForTimeout(200);
  const after = await page.textContent(".hi3-selmeta");
  /* HIST_SEL is null until the user picks one, and the panel resolves "current" at read time - so
     stepping back moves the panel with you rather than leaving it on a checkpoint you just left. */
  expect(after).not.toBe(before);
  expect(after).toContain("2025-03-18");
});

test("undo and redo disable themselves at the ends of the timeline", async ({ page }) => {
  await openHistory(page);
  const state = () => page.evaluate(() => ({
    undo: document.querySelector('.hi3-acts [data-vaction="undo"]').disabled,
    redo: document.querySelector('.hi3-acts [data-vaction="redo"]').disabled,
    head: head(), n: versions().length }));
  let s = await state();
  expect(s.redo).toBe(true);                       // already at the newest
  expect(s.undo).toBe(false);
  /* E8: you can step back BEFORE the initial build, to head -1, which clears what the build
     created. So the end of the line is one undo past the oldest checkpoint, not at it. */
  for (let i = 0; i < 3; i++) { await page.click(UNDO); await page.waitForTimeout(180); }
  s = await state();
  expect(s.head).toBe(-1);
  expect(s.undo).toBe(true);                       // nothing left to undo
  expect(s.redo).toBe(false);
});

test("a checkpoint with no recorded allocation says so rather than drawing a stub", async ({ page }) => {
  await openHistory(page);
  const r = await page.evaluate(() => {
    versions().forEach(v => { delete v.alloc; });
    renderHistory();
    return { segs: document.querySelectorAll(".hi3-sel .md3-stack span").length,
             note: document.querySelector(".hi3-sel .hi3-note").textContent };
  });
  // a three-pixel bar reads as "everything sits in one portfolio", which is a claim, not a gap
  expect(r.segs).toBe(0);
  expect(r.note).toContain("did not record");
});

test("the reset is not offered on an account with nothing to lose", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  const r = await page.evaluate(() => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "T", refresh_token: "r", user: { id: "u1", email: "x@y.z" } }));
    sbLoadSession(); appLocked = false; showGate(false);
    state.portfolio = { holdings: {}, versions: [], head: -1 };
    renderAll(); switchView("history");
    return { painted: !!document.getElementById("resetBtn").offsetParent, init: isInit() };
  });
  expect(r.init).toBe(false);
  expect(r.painted).toBe(false);
});

test("no tour step on this lane points at an element that no longer exists", async ({ page }) => {
  await openHistory(page);
  const dead = await page.evaluate(() =>
    Object.values(TOURS).flatMap(t => t.steps || []).map(s => s && s.sel)
      .filter(Boolean).filter(sel => !document.querySelector(sel)));
  expect(dead).toEqual([]);
});
