/* E12.0b — the sign-in gate.
 *
 * The gate is the one screen where a cosmetic rewrite can break authentication, so most of this
 * file guards the CONTRACT rather than the looks: every gate* element ID still exists, the
 * autocomplete hints survive, and the captcha keeps its mount. The auth code is wired to those.
 */
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.gateMsg === "function");
});

test("every element ID the auth code is wired to still exists", async ({ page }) => {
  const missing = await page.evaluate(() =>
    ["gate","gateTitle","gateSub","gateEmail","gatePass","gateCaptcha","gateMsg",
     "gateGo","gateToggle","gateForgot","gateLegal"].filter(id => !document.getElementById(id)));
  expect(missing).toEqual([]);
});

test("the autocomplete hints and the captcha mount are untouched", async ({ page }) => {
  const r = await page.evaluate(() => ({
    user: document.getElementById("gateEmail").getAttribute("autocomplete"),
    pass: document.getElementById("gatePass").getAttribute("autocomplete"),
    captchaInsideGate: !!document.querySelector("#gate #gateCaptcha"),
  }));
  expect(r.user).toBe("username");
  expect(r.pass).toBe("current-password");
  expect(r.captchaInsideGate).toBe(true);
});

test("inputs are 46px tall and never small enough to make iOS zoom", async ({ page }) => {
  /* Visible ones only: the Confirm field is hidden in sign-in mode and measures 0, which is
     correct rather than a violation. */
  const r = await page.evaluate(() => [...document.querySelectorAll("#gate input")]
    .filter(e => e.offsetParent).map(e => ({
    h: Math.round(e.getBoundingClientRect().height),
    px: parseFloat(getComputedStyle(e).fontSize),
  })));
  expect(r.length).toBeGreaterThan(0);          // and it must actually have measured something
  r.forEach(i => { expect(i.h).toBeGreaterThanOrEqual(44); expect(i.px).toBeGreaterThanOrEqual(16); });
});

test("an error does not move the button under the user's cursor", async ({ page }) => {
  const r = await page.evaluate(() => {
    const top = () => Math.round(document.getElementById("gateGo").getBoundingClientRect().top);
    const before = top();
    gateMsg("err", "Those passwords do not match.");
    return { before, after: top() };
  });
  expect(r.after).toBe(r.before);      // the message row is RESERVED, not inserted
});

test("Confirm password appears only when creating an account", async ({ page }) => {
  const r = await page.evaluate(() => {
    const vis = () => !!document.getElementById("gateConfirmWrap").offsetParent;
    const inSignIn = vis();
    document.getElementById("gateToggle").click();
    const inCreate = vis();
    document.getElementById("gateToggle").click();
    return { inSignIn, inCreate, backToSignIn: vis() };
  });
  expect(r.inSignIn).toBe(false);
  expect(r.inCreate).toBe(true);
  expect(r.backToSignIn).toBe(false);
});

test("the submit arrow survives every label change", async ({ page }) => {
  /* setMode and submit both used gateGo.textContent, which replaces EVERY child - so the arrow
     that section 4.8 puts flush right vanished on the first render, and again on every attempt.
     Checking the label alone would not have caught it. */
  const r = await page.evaluate(() => {
    const arrow = () => { const a = document.querySelector("#gateGo .gate-arrow"); return !!(a && a.offsetParent); };
    const out = { initial: arrow() };
    document.getElementById("gateToggle").click(); out.afterToggle = arrow();
    gateGoLabel("Working…");                   out.afterWorking = arrow();
    gateGoLabel("Sign in");                         out.afterRestore = arrow();
    return out;
  });
  Object.entries(r).forEach(([k, v]) => expect(v, k).toBe(true));
});

test("nothing in the gate has a corner radius", async ({ page }) => {
  const rounded = await page.evaluate(() =>
    [...document.querySelectorAll("#gate, #gate *")]
      .filter(e => getComputedStyle(e).borderTopLeftRadius !== "0px").length);
  expect(rounded).toBe(0);
});

test("the ink field's statement is centred, with the legal line still on the floor", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("/");
  await page.waitForFunction(() => typeof window.showGate === "function");
  const r = await page.evaluate(() => {
    const b = (s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
    const panel = b(".gate-ink"), stmt = b(".gate-statement"), assure = b(".gate-assure"),
          legal = b(".gate-legal"), brand = b(".gate-inktop");
    return {
      above: stmt.top - brand.bottom,
      below: legal.top - assure.bottom,
      groupMid: (stmt.top + assure.bottom) / 2,
      panelMid: (panel.top + panel.bottom) / 2,
      legalGap: panel.bottom - legal.bottom,
    };
  });
  /* Owner, 2026-08-31: this block sat on the floor with the top two thirds of the field empty,
     because a single `margin-top:auto` pushes everything after it to the bottom. A second auto
     margin on .gate-legal splits the free space instead.
     Measured at 1400x950 - centred: above 147, below 147, midpoint 19px off centre.
     Floored: above 294, below 22, midpoint 128px off. The thresholds sit between those. */
  expect(Math.abs(r.groupMid - r.panelMid)).toBeLessThan(60);
  expect(Math.abs(r.above - r.below)).toBeLessThan(80);
  expect(r.legalGap).toBeLessThan(80);          // and the footnote stays pinned to the bottom
});
