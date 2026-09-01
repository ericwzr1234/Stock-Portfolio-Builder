/* E14 - our weighting against equal weighting of the same names.
 *
 * The arithmetic here is the owner's, worked through on 2026-09-01, and the first test is his
 * example verbatim: $1,000 across five names at $10, equal-weighted to $200 and 20 shares each;
 * two weeks later the five trade at 20, 4, 15, 2 and 11, so the basket is worth 20 x 52 = $1,040
 * and the return is +$40. If that number ever stops coming out, the chart is lying.
 *
 * The defect this replaced: the old series priced its basket only from trades recorded AT each
 * checkpoint, so a name whose weight did not change generated no trade, kept a stale price, and
 * earned exactly zero forever - which pinned the whole line to the zero axis. "The line moves when
 * prices move" is therefore a test in its own right, because a flat line at zero is otherwise
 * indistinguishable from "the tool exactly matched equal weight".
 */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const D0 = "2025-01-06", D1 = "2025-01-20", D2 = "2025-02-10";
const ts = (d) => Math.floor(Date.parse(d) / 1000);

/* Install a book and a price series. `holdings` is per checkpoint; `prices` is symbol -> closes
 * aligned to `dates`. Nothing is mocked beyond the network: the walk under test is the real one. */
async function book(page, spec) {
  return page.evaluate((s) => {
    const times = s.dates.map((d) => Math.floor(Date.parse(d) / 1000));
    const hist = {};
    Object.keys(s.prices).forEach((sym) => {
      hist[sym] = { t: times, c: s.prices[sym], splits: (s.splits && s.splits[sym]) || [] };
    });
    state.portfolio = {
      createdAt: s.dates[0],
      holdings: s.checkpoints[s.checkpoints.length - 1].holdings,
      versions: s.checkpoints.map((c, i) => ({
        id: "v" + i, date: c.date, type: i ? "REBALANCE" : "INITIAL",
        cashIn: c.cashIn || 0, trades: [], snapshot: { holdings: c.holdings },
      })),
      head: s.checkpoints.length - 1,
    };
    state.quotes = {};                       // no live quote, so the last point uses the last close
    state.history = { max: hist, "5y": hist, "1mo": hist, "1d": hist };
    return true;
  }, spec);
}

const seriesAt = (page, iso) => page.evaluate((d) => {
  const t = Math.floor(Date.parse(d) / 1000);
  const all = benchmarkSeries(state.history.max, Math.floor(Date.parse("2025-03-01") / 1000));
  const hit = all.find((p) => p.t === t);
  return hit ? { real: Math.round(hit.real * 100) / 100, ew: Math.round(hit.ew * 100) / 100 } : null;
}, iso);

const FIVE = ["AA", "BB", "CC", "DD", "EE"];
const sharesOf = (n) => { const h = {}; FIVE.forEach((s) => { h[s] = { shares: n, costBasis: 200 }; }); return h; };

test("the owner's worked example: equal weight earns exactly +$40", async ({ page }) => {
  await seedBook(page);
  await book(page, {
    dates: [D0, D1],
    /* The real book is deliberately LOPSIDED - 60 shares of the winner, 10 of each other - so the
       two lines must differ. Its value at the checkpoint is still $1,000, which is the base both
       strategies start the segment from. */
    checkpoints: [{ date: D0, holdings: { AA: { shares: 60 }, BB: { shares: 10 }, CC: { shares: 10 },
                                          DD: { shares: 10 }, EE: { shares: 10 } } }],
    prices: { AA: [10, 20], BB: [10, 4], CC: [10, 15], DD: [10, 2], EE: [10, 11] },
  });
  const at = await seriesAt(page, D1);
  /* $1,000 / 5 = $200 a name = 20 shares each at $10. 20 x (20+4+15+2+11) = $1,040. */
  expect(at.ew).toBe(40);
  /* And the real book, which backed the winner: 60x20 + 10x4 + 10x15 + 10x2 + 10x11 = $1,520. */
  expect(at.real).toBe(520);
});

test("the line MOVES when prices move - the defect that pinned it to zero", async ({ page }) => {
  await seedBook(page);
  await book(page, {
    dates: [D0, D1, D2],
    /* No trade at the second checkpoint changes these names, which is exactly the case the old
       implementation priced from a stale trade record and scored as zero. */
    checkpoints: [{ date: D0, holdings: sharesOf(20) }, { date: D1, holdings: sharesOf(20) }],
    prices: { AA: [10, 12, 14], BB: [10, 11, 9], CC: [10, 9, 13], DD: [10, 10, 10], EE: [10, 13, 15] },
  });
  const mid = await seriesAt(page, D1), end = await seriesAt(page, D2);
  expect(mid.ew).not.toBe(0);
  expect(end.ew).not.toBe(0);
  expect(end.ew).not.toBe(mid.ew);
});

test("the basket is rebuilt at each checkpoint, not carried forward", async ({ page }) => {
  await seedBook(page);
  /* Six names from the second checkpoint on. A carried-forward basket would still hold five. */
  await book(page, {
    dates: [D0, D1, D2],
    checkpoints: [
      { date: D0, holdings: sharesOf(20) },
      { date: D1, holdings: { AA: { shares: 8.67 }, BB: { shares: 43.33 }, CC: { shares: 11.56 },
                              DD: { shares: 86.67 }, EE: { shares: 15.76 }, FF: { shares: 17.33 } } }],
    prices: { AA: [10, 20, 20], BB: [10, 4, 4], CC: [10, 15, 15], DD: [10, 2, 2],
              EE: [10, 11, 11], FF: [10, 10, 20] },
  });
  /* The owner's second scenario: the book is worth $1,040 at the rebalance and is split equally
     across SIX names, so each gets $1,040 / 6 = $173.33. Only FF moves afterwards, doubling, so
     the segment earns exactly that one slice. */
  const mid = await seriesAt(page, D1), end = await seriesAt(page, D2);
  expect(Math.round((end.ew - mid.ew) * 100) / 100).toBeCloseTo(173.33, 1);
});

test("cumulative equals the sum of its segments, which is what makes the two lines comparable", async ({ page }) => {
  await seedBook(page);
  await book(page, {
    dates: [D0, D1, D2],
    checkpoints: [{ date: D0, holdings: sharesOf(20) },
                  { date: D1, holdings: sharesOf(30) }],
    prices: { AA: [10, 12, 14], BB: [10, 11, 9], CC: [10, 9, 13], DD: [10, 10, 10], EE: [10, 13, 15] },
  });
  const mid = await seriesAt(page, D1), end = await seriesAt(page, D2);
  const seg2 = await page.evaluate(() => {
    /* Segment two, computed independently of the walk: 30 shares of each name at the D1 prices is
       the base; the same shares at D2 prices is the end. */
    const p1 = [12, 11, 9, 10, 13], p2 = [14, 9, 13, 10, 15];
    const base = p1.reduce((a, x) => a + 30 * x, 0), fin = p2.reduce((a, x) => a + 30 * x, 0);
    return Math.round((fin - base) * 100) / 100;
  });
  expect(Math.round((end.real - mid.real) * 100) / 100).toBeCloseTo(seg2, 1);
});

test("a split inside a segment is not a crash", async ({ page }) => {
  await seedBook(page);
  /* The close series is RAW, so AA halves overnight. Without the split factor the basket reads a
     50% loss on a fifth of its value that nobody suffered. */
  await book(page, {
    dates: [D0, D1],
    checkpoints: [{ date: D0, holdings: sharesOf(20) }],
    prices: { AA: [10, 5], BB: [10, 10], CC: [10, 10], DD: [10, 10], EE: [10, 10] },
    splits: { AA: [{ date: ts(D1) - 1, num: 2, den: 1 }] },
  });
  const at = await seriesAt(page, D1);
  expect(at.ew).toBeCloseTo(0, 6);
  expect(at.real).toBeCloseTo(0, 6);
});

test("a window re-bases both lines to zero at its first point", async ({ page }) => {
  await seedBook(page);
  await book(page, {
    dates: [D0, D1, D2],
    checkpoints: [{ date: D0, holdings: sharesOf(20) }],
    prices: { AA: [10, 20, 30], BB: [10, 10, 10], CC: [10, 10, 10], DD: [10, 10, 10], EE: [10, 10, 10] },
  });
  const first = await page.evaluate(() => {
    const w = benchmarkWindow("ALL", state.history.max, Math.floor(Date.parse("2025-03-01") / 1000));
    return { real: w[0].real, ew: w[0].ew, n: w.length };
  });
  expect(first.real).toBe(0);
  expect(first.ew).toBe(0);
  expect(first.n).toBeGreaterThan(1);
});

test("the chart is dollars only - no percent anywhere", async ({ page }) => {
  await seedBook(page);
  await book(page, {
    dates: [D0, D1],
    checkpoints: [{ date: D0, holdings: sharesOf(20) }],
    prices: { AA: [10, 20], BB: [10, 10], CC: [10, 10], DD: [10, 10], EE: [10, 10] },
  });
  await page.evaluate(() => { OV_RANGE = "ALL"; renderReturnChart(); });
  const head = await page.textContent("#ovRetHead");
  expect(head).not.toContain("%");
  expect(head).toMatch(/\$/);
  /* The removed switch must be gone from the DOM, not merely hidden. */
  expect(await page.locator("#retPct").count()).toBe(0);
  expect(await page.locator("#retDol").count()).toBe(0);
});

test("the benchmark line is drawn distinctly from the zero gridline", async ({ page }) => {
  await seedBook(page);
  await book(page, {
    dates: [D0, D1],
    checkpoints: [{ date: D0, holdings: sharesOf(20) }],
    prices: { AA: [10, 20], BB: [10, 10], CC: [10, 10], DD: [10, 10], EE: [10, 10] },
  });
  await page.evaluate(() => { OV_RANGE = "ALL"; renderReturnChart(); });
  const svg = await page.innerHTML("#ovRetChart");
  /* Both are dashed, so the dash pattern alone must differ - 8 5 against the gridline's 3 3. */
  expect(svg).toContain('stroke-dasharray="8 5"');
  expect(svg).toContain('stroke-dasharray="3 3"');
  expect((svg.match(/<path/g) || []).length).toBe(2);
});

test("with no price history the chart says so rather than drawing a lie", async ({ page }) => {
  await seedBook(page);
  await page.evaluate(() => { state.history = {}; OV_RANGE = "ALL"; renderReturnChart(); });
  expect(await page.textContent("#ovRetHead")).toContain("Loading");
  expect(await page.innerHTML("#ovRetChart")).toBe("");
});

test("every range chip renders without error", async ({ page }) => {
  await seedBook(page);
  await book(page, {
    dates: [D0, D1, D2],
    checkpoints: [{ date: D0, holdings: sharesOf(20) }],
    prices: { AA: [10, 20, 30], BB: [10, 10, 10], CC: [10, 10, 10], DD: [10, 10, 10], EE: [10, 10, 10] },
  });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  for (const chip of ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y", "ALL"]) {
    await page.evaluate((c) => { OV_RANGE = c; renderReturnChart(); }, chip);
  }
  expect(errs).toEqual([]);
});
