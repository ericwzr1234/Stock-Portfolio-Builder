/* Hostile shapes arriving from the data layer.
 *
 * tests/fuzzengine.spec.js mutates `state` directly, which tests the ENGINE but walks straight past
 * the INGEST - and ingest is where Yahoo's shape actually arrives. Yahoo is an unauthenticated third
 * party; our proxy parses its JSON and hands it on. The merge is
 *
 *     state.quotes = Object.assign({}, state.quotes, d.quotes)
 *
 * which is doing more than it looks. Object.assign over a string spreads it into index keys; over an
 * object carrying "__proto__" it invokes a setter rather than creating a property. So this feeds the
 * loaders shapes a broken, hostile or man-in-the-middled feed could produce, and asserts three
 * things: nothing throws, no prototype is polluted, and no junk reaches `state`.
 */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const SHAPES = {
  "undefined":                    "undefined",
  "null":                         "null",
  "empty object (no quotes key)": "({})",
  "quotes: null":                 "({quotes:null})",
  "quotes: a string":             "({quotes:'abcdef'})",
  "quotes: an array":             "({quotes:[1,2,3]})",
  "quotes: a number":             "({quotes:42})",
  "quotes: __proto__ payload":    "JSON.parse('{\"quotes\":{\"__proto__\":{\"polluted\":true}}}')",
  "quotes: constructor payload":  "JSON.parse('{\"quotes\":{\"constructor\":{\"prototype\":{\"polluted\":true}}}}')",
  "a symbol mapped to null":      "({quotes:{NVDA:null}})",
  "a symbol mapped to a string":  "({quotes:{NVDA:'nope'}})",
  "a symbol mapped to an array":  "({quotes:{NVDA:[1,2]}})",
  "price is an object":           "({quotes:{NVDA:{price:{v:1}, prevClose:1}}})",
  "a 10KB symbol key":            "({quotes:{['X'.repeat(10000)]:{price:1,prevClose:1}}})",
  "5000 symbols at once":         "(()=>{const q={};for(let i=0;i<5000;i++)q['S'+i]={price:1,prevClose:1};return {quotes:q};})()",
  "deeply nested value":          "(()=>{let o={v:1};for(let i=0;i<500;i++)o={n:o};return {quotes:{NVDA:{price:1,prevClose:1,deep:o}}};})()",
};

const run = (page, expr) => page.evaluate(async (expr) => {
  const out = { threw: null };
  /* Every loader gets the same hostile shape. dsFundamentals and dsStatements return the map
     directly rather than an envelope, so hand them the inner value where there is one. */
  const shape = (0, eval)(expr);
  window.dsQuotes = async () => shape;
  window.dsFundamentals = async () => (shape && shape.quotes !== undefined ? shape.quotes : shape);
  window.dsStatements = async () => (shape && shape.quotes !== undefined ? shape.quotes : shape);
  try {
    await loadQuotes();
  } catch (e) { out.threw = "loadQuotes: " + String(e && e.message).slice(0, 90); }
  if (!out.threw) {
    try { await loadFundamentals(false); }
    catch (e) { out.threw = "loadFundamentals: " + String(e && e.message).slice(0, 90); }
  }
  if (!out.threw) {
    try { await loadStatements(["NVDA"], false); }
    catch (e) { out.threw = "loadStatements: " + String(e && e.message).slice(0, 90); }
  }
  try { renderAll(); }
  catch (e) { out.threw = (out.threw || "") + " | renderAll: " + String(e && e.message).slice(0, 90); }

  out.polluted = ({}).polluted !== undefined || Object.prototype.polluted !== undefined;
  out.protoMoved = Object.getPrototypeOf(state.quotes) !== Object.prototype;
  out.indexKeys = Object.keys(state.quotes).filter((k) => /^\d+$/.test(k)).length;
  out.total = curTotal();
  out.finite = Number.isFinite(curTotal()) && Number.isFinite(dayPL());
  return out;
}, expr);

for (const [name, expr] of Object.entries(SHAPES)) {
  test(`ingest survives: ${name}`, async ({ page }) => {
    await seedBook(page);
    await page.evaluate(() => { window.savePortfolio = async () => true; });
    const r = await run(page, expr);

    // 1. A bad feed must not take the app down. A throw here kills the 60s refresh loop.
    expect(r.threw, `threw -> ${r.threw}`).toBeNull();

    // 2. Nothing from a feed may reach a prototype. This is the whole point of the exercise.
    expect(r.polluted, "Object.prototype was polluted by feed data").toBe(false);
    expect(r.protoMoved, "state.quotes had its prototype replaced").toBe(false);

    // 3. Object.assign over a string spreads it into 0,1,2... keys. Those become fake symbols.
    expect(r.indexKeys, "numeric index keys leaked into state.quotes").toBe(0);

    // 4. And the money still computes to a real number.
    expect(r.finite, `curTotal=${r.total}`).toBe(true);
  });
}
