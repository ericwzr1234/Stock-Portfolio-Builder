/* A computed-style fingerprint of the whole app, for proving a CSS deletion changed nothing.
 *
 * Grepping for a class name cannot answer "is this rule dead": 17 places in index.html build a
 * class attribute by interpolation, so a name can reach the DOM without ever appearing literally.
 * This measures the thing that actually matters instead - what the browser COMPUTES for every
 * element in every state we can reach. Delete the rules, run this again, diff. A rule that was
 * doing nothing cannot change a single computed value.
 *
 *   npx playwright test --config playwright.styleprint.js
 *   -> writes tools/styleprint.json
 *
 * Coverage is the limit, not precision: it proves the deleted rules were dead in the states this
 * visits. So visit every state - every lane, both accordions open, every modal, the panel, the
 * poster, the empty account.
 */
const { test } = require("@playwright/test");
const { seedBook } = require("../tests/book");
const fs = require("fs");

/* The properties this design system actually sets. Fingerprinting all ~340 computed properties
   makes the diff unreadable and picks up UA noise; these are the ones a deleted rule could move. */
const PROPS = [
  "display", "position", "top", "right", "bottom", "left", "float", "clear",
  "width", "height", "min-width", "max-width", "min-height", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-style", "border-radius",
  "background-color", "background-image", "color", "opacity", "visibility",
  "font-family", "font-size", "font-weight", "font-style", "line-height",
  "letter-spacing", "text-transform", "text-align", "text-decoration-line", "white-space",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "justify-content", "align-items", "align-self", "gap",
  "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
  "box-shadow", "transform", "z-index", "overflow-x", "overflow-y", "cursor",
  "font-variant-numeric", "list-style-type", "vertical-align", "table-layout",
];

const snap = (page, label) => page.evaluate(([props, label]) => {
  const out = [];
  const walk = (root) => {
    const all = root.querySelectorAll("*");
    for (const el of all) {
      const cs = getComputedStyle(el);
      /* Identify by structural path, not by index alone: two runs must line up even though the
         clock in the header differs between them. */
      let path = [], n = el;
      while (n && n !== document.documentElement && path.length < 8) {
        const cls = (n.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).sort().join(".");
        path.push(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (cls ? "." + cls : ""));
        n = n.parentElement;
      }
      const style = {};
      for (const p of props) style[p] = cs.getPropertyValue(p);
      out.push({ k: label + "|" + path.reverse().join(">"), s: style });
    }
  };
  walk(document);
  return out;
}, [PROPS, label]);

test("styleprint", async ({ page }) => {
  const frames = [];
  const add = async (label) => { await page.waitForTimeout(120); frames.push(...await snap(page, label)); };

  /* The gate first: seedBook dismisses it, and it is a whole surface of its own. Capture every
     mode, because create-account and recovery show controls sign-in does not. */
  /* Freeze motion. Entrance animations (fade, ctxIn, sdIn) mean two runs sample an element at
     microscopically different points, which showed up as ~30 differences of a few ten-thousandths -
     enough noise to hide a small REAL change. With motion off the comparison is exact, so any
     non-zero diff is a genuine regression. */
  await page.addInitScript(() => {
    const kill = () => {
      const st = document.createElement("style");
      st.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
      document.documentElement.appendChild(st);
    };
    if (document.documentElement) kill();
    else document.addEventListener("DOMContentLoaded", kill);
  });

  await page.goto("/");
  await page.waitForFunction(() => typeof window.showGate === "function");
  await add("gate-signin");
  /* setMode is module-scoped. The guarded call here silently did nothing, so this loop was
     fingerprinting the sign-in screen three times and calling it three modes. Drive the controls. */
  await page.click("#gateToggle");   await add("gate-signup");
  await page.click("#gateToggle");   await add("gate-back-to-signin");
  await page.click("#gateForgot");   await add("gate-recover");

  await seedBook(page);
  await page.evaluate(() => { window.savePortfolio = async () => true; });

  // ---- lane 1, collapsed then with every portfolio and the live-prices block open
  await add("overview");
  await page.evaluate(() => {
    themes().forEach(t => toggleTheme(t.key));
    if (typeof toggleLive === "function") toggleLive();
  });
  await add("overview-open");
  for (const r of ["1D", "1W", "1M", "3M", "1Y", "ALL"]) {
    await page.evaluate((x) => document.querySelector(`#ovRange button[data-range="${x}"]`).click(), r);
    await add("overview-range-" + r);
  }
  await page.evaluate(() => { const b = document.querySelector("#retDol"); if (b) b.click(); });
  await add("overview-return-dollars");

  // ---- lane 2, collapsed then open, plus the catalog
  await page.evaluate(() => switchView("fundamentals"));
  await add("model");
  await page.evaluate(() => themes().forEach(t => toggleFTheme(t.key)));
  await add("model-open");
  await page.evaluate(() => openMetricPicker());
  await add("model-catalog");
  await page.evaluate(() => closeModal());

  // ---- lane 3, all three modes
  await page.evaluate(() => switchView("calc"));
  await add("trade");
  for (const m of ["cash", "realign", "full"]) {
    await page.evaluate((x) => document.querySelector(`[data-mode="${x}"]`).click(), m);
    await add("trade-" + m);
  }

  // ---- research: resting, a search result, and the add-to-portfolio dialog
  await page.evaluate(() => {
    switchView("screener");
    window.dsSearch = async () => [
      { symbol: "AMD", name: "Advanced Micro Devices", exchange: "NMS", type: "EQUITY" },
      { symbol: "NVDA", name: "Nvidia", exchange: "NMS", type: "EQUITY" }];
    window.dsQuotes = async (syms) => { const o = {}; syms.forEach(s => o[s] = { price: 50, prevClose: 49, changePct: 2 }); return { quotes: o }; };
  });
  await add("research");
  await page.fill("#resQuery", "amd");
  await page.waitForSelector(".rs3-row");
  await add("research-results");
  await page.evaluate(() => document.querySelector("[data-wladd]").click());
  await add("research-addto");
  await page.evaluate(() => { const b = document.querySelector('#apHow [data-how="swap"]'); if (b) b.click(); });
  await add("research-addto-swap");
  await page.evaluate(() => closeModal());

  // ---- the stock panel, both for a held name and one you do not own
  await page.evaluate(() => {
    state.statements.NVDA = { quarters: [1, 2, 3, 4].map(i => ({ date: "2025-Q" + i,
      revenue: 1e9 * i, netIncome: 2e8 * i, ebitda: 3e8 * i, totalAssets: 5e9 * i })) };
    openStockDetail("NVDA");
  });
  await page.waitForSelector(".sd-m");
  await add("panel-held");
  await page.evaluate(() => { const t = document.querySelectorAll(".sd-tab")[1]; if (t) t.click(); });
  await add("panel-balance");
  await page.evaluate(() => closeModal());

  // ---- lane 4, current then stepped back so a redoable future exists
  await page.evaluate(() => switchView("history"));
  await add("history");
  await page.evaluate(() => document.querySelectorAll(".hi3-row")[2].click());
  await add("history-oldest-selected");
  await page.evaluate(() => { const u = document.querySelector('.hi3-acts [data-vaction="undo"]'); if (u) u.click(); });
  await page.waitForTimeout(250);
  await add("history-undone");

  // ---- transient chrome: a toast, and the guided tour
  await page.evaluate(() => { if (typeof toast === "function") toast("styleprint"); });
  await add("toast");
  await page.evaluate(() => { if (typeof coachStart === "function") coachStart("prices", true); });
  await page.waitForTimeout(600);
  await add("tour");
  await page.evaluate(() => { if (typeof coachEnd === "function") coachEnd(); });

  // ---- the empty account: the poster, and every empty state behind it
  await page.evaluate(() => {
    state.themes = []; state.themeTickers = {}; state.watchlist = [];
    state.portfolio = { holdings: {}, versions: [], head: -1 };
    rebuildThemeOf(); renderAll();
  });
  await add("firstrun");
  for (const v of ["prices", "fundamentals", "calc", "screener", "history"]) {
    await page.evaluate((x) => switchView(x), v);
    await add("empty-" + v);
  }

  const map = {};
  for (const f of frames) if (!(f.k in map)) map[f.k] = f.s;   // first occurrence wins; keys are structural
  fs.writeFileSync("tools/styleprint.json", JSON.stringify(map, null, 0));
  console.log("styleprint: " + Object.keys(map).length + " element states across " +
              new Set(frames.map(f => f.k.split("|")[0])).size + " screens");
});
