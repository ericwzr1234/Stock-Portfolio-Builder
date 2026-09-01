/* E15 - a name held across a stock split.
 *
 * Share counts are recorded from a trade and never revised, while live prices come from Yahoo
 * POST-split. NVDA's real 10:1 in June 2024 therefore made a position read as a 90% loss that
 * never happened. The invariant that matters is that a split MOVES NO MONEY: shares scale, value
 * does not, and cost basis is untouched.
 */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const DAY = 86400;
const NVDA_SPLIT = { date: 1718026200, num: 10, den: 1 };     // the real one, 2024-06-10

/* Put the book in a known state: one holding, one recorded trade date, no splitsThrough yet. */
async function holding(page, opts) {
  return page.evaluate((o) => {
    state.portfolio = {
      createdAt: "2024-01-02",
      holdings: { NVDA: { shares: 100, costBasis: 10000 } },
      versions: [{ id: "v1", date: o.tradeDate, type: "INITIAL", cashIn: 10000, trades: [
        { sym: "NVDA", shares: 100, price: 100, amount: 10000 }], snapshot: { holdings: {
        NVDA: { shares: 100, costBasis: 10000 } } } }],
      head: 0,
    };
    window.savePortfolio = async () => true;
    window.dsHistory = async () => ({ NVDA: { t: [], c: [], splits: o.splits } });
    return true;
  }, opts);
}

const shares = (page) => page.evaluate(() => state.portfolio.holdings.NVDA.shares);
const basis  = (page) => page.evaluate(() => state.portfolio.holdings.NVDA.costBasis);

test("a split after the last trade scales the share count by its exact ratio", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-01-02", splits: [NVDA_SPLIT] });
  await page.evaluate(() => checkSplits());
  expect(await shares(page)).toBe(1000);          // 100 x 10, not a guess from a price move
});

test("a split moves no money: value is continuous and cost basis is untouched", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-01-02", splits: [NVDA_SPLIT] });
  /* Pre-split the position is 100 shares at the pre-split price; post-split it is 1000 at a tenth
     of it. If the two disagree the correction has invented or destroyed money. */
  const before = 100 * 1710;
  await page.evaluate(() => checkSplits());
  const after = (await shares(page)) * 171;
  expect(Math.abs(after - before)).toBeLessThan(0.01);
  expect(await basis(page)).toBe(10000);
});

test("a split BEFORE the last trade is already in the price, and is not applied", async ({ page }) => {
  await seedBook(page);
  /* The trade is recorded after the split, so its 100 shares are post-split shares bought at a
     post-split price. Applying the ratio again would multiply a real position by ten. */
  await holding(page, { tradeDate: "2024-08-01", splits: [NVDA_SPLIT] });
  await page.evaluate(() => checkSplits());
  expect(await shares(page)).toBe(100);
});

test("a split effective the same day as the trade is treated as already reflected", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-06-10", splits: [NVDA_SPLIT] });
  await page.evaluate(() => checkSplits());
  expect(await shares(page)).toBe(100);
});

test("running it twice cannot apply the same split twice", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-01-02", splits: [NVDA_SPLIT] });
  await page.evaluate(async () => { await checkSplits(); await checkSplits(); await checkSplits(); });
  expect(await shares(page)).toBe(1000);          // not 10,000 and not 1,000,000
});

test("the applied-through mark survives a save and reload of the stored payload", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-01-02", splits: [NVDA_SPLIT] });
  await page.evaluate(() => checkSplits());
  /* The whole portfolio is stored as JSON. If the mark did not round-trip, every load would
     re-apply the split and the share count would grow tenfold each time the app was opened. */
  const roundTripped = await page.evaluate(() => {
    const copy = JSON.parse(JSON.stringify(state.portfolio));
    state.portfolio = copy;
    return typeof copy.holdings.NVDA.splitsThrough;
  });
  expect(roundTripped).toBe("number");
  await page.evaluate(() => checkSplits());
  expect(await shares(page)).toBe(1000);
});

test("several splits on one name compound in order", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-01-02", splits: [
    { date: 1718026200, num: 10, den: 1 },
    { date: 1718026200 + 30 * DAY, num: 3, den: 2 }] });
  await page.evaluate(() => checkSplits());
  expect(await shares(page)).toBe(1500);          // 100 x 10 x 1.5
});

test("a reverse split shrinks the count", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-01-02", splits: [{ date: 1718026200, num: 1, den: 4 }] });
  await page.evaluate(() => checkSplits());
  expect(await shares(page)).toBe(25);
});

test("no splits means no change, and the name is still marked as checked", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-01-02", splits: [] });
  await page.evaluate(() => checkSplits());
  expect(await shares(page)).toBe(100);
  expect(await page.evaluate(() => typeof state.portfolio.holdings.NVDA.splitsThrough)).toBe("number");
});

test("a malformed split event is ignored rather than corrupting the book", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-01-02", splits: [
    { date: 1718026200, num: 0, den: 1 }, { date: 1718026200, num: 2, den: 0 },
    { date: null, num: 2, den: 1 }, { date: 1718026200, num: "2", den: 1 }] });
  await page.evaluate(() => checkSplits());
  expect(await shares(page)).toBe(100);
});

test("an unreachable proxy does not stop the app or touch the book", async ({ page }) => {
  await seedBook(page);
  await holding(page, { tradeDate: "2024-01-02", splits: [NVDA_SPLIT] });
  await page.evaluate(() => { window.dsHistory = async () => { throw new Error("proxy down"); }; });
  await page.evaluate(() => checkSplits());
  expect(await shares(page)).toBe(100);
  expect(await page.evaluate(() => typeof renderAll)).toBe("function");
});
