/* /api/history - the price series E14 and E15 are both built on.
 *
 * Two things matter here and they are different in kind. The SHAPE must be right, because a
 * misaligned or silently-shortened series produces a portfolio total that sums different dates for
 * different names and looks entirely plausible while being wrong. And the SYMBOL must never escape
 * the URL path, because unlike every other route this one interpolates it into the path itself.
 */
const { test, expect } = require("@playwright/test");
const { makeKeypair, sign, goodClaims, loadWorker, call } = require("./worker");

const API = "https://x.pages.dev/api/history";

/* A Yahoo chart response, trimmed to the fields the Worker reads. Null closes are deliberate -
 * Yahoo pads halted and untraded bars that way and the forward-fill is the thing under test. */
function chart(opts) {
  const o = opts || {};
  return {
    chart: { result: [{
      timestamp: o.t || [100, 200, 300, 400],
      indicators: { quote: [{
        close: "close" in o ? o.close : [10, null, 12, 13],
        open: [1, 1, 1, 1], high: [9, 9, 9, 9], low: [2, 2, 2, 2], volume: [5, 5, 5, 5],
      }] },
      events: o.splits ? { splits: o.splits } : undefined,
    }] },
  };
}

/* Records every upstream URL, so a test can assert what actually reached Yahoo. */
function stub(body) {
  const seen = [];
  const fn = async (u) => { seen.push(u); return { ok: true, status: 200,
    text: async () => JSON.stringify(body || chart()) }; };
  fn.seen = seen;
  return fn;
}

async function get(query, body) {
  const kp = makeKeypair();
  const up = stub(body);
  const worker = await loadWorker(kp.jwk, up);
  const res = await call(worker, API + query, sign(kp.privateKey, goodClaims()));
  let json = null;
  try { json = JSON.parse(await res.text()); } catch (e) {}
  return { res, json, seen: up.seen };
}

test("it returns timestamps, closes and splits for a symbol", async () => {
  const { res, json } = await get("?symbols=NVDA&range=1mo");
  expect(res.status).toBe(200);
  expect(json.range).toBe("1mo");
  expect(json.history.NVDA.t.length).toBe(4);
  expect(json.history.NVDA.c.length).toBe(4);
});

test("a null bar is carried forward, not dropped", async () => {
  /* Dropping it would leave this symbol with 3 points while its neighbours have 4, and every
     later index would compare different dates. The value is the last known close. */
  const { json } = await get("?symbols=NVDA&range=1mo");
  expect(json.history.NVDA.c).toEqual([10, 10, 12, 13]);
  expect(json.history.NVDA.t).toEqual([100, 200, 300, 400]);
});

test("bars before the first real price are skipped, since there is nothing to carry", async () => {
  const { json } = await get("?symbols=NVDA&range=1mo", chart({ close: [null, null, 12, 13] }));
  expect(json.history.NVDA.c).toEqual([12, 13]);
  expect(json.history.NVDA.t).toEqual([300, 400]);
});

test("splits come through as exact ratios, never inferred", async () => {
  const { json } = await get("?symbols=NVDA&range=5y",
    chart({ splits: { "1718026200": { date: 1718026200, numerator: 10, denominator: 1 } } }));
  expect(json.history.NVDA.splits).toEqual([{ date: 1718026200, num: 10, den: 1 }]);
});

test("a symbol with no splits reports an empty list, not a missing key", async () => {
  const { json } = await get("?symbols=NVDA&range=5y");
  expect(json.history.NVDA.splits).toEqual([]);
});

test("only timestamps, closes and splits cross the wire", async () => {
  /* Yahoo sends OHLC and volume for every bar. Forwarding them would multiply a five-year series
     several-fold for data no chart here reads. */
  const { json } = await get("?symbols=NVDA&range=1mo");
  expect(Object.keys(json.history.NVDA).sort()).toEqual(["c", "splits", "t"]);
});

test("an unknown range is refused rather than guessed", async () => {
  const { res } = await get("?symbols=NVDA&range=7y");
  expect(res.status).toBe(400);
});

test("a missing range is refused", async () => {
  expect((await get("?symbols=NVDA")).res.status).toBe(400);
});

const HOSTILE = {
  "path traversal":        "../../v7/finance/quote",
  "a full URL":            "https://evil.example/x",
  "a slash":               "NV/DA",
  "a query of its own":    "NVDA?a=b",
  "an @ host swap":        "NVDA@evil.example",
  "a space":               "NV DA",
  "much too long":         "A".repeat(40),
};

for (const [name, sym] of Object.entries(HOSTILE)) {
  test(`refused, and never reaches Yahoo: ${name}`, async () => {
    const { res, seen } = await get("?symbols=" + encodeURIComponent(sym) + "&range=1mo");
    /* Two assertions, and the second is the real one. A 400 is good; what matters is that our
       authenticated, our-reputation fetch was never pointed anywhere the caller chose. */
    expect(res.status).toBe(400);
    expect(seen.filter((u) => !u.includes("jwks"))).toEqual([]);
  });
}

test("legitimate punctuation still works: BRK-B, ^GSPC, 7203.T, EURUSD=X", async () => {
  for (const sym of ["BRK-B", "^GSPC", "7203.T", "EURUSD=X"]) {
    const { res, json } = await get("?symbols=" + encodeURIComponent(sym) + "&range=1mo");
    expect(res.status, sym).toBe(200);
    expect(Object.keys(json.history), sym).toEqual([sym]);
  }
});

test("it requires a session, like every other data route", async () => {
  const kp = makeKeypair();
  const worker = await loadWorker(kp.jwk, stub());
  expect((await call(worker, API + "?symbols=NVDA&range=1mo", null)).status).toBe(401);
});
