#!/usr/bin/env python3
"""
build_universe.py — turn the raw screener-curation output into www/data/universe.json.

The raw file (www/data/universe-raw.json) is the JSON returned by the multi-agent
`screener-universe` workflow: 5 themes, each with market-cap-ranked, mutually-exclusive
stock candidates. This script cleans it (drops placeholders / bad tickers / dupes,
fixes a few known-wrong symbols), re-enforces mutual exclusivity, re-sorts by market
cap, caps each theme, and writes the file the app actually loads.

Re-run after re-curating:  python3 tools/build_universe.py
Idempotent. No third-party deps.
"""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "www", "data", "universe-raw.json")
OUT = os.path.join(BASE, "www", "data", "universe.json")

# Theme priority for resolving any ticker that lands in two themes (higher wins).
PRIORITY = {"stablecoin": 5, "robotics": 4, "data": 3, "enterpriseai": 2, "personalai": 1}
CAP_PER_THEME = 55  # store a small buffer; the app shows the top 50 by *live* market cap

# Known fixes: wrong/placeholder symbols the researchers emitted.
TICKER_FIX = {"ROK2": "HXGBY", "TRAK": "TTAN"}   # Hexagon AB ADR; ServiceTitan
DROP_TICKERS = {"NYSE"}                            # duplicate of ICE (Intercontinental Exchange)
DROP_RATIONALES = {"placeholder removed"}          # researcher self-flagged junk


def load_raw():
    with open(RAW, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("result", data)  # raw file may be wrapped in {summary,logs,result}


def clean():
    raw = load_raw()
    cores = {}                 # ticker -> theme key (cores are pinned)
    for t in raw["themes"]:
        for c in t.get("core", []):
            cores[c.upper()] = t["key"]

    # Collect candidates, applying fixes/drops; resolve cross-theme dupes by priority.
    assign = {}                # ticker -> {theme,name,mcapB,rationale,core}
    for t in raw["themes"]:
        tkey = t["key"]
        for s in t.get("stocks", []):
            tk = str(s.get("ticker", "")).upper().strip()
            tk = TICKER_FIX.get(tk, tk)
            if not tk or tk in DROP_TICKERS:
                continue
            if str(s.get("rationale", "")).strip().lower() in DROP_RATIONALES:
                continue
            mcapB = s.get("mcapB") or 0
            target = cores.get(tk, tkey)              # cores pinned to their theme
            prev = assign.get(tk)
            if prev is None:
                assign[tk] = {"theme": target, "name": s.get("name", tk),
                              "mcapB": mcapB, "rationale": s.get("rationale", ""),
                              "core": tk in cores}
                continue
            # already seen: cores win; else higher-priority theme wins
            if tk in cores:
                prev["theme"] = cores[tk]
            elif PRIORITY[target] > PRIORITY[prev["theme"]]:
                prev["theme"] = target
            if mcapB > prev["mcapB"]:
                prev["mcapB"] = mcapB

    # Guarantee every core ticker exists in its theme.
    for tk, themekey in cores.items():
        assign.setdefault(tk, {"theme": themekey, "name": tk, "mcapB": 0,
                               "rationale": "core holding", "core": True})

    out_themes = []
    for t in raw["themes"]:
        stocks = [{"ticker": tk, "name": v["name"],
                   "mcapB": round(v["mcapB"], 1), "rationale": v["rationale"],
                   "core": v["core"]}
                  for tk, v in assign.items() if v["theme"] == t["key"]]
        stocks.sort(key=lambda x: x["mcapB"], reverse=True)
        stocks = stocks[:CAP_PER_THEME]
        out_themes.append({"key": t["key"], "name": t["name"],
                           "core": t["core"], "stocks": stocks})

    # Validation: mutual exclusivity + cores present.
    seen = {}
    for t in out_themes:
        for s in t["stocks"]:
            assert s["ticker"] not in seen, f"DUPLICATE {s['ticker']} in {t['key']} and {seen[s['ticker']]}"
            seen[s["ticker"]] = t["key"]
    for tk, themekey in cores.items():
        assert seen.get(tk) == themekey, f"core {tk} missing from {themekey} (got {seen.get(tk)})"

    out = {
        "schemaVersion": 1,
        "note": ("Mutually-exclusive theme universes for the Portfolio Builder screener. "
                 "Core tickers are pinned to their theme; shared names resolve to the "
                 "higher-priority theme (stablecoin > robotics > data > enterpriseai > "
                 "personalai). mcapB is an approximate seed; the app re-sorts by live "
                 "market cap and shows the top 50 per theme."),
        "themes": out_themes,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    # Also emit a <script>-loadable form. The iOS WebView can choke on fetch()ing
    # bundled JSON; a plain <script src> that sets window.__UNIVERSE always works.
    out_js = os.path.join(BASE, "www", "data", "universe.js")
    with open(out_js, "w", encoding="utf-8") as f:
        f.write("window.__UNIVERSE = " + json.dumps(out) + ";\n")
    total = sum(len(t["stocks"]) for t in out_themes)
    print(f"Wrote {OUT}")
    print(f"Wrote {out_js}")
    for t in out_themes:
        print(f"  {t['name']:<16} {len(t['stocks'])} stocks")
    print(f"  total: {total} unique tickers across 5 themes")


if __name__ == "__main__":
    clean()
