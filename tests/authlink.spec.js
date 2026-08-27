/* Cross-account exposure via the idle lock and the verification link. OWNER-FOUND 2026-08-27:
 * signed in as test-a, the 5-minute idle lock fired, a NEW account was registered, and clicking
 * that new account's verification email landed on TEST-A's portfolio.
 *
 * Two defects had to line up, and each is tested separately because either alone is a bug:
 *   1. lockOut() never ended the SESSION. Every deliberate exit (Sign out, Delete account) called
 *      sbSignOut() first; the idle timeout called lockOut() alone. So the one path whose entire
 *      purpose is security left the token in localStorage, and the next load walked back in.
 *   2. Nothing read the URL fragment. Supabase puts the new session in
 *      #access_token=...&type=signup, so the link never signed anyone in - the app just restored
 *      whatever session was cached in that browser.
 */
const { test, expect } = require("@playwright/test");

const A = { access_token: "A", refresh_token: "AR", user: { id: "user-A", email: "test-a@example.com" } };

async function signedInAsA(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.lockOut === "function");
  await page.evaluate((a) => {
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(a));
    sbLoadSession(); appLocked = false; showGate(false);
  }, A);
}

test("the idle lock actually ends the session, not just the screen", async ({ page }) => {
  await signedInAsA(page);
  const r = await page.evaluate(() => {
    lockOut("Signed out after 5 minutes of inactivity.");
    return { inMemory: !!sbSession, onDisk: !!localStorage.getItem(SB_SESSION_KEY),
             gateUp: !document.getElementById("gate").hidden };
  });
  expect(r.gateUp).toBe(true);
  expect(r.inMemory).toBe(false);
  expect(r.onDisk).toBe(false);      // THE BUG: the token used to survive here
});

test("after an idle lock, reopening the app does not sign you back in", async ({ page }) => {
  await signedInAsA(page);
  await page.evaluate(() => lockOut("idle"));
  await page.goto("/");                                  // as if the browser were reopened
  await page.waitForFunction(() => typeof window.sbUserEmail === "function");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => sbUserEmail() || "")).toBe("");
  expect(await page.evaluate(() => !document.getElementById("gate").hidden)).toBe(true);
});

test("an unverifiable auth link lands on the gate, never on a cached account", async ({ page }) => {
  await signedInAsA(page);                               // somebody else was signed in on this browser
  await page.goto("/#access_token=B&refresh_token=BR&type=signup");
  await page.waitForFunction(() => typeof window.sbUserEmail === "function");
  await page.waitForTimeout(2500);                       // the token is checked against Supabase
  const r = await page.evaluate(() => ({
    who: sbUserEmail() || "(nobody)",
    gateUp: !document.getElementById("gate").hidden,
    hash: location.hash,
  }));
  expect(r.who).not.toBe("test-a@example.com");          // THE BUG: this used to be test-a
  expect(r.gateUp).toBe(true);                           // fail closed: unverifiable means no entry
  expect(r.hash).toBe("");                               // tokens are not left in history
});

test("an auth link carrying an error shows it instead of signing anyone in", async ({ page }) => {
  await signedInAsA(page);
  await page.goto("/#error=access_denied&error_description=Email+link+is+invalid+or+has+expired");
  await page.waitForFunction(() => typeof window.sbUserEmail === "function");
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({
    who: sbUserEmail() || "(nobody)",
    gateUp: !document.getElementById("gate").hidden,
    msg: (document.getElementById("gateMsg") || {}).textContent || "",
  }));
  expect(r.who).toBe("(nobody)");
  expect(r.gateUp).toBe(true);
  expect(r.msg.toLowerCase()).toContain("expired");
});
