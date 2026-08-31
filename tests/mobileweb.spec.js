/* The WEB app in a phone BROWSER — the owner's actual demo path.
 *
 * WHY THIS EXISTS. tools/phone/ verifies the CAPACITOR build: it stubs window.Capacitor so NATIVE
 * is true and the whole APP2 phone shell applies. None of that runs in Mobile Safari. The demo is
 * "pick up my phone, open the URL" — NATIVE is false there, the narrow-web fallback applies, and
 * nothing was watching it. Two defects were sitting on the first screen anyone sees:
 *
 *   1. nav.tabs still carried the pre-E5 labels ("Fundamentals & Allocation", "Calculator /
 *      Rebalance"). 419px of text in a 390px viewport pushed History off screen and made the whole
 *      page pan sideways — the one thing the owner's standing rule forbids.
 *   2. The gate's email and password fields were 14px. iOS Safari zooms the page when a focused
 *      field is under 16px. The rule preventing that existed, written `.native ...`, so it only
 *      covered the build that is not a browser.
 *
 * Both are the same failure: a fact was taught to one reader of it.
 */
const { test, expect } = require("@playwright/test");

const PHONES = [
  { name: "iPhone 13", width: 390, height: 844 },
  { name: "small Android", width: 360, height: 780 },
];

for (const ph of PHONES) {
  test.describe(`${ph.name} (${ph.width}px)`, () => {
    test.use({ viewport: { width: ph.width, height: ph.height }, isMobile: true, hasTouch: true });

    test("the sign-in screen never scrolls sideways", async ({ page }) => {
      await page.goto("/");
      await page.waitForFunction(() => typeof window.renderAll === "function");
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        window.scrollTo(999, 0); const pans = window.scrollX > 0; window.scrollTo(0, 0);
        const past = [...document.querySelectorAll("body *")]
          .filter(e => e.getBoundingClientRect().right > vw + 1)
          .map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "." + String(e.className).split(" ")[0]));
        return { pans, past: past.slice(0, 4), scrollW: document.body.scrollWidth, vw };
      });
      expect(r.past).toEqual([]);
      expect(r.pans).toBe(false);
      expect(r.scrollW).toBeLessThanOrEqual(r.vw);
    });

    test("no visible field is small enough to make iOS zoom on tap", async ({ page }) => {
      await page.goto("/");
      await page.waitForFunction(() => typeof window.renderAll === "function");
      const tiny = await page.evaluate(() =>
        [...document.querySelectorAll("input,select,textarea")]
          .filter(e => e.offsetParent && !["checkbox", "radio"].includes(e.type))
          .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16)
          .map(e => e.id || e.type));
      expect(tiny).toEqual([]);
    });
  });
}

/* E12.0 replaced this. The old test asserted the tab strip matched the desktop RAIL - an
   invariant that existed because V2 had two chromes onto one set of views and they had already
   drifted once. V3 deletes the rail (E12 §6), so there is only one set of nav labels and nothing
   to keep in sync. What must hold now is that nav is TEXT and there are exactly FOUR lanes. */
test("nav is four text lanes, and the rail is gone", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  const r = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll("nav.tabs button")].map(e => e.textContent.trim()),
    railGone: !document.querySelector("#rail, .rail, .navlink"),
    iconsInNav: document.querySelectorAll("nav.tabs svg, nav.tabs img").length,
  }));
  expect(r.tabs).toEqual(["Overview", "Model", "Trade", "History"]);   // four, not five
  expect(r.railGone).toBe(true);
  expect(r.iconsInNav).toBe(0);            // E12 rule 4: nav is text, never an icon
});

test("Research is reachable as a sub-tab of Trade, not a fifth lane", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.switchView === "function");
  const r = await page.evaluate(() => {
    /* offsetParent, NOT the .hidden property. display:flex on a class beats the UA rule for
       [hidden], so the attribute can be set while the element still paints - which is exactly
       what happened: the sub-tabs rendered on Overview and an attribute check passed. */
    const paints = s => { const e = document.querySelector(s); return !!(e && e.offsetParent); };
    switchView("calc");
    const shownOnTrade = paints("#subtabs");
    switchView("screener");
    const laneStillTrade = document.querySelector('nav.tabs button[data-view="calc"]').classList.contains("active");
    const researchVisible = document.getElementById("view-screener").classList.contains("active");
    switchView("prices");
    const hiddenElsewhere = !paints("#subtabs");
    return { shownOnTrade, laneStillTrade, researchVisible, hiddenElsewhere };
  });
  expect(r.shownOnTrade).toBe(true);
  expect(r.laneStillTrade).toBe(true);     // Research lights the TRADE lane
  expect(r.researchVisible).toBe(true);
  expect(r.hiddenElsewhere).toBe(true);
});

test("the context bar is absent on Overview and present elsewhere", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.switchView === "function");
  const r = await page.evaluate(() => {
    const paints = s => { const e = document.querySelector(s); return !!(e && e.offsetParent); };
    switchView("prices");       const onOverview = !paints("#ctxKpis");
    switchView("fundamentals"); const onModel    = !paints("#ctxKpis");
    return { onOverview, onModel };
  });
  // E12 section 3: on Overview the hero IS the context, so the total never renders twice.
  expect(r.onOverview).toBe(true);
  expect(r.onModel).toBe(false);
});
