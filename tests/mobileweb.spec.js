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

test("the phone-browser tab strip uses the same names as the desktop rail", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  const r = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll("nav.tabs button")].map(e => e.textContent.trim()),
    rail: [...document.querySelectorAll("#rail .navlink")].map(e => e.textContent.trim().replace(/\s+\d$/, "")),
  }));
  expect(r.tabs).toEqual(r.rail);          // one set of names for one set of views
  expect(r.tabs).toEqual(["Overview", "Model", "Rebalance", "Research", "History"]);
});
