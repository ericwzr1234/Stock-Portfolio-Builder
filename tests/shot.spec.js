/* Not a test - a screenshot harness for E12 visual review. Run: npx playwright test shot */
const { test } = require("@playwright/test");
const { seedBook } = require("./book");

test("shots", async ({ page }) => {
  await seedBook(page);
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "docs/prototypes/shot-ov-1440.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "docs/prototypes/shot-ov-390.png", fullPage: true });
});
