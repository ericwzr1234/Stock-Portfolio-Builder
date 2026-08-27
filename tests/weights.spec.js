/* boundedWeights — the arithmetic core of the allocation model, used at BOTH levels.
 *
 * These are INVARIANTS, not golden numbers, for the reason the engine tests already give: the
 * dangerous bug in a portfolio tool is not a crash, it is a plausible wrong weight. A golden
 * value breaks on every legitimate change to the model and catches none of the failures that
 * matter. What must always hold is: the weights sum to 1, none escapes the owner's bounds, and a
 * better-scoring name is never given less money than a worse one.
 */
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.boundedWeights === "function");
});

const run = (page, raw, cap) => page.evaluate(([r, c]) => boundedWeights(r, c), [raw, cap]);

test("the owner's own examples come out exactly as specified", async ({ page }) => {
  /* The floor is a MINIMUM, not a target. Once the leader is capped, whatever is left is shared
     by the rest - which normally lands ABOVE the floor. Asserting min === floor here was my own
     mistake and it failed against correct code. The floor only binds when a name is weak relative
     to others that are NOT themselves at the ceiling, which is the second case below. */
  // 3 themes: ceiling 1/(3-1) = 50%. The leader caps; the other two split the remaining 50%.
  const three = await run(page, [100, 1, 1]);
  expect(three.map(x => +(x * 100).toFixed(4))).toEqual([50, 25, 25]);

  // 5 tickers: ceiling 1/(5-1) = 25%. Leader caps; the other four split 75%.
  const five = await run(page, [100, 1, 1, 1, 1]);
  expect(five.map(x => +(x * 100).toFixed(4))).toEqual([25, 18.75, 18.75, 18.75, 18.75]);

  // the floor binding, which is where 1/(2n) actually shows up
  const weak3 = await run(page, [10, 10, 0.001]);
  expect(Math.min(...weak3)).toBeCloseTo(1 / 6, 9);            // 16.67%
  const weak5 = await run(page, [10, 10, 10, 10, 0.001]);
  expect(Math.min(...weak5)).toBeCloseTo(0.10, 9);             // 10%
});

test("weights always sum to 1 and stay inside the bounds, across n and shapes", async ({ page }) => {
  const bad = await page.evaluate(() => {
    const out = [];
    // a deterministic spread of shapes: flat, one dominant, one starved, steep ramp, all zero
    const shapes = (n) => [
      Array.from({ length: n }, () => 1),
      Array.from({ length: n }, (_, i) => (i === 0 ? 1000 : 1)),
      Array.from({ length: n }, (_, i) => (i === 0 ? 0 : 1)),
      Array.from({ length: n }, (_, i) => Math.pow(2, i)),
      Array.from({ length: n }, () => 0),
      Array.from({ length: n }, (_, i) => (i % 2 ? 0 : 5)),
    ];
    for (let n = 2; n <= 20; n++) {
      const lo = 1 / (2 * n), hi = 1 / (n - 1);
      for (const raw of shapes(n)) {
        const w = boundedWeights(raw);
        const sum = w.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1) > 1e-9) out.push({ n, why: "sum", sum });
        w.forEach((x, i) => {
          if (x < lo - 1e-9) out.push({ n, why: "below floor", x, lo });
          if (x > hi + 1e-9) out.push({ n, why: "above ceiling", x, hi });
        });
        // order preserved: a better raw score never gets less weight
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
          if (raw[i] > raw[j] && w[i] < w[j] - 1e-9) out.push({ n, why: "order inverted", i, j });
      }
    }
    return out.slice(0, 6);
  });
  expect(bad).toEqual([]);
});

test("a single item takes everything; an empty set allocates nothing", async ({ page }) => {
  expect(await run(page, [5])).toEqual([1]);
  expect(await run(page, [0])).toEqual([1]);       // lone name with no score still gets the capital
  expect(await run(page, [])).toEqual([]);
});

test("an all-zero model falls back to equal weight, never to a zero-sum book", async ({ page }) => {
  const w = await run(page, [0, 0, 0, 0]);
  w.forEach(x => expect(x).toBeCloseTo(0.25, 9));
});

test("two items: the ceiling is inert, so the floor does the work", async ({ page }) => {
  const w = await run(page, [1000, 1]);
  expect(w[1]).toBeCloseTo(0.25, 9);               // floor 1/(2*2)
  expect(w[0]).toBeCloseTo(0.75, 9);
  expect(w[0] + w[1]).toBeCloseTo(1, 9);
});

test("the floor is always half of equal weight, and it binds before the ceiling does", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = [];
    for (const n of [3, 5, 8, 12, 20]) {
      /* MANY strong and ONE weak. The mirror image (one strong, many weak) caps the leader and
         leaves the rest sharing what is left, which sits above the floor - so it would not
         exercise the floor at all. */
      const raw = Array.from({ length: n }, (_, i) => (i === n - 1 ? 1e-9 : 1));
      const w = boundedWeights(raw);
      out.push({ n, min: w[n - 1] * n });                 // expressed as a multiple of equal weight
    }
    return out;
  });
  r.forEach(x => expect(x.min).toBeCloseTo(0.5, 6));                   // floor is 0.5x equal at every n
});
