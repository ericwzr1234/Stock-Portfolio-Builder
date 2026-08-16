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

const j = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
/* Yahoo returns either a scalar or {raw, fmt}. server.py's _rv does the same unwrapping. */
const rv = (d, k) => { const x = d && d[k]; return x && typeof x === "object" && "raw" in x ? x.raw : x; };

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
    "averageDailyVolume3Month,averageDailyVolume10Day";

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
        marketState: q.marketState || null, currency: q.currency || null, time: num(rv(q, "regularMarketTime")),
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

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const asOf = () => Math.floor(Date.now() / 1000);
    try {
      if (path === "/api/quotes")  return j({ quotes: await getQuotes(symbolsOf(url)), asOf: asOf() });
      if (path === "/api/search")  return j({ results: await search((url.searchParams.get("q") || "").trim()) });
      if (path === "/api/peers")   return j({ peers: await peers((url.searchParams.get("symbol") || "").trim()) });
      // E11.2b lands /api/fundamentals and /api/statements. Saying so beats a bare 404.
      if (path === "/api/fundamentals" || path === "/api/statements")
        return j({ error: "not implemented in this Worker yet" }, 501);
      return j({ error: "not found" }, 404);
    } catch (e) {
      return j({ error: String((e && e.message) || e) }, 500);
    }
  },
};
