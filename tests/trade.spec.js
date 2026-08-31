/* E12.3 Trade. V2 offered three bare controls - a two-option select, a Calculate button and a
   Realign button - with nothing on screen saying what any of them did. The modes are one radio list
   with the consequence written under each, and the plan is live so it can never describe inputs the
   user has since changed. */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const openTrade = async (page) => {
  await seedBook(page);
  await page.evaluate(() => switchView("calc"));
  await page.waitForTimeout(120);
};

test("all three modes are offered, each with its consequence in words", async ({ page }) => {
  await openTrade(page);
  const r = await page.evaluate(() => [...document.querySelectorAll("#tradeModes .tr3-mode")].map(b => ({
    v: b.dataset.mode,
    title: b.querySelector("b").textContent.trim(),
    said: b.querySelector("i").textContent.trim().length,
    painted: !!b.offsetParent,
  })));
  expect(r.map(x => x.v)).toEqual(["full", "cash", "realign"]);
  for (const m of r) { expect(m.painted).toBe(true); expect(m.said).toBeGreaterThan(30); }
});

test("the plan is live: changing the cash re-flows it with no Calculate step", async ({ page }) => {
  await openTrade(page);
  const say = () => page.textContent("#planSay");
  const before = await say();
  await page.fill("#addCash", "40000");
  await page.waitForTimeout(80);
  expect(await say()).not.toBe(before);
  expect(await page.evaluate(() => lastPlan.addCash)).toBe(40000);
  // there is no button that computes the plan, because there is no un-computed state to leave
  expect(await page.locator("#calcRebBtn, #realignBtn").count()).toBe(0);
});

test("the steppers move the cash by a thousand and typing still works", async ({ page }) => {
  await openTrade(page);
  await page.fill("#addCash", "4000");
  await page.click("#cashUp");
  expect(await page.inputValue("#addCash")).toBe("5000");
  await page.click("#cashDown");
  await page.click("#cashDown");
  expect(await page.inputValue("#addCash")).toBe("3000");
  await page.fill("#addCash", "12345");
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => lastPlan.addCash)).toBe(12345);
});

test("the cash never goes negative, however hard the stepper is pressed", async ({ page }) => {
  await openTrade(page);
  await page.fill("#addCash", "1000");
  for (let i = 0; i < 4; i++) await page.click("#cashDown");
  expect(Number(await page.inputValue("#addCash"))).toBe(0);
  expect(await page.evaluate(() => lastPlan.addCash)).toBe(0);
});

test("realign zeroes the cash on screen, not only in the plan", async ({ page }) => {
  await openTrade(page);
  await page.fill("#addCash", "9000");
  await page.click('[data-mode="realign"]');
  await page.waitForTimeout(80);
  /* Leaving $9,000 above a plan that spends none of it is the screen contradicting itself, and it
     is exactly the confusion the separate Realign button used to create. */
  expect(await page.inputValue("#addCash")).toBe("0");
  expect(await page.evaluate(() => lastPlan.addCash)).toBe(0);
  expect(await page.evaluate(() => lastPlan.mode)).toBe("full");   // realign IS a full rebalance at zero cash
});

test("cash-only never sells", async ({ page }) => {
  await openTrade(page);
  await page.fill("#addCash", "20000");
  await page.click('[data-mode="cash"]');
  await page.waitForTimeout(80);
  const sells = await page.evaluate(() =>
    lastPlan.universe.filter(s => (lastPlan.trade[s] || 0) < -0.005).length);
  expect(sells).toBe(0);
  expect(await page.locator(".tr3-t .chip.s").count()).toBe(0);
});

test("plan rows show a chip, a ticker, shares and an amount, and paint as four columns", async ({ page }) => {
  await openTrade(page);
  const r = await page.evaluate(() => {
    const row = document.querySelector(".tr3-t");
    return { cols: getComputedStyle(row).gridTemplateColumns.split(" ").length,
             kids: row.children.length, painted: !!row.offsetParent,
             chip: row.querySelector(".chip").textContent };
  });
  expect(r.painted).toBe(true);
  expect(r.cols).toBe(4);
  expect(r.kids).toBe(4);
  expect(["BUY", "SELL"]).toContain(r.chip);
});

test("the commit button sits outside every scrolling container", async ({ page }) => {
  await openTrade(page);
  const scrolled = await page.evaluate(() => {
    let n = document.querySelector("#applyBtn").parentElement, chain = [];
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflow)) chain.push(n.className || n.tagName);
      n = n.parentElement;
    }
    return chain;
  });
  // E5's rule: the one button you must never have to hunt for
  expect(scrolled).toEqual([]);
});

test("the after-bar and the now to after rows agree with the plan", async ({ page }) => {
  await openTrade(page);
  const r = await page.evaluate(() => ({
    segs: document.querySelector("#tradeAfterBar").children.length,
    rows: document.querySelectorAll("#tradeLands .tr3-land").length,
    themes: themes().length,
    after: document.querySelector("#tradeAfterTotal").textContent,
    want: money(lastPlan.newTotal, 0),
  }));
  expect(r.segs).toBe(r.themes);
  expect(r.rows).toBe(r.themes);
  expect(r.after).toBe(r.want);
});

test("a failed save replaces the account sentence in place and keeps the change on screen", async ({ page }) => {
  await openTrade(page);
  const r = await page.evaluate(async () => {
    window.savePortfolio = async () => false;            // the account is unreachable
    const before = curTotal();
    document.querySelector("#applyBtn").click();
    await new Promise(r => setTimeout(r, 300));
    return { note: document.querySelector("#tradeAcct").textContent,
             bad: document.querySelector("#tradeAcct").classList.contains("bad"),
             stillThere: isInit(), before };
  });
  /* Baseline section 9 rule 1. A toast fades; the user can look away for two seconds and never
     learn the checkpoint did not persist. */
  expect(r.bad).toBe(true);
  expect(r.note).toMatch(/NOT saved/);
  expect(r.stillThere).toBe(true);
});

test("no tour step on this lane points at an element that no longer exists", async ({ page }) => {
  await openTrade(page);
  const dead = await page.evaluate(() =>
    (typeof TOUR === "object" ? Object.values(TOUR).flat() : [])
      .map(s => s && s.sel).filter(Boolean).filter(sel => !document.querySelector(sel)));
  expect(dead).toEqual([]);
});
