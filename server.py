#!/usr/bin/env python3
"""
Portfolio Builder - local server
--------------------------------
A tiny, dependency-free (Python standard library only) web server that:
  1. Serves the single-page app (index.html).
  2. Proxies Yahoo Finance for free live-ish prices + fundamentals (PEG, EV/EBITDA TTM),
     handling the cookie/crumb dance server-side so the browser never hits CORS.
  3. Reads / writes a local JSON "database" (portfolio.json) for persistence.

No API keys. No paid tiers. No pip installs. Just:  py server.py

Free-data notes / cadence:
  - Prices come from Yahoo's batch quote endpoint (1 request for all 20 tickers).
    The server caches them for QUOTE_TTL seconds so rapid page refreshes don't hammer
    Yahoo. The browser auto-refreshes on an interval you pick (default 60s). Yahoo's
    free feed is delayed up to ~15 min for some tickers; during market hours most US
    names update in near real time.
  - Fundamentals (PEG, EV/EBITDA) barely move intraday, so they're cached for
    FUND_TTL seconds (default 6h). Use the "Refresh fundamentals" button to force.
  - If Yahoo ever rejects a request, the server falls back to the embedded SEED
    snapshot so the app keeps working (values are flagged as "seed" in the UI).
"""

import json
import os
import sys
import threading
import time
import urllib.parse
import urllib.request
import http.cookiejar
import socket
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Portfolio DB path. Defaults to portfolio.json; set PB_DB to use an isolated file
# (e.g. a dev/test database so development never overwrites real holdings). A relative
# PB_DB resolves against this folder.
DB_PATH = os.environ.get("PB_DB") or os.path.join(BASE_DIR, "portfolio.json")
if not os.path.isabs(DB_PATH):
    DB_PATH = os.path.join(BASE_DIR, DB_PATH)
WEB_DIR = os.path.join(BASE_DIR, "www")        # the app lives here (also bundled into the iOS app)
INDEX_PATH = os.path.join(WEB_DIR, "index.html")

# Minimal static content-type map for assets served out of www/.
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".map": "application/json",
}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

QUOTE_TTL = 15          # seconds to cache live quotes
FUND_TTL = 6 * 3600     # seconds to cache fundamentals (PEG / EV/EBITDA)

# The full universe (kept in sync with index.html). Used so the server can warm caches.
ALL_TICKERS = ["CRCL", "MA", "V", "COIN", "JPM", "AAPL", "AMZN", "META", "GOOGL", "IBM",
               "NOW", "PLTR", "MSFT", "CRM", "PATH", "ISRG", "ROK", "NVDA", "SYM", "TSLA",
               "SNOW", "SPGI", "MCO", "MSCI", "RDDT"]

# ---------------------------------------------------------------------------
# Embedded fallback snapshot (real values fetched at build time). Only used when
# Yahoo is unreachable, so the tool is never dead-in-the-water.
# fields: price, mcap (USD), peg, ev (EV/EBITDA TTM), dfcf (Total Debt/FCF TTM; -1 = negative FCF, None = N/A),
#         pe (trailing), mom (price vs 50/200-day MA, a fraction), name
# ---------------------------------------------------------------------------
SEED = {
    "CRCL": {"price": 85.22,  "mcap": 23e9,    "peg": 4.34, "ev": -133.8,  "dfcf": -1,    "pe": None,  "mom": -0.160, "name": "Circle Internet"},
    "MA":   {"price": 491.06, "mcap": 434e9,   "peg": 1.51, "ev": 20.8,    "dfcf": 1.17,  "pe": 28.4,  "mom": -0.044, "name": "Mastercard"},
    "V":    {"price": 325.74, "mcap": 619e9,   "peg": 1.41, "ev": 20.5,    "dfcf": 1.15,  "pe": 28.4,  "mom": 0.008,  "name": "Visa"},
    "COIN": {"price": 172.68, "mcap": 45e9,    "peg": 0.89, "ev": 39.5,    "dfcf": 3.31,  "pe": 63.5,  "mom": -0.156, "name": "Coinbase"},
    "JPM":  {"price": 321.37, "mcap": 861e9,   "peg": 1.70, "ev": None,    "dfcf": None,  "pe": 15.4,  "mom": 0.048,  "name": "JPMorgan Chase"},
    "AAPL": {"price": 296.74, "mcap": 4358e9,  "peg": 2.35, "ev": 26.8,    "dfcf": 0.84,  "pe": 35.9,  "mom": 0.068,  "name": "Apple"},
    "AMZN": {"price": 246.04, "mcap": 2647e9,  "peg": 1.83, "ev": 17.1,    "dfcf": 24.02, "pe": 32.6,  "mom": 0.003,  "name": "Amazon"},
    "META": {"price": 596.22, "mcap": 1513e9,  "peg": 0.82, "ev": 13.2,    "dfcf": 3.39,  "pe": 21.7,  "mom": -0.062, "name": "Meta Platforms"},
    "GOOGL":{"price": 371.03, "mcap": 4525e9,  "peg": 1.42, "ev": 26.8,    "dfcf": 3.43,  "pe": 28.3,  "mom": 0.096,  "name": "Alphabet"},
    "IBM":  {"price": 268.39, "mcap": 252e9,   "peg": 2.54, "ev": 18.9,    "dfcf": 5.34,  "pe": 23.8,  "mom": 0.039,  "name": "IBM"},
    "NOW":  {"price": 105.75, "mcap": 109e9,   "peg": 0.99, "ev": 35.5,    "dfcf": 0.48,  "pe": 62.9,  "mom": -0.056, "name": "ServiceNow"},
    "PLTR": {"price": 134.30, "mcap": 322e9,   "peg": 1.84, "ev": 148.2,   "dfcf": 0.12,  "pe": 149.2, "mom": -0.088, "name": "Palantir"},
    "MSFT": {"price": 400.22, "mcap": 2973e9,  "peg": 1.20, "ev": 16.0,    "dfcf": 3.39,  "pe": 23.8,  "mom": -0.064, "name": "Microsoft"},
    "CRM":  {"price": 166.69, "mcap": 137e9,   "peg": 0.79, "ev": 12.9,    "dfcf": 2.57,  "pe": 19.3,  "mom": -0.139, "name": "Salesforce"},
    "PATH": {"price": 10.87,  "mcap": 6e9,     "peg": 0.38, "ev": 34.3,    "dfcf": 0.16,  "pe": 18.1,  "mom": -0.058, "name": "UiPath"},
    "ISRG": {"price": 414.78, "mcap": 147e9,   "peg": 2.16, "ev": 36.3,    "dfcf": 0.0,   "pe": 50.5,  "mom": -0.101, "name": "Intuitive Surgical"},
    "ROK":  {"price": 469.77, "mcap": 52e9,    "peg": 2.00, "ev": 27.8,    "dfcf": 4.16,  "pe": 48.7,  "mom": 0.139,  "name": "Rockwell Automation"},
    "NVDA": {"price": 212.04, "mcap": 5136e9,  "peg": 0.63, "ev": 29.8,    "dfcf": 0.28,  "pe": 32.5,  "mom": 0.063,  "name": "NVIDIA"},
    "SYM":  {"price": 42.72,  "mcap": 26e9,    "peg": 2.88, "ev": 161.5,   "dfcf": 0.08,  "pe": None,  "mom": -0.223, "name": "Symbotic"},
    "TSLA": {"price": 408.73, "mcap": 1535e9,  "peg": 5.60, "ev": 135.1,   "dfcf": 3.03,  "pe": 371.6, "mom": 0.009,  "name": "Tesla"},
    "SNOW": {"price": 241.91, "mcap": 84e9,    "peg": 6.02, "ev": -71.4,   "dfcf": 1.59,  "pe": None,  "mom": 0.310,  "name": "Snowflake"},
    "SPGI": {"price": 427.86, "mcap": 127e9,   "peg": 1.47, "ev": 17.9,    "dfcf": 2.62,  "pe": 27.1,  "mom": -0.033, "name": "S&P Global"},
    "MCO":  {"price": 459.44, "mcap": 80e9,    "peg": 2.02, "ev": 22.1,    "dfcf": 3.27,  "pe": 33.0,  "mom": 0.002,  "name": "Moody's"},
    "MSCI": {"price": 613.01, "mcap": 45e9,    "peg": 1.93, "ev": 26.2,    "dfcf": 5.45,  "pe": 35.0,  "mom": 0.059,  "name": "MSCI"},
    "RDDT": {"price": 179.29, "mcap": 35e9,    "peg": 1.16, "ev": 44.7,    "dfcf": 0.04,  "pe": 51.2,  "mom": 0.059,  "name": "Reddit"},
}

# ---------------------------------------------------------------------------
# Yahoo session (cookie + crumb), shared across requests, refreshed on demand.
# ---------------------------------------------------------------------------
_sess_lock = threading.Lock()
_opener = None
_crumb = None

_quote_cache = {"ts": 0, "data": {}}
_quote_lock = threading.Lock()
_fund_cache = {"ts": 0, "data": {}}
_fund_lock = threading.Lock()


def _build_opener():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def _http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/plain,*/*"})
    with _opener.open(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def ensure_session(force=False):
    """Make sure we have a cookie + crumb for Yahoo. Returns crumb or None."""
    global _opener, _crumb
    with _sess_lock:
        if _crumb and not force:
            return _crumb
        try:
            _opener = _build_opener()
            try:
                _http_get("https://fc.yahoo.com/", timeout=10)
            except Exception:
                pass  # we just want the cookie; this often 404s but sets it
            crumb = _http_get("https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=10).strip()
            # A valid crumb is short and has no spaces/html
            if crumb and "<" not in crumb and len(crumb) < 40:
                _crumb = crumb
            else:
                _crumb = None
        except Exception as e:
            sys.stderr.write(f"[yahoo] session error: {e}\n")
            _crumb = None
        return _crumb


def search_yahoo(query):
    """Yahoo symbol/name search -> [{symbol,name,exchange,type}], equities & ETFs only. [] on failure."""
    q = (query or "").strip()
    if not q:
        return []
    ensure_session()  # builds the cookie opener; the search endpoint needs no crumb
    try:
        qs = urllib.parse.urlencode({"q": q, "quotesCount": 10, "newsCount": 0, "listsCount": 0})
        raw = _http_get(f"https://query2.finance.yahoo.com/v1/finance/search?{qs}", timeout=10)
        data = json.loads(raw)
    except Exception as e:
        sys.stderr.write(f"[search {q!r}] {e}\n")
        return []
    out = []
    for it in (data.get("quotes") or []):
        sym = it.get("symbol")
        qt = (it.get("quoteType") or "").upper()
        if not sym or qt not in ("EQUITY", "ETF"):
            continue  # skip indices, currencies, futures, options
        out.append({
            "symbol": sym,
            "name": it.get("shortname") or it.get("longname") or it.get("name") or sym,
            "exchange": it.get("exchDisp") or it.get("exchange") or "",
            "type": qt,
        })
    return out


def _rv(d, k):
    """Pull a Yahoo numeric field that may be {'raw': x} or a bare number."""
    x = d.get(k)
    if isinstance(x, dict):
        return x.get("raw")
    return x


def fetch_quotes_live(symbols):
    """One batch call -> {sym: {...}}. Returns {} on failure."""
    crumb = ensure_session()
    if not crumb:
        return {}
    fields = ("regularMarketPrice,regularMarketChange,regularMarketChangePercent,"
              "regularMarketPreviousClose,marketCap,shortName,longName,marketState,"
              "currency,regularMarketTime")
    qs = urllib.parse.urlencode({"symbols": ",".join(symbols), "fields": fields, "crumb": crumb})
    out = {}
    for attempt in range(2):
        try:
            raw = _http_get(f"https://query1.finance.yahoo.com/v7/finance/quote?{qs}")
            results = json.loads(raw).get("quoteResponse", {}).get("result", [])
            for r in results:
                sym = r.get("symbol")
                if not sym:
                    continue
                out[sym] = {
                    "price": _rv(r, "regularMarketPrice"),
                    "change": _rv(r, "regularMarketChange"),
                    "changePct": _rv(r, "regularMarketChangePercent"),
                    "prevClose": _rv(r, "regularMarketPreviousClose"),
                    "marketCap": _rv(r, "marketCap"),
                    "name": r.get("shortName") or r.get("longName") or sym,
                    "marketState": r.get("marketState"),
                    "currency": r.get("currency"),
                    "time": _rv(r, "regularMarketTime"),
                    "source": "live",
                }
            if out:
                return out
        except Exception as e:
            sys.stderr.write(f"[yahoo] quote error (attempt {attempt}): {e}\n")
            ensure_session(force=True)  # crumb may be stale
    return out


def _momentum(price, ma50, ma200):
    """Price momentum: how far price sits above its 50-day (weight 0.6) and 200-day (0.4) moving
    averages. >0 = uptrend, stronger = bigger. Returns a fraction, or None if no usable MA data."""
    if not (isinstance(price, (int, float)) and price > 0):
        return None
    parts = []
    if isinstance(ma50, (int, float)) and ma50 > 0:
        parts.append((0.6, price / ma50 - 1))
    if isinstance(ma200, (int, float)) and ma200 > 0:
        parts.append((0.4, price / ma200 - 1))
    if not parts:
        return None
    return sum(w * v for w, v in parts) / sum(w for w, _ in parts)


def _fetch_one_fundamental(sym):
    crumb = ensure_session()
    if not crumb:
        return sym, None
    qs = urllib.parse.urlencode({"modules": "defaultKeyStatistics,price,financialData,summaryDetail", "crumb": crumb})
    try:
        raw = _http_get(f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{sym}?{qs}")
        res = json.loads(raw)["quoteSummary"]["result"][0]
        ks = res.get("defaultKeyStatistics", {}) or {}
        pr = res.get("price", {}) or {}
        fd = res.get("financialData", {}) or {}
        sd = res.get("summaryDetail", {}) or {}
        peg = _rv(ks, "trailingPegRatio")
        if peg is None:
            peg = _rv(ks, "pegRatio")
        mc = _rv(pr, "marketCap")
        price = _rv(pr, "regularMarketPrice")
        td = _rv(fd, "totalDebt") or 0
        cash = _rv(fd, "totalCash") or 0

        # Total Debt / Free Cash Flow (TTM):  >0 -> td/fcf;  <=0 -> -1 (penalize);  missing -> None (N/A, excluded)
        fcf = _rv(fd, "freeCashflow")
        if fcf is None:
            dfcf = None
        elif fcf > 0:
            dfcf = td / fcf
        else:
            dfcf = -1.0

        # --- Computation fallback: if Yahoo's ready-made ratio is missing, derive it from the TTM
        #     statement figures (validated to ~2% of Yahoo's published ratios for names that have both). ---
        # P/E = market cap / TTM net income to common (income statement). Needs net income > 0.
        pe = _rv(sd, "trailingPE")
        pe_calc = False
        if pe is None:
            ni = _rv(ks, "netIncomeToCommon")
            if mc and isinstance(ni, (int, float)) and ni > 0:
                pe, pe_calc = mc / ni, True
        # EV/EBITDA = (market cap + total debt - cash) / TTM EBITDA. (Negative EBITDA -> negative ratio -> penalized.)
        ev = _rv(ks, "enterpriseToEbitda")
        ev_calc = False
        if ev is None:
            ebitda = _rv(fd, "ebitda")
            if mc and isinstance(ebitda, (int, float)) and ebitda != 0:
                ev, ev_calc = (mc + td - cash) / ebitda, True

        mom = _momentum(price, _rv(sd, "fiftyDayAverage"), _rv(sd, "twoHundredDayAverage"))
        return sym, {
            "peg": peg,
            "ev": ev, "evCalc": ev_calc,
            "dfcf": dfcf,
            "pe": pe, "peCalc": pe_calc,
            "mom": mom,
            "marketCap": mc,
            "price": price,
            "name": pr.get("shortName") or pr.get("longName") or sym,
            "source": "live",
        }
    except Exception as e:
        sys.stderr.write(f"[yahoo] fundamentals {sym}: {e}\n")
        return sym, None


def fetch_fundamentals_live(symbols):
    out = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for sym, data in ex.map(_fetch_one_fundamental, symbols):
            if data:
                out[sym] = data
    return out


def get_quotes(symbols):
    """Cached quotes with seed fallback. Always returns every requested symbol."""
    now = time.time()
    with _quote_lock:
        fresh = (now - _quote_cache["ts"]) < QUOTE_TTL
        cached = dict(_quote_cache["data"])
    have_all = fresh and all(s in cached for s in symbols)
    if not have_all:
        live = fetch_quotes_live(symbols)
        if live:
            with _quote_lock:
                _quote_cache["data"].update(live)
                _quote_cache["ts"] = now
                cached = dict(_quote_cache["data"])
    result = {}
    for s in symbols:
        if s in cached and cached[s].get("price") is not None:
            result[s] = cached[s]
        else:
            sd = SEED.get(s, {})
            result[s] = {
                "price": sd.get("price"), "change": None, "changePct": None,
                "prevClose": None, "marketCap": sd.get("mcap"),
                "name": sd.get("name", s), "marketState": None, "currency": "USD",
                "time": None, "source": "seed",
            }
    return result


def get_fundamentals(symbols, force=False):
    now = time.time()
    with _fund_lock:
        fresh = (not force) and (now - _fund_cache["ts"]) < FUND_TTL
        cached = dict(_fund_cache["data"])
    have_all = fresh and all(s in cached for s in symbols)
    if not have_all:
        live = fetch_fundamentals_live(symbols)
        if live:
            with _fund_lock:
                _fund_cache["data"].update(live)
                _fund_cache["ts"] = now
                cached = dict(_fund_cache["data"])
    result = {}
    for s in symbols:
        if s in cached and (cached[s].get("peg") is not None or cached[s].get("ev") is not None):
            result[s] = cached[s]
        else:
            sd = SEED.get(s, {})
            result[s] = {
                "peg": sd.get("peg"), "ev": sd.get("ev"), "dfcf": sd.get("dfcf"),
                "pe": sd.get("pe"), "mom": sd.get("mom"),
                "marketCap": sd.get("mcap"), "price": sd.get("price"),
                "name": sd.get("name", s), "source": "seed",
            }
    return result


# ---------------------------------------------------------------------------
# Local JSON "database"
# ---------------------------------------------------------------------------
_db_lock = threading.Lock()


def read_db():
    with _db_lock:
        if not os.path.exists(DB_PATH):
            return None
        try:
            with open(DB_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            sys.stderr.write(f"[db] read error: {e}\n")
            return None


def write_db(obj):
    with _db_lock:
        tmp = DB_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2)
        os.replace(tmp, DB_PATH)


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body)
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass  # keep the console quiet

    def _symbols(self, qs):
        raw = qs.get("symbols", [""])[0]
        syms = [s.strip().upper() for s in raw.split(",") if s.strip()]
        return syms or ALL_TICKERS

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)
        try:
            if path in ("/", "/index.html"):
                if os.path.exists(INDEX_PATH):
                    with open(INDEX_PATH, "rb") as f:
                        self._send(200, f.read(), "text/html; charset=utf-8")
                else:
                    self._send(404, "index.html not found", "text/plain; charset=utf-8")
            elif path == "/api/quotes":
                self._send(200, {"quotes": get_quotes(self._symbols(qs)), "asOf": int(time.time())})
            elif path == "/api/fundamentals":
                force = qs.get("force", ["0"])[0] in ("1", "true", "yes")
                self._send(200, {"fundamentals": get_fundamentals(self._symbols(qs), force=force),
                                 "asOf": int(time.time())})
            elif path == "/api/search":
                self._send(200, {"results": search_yahoo(qs.get("q", [""])[0])})
            elif path == "/api/portfolio":
                self._send(200, {"portfolio": read_db()})
            elif not path.startswith("/api/"):
                # static asset from www/ (e.g. /data/universe.js), with path-traversal guard
                rel = urllib.parse.unquote(path.lstrip("/"))
                fp = os.path.normpath(os.path.join(WEB_DIR, rel))
                if (fp == WEB_DIR or fp.startswith(WEB_DIR + os.sep)) and os.path.isfile(fp):
                    ctype = CONTENT_TYPES.get(os.path.splitext(fp)[1].lower(), "application/octet-stream")
                    with open(fp, "rb") as f:
                        self._send(200, f.read(), ctype)
                else:
                    self._send(404, "not found", "text/plain; charset=utf-8")
            else:
                self._send(404, {"error": "not found"})
        except BrokenPipeError:
            pass
        except Exception as e:
            sys.stderr.write(f"[GET {path}] {e}\n")
            self._send(500, {"error": str(e)})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            if path == "/api/portfolio":
                obj = json.loads(body.decode("utf-8"))
                write_db(obj)
                self._send(200, {"ok": True})
            else:
                self._send(404, {"error": "not found"})
        except Exception as e:
            sys.stderr.write(f"[POST {path}] {e}\n")
            self._send(500, {"error": str(e)})


def find_port(preferred=8765):
    for port in range(preferred, preferred + 40):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:  # nothing listening -> free
                return port
    return preferred


def lan_ip():
    """Best-effort LAN IP so the iPhone app can reach this server on the same Wi-Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


def main():
    env_port = os.environ.get("PB_PORT")
    port = int(env_port) if env_port and env_port.isdigit() else find_port()
    url = f"http://127.0.0.1:{port}/"
    ip = lan_ip()
    print("=" * 60)
    print("  Portfolio Builder  -  local, free, no API keys")
    print("=" * 60)
    print(f"  Open on this computer:  {url}")
    if ip:
        print(f"  iPhone app sync (same Wi-Fi):  http://{ip}:{port}")
    print(f"  Data:  {DB_PATH}")
    print("  Stop:  press Ctrl+C in this window")
    print("=" * 60)
    # warm caches in the background so the first page load is instant
    threading.Thread(target=lambda: (get_quotes(ALL_TICKERS), get_fundamentals(ALL_TICKERS)),
                     daemon=True).start()
    if not os.environ.get("PB_NO_BROWSER"):
        try:
            webbrowser.open(url)
        except Exception:
            pass
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)   # 0.0.0.0 so the iPhone app can reach it on the LAN
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down. Your portfolio is saved in portfolio.json.")
        server.shutdown()


if __name__ == "__main__":
    main()
