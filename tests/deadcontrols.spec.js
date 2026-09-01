/* Every control the user can see must actually do something.
 *
 * WHY THIS EXISTS. The "ALL HISTORY - UNDO ->" button on Overview rendered, invited a click, and
 * had no handler at all - built to spec section 4.2 item 6 and never wired. Nothing failed. No test
 * covered it, nothing threw, and it looked perfect in every screenshot. A control that does nothing
 * is worse than a missing one: it teaches the user the app is broken and leaves them unable to tell
 * which other buttons to trust.
 *
 * HOW IT JUDGES. A visible, enabled button is considered reachable if any of these hold:
 *   - it has an own onclick/onpointerdown, or
 *   - it carries (or sits inside) one of the data-* attributes this app delegates on, or
 *   - its id appears in index.html MORE THAN ONCE - the markup that declares it, plus at least one
 *     JS reference. That last rule is exactly the signal that exposed the bug: #ovAllHistory
 *     appeared precisely once, in the markup, and nowhere else.
 * Wiring through a local variable (`const b = $("#x"); b.addEventListener(...)`) still counts,
 * because the id string is present twice. A first attempt at this test matched on
 * `$("#id").addEventListener` and produced a false positive for exactly that pattern.
 */
const { test, expect } = require("@playwright/test");
const { seedBook } = require("./book");

const DELEGATED = [
  "data-view", "data-sub", "data-range", "data-stock", "data-thmtoggle", "data-fthmtoggle",
  "data-mode", "data-wstep", "data-mpolicy", "data-mpick", "data-how", "data-vaction",
  "data-vsel", "data-vid", "data-rmvtkr", "data-addticker", "data-editth", "data-delth",
  "data-wladd", "data-wlsym", "data-rsadd", "data-sdtab", "data-reset", "data-edit",
  "data-vtoggle", "data-pv", "data-d", "data-sd-sym", "data-wkey", "data-mpen",
];

const audit = (page, screen) => page.evaluate(([screen, DELEGATED]) => {
  const out = [];
  for (const b of document.querySelectorAll("button")) {
    if (!b.offsetParent || b.disabled || b.closest("[hidden]")) continue;
    out.push({
      screen,
      id: b.id || "",
      cls: (b.getAttribute("class") || "").split(" ")[0],
      text: (b.textContent || "").trim().slice(0, 34),
      own: !!(b.onclick || b.onpointerdown),
      deleg: DELEGATED.some((a) => b.hasAttribute(a) || b.closest("[" + a + "]")),
    });
  }
  return out;
}, [screen, DELEGATED]);

test("no visible button is a dead control", async ({ page }) => {
  /* E13.1 moved the application to app.js, so a button declared in index.html is wired from a
     different file. "The source" is both, or every button looks dead. */
  const src = (await page.request.get("/index.html").then((r) => r.text()))
            + (await page.request.get("/app.js").then((r) => r.text()));
  const mentions = (id) => (src.match(new RegExp("\\b" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g")) || []).length;

  const found = [];
  await seedBook(page);
  await page.evaluate(() => { window.savePortfolio = async () => true; });
  found.push(...await audit(page, "overview"));
  await page.evaluate(() => { themes().forEach((t) => toggleTheme(t.key)); toggleLive(); });
  found.push(...await audit(page, "overview-open"));
  await page.evaluate(() => switchView("fundamentals"));
  await page.evaluate(() => themes().forEach((t) => toggleFTheme(t.key)));
  found.push(...await audit(page, "model"));
  await page.evaluate(() => openMetricPicker());
  found.push(...await audit(page, "model-catalog"));
  await page.evaluate(() => closeModal());
  await page.evaluate(() => switchView("calc"));
  found.push(...await audit(page, "trade"));
  await page.evaluate(() => switchView("screener"));
  found.push(...await audit(page, "research"));
  await page.evaluate(() => switchView("history"));
  found.push(...await audit(page, "history"));

  const dead = found.filter((b) => !b.own && !b.deleg && !(b.id && mentions(b.id) > 1));
  const seen = new Set();
  const uniq = dead.filter((d) => {
    const k = (d.id || d.cls) + d.text;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  expect(uniq.map((d) => `${d.screen} ${d.id ? "#" + d.id : "." + d.cls} "${d.text}"`)).toEqual([]);
});
