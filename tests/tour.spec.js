/* The guided tour is shown ONCE per account per view, then never again unless asked for.
 *
 * WHY THIS EXISTS. The owner reported the guide reappearing on every sign-in. The flag recorded
 * "the user clicked through to the last step", but every other way out of a tour — switching tab,
 * a modal opening, the gate going up at sign-out, stepping back off step one — wrote nothing. So
 * anyone who did not click Done through every step of every tab was shown all of them, forever.
 *
 * Every test here leaves the tour by one of the paths that used to write nothing. A test that
 * clicked Done would have passed against the broken code, which is exactly why none of them do.
 *
 * `sbSession` and `appLocked` are script-scoped `let`s, so `window.x = …` makes an unrelated
 * property and the app never sees it. A bare assignment inside evaluate() resolves to the real
 * binding; the session itself is installed the way a returning user installs it, via
 * sbLoadSession() reading localStorage.
 */
const { test, expect } = require("@playwright/test");

const UID = "11111111-2222-3333-4444-555555555555";

async function signIn(page, uid = UID) {
  await page.evaluate((u) => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(
      { access_token: "t", refresh_token: "r", user: { id: u, email: "x@y.z" } }));
    sbLoadSession();
    appLocked = false;
    showGate(false);
  }, uid);
}

const onScreen = (page) => page.evaluate(() => !!document.querySelector(".coach"));

/* Arrive from somewhere else: maybeCoach only fires when the view actually CHANGES. */
async function landOn(page, view) {
  await page.evaluate((v) => { switchView(v === "history" ? "prices" : "history"); switchView(v); }, view);
  await page.waitForTimeout(600);              // maybeCoach defers 420ms to let the view paint
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.coachStart === "function");
  await page.evaluate(() => localStorage.clear());
});

test("a guide left by switching tab is not shown again at the next sign-in", async ({ page }) => {
  await signIn(page);
  await landOn(page, "fundamentals");
  expect(await onScreen(page)).toBe(true);              // first visit for this account: shown

  await landOn(page, "calc");                           // walk away without finishing it

  await signIn(page);                                   // sign in again, same account
  await landOn(page, "fundamentals");
  expect(await onScreen(page)).toBe(false);             // THE BUG: this used to be true, every time
});

test("closing a guide at step one still counts as shown", async ({ page }) => {
  await signIn(page);
  await landOn(page, "fundamentals");
  expect(await onScreen(page)).toBe(true);
  await page.evaluate(() => coachGo(-1));               // back off the start = just close
  expect(await onScreen(page)).toBe(false);

  await signIn(page);
  await landOn(page, "fundamentals");
  expect(await onScreen(page)).toBe(false);
});

test("the gate going up mid-tour does not re-arm it", async ({ page }) => {
  await signIn(page);
  await landOn(page, "fundamentals");
  expect(await onScreen(page)).toBe(true);
  await page.evaluate(() => showGate(true));            // sign-out, or the 5-minute idle lock
  expect(await onScreen(page)).toBe(false);

  await signIn(page);
  await landOn(page, "fundamentals");
  expect(await onScreen(page)).toBe(false);
});

test("Help replays the guide for the current view after it has been seen", async ({ page }) => {
  await signIn(page);
  await landOn(page, "fundamentals");
  await page.evaluate(() => coachEnd());
  expect(await onScreen(page)).toBe(false);

  await page.evaluate(() => coachStart(curView, true)); // exactly what the Help button calls
  expect(await onScreen(page)).toBe(true);
});

test("a second account on the same browser gets its own guide", async ({ page }) => {
  await signIn(page);
  await landOn(page, "fundamentals");
  await page.evaluate(() => coachEnd());

  await signIn(page, "99999999-8888-7777-6666-555555555555");
  await landOn(page, "fundamentals");
  expect(await onScreen(page)).toBe(true);
});

test("with no account there is no guide, and nothing is written under a shared key", async ({ page }) => {
  await page.evaluate(() => { appLocked = false; showGate(false); });
  await landOn(page, "fundamentals");
  expect(await onScreen(page)).toBe(false);
  expect(await page.evaluate(() =>
    Object.keys(localStorage).filter(k => k.startsWith("pb_tour_")))).toEqual([]);
});

test("the header button reads Help, not a question mark", async ({ page }) => {
  expect((await page.textContent("#tourBtn")).trim()).toBe("Help");
});
