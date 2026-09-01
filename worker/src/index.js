/* The market-data proxy, as a Cloudflare Worker.
 *
 * It exists for the same reason server.py does: a browser cannot call Yahoo directly (CORS), and
 * Yahoo's quote endpoint needs a cookie + crumb handshake. Under Pages this is mounted on /api/* of
 * the SAME origin as the page, so the client's relative fetches keep working unchanged and the CORS
 * half of the job disappears.
 *
 * Response shapes are the CONTRACT — index.html reads them directly and server.py must stay
 * interchangeable with this. Every field here is diffed against server.py before cutover.
 *
 * NOT SERVED HERE, deliberately: /api/portfolio. It reads and writes a portfolio file next to the
 * server with no authentication — fine on localhost, an open read/write endpoint in public. E6 moved
 * everything to Supabase and it is only reachable behind isPrivateHost().
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/* Module scope survives between requests in a warm isolate, so the handshake is reused rather than
   repeated on every call — the spike paid two extra upstream requests each time. It is not shared
   across isolates or colos, and does not need to be: a miss costs one handshake. */
let _sess = { cookie: null, crumb: null, at: 0 };
const SESSION_TTL_MS = 20 * 60 * 1000;

/* Matches server.py's QUOTE_TTL. With several users polling the same tickers this collapses their
   requests onto one upstream call per minute instead of one each. */
let _quoteCache = { at: 0, data: {} };
const QUOTE_TTL_MS = 60 * 1000;

const j = (obj, status, extraHeaders) =>
  new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, extraHeaders || {}),
  });

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
/* Yahoo returns a scalar, {raw, fmt}, or a bare {} meaning "no value". Mirrors server.py's _rv,
   which returns x.get("raw") for any dict — i.e. None when there is no raw.
   Normalising undefined to null matters more than it looks: JSON.stringify DROPS undefined keys
   entirely, so a sparse symbol came back missing a dozen fields the client expects to exist, while
   Python emitted them as null. The diff harness caught exactly that on ETFs. */
const rv = (d, k) => {
  const x = d && d[k];
  if (x && typeof x === "object") { const v = "raw" in x ? x.raw : null; return v === undefined ? null : v; }
  return x === undefined ? null : x;
};

function qs(params) {
  const sp = new URLSearchParams();
  for (const k in params) if (params[k] != null && params[k] !== "") sp.set(k, String(params[k]));
  const s = sp.toString();
  return s ? "?" + s : "";
}

async function yGet(url, params, cookie) {
  const headers = { "User-Agent": UA, Accept: "application/json,text/plain,*/*" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url + qs(params), { headers, redirect: "follow" });
  return { status: res.status, text: await res.text(), res };
}

/* Workers have no cookie jar, so the Set-Cookie pairs are collected by hand. */
function cookiesFrom(res) {
  let lines = [];
  try { if (typeof res.headers.getSetCookie === "function") lines = res.headers.getSetCookie(); } catch (e) {}
  if (!lines.length) { const one = res.headers.get("set-cookie"); if (one) lines = [one]; }
  return lines
    .map((l) => String(l).split(";")[0].trim())
    .filter((p) => p && p.includes("="))
    .join("; ");
}

async function ensureSession(force) {
  if (!force && _sess.crumb && Date.now() - _sess.at < SESSION_TTL_MS) return _sess;
  // fc.yahoo.com is only for the cookie; it usually 404s, which is expected and fine.
  let cookie = null;
  try { const a = await yGet("https://fc.yahoo.com/", null, null); cookie = cookiesFrom(a.res); } catch (e) {}
  let crumb = null;
  try {
    const b = await yGet("https://query2.finance.yahoo.com/v1/test/getcrumb", null, cookie);
    const c = (b.text || "").trim();
    /* A crumb is a short token with NO WHITESPACE. Without the whitespace test an error body passes:
       a throttled edge returns "Edge: Too Many Requests" — 23 chars, no "<" — which then gets sent
       as ?crumb= and makes every later call fail for a reason that looks nothing like throttling.
       Identical to server.py's ensure_session and index.html's yEnsureCrumb; the three must agree. */
    if (c && c.indexOf("<") < 0 && c.length < 40 && !/\s/.test(c)) crumb = c;
  } catch (e) {}
  _sess = { cookie, crumb, at: Date.now() };
  return _sess;
}

/* ------------------------------------------------------------------ quotes */

async function fetchQuotes(syms) {
  const s = await ensureSession();
  const out = {};
  const fields = "regularMarketPrice,regularMarketChange,regularMarketChangePercent," +
    "regularMarketPreviousClose,marketCap,shortName,longName,marketState,currency," +
    "regularMarketTime,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketVolume," +
    "averageDailyVolume3Month,averageDailyVolume10Day,quoteType";

  for (let i = 0; i < syms.length; i += 40) {          // same chunk size as the native client
    const chunk = syms.slice(i, i + 40);
    let r = await yGet("https://query1.finance.yahoo.com/v7/finance/quote",
      { symbols: chunk.join(","), fields, crumb: s.crumb || "" }, s.cookie);
    if (r.status === 401 || r.status === 403) {         // stale crumb: re-handshake once, then retry
      const s2 = await ensureSession(true);
      r = await yGet("https://query1.finance.yahoo.com/v7/finance/quote",
        { symbols: chunk.join(","), fields, crumb: s2.crumb || "" }, s2.cookie);
    }
    let results = [];
    try { results = (((JSON.parse(r.text) || {}).quoteResponse) || {}).result || []; } catch (e) {}
    results.forEach((q) => {
      const sym = q.symbol; if (!sym) return;
      out[sym] = {
        price: num(rv(q, "regularMarketPrice")), change: num(rv(q, "regularMarketChange")),
        changePct: num(rv(q, "regularMarketChangePercent")), prevClose: num(rv(q, "regularMarketPreviousClose")),
        marketCap: num(rv(q, "marketCap")), name: q.shortName || q.longName || sym,
        marketState: q.marketState || null, currency: q.currency || null, quoteType: q.quoteType || null, time: num(rv(q, "regularMarketTime")),
        high52: num(rv(q, "fiftyTwoWeekHigh")), low52: num(rv(q, "fiftyTwoWeekLow")),
        vol: num(rv(q, "regularMarketVolume")),
        avgVol: num(rv(q, "averageDailyVolume3Month")) || num(rv(q, "averageDailyVolume10Day")),
        source: "live",
      };
    });
  }
  return out;
}

async function getQuotes(syms) {
  const fresh = Date.now() - _quoteCache.at < QUOTE_TTL_MS;
  if (fresh && syms.every((s) => s in _quoteCache.data)) {
    const hit = {}; syms.forEach((s) => { hit[s] = _quoteCache.data[s]; });
    return hit;
  }
  const live = await fetchQuotes(syms);
  if (Object.keys(live).length) {
    _quoteCache = { at: Date.now(), data: Object.assign({}, _quoteCache.data, live) };
  }
  const out = {};
  syms.forEach((s) => { if (_quoteCache.data[s]) out[s] = _quoteCache.data[s]; });
  return out;
}

/* ------------------------------------------------- fundamentals + statements */

/* v10/quoteSummary and the timeseries endpoint each take ONE symbol, so the fan-out is forced.
   The concurrency is not: 4 matches server.py's thread pools and the client's yMapLimit. Bursts
   draw throttling far more readily than steady volume, and these leave from a datacenter IP. */
const CONCURRENCY = 4;
async function mapLimit(items, fn) {
  const queue = items.slice();
  const workers = [];
  for (let w = 0; w < Math.min(CONCURRENCY, queue.length); w++) {
    workers.push((async () => { while (queue.length) await fn(queue.shift()); })());
  }
  await Promise.all(workers);
}

function momentum(price, ma50, ma200) {
  if (!(typeof price === "number" && price > 0)) return null;
  const parts = [];
  if (typeof ma50 === "number" && ma50 > 0) parts.push([0.6, price / ma50 - 1]);
  if (typeof ma200 === "number" && ma200 > 0) parts.push([0.4, price / ma200 - 1]);
  if (!parts.length) return null;
  return parts.reduce((a, p) => a + p[0] * p[1], 0) / parts.reduce((a, p) => a + p[0], 0);
}

async function fundamentals(syms) {
  const s = await ensureSession();
  const out = {};
  await mapLimit(syms, async (sym) => {
    try {
      const r = await yGet("https://query1.finance.yahoo.com/v10/finance/quoteSummary/" + encodeURIComponent(sym),
        { modules: "defaultKeyStatistics,price,financialData,summaryDetail", crumb: s.crumb || "" }, s.cookie);
      const res = JSON.parse(r.text).quoteSummary.result[0];
      const ks = res.defaultKeyStatistics || {}, pr = res.price || {},
            fd = res.financialData || {}, sd = res.summaryDetail || {};

      let peg = rv(ks, "trailingPegRatio"); if (peg == null) peg = rv(ks, "pegRatio");
      const mc = rv(pr, "marketCap"), price = rv(pr, "regularMarketPrice");
      const td = rv(fd, "totalDebt") || 0, cash = rv(fd, "totalCash") || 0;
      const fcf = rv(fd, "freeCashflow");
      let dfcf; if (fcf == null) dfcf = null; else if (fcf > 0) dfcf = td / fcf; else dfcf = -1.0;
      let pe = rv(sd, "trailingPE"), peCalc = false;
      if (pe == null) { const ni = rv(ks, "netIncomeToCommon"); if (mc && typeof ni === "number" && ni > 0) { pe = mc / ni; peCalc = true; } }
      let ev = rv(ks, "enterpriseToEbitda"), evCalc = false;
      if (ev == null) { const eb = rv(fd, "ebitda"); if (mc && typeof eb === "number" && eb !== 0) { ev = (mc + td - cash) / eb; evCalc = true; } }
      let fwdpe = rv(sd, "forwardPE"); if (fwdpe == null) fwdpe = rv(ks, "forwardPE");
      let dyield = rv(sd, "dividendYield"); if (dyield == null) dyield = rv(sd, "trailingAnnualDividendYield");
      let beta = rv(sd, "beta"); if (beta == null) beta = rv(ks, "beta");

      out[sym] = {
        peg, ev, evCalc, dfcf, pe, peCalc,
        mom: momentum(price, rv(sd, "fiftyDayAverage"), rv(sd, "twoHundredDayAverage")),
        marketCap: mc, price, name: pr.shortName || pr.longName || sym, source: "live",
        financialCurrency: rv(fd, "financialCurrency"), currency: rv(pr, "currency"),
        forwardPE: fwdpe, evRev: rv(ks, "enterpriseToRevenue"),
        ps: rv(sd, "priceToSalesTrailing12Months"), pb: rv(ks, "priceToBook"),
        grossMargin: rv(fd, "grossMargins"), opMargin: rv(fd, "operatingMargins"), netMargin: rv(fd, "profitMargins"),
        roe: rv(fd, "returnOnEquity"), roa: rv(fd, "returnOnAssets"), debtToEquity: rv(fd, "debtToEquity"),
        currentRatio: rv(fd, "currentRatio"), quickRatio: rv(fd, "quickRatio"),
        revGrowth: rv(fd, "revenueGrowth"), earnGrowth: rv(fd, "earningsGrowth"),
        divYield: dyield, payout: rv(sd, "payoutRatio"), beta,
        fcf, ebitda: rv(fd, "ebitda"), revenue: rv(fd, "totalRevenue"), cash: rv(fd, "totalCash"), debt: rv(fd, "totalDebt"),
      };
    } catch (e) { /* leave missing - the client's median/seed fallback covers it */ }
  });
  return out;
}

/* Yahoo's timeseries key -> our field name. Must stay identical to index.html's STMT_FIELD_MAP and
   server.py's; a name that drifts here silently drops a column from the statements view. */
const STMT_FIELDS = {
  quarterlyTotalRevenue: "revenue", quarterlyCostOfRevenue: "costOfRevenue", quarterlyGrossProfit: "grossProfit",
  quarterlyOperatingExpense: "operatingExpense", quarterlyOperatingIncome: "operatingIncome",
  quarterlyPretaxIncome: "pretaxIncome", quarterlyTaxProvision: "taxProvision", quarterlyNetIncome: "netIncome",
  quarterlyNetIncomeCommonStockholders: "netIncomeCommon", quarterlyEBIT: "ebit", quarterlyEBITDA: "ebitda",
  quarterlyInterestExpense: "interestExpense", quarterlyDilutedEPS: "dilutedEPS",
  quarterlyDilutedAverageShares: "dilutedShares", quarterlyBasicAverageShares: "basicShares",
  quarterlyTotalAssets: "totalAssets", quarterlyTotalLiabilitiesNetMinorityInterest: "totalLiabilities",
  quarterlyStockholdersEquity: "equity", quarterlyCommonStockEquity: "commonEquity",
  quarterlyCashAndCashEquivalents: "cash", quarterlyCashCashEquivalentsAndShortTermInvestments: "cashAndSTI",
  quarterlyTotalDebt: "totalDebt", quarterlyCurrentAssets: "currentAssets", quarterlyCurrentLiabilities: "currentLiabilities",
  quarterlyInventory: "inventory", quarterlyInvestedCapital: "investedCapital",
  quarterlyOperatingCashFlow: "operatingCashFlow", quarterlyCapitalExpenditure: "capex", quarterlyFreeCashFlow: "fcf",
  quarterlyRepurchaseOfCapitalStock: "buyback", quarterlyCashDividendsPaid: "dividendsPaid",
};

async function statements(syms) {
  const s = await ensureSession();
  const out = {};
  const types = Object.keys(STMT_FIELDS).join(",");
  const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 6 * 366 * 24 * 3600;
  await mapLimit(syms, async (sym) => {
    try {
      const r = await yGet("https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/" +
        encodeURIComponent(sym),
        { symbol: sym, type: types, period1: p1, period2: p2, merge: "false", padTimeSeries: "false",
          lang: "en-US", region: "US", crumb: s.crumb || "" }, s.cookie);
      const result = ((JSON.parse(r.text) || {}).timeseries || {}).result || [];
      const byDate = {};
      result.forEach((series) => {
        const t = ((series.meta || {}).type || [])[0];
        const field = STMT_FIELDS[t]; if (!field) return;
        (series[t] || []).forEach((pt) => {
          if (!pt || pt.asOfDate == null) return;
          const raw = (pt.reportedValue || {}).raw;      // padded points carry no raw; skip them
          if (raw == null) return;
          (byDate[pt.asOfDate] = byDate[pt.asOfDate] || {})[field] = raw;
        });
      });
      const dates = Object.keys(byDate).sort().slice(-9);
      const asOf = Math.floor(Date.now() / 1000);
      out[sym] = dates.length
        ? { sym, quarters: dates.map((d) => Object.assign({ date: d }, byDate[d])), asOf, source: "live" }
        // The sentinel matters: without it a genuinely statement-less name is refetched on every open.
        : { sym, quarters: [], asOf, source: "empty" };
    } catch (e) { /* leave uncached so it retries; the pulled fallback stands */ }
  });
  return out;
}

/* ------------------------------------------------------------ search, peers */

async function search(q) {
  if (!q) return [];
  const s = await ensureSession();
  const r = await yGet("https://query2.finance.yahoo.com/v1/finance/search",
    { q, quotesCount: 10, newsCount: 0, listsCount: 0 }, s.cookie);
  let quotes = [];
  try { quotes = (JSON.parse(r.text) || {}).quotes || []; } catch (e) {}
  return quotes
    .filter((it) => it.symbol && ["EQUITY", "ETF"].includes(String(it.quoteType || "").toUpperCase()))
    .map((it) => ({
      symbol: it.symbol, name: it.shortname || it.longname || it.symbol,
      exchange: it.exchDisp || it.exchange || "", type: String(it.quoteType || "").toUpperCase(),
    }));
}

async function peers(sym) {
  if (!sym) return [];
  const s = await ensureSession();
  const r = await yGet("https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/" +
    encodeURIComponent(sym), null, s.cookie);
  try {
    const res = (((JSON.parse(r.text) || {}).finance) || {}).result || [];
    return ((res[0] || {}).recommendedSymbols || []).map((x) => x.symbol).filter(Boolean);
  } catch (e) { return []; }
}

/* ------------------------------------------------------------------ router */

function symbolsOf(url) {
  return (url.searchParams.get("symbols") || "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 200);
}


/* ===== E13.4 - who may call this proxy =======================================================
 *
 * Until 2026-09-01 every route here answered anybody. The page is unlisted, but an unlisted URL is
 * not a control: whoever had it had a free, anonymous Yahoo proxy running on this Cloudflare
 * account and this outbound reputation. Three exposures that compound - the daily request quota
 * (which is the OWNER's app going dark), the Yahoo relationship (a stranger's volume is
 * indistinguishable from ours, and it is our endpoint that gets blocked), and simply being
 * somebody else's infrastructure.
 *
 * So the data routes now require the Supabase session the app already holds. This costs the user
 * nothing - they sign in exactly as before, and the token rides along automatically. Verified
 * BEFORE this shipped: a signed-out page makes ZERO /api calls, so nothing user-facing depends on
 * anonymous access.
 *
 * WHY THERE IS NO SECRET HERE. This project signs tokens with ES256 - asymmetric - and publishes
 * the PUBLIC verification key at a well-known JWKS endpoint. So this verifies a signature with a
 * public key it fetches itself. Nothing to configure, nothing to leak. (A project on the older
 * symmetric HS256 setup would have needed its JWT secret in the environment; this one does not.)
 *
 * server.py deliberately does NOT do this. It binds 0.0.0.0 so the iPhone can reach it over the
 * home LAN, it is not on the internet, and the test suite drives it without a real session. The
 * Worker is the internet-facing surface, so the Worker is where this belongs. tests assert the
 * project URL below still matches the client's SB_URL, so the two cannot drift apart silently.
 */
const SUPABASE_URL = "https://uvzxdeiiwswhthfaqhtb.supabase.co";   // must equal SB_URL in www/index.html
const JWKS_URL = SUPABASE_URL + "/auth/v1/.well-known/jwks.json";
const JWKS_TTL_MS = 10 * 60 * 1000;      // a key rotation is picked up within ten minutes
const CLOCK_SKEW_S = 60;                 // a minute of tolerance, not more

let _jwks = null, _jwksAt = 0;

async function jwks() {
  const now = Date.now();
  if (_jwks && now - _jwksAt < JWKS_TTL_MS) return _jwks;
  const r = await fetch(JWKS_URL, { cf: { cacheTtl: 600 } });
  if (!r.ok) throw new Error("jwks " + r.status);
  const d = await r.json();
  _jwks = (d && d.keys) || [];
  _jwksAt = now;
  return _jwks;
}

function b64urlToBytes(x) {
  const p = x.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((x.length + 3) % 4);
  const raw = atob(p);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function b64urlToJson(x) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(x)));
}

/* Returns the user id on success, or null. Never throws to the caller: a JWKS outage must fail
   CLOSED (401) rather than open, because failing open here is the whole vulnerability. */
let lastAuthFailure = "none";
function fail(reason) { lastAuthFailure = reason; return null; }

async function verifyUser(request) {
  lastAuthFailure = "none";
  try {
    const hdr = request.headers.get("Authorization") || "";
    const m = /^Bearer\s+(.+)$/i.exec(hdr.trim());
    if (!m) return fail("no-bearer");
    const parts = m[1].split(".");
    if (parts.length !== 3) return fail("not-a-jwt");

    const head = b64urlToJson(parts[0]);
    if (head.alg !== "ES256") return fail("alg");     // only the algorithm this project actually uses
    const keys = await jwks();
    const jwk = keys.find((k) => !head.kid || k.kid === head.kid);
    if (!jwk) return fail("no-key-for-kid");

    const key = await crypto.subtle.importKey(
      "jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1]));
    if (!ok) return fail("signature");

    const claims = b64urlToJson(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < now) return fail("expired");
    if (claims.nbf && claims.nbf - CLOCK_SKEW_S > now) return fail("not-yet-valid");
    if (typeof claims.iss !== "string" || claims.iss.indexOf(SUPABASE_URL) !== 0) return fail("iss");
    /* A DENYLIST, not an allowlist, and deliberately so. The SIGNATURE is the real control here -
       only this project's private key can mint a token at all - so this check is belt and braces.
       Requiring role==="authenticated" exactly would lock every real user out if Supabase ever
       used another value for a normal session, and I cannot test the accept path without an
       account. Refusing the two roles that must never drive this proxy costs nothing and cannot
       cause a lockout. */
    if (claims.role === "anon" || claims.role === "service_role") return fail("role");
    return claims.sub ? { sub: claims.sub } : fail("no-sub");
  } catch (e) {
    return fail("verify-threw");                        // fail closed, always
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const asOf = () => Math.floor(Date.now() / 1000);
    try {
      /* Every data route, without exception. A route added later that forgets this line is the
         failure mode, so there is exactly one gate and it sits above all of them. */
      if (path.startsWith("/api/") && path !== "/api/health") {
        if (!(await verifyUser(request))) {
          /* The reason is here because the ACCEPT path cannot be tested without a real account:
             if a genuine sign-in is ever refused, this turns an opaque 401 into a one-look
             diagnosis in the network tab. It reveals only what trial and error would. */
          return j({ error: "sign-in required", reason: lastAuthFailure }, 401,
                   { "WWW-Authenticate": 'Bearer realm="portfolio-builder"' });
        }
      }
      if (path === "/api/quotes")       return j({ quotes: await getQuotes(symbolsOf(url)), asOf: asOf() });
      if (path === "/api/fundamentals") return j({ fundamentals: await fundamentals(symbolsOf(url)), asOf: asOf() });
      if (path === "/api/statements")   return j({ statements: await statements(symbolsOf(url)), asOf: asOf() });
      if (path === "/api/search")       return j({ results: await search((url.searchParams.get("q") || "").trim()) });
      if (path === "/api/peers")        return j({ peers: await peers((url.searchParams.get("symbol") || "").trim()) });
      return j({ error: "not found" }, 404);
    } catch (e) {
      return j({ error: String((e && e.message) || e) }, 500);
    }
  },
};
