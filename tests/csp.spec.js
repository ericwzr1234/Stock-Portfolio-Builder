/* E13.1 - the CSP must actually refuse injected script.
 *
 * The point of removing 'unsafe-inline' is that an escaping slip stops being account takeover. The
 * session token lives in localStorage, so any script that RUNS can take it. With the policy in
 * place the browser refuses to run injected script at all, and the same slip is a cosmetic glitch.
 *
 * This is only true if the policy is actually enforced, which is exactly the sort of thing that
 * looks fine and is not. server.py serves www/_headers on HTML, mirroring Pages, so it can be
 * tested here rather than only in production.
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

test("the served policy has no 'unsafe-inline' in script-src", async ({ page }) => {
  const res = await page.request.get("/index.html");
  const csp = res.headers()["content-security-policy"] || "";
  expect(csp, "no CSP served at all").not.toBe("");
  const scriptSrc = /script-src ([^;]*)/.exec(csp)[1];
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).toContain("'self'");
  expect(scriptSrc).toMatch(/'sha256-/);          // the inline blocks are named, not blanket-allowed
});

test("an injected inline <script> does not run", async ({ page }) => {
  const blocked = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to execute/i.test(m.text())) blocked.push(m.text()); });
  await page.goto("/");
  await page.waitForFunction(() => typeof window.showGate === "function");
  const fired = await page.evaluate(() => {
    window.__PWNED = 0;
    /* Exactly the shape an escaping slip produces: markup with a script in it, inserted through
       innerHTML. Under 'unsafe-inline' the browser would run it. */
    const d = document.createElement("div");
    d.innerHTML = '<img src=x onerror="window.__PWNED=1">';
    document.body.appendChild(d);
    const s = document.createElement("script");
    s.textContent = "window.__PWNED = (window.__PWNED||0) + 2;";
    document.body.appendChild(s);
    return window.__PWNED;
  });
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.__PWNED);
  /* Both routes must be dead: the event-handler attribute and the injected <script> element. */
  expect(fired).toBe(0);
  expect(after).toBe(0);
  expect(blocked.length, "the browser did not report refusing anything").toBeGreaterThan(0);
});

test("the app itself still runs, so the policy is not simply blocking everything", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.renderAll === "function");
  /* The inverse of the test above, and the reason it is here: a policy that blocks the app too
     would pass "injected script does not run" while being catastrophic. */
  const r = await page.evaluate(() => ({
    app: typeof window.renderAll === "function",
    gateUp: !document.querySelector("#gate").hidden,
    version: typeof APP_VERSION === "string",
  }));
  expect(r.app).toBe(true);
  expect(r.gateUp).toBe(true);       // the pre-paint inline block that keeps the gate up still ran
  expect(r.version).toBe(true);      // and app.js, which is where APP_VERSION now lives, loaded
});

test("every inline block still in index.html is named by a hash in the CSP", async ({ page }) => {
  const crypto = require("crypto");
  const html = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8");
  const csp = fs.readFileSync(path.join(__dirname, "..", "www", "_headers"), "utf8");
  const line = /^[ \t]*Content-Security-Policy:[ \t]*(.*)$/m.exec(csp)[1];
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  expect(blocks.length).toBeGreaterThan(0);
  for (const b of blocks) {
    const h = "sha256-" + crypto.createHash("sha256").update(b[1], "utf8").digest("base64");
    /* A block whose hash is missing is simply not executed - silently. That is how this design
       fails, so it is what the gate has to catch. */
    expect(line, `block hashed ${h} is not in the policy`).toContain(h);
  }
});
