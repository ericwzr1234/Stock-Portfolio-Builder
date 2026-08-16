"""Build the local ticker directory from the NASDAQ Trader symbol directory.

    py -3 tools/build_ticker_directory.py

Writes www/data/tickers.json — every US-listed common stock and ETF, with an is-ETF flag — so the
Research search box can match locally instead of asking Yahoo on every keystroke. Yahoo's search is
slow, rate-limited, and the thing most likely to get an IP throttled; this replaces it entirely for
the common case.

SOURCE: https://www.nasdaqtrader.com/dynamic/SymDir/{nasdaqlisted,otherlisted}.txt
No key, no bot wall on this host (api.nasdaq.com is a different host and does challenge clients).
Covers Nasdaq, NYSE, NYSE American, NYSE Arca (where SPY and VOO list), Cboe BZX and IEX.

Nasdaq's own published field definitions are STALE — they omit the ETF and NextShares columns that
the live nasdaqlisted.txt actually has. Everything below therefore parses by HEADER NAME and never
by column position.
"""
import io
import json
import os
import sys
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "www", "data", "tickers.json")

FILES = [
    ("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", "Symbol", "Security Name", None),
    ("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt", "ACT Symbol", "Security Name", "Exchange"),
]

# otherlisted.txt exchange codes, per Nasdaq's definitions page.
EXCH = {"N": "NYSE", "A": "NYSE American", "P": "NYSE Arca", "Z": "Cboe BZX", "V": "IEX"}

# Instruments a person building an equity portfolio never searches for. Dropping these is most of
# the difference between ~13,000 raw rows and the ~7,000 worth showing.
NOISE = (
    " WARRANT", " WARRANTS", " RIGHT", " RIGHTS", " UNIT", " UNITS",
    "% NOTE", "% NOTES", " DEBENTURE", "DEPOSITARY SHARE", "PREFERRED",
    "SUBORDINATED", " TRUST PREFERRED",
)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def parse(text, sym_col, name_col, exch_col):
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        raise SystemExit("empty file")
    header = lines[0].split("|")
    idx = {h.strip(): i for i, h in enumerate(header)}
    for need in (sym_col, name_col):
        if need not in idx:
            raise SystemExit("column %r missing; header was %r" % (need, header))
    out = []
    for ln in lines[1:]:
        # Both files end with a "File Creation Time: ..." trailer that is not a record.
        if ln.startswith("File Creation Time"):
            continue
        f = ln.split("|")
        if len(f) < len(header):
            continue
        get = lambda c: f[idx[c]].strip() if c and c in idx else ""
        sym, name = get(sym_col), get(name_col)
        if not sym or not name:
            continue
        if get("Test Issue").upper() == "Y":        # ZAZZT and friends
            continue
        upper = name.upper()
        if any(n in upper for n in NOISE):
            continue
        # Nasdaq writes class shares in the CQS convention (BRK.A); Yahoo — and therefore every
        # quote, fundamental and statement call this app makes — writes BRK-A. Without this the
        # directory would happily offer a ticker that then fails to fetch, which is the worst kind
        # of wrong: visible, clickable, and silently useless. 23 symbols today.
        sym = sym.replace(".", "-")
        is_etf = get("ETF").upper() == "Y"
        exch = EXCH.get(get(exch_col).upper(), "") if exch_col else "Nasdaq"
        # Positional, not keyed: [symbol, name, exchange, isETF]. The four key names would repeat
        # 11,000 times and cost about 180 KB of the payload for no information.
        out.append([sym, name, exch, 1 if is_etf else 0])
    return out


def main():
    rows = []
    for url, sym_col, name_col, exch_col in FILES:
        text = fetch(url)
        got = parse(text, sym_col, name_col, exch_col)
        print("%-14s %5d rows" % (os.path.basename(url), len(got)))
        rows.extend(got)

    # Deduplicate on symbol; the first file wins, which keeps Nasdaq's own convention.
    seen, merged = set(), []
    for r in rows:
        if r[0] in seen:
            continue
        seen.add(r[0])
        merged.append(r)
    merged.sort(key=lambda r: r[0])

    # VALIDATE BEFORE REPLACING ANYTHING. A failed or truncated fetch must never be allowed to
    # produce an empty search index — the old file is far better than a broken new one.
    etfs = sum(r[3] for r in merged)
    have = {r[0] for r in merged}
    problems = []
    if len(merged) < 4000:
        problems.append("only %d rows; expected several thousand" % len(merged))
    if etfs < 1000:
        problems.append("only %d ETFs; expected thousands" % etfs)
    for must in ("AAPL", "MSFT", "SPY", "VOO", "QQQ"):
        if must not in have:
            problems.append("%s is missing" % must)
    if os.path.exists(OUT):
        try:
            prev = json.load(io.open(OUT, encoding="utf-8"))
            if len(merged) < len(prev) * 0.8:
                problems.append("row count fell %d -> %d (>20%%)" % (len(prev), len(merged)))
        except Exception:
            pass
    if problems:
        sys.stderr.write("REFUSING TO WRITE:\n  - " + "\n  - ".join(problems) + "\n")
        return 1

    # Write to a temp file and swap, so an interrupted run cannot leave a half-written index.
    tmp = OUT + ".tmp"
    io.open(tmp, "w", encoding="utf-8", newline="").write(
        json.dumps(merged, separators=(",", ":"), ensure_ascii=False))
    os.replace(tmp, OUT)

    print("wrote %s" % OUT)
    print("  %d symbols  (%d ETFs, %d equities)  %.0f KB"
          % (len(merged), etfs, len(merged) - etfs, os.path.getsize(OUT) / 1024.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
