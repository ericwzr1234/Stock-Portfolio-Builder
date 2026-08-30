/* Where Turnstile is rendered, and — more importantly — where it must NOT be skipped.
 *
 * The site key is bound to the deployed hostname, so on a dev server the widget can only fail.
 * Skipping it there removes real noise. But the same switch decides whether PRODUCTION has any bot
 * protection at all: if it wrongly answered "no" on pages.dev, no widget would render, Supabase
 * would reject every sign-in for a missing captcha token, and the app would be locked out. So the
 * live hostname is the case that actually matters here.
 */
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.captchaAvailableFor === "function");
});

test("the deployed hostname MUST get a captcha", async ({ page }) => {
  const r = await page.evaluate(() => ["portfolio-builder-esb.pages.dev",
                                       "PORTFOLIO-BUILDER-ESB.PAGES.DEV",
                                       "example.com", "app.example.com"]
    .map(h => [h, captchaAvailableFor(h)]));
  r.forEach(([h, ok]) => expect(ok, h + " must require a captcha").toBe(true));
});

test("only genuinely local hosts are skipped", async ({ page }) => {
  const r = await page.evaluate(() => ["localhost", "127.0.0.1", "::1", "[::1]", "",
                                       "LOCALHOST", "app.localhost"]
    .map(h => [h, captchaAvailableFor(h)]));
  r.forEach(([h, ok]) => expect(ok, h + " should be skipped").toBe(false));
});

test("a hostname that merely CONTAINS localhost is not treated as local", async ({ page }) => {
  // an attacker-controlled "localhost.evil.com" must not disable the check
  const r = await page.evaluate(() => ["localhost.evil.com", "notlocalhost", "mylocalhost.io",
                                       "127.0.0.1.evil.com"].map(h => [h, captchaAvailableFor(h)]));
  r.forEach(([h, ok]) => expect(ok, h + " must still require a captcha").toBe(true));
});

test("running on 127.0.0.1, this test environment skips it — which is why the harness is quiet", async ({ page }) => {
  expect(await page.evaluate(() => captchaAvailable())).toBe(false);
});
