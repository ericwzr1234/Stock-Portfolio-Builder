"""Compare the Cloudflare Worker proxy against server.py, field by field.

    py -3 tools/diff_proxy.py http://127.0.0.1:8766 https://pb-proxy.<sub>.workers.dev

The client reads these shapes directly, so the two proxies have to be interchangeable — not merely
"both return some JSON". A data-layer rewrite must not go in on inspection alone, which is the whole
reason this exists.

Exits 1 on any difference. Numeric fields are compared with a relative tolerance because quotes move
while the market is open; run it with the market CLOSED and the tolerance should never be exercised.
"""
import json
import sys
import urllib.parse
import urllib.request

TOL = 0.02          # 2% — only meant to absorb a tick between the two calls, not real disagreement
SYMS = ["AAPL", "MSFT", "NVDA", "TSM", "JPM", "XOM", "BRK-B", "SPY"]

fails = []
notes = []
checked = 0


def get(base, path, params):
    url = base.rstrip("/") + path + "?" + urllib.parse.urlencode(params)
    # A browser-ish agent: Cloudflare bot protection 403s urllib's default Python-urllib/x.y, so
    # without this the harness fails against the Worker and looks like a Worker fault.
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def same(a, b):
    global checked
    checked += 1
    if a is None and b is None:
        return True
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if a == b:
            return True
        scale = max(abs(a), abs(b), 1e-9)
        return abs(a - b) / scale <= TOL
    return a == b


def cmp_dict(label, A, B):
    ka, kb = set(A or {}), set(B or {})
    for k in sorted(ka - kb):
        fails.append("%s: only server.py has %r" % (label, k))
    for k in sorted(kb - ka):
        fails.append("%s: only the Worker has %r" % (label, k))
    for k in sorted(ka & kb):
        if not same(A[k], B[k]):
            fails.append("%s.%s: server.py=%r worker=%r" % (label, k, A[k], B[k]))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    py, wk = sys.argv[1], sys.argv[2]

    # ---- quotes: the big one. Same symbols, same keys, same values.
    a = get(py, "/api/quotes", {"symbols": ",".join(SYMS)})
    b = get(wk, "/api/quotes", {"symbols": ",".join(SYMS)})
    qa, qb = a.get("quotes") or {}, b.get("quotes") or {}
    for s in sorted(set(qa) - set(qb)):
        fails.append("quotes: server.py returned %s, the Worker did not" % s)
    for s in sorted(set(qb) - set(qa)):
        fails.append("quotes: the Worker returned %s, server.py did not" % s)
    for s in sorted(set(qa) & set(qb)):
        cmp_dict("quotes[%s]" % s, qa[s], qb[s])
    if not isinstance(b.get("asOf"), int):
        fails.append("quotes: the Worker returned no integer asOf")
    print("quotes    : %d symbols compared (server.py %d / worker %d)" % (len(set(qa) & set(qb)), len(qa), len(qb)))

    # ---- fundamentals: 35 fields per symbol, the model reads all of them
    a = get(py, "/api/fundamentals", {"symbols": ",".join(SYMS)})
    b = get(wk, "/api/fundamentals", {"symbols": ",".join(SYMS)})
    fa, fb = a.get("fundamentals") or {}, b.get("fundamentals") or {}
    for s in sorted(set(fa) - set(fb)):
        fails.append("fundamentals: server.py returned %s, the Worker did not" % s)
    for s in sorted(set(fa) & set(fb)):
        cmp_dict("fundamentals[%s]" % s, fa[s], fb[s])
    print("fundamentals: %d symbols compared (server.py %d / worker %d)" % (len(set(fa) & set(fb)), len(fa), len(fb)))

    # ---- statements: quarter dates and every reported line must agree
    a = get(py, "/api/statements", {"symbols": ",".join(SYMS[:4])})
    b = get(wk, "/api/statements", {"symbols": ",".join(SYMS[:4])})
    sa, sb = a.get("statements") or {}, b.get("statements") or {}
    for s in sorted(set(sa) & set(sb)):
        qa2 = {q["date"]: q for q in (sa[s].get("quarters") or [])}
        qb2 = {q["date"]: q for q in (sb[s].get("quarters") or [])}
        if sa[s].get("source") != sb[s].get("source"):
            fails.append("statements[%s].source: server.py=%s worker=%s" % (s, sa[s].get("source"), sb[s].get("source")))
        if set(qa2) != set(qb2):
            fails.append("statements[%s]: quarter dates differ - server.py=%s worker=%s" % (s, sorted(qa2), sorted(qb2)))
        for d in sorted(set(qa2) & set(qb2)):
            cmp_dict("statements[%s][%s]" % (s, d), qa2[d], qb2[d])
    print("statements  : %d symbols compared" % len(set(sa) & set(sb)))

    # ---- search: same shape and the same leading hit
    for q in ("apple", "AMD", "vanguard"):
        ra = (get(py, "/api/search", {"q": q}).get("results") or [])
        rb = (get(wk, "/api/search", {"q": q}).get("results") or [])
        if not rb:
            fails.append("search[%s]: the Worker returned nothing" % q)
            continue
        # SHAPE is the contract the client reads, so a mismatch there is fatal.
        keys_a = set(ra[0]) if ra else set()
        if keys_a and set(rb[0]) != keys_a:
            fails.append("search[%s]: keys differ - server.py=%s worker=%s" % (q, sorted(keys_a), sorted(rb[0])))
        if not all(r.get("symbol") for r in rb):
            fails.append("search[%s]: the Worker returned a result with no symbol" % q)
        # RANKING is not asserted, because the two read different sources by design: server.py
        # searches the cached SEC company directory, which lists operating companies and NOT ETFs,
        # so it can never return VOO or SPY. The Worker uses Yahoo search, which can. That is an
        # open design question (see E11.2a notes), not a port defect - reported, not failed.
        if ra and rb and ra[0].get("symbol") != rb[0].get("symbol"):
            notes.append("search[%s]: top hit server.py=%s worker=%s"
                         % (q, ra[0].get("symbol"), rb[0].get("symbol")))
    print("search    : 3 queries compared")

    # ---- peers: a set comparison; Yahoo's ordering is not stable enough to assert
    for s in ("AAPL", "JPM"):
        pa = set(get(py, "/api/peers", {"symbol": s}).get("peers") or [])
        pb = set(get(wk, "/api/peers", {"symbol": s}).get("peers") or [])
        if pa != pb:
            fails.append("peers[%s]: server.py=%s worker=%s" % (s, sorted(pa), sorted(pb)))
    print("peers     : 2 symbols compared")

    print("fields compared: %d" % checked)
    if notes:
        print("\nDIFFERENT BY DESIGN (not failures):")
        for n in notes:
            print("  ~", n)
    if fails:
        print("\nDIFFERENCES (%d):" % len(fails))
        for f in fails[:40]:
            print("  -", f)
        if len(fails) > 40:
            print("  ... and %d more" % (len(fails) - 40))
        return 1
    print("\nIDENTICAL - the Worker is interchangeable with server.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
