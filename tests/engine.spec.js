/* Engine tests — the allocation maths and the version timeline.
 *
 * WHY THESE AND NOT COVERAGE. The dangerous bug in a portfolio tool is not a crash, it is a WRONG
 * NUMBER that still looks plausible. A crash gets reported; a mis-weighted target allocation does
 * not. So every assertion here is an INVARIANT — weights sum to 1, cash is conserved, nothing
 * exceeds the cap, undo cannot wipe holdings — rather than a golden value. Golden values break on
 * every legitimate change to the model and catch none of the failures that matter.
 *
 * This exists because E10.1 shipped a defect that made the Overview report a fabricated
 * equal-weight return, and it survived both my own testing and two review passes.
 */
const { test, expect } = require("@playwright/test");

/* A fresh page per test. These functions read and write module-level `state`, so a shared page
   lets one test's fixture leak into the next and makes failures unreproducible. */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => typeof window.computeAllocation === "function" && typeof window.planTrades === "function"
  );
});

const FIXTURE = {
  themes: [
    { key: "alpha", syms: ["A1", "A2"] },
    { key: "beta", syms: ["B1", "B2"] },
    { key: "gamma", syms: ["G1"] },
  ],
  data: {
    A1: { price: 100, marketCap: 8.0e11, peg: 1.2, ev: 18, dfcf: 25, pe: 30 },
    A2: { price: 50, marketCap: 2.0e11, peg: 1.8, ev: 24, dfcf: 35, pe: 40 },
    B1: { price: 200, marketCap: 5.0e11, peg: 0.9, ev: 12, dfcf: 18, pe: 22 },
    B2: { price: 25, marketCap: 6.0e10, peg: 2.5, ev: 30, dfcf: 45, pe: 55 },
    G1: { price: 80, marketCap: 3.0e11, peg: 1.5, ev: 20, dfcf: 28, pe: 33 },
  },
};

async function load(page, opts) {
  await page.evaluate(
    ([F, o]) => {
      state.themes = F.themes.map((t) => ({ key: t.key, name: t.key, color: "#111" }));
      state.themeTickers = {};
      F.themes.forEach((t) => { state.themeTickers[t.key] = t.syms.slice(); });
      state.quotes = {}; state.fundamentals = {};
      Object.keys(F.data).forEach((s) => {
        const d = F.data[s];
        state.quotes[s] = { price: d.price, marketCap: d.marketCap, marketState: "REGULAR" };
        state.fundamentals[s] = { peg: d.peg, ev: d.ev, dfcf: d.dfcf, pe: d.pe, marketCap: d.marketCap };
      });
      Object.keys(o.extraQuotes || {}).forEach((s) => { state.quotes[s] = o.extraQuotes[s]; });
      state.overrides = {}; state.metrics = null; state.metricCfg = null; state.watchlist = [];
      state.cap = o.cap === undefined ? null : o.cap;
      state.weights = Object.assign({}, DEFAULT_CONFIG.weights);
      state.penalty = Object.assign({}, DEFAULT_CONFIG.penalty);
      state.portfolio = {
        holdings: o.holdings || {}, totalContributed: o.contributed || 0,
        versions: [], head: -1, revision: 1,
      };
      rebuildThemeOf();
    },
    [FIXTURE, opts || {}]
  );
}

/* ---------------------------------------------------------------- allocation */

test("allocation sums to 1 and no theme exceeds the cap", async ({ page }) => {
  await load(page, { cap: 0.4 });
  const r = await page.evaluate(() => {
    const funded = computeAllocation().rows.filter((x) => !x.empty);
    return { n: funded.length, sum: funded.reduce((s, x) => s + x.alloc, 0),
             max: Math.max.apply(null, funded.map((x) => x.alloc)) };
  });
  expect(r.n).toBe(3);
  expect(r.sum).toBeCloseTo(1, 9);
  expect(r.max).toBeLessThanOrEqual(0.4 + 1e-9);
});

test("a theme with no names scores 0 and is excluded from the model", async ({ page }) => {
  await load(page, {});
  const r = await page.evaluate(() => {
    state.themeTickers.gamma = [];
    rebuildThemeOf();
    const a = computeAllocation();
    const empty = a.rows.find((x) => x.theme.key === "gamma");
    const funded = a.rows.filter((x) => !x.empty);
    return { emptyAlloc: empty.alloc, emptyFlag: !!empty.empty,
             fundedSum: funded.reduce((s, x) => s + x.alloc, 0), fundedCount: funded.length };
  });
  expect(r.emptyFlag).toBe(true);
  expect(r.emptyAlloc).toBe(0);
  expect(r.fundedCount).toBe(2);
  expect(r.fundedSum).toBeCloseTo(1, 9);   // the survivors absorb it; the book is never left short
});

test("all-zero weights fall back to an equal blend, never a zero-sum model", async ({ page }) => {
  // A zero-sum model would allocate nothing and the next rebalance would liquidate the book.
  await load(page, {});
  const r = await page.evaluate(() => {
    Object.keys(state.weights).forEach((k) => { state.weights[k] = 0; });
    const funded = computeAllocation().rows.filter((x) => !x.empty);
    return { sum: funded.reduce((s, x) => s + x.alloc, 0), min: Math.min.apply(null, funded.map((x) => x.alloc)) };
  });
  expect(r.sum).toBeCloseTo(1, 9);
  expect(r.min).toBeGreaterThan(0);
});

test("applyThemeCap: total preserved, cap respected, and equalised when the cap is too low", async ({ page }) => {
  const r = await page.evaluate(() => {
    const mk = (a) => a.map((v, i) => ({ theme: { key: "t" + i }, alloc: v }));
    const sum = (rows) => rows.reduce((s, x) => s + x.alloc, 0);

    const skewed = mk([0.6, 0.25, 0.1, 0.05]);
    applyThemeCap(skewed, 0.35);

    const low = mk([0.6, 0.25, 0.1, 0.05]);
    applyThemeCap(low, 0.2);                       // 0.2 <= 1/4, so equal weight

    const off = mk([0.6, 0.25, 0.1, 0.05]);
    applyThemeCap(off, 1);                         // no cap at all

    return {
      cappedSum: sum(skewed), cappedMax: Math.max.apply(null, skewed.map((x) => x.alloc)),
      lowAllEqual: low.every((x) => Math.abs(x.alloc - 0.25) < 1e-9),
      offUntouched: off.map((x) => x.alloc).join(","),
      rawKept: skewed.every((x) => typeof x.allocRaw === "number"),
    };
  });
  expect(r.cappedSum).toBeCloseTo(1, 9);
  expect(r.cappedMax).toBeLessThanOrEqual(0.35 + 1e-9);
  expect(r.lowAllEqual).toBe(true);
  expect(r.offUntouched).toBe("0.6,0.25,0.1,0.05");
  expect(r.rawKept).toBe(true);
});

/* ---------------------------------------------------------------- trades: conservation */

test("full rebalance conserves value: the trades sum to exactly the cash added", async ({ page }) => {
  // trade[s] = target[s] - cv[s], so the sum must equal newTotal - cur0 = addCash. Exactly.
  // If this drifts, money is being invented or destroyed somewhere in the plan.
  await load(page, {
    holdings: { A1: { shares: 10, costBasis: 900 }, B1: { shares: 5, costBasis: 900 } },
    contributed: 1800,
  });
  const r = await page.evaluate(() => {
    const p = planTrades(5000, "full");
    return {
      tradeSum: p.universe.reduce((a, s) => a + (p.trade[s] || 0), 0),
      targetSum: p.universe.reduce((a, s) => a + (p.target[s] || 0), 0),
      newTotal: p.newTotal, cur0: p.cur0, missing: p.missing,
    };
  });
  expect(r.cur0).toBeCloseTo(10 * 100 + 5 * 200, 6);
  expect(r.tradeSum).toBeCloseTo(5000, 6);
  expect(r.targetSum).toBeCloseTo(r.newTotal, 6);
  expect(r.missing).toEqual([]);
});

test("cash deploy never sells, and spends exactly the cash added", async ({ page }) => {
  await load(page, {
    holdings: { A1: { shares: 30, costBasis: 3000 }, B2: { shares: 4, costBasis: 100 } },
    contributed: 3100,
  });
  const r = await page.evaluate(() => {
    const p = planTrades(3000, "cash");
    return {
      sum: p.universe.reduce((a, s) => a + (p.trade[s] || 0), 0),
      sells: p.universe.filter((s) => (p.trade[s] || 0) < -1e-9),
    };
  });
  expect(r.sells).toEqual([]);            // the entire point of cash mode
  expect(r.sum).toBeCloseTo(3000, 6);
});

test("a holding in no theme is sold to zero, and value still conserves", async ({ page }) => {
  await load(page, {
    holdings: { A1: { shares: 10, costBasis: 900 }, ZZ: { shares: 4, costBasis: 400 } },
    contributed: 1300,
    extraQuotes: { ZZ: { price: 100, marketCap: 1e9, marketState: "REGULAR" } },
  });
  const r = await page.evaluate(() => {
    const p = planTrades(0, "full");
    return {
      zzTarget: p.target.ZZ, zzTrade: p.trade.ZZ,
      sum: p.universe.reduce((a, s) => a + (p.trade[s] || 0), 0),
      inUniverse: p.universe.indexOf("ZZ") >= 0,
      exitTheme: themeOfSym("ZZ").key,
    };
  });
  expect(r.inUniverse).toBe(true);
  expect(r.exitTheme).toBe("_exit");
  expect(r.zzTarget).toBe(0);
  expect(r.zzTrade).toBeCloseTo(-400, 6);
  expect(r.sum).toBeCloseTo(0, 6);        // no new cash: a pure reshuffle must net to zero
});

/* ---------------------------------------------------------------- version timeline (E10) */

async function pushN(page, n) {
  return page.evaluate((count) => {
    for (let i = 0; i < count; i++) {
      pushVersion({ date: "d" + i, type: i ? "REBALANCE" : "INITIAL", mode: "full",
                    cashIn: 0, valueBefore: 0, valueAfter: 0, alloc: {}, trades: [] });
    }
    return { n: versions().length, head: head(), firstId: versions()[0].id,
             lastId: versions()[versions().length - 1].id, trimmed: timelineTrimmed() };
  }, n);
}

test("history caps at MAX_VERSIONS and re-bases head in the same operation", async ({ page }) => {
  await load(page, { holdings: { A1: { shares: 1, costBasis: 100 } }, contributed: 100 });
  const cap = await page.evaluate(() => MAX_VERSIONS);
  const r = await pushN(page, cap + 5);
  expect(r.n).toBe(cap);
  expect(r.head).toBe(cap - 1);           // head is an INDEX; a front-trim shifts every one of them
  expect(r.firstId).toBe(6);
  expect(r.lastId).toBe(cap + 5);
  expect(r.trimmed).toBe(true);
});

test("once trimmed, undo stops at the oldest kept checkpoint and never wipes holdings", async ({ page }) => {
  // head === -1 means "before the very first build" and zeroes the book. That is correct only while
  // the first build is still in the list, and a total loss once it has been trimmed away.
  await load(page, { holdings: { A1: { shares: 1, costBasis: 100 } }, contributed: 100 });
  await pushN(page, 15);
  const r = await page.evaluate(() => {
    let steps = 0;
    while (canUndo() && steps < 50) { restoreVersion(head() - 1); steps++; }
    return { head: head(), holdings: Object.keys(holdings()).length, canUndo: canUndo() };
  });
  expect(r.head).toBe(0);
  expect(r.holdings).toBeGreaterThan(0);
  expect(r.canUndo).toBe(false);
});

test("an untrimmed timeline still lets undo go back past the first build", async ({ page }) => {
  await load(page, { holdings: { A1: { shares: 1, costBasis: 100 } }, contributed: 100 });
  const r = await page.evaluate(() => {
    pushVersion({ date: "i", type: "INITIAL", mode: "full", cashIn: 100,
                  valueBefore: 0, valueAfter: 100, alloc: {}, trades: [] });
    const before = { trimmed: timelineTrimmed(), canUndo: canUndo() };
    restoreVersion(-1);
    return Object.assign(before, { holdings: Object.keys(holdings()).length, contributed: totalContributed() });
  });
  expect(r.trimmed).toBe(false);
  expect(r.canUndo).toBe(true);
  expect(r.holdings).toBe(0);
  expect(r.contributed).toBe(0);
});

test("undo does not rewind the theme library or the watchlist (E10.2)", async ({ page }) => {
  await load(page, {});
  const r = await page.evaluate(() => {
    state.portfolio.holdings = { A1: { shares: 1, costBasis: 100 } };
    state.portfolio.totalContributed = 100;
    pushVersion({ date: "1", type: "INITIAL", mode: "full", cashIn: 100, valueBefore: 0, valueAfter: 100, alloc: {}, trades: [] });
    state.portfolio.holdings = { A1: { shares: 2, costBasis: 250 } };
    state.portfolio.totalContributed = 250;
    pushVersion({ date: "2", type: "REBALANCE", mode: "full", cashIn: 150, valueBefore: 100, valueAfter: 250, alloc: {}, trades: [] });

    state.themes.push({ key: "added", name: "added", color: "#222" });
    state.themeTickers.added = ["NEW"];
    state.watchlist = [{ sym: "WATCHED", theme: null }];

    restoreVersion(0);
    return {
      themeKept: themes().some((t) => t.key === "added"),
      membershipKept: (tickersOf("added") || []).join(","),
      watchKept: (state.watchlist || []).some((w) => w.sym === "WATCHED"),
      sharesRewound: holdings().A1.shares,
      contributedRewound: totalContributed(),
      snapshotHasNoLibrary: ["themes", "themeTickers", "watchlist"].every((k) => !(k in snapshotState())),
    };
  });
  expect(r.themeKept).toBe(true);          // a library edit must survive an undo of a trade
  expect(r.membershipKept).toBe("NEW");
  expect(r.watchKept).toBe(true);
  expect(r.sharesRewound).toBe(1);         // ...while the transaction itself does rewind
  expect(r.contributedRewound).toBe(100);
  expect(r.snapshotHasNoLibrary).toBe(true);
});

/* ------------------------------------------- the equal-weight chart across a trim (the E10.1 bug) */

test("the equal-weight series opens at the real book value after a trim, not at the new cash", async ({ page }) => {
  // With constant prices an equal-weight book must track the real book exactly. Before the fix the
  // series restarted from one checkpoint's new cash while value and invested stayed cumulative, so
  // a book worth $800 reported equal weight of $100.
  await load(page, {});
  const r = await page.evaluate(() => {
    const SY = ["A1", "A2", "B1"];
    state.themes = SY.map((s) => ({ key: s, name: s, color: "#111" }));
    state.themeTickers = {}; SY.forEach((s) => { state.themeTickers[s] = [s]; });
    SY.forEach((s) => { state.quotes[s] = { price: 10, marketCap: 1e10, marketState: "REGULAR" }; });
    rebuildThemeOf();
    state.portfolio = { holdings: {}, totalContributed: 0, versions: [], head: -1, revision: 1 };

    const sh = { A1: 0, A2: 0, B1: 0 };
    let c = 0;
    const push = (i) => {
      const cash = i === 0 ? 300 : 100, before = c;
      c += cash;
      const per = cash / 3 / 10;
      SY.forEach((s) => { sh[s] += per; });
      state.portfolio.holdings = {};
      SY.forEach((s) => { state.portfolio.holdings[s] = { shares: sh[s], costBasis: sh[s] * 10 }; });
      state.portfolio.totalContributed = c;
      pushVersion({ date: "d" + i, type: i ? "REBALANCE" : "INITIAL", mode: "full", cashIn: cash,
        valueBefore: before, valueAfter: c, alloc: {},
        trades: SY.map((s) => ({ sym: s, theme: s, amount: cash / 3, shares: per, price: 10 })) });
    };

    for (let i = 0; i < 8; i++) push(i);            // 8 checkpoints: under the cap, nothing trimmed
    const un = valueHistory().filter((p) => !p.live);
    const untrimmed = { openEw: un[0].ew, openValue: un[0].value,
                        tracks: un.every((p) => Math.abs(p.ew - p.value) < 1e-6),
                        seeded: !!versions()[0].pxSeed, trimmed: timelineTrimmed() };

    for (let i = 8; i < 15; i++) push(i);           // now past the cap
    const tr = valueHistory().filter((p) => !p.live);
    return { untrimmed, trimmedOpenEw: tr[0].ew, trimmedOpenValue: tr[0].value,
             trimmedTracks: tr.every((p) => Math.abs(p.ew - p.value) < 1e-6),
             seeded: !!versions()[0].pxSeed, seedCount: versions().filter((v) => v.pxSeed).length,
             cashAtOpen: versions()[0].cashIn };
  });

  // untrimmed behaviour must be completely unchanged by the fix
  expect(r.untrimmed.trimmed).toBe(false);
  expect(r.untrimmed.seeded).toBe(false);
  expect(r.untrimmed.openEw).toBeCloseTo(300, 6);   // the initial capital
  expect(r.untrimmed.tracks).toBe(true);

  // and after a trim the window must open where the real book stood
  expect(r.trimmedOpenEw).toBeCloseTo(r.trimmedOpenValue, 6);
  expect(r.trimmedOpenEw).not.toBeCloseTo(r.cashAtOpen, 6);   // the exact bug that shipped
  expect(r.trimmedTracks).toBe(true);
  expect(r.seeded).toBe(true);
  expect(r.seedCount).toBe(1);                      // exactly one seed survives each trim
});
