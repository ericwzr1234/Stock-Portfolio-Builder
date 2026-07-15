# Web → iOS app migration — status & checklist

> **The shared record of what's been built on the web side and what the iOS app still needs.**
> The Windows machine builds features on the web (`www/index.html` + `server.py`); the Mac brings the
> **native iOS app** (Capacitor) to parity. Both machines share **one** project board — see §5.
> Board card: **APP1** (epic `APP`, now **testing**). Last synced **2026-07-15** (web `main` = E1–E4.5 shipped;
> iOS parity implemented on `dev`, awaiting on-device try + `dev→main` integration).

---

## 1. How the two platforms relate (read this first)

**There is ONE codebase.** `www/index.html` is the entire app (markup + CSS + JS). The iOS app is a
**Capacitor** wrapper around `www/` — no rewrite, no second copy. The only thing that differs between
platforms is the **data layer**, which branches at runtime:

```
NATIVE = window.Capacitor?.isNativePlatform()      // true only inside the iOS app
dsQuotes / dsFundamentals / dsStatements / dsSearch / dsPeers   // unified entry points
    → web:    api("/api/…")           hits server.py (Python proxy to Yahoo)
    → native: nativeX(…)              hits Yahoo directly on-device via CapacitorHttp (no CORS)
```

So **any web feature that is pure UI or reuses an existing `ds*` entry point reaches iOS for free** by
running `npx cap sync ios` (copies `www/` into the app bundle) and rebuilding in Xcode. **Only new data
needs matching native code** — a `nativeX()` that returns the same shape `server.py` returns.

Portfolio persistence on iOS = `localStorage` (`nativeLoadPortfolio`/`nativeSavePortfolio`), with an
optional Wi-Fi sync to the computer's `portfolio.json` (see [IOS_BUILD.md](IOS_BUILD.md) §"Sync").

---

## 2. Web progress — shipped to prod (`main`)

| Epic | What shipped | iOS reach |
|------|--------------|-----------|
| **Core** (C1–C10) | 6-factor allocation model, bad-data handling, Yahoo data layer, calculator/rebalance, version history, Prices/Screener tabs, swap, dynamic membership, cross-platform shell | ✅ native (built cross-platform from day one) |
| **E1** User-defined themes | data-driven theme list, add/remove ticker, ticker search+validate, create/rename/recolour/delete theme, restore defaults, peers recommendations, flat screener | ✅ **UI only** → `cap sync`. Data: `nativeQuotes`/`nativeSearch`/`dsPeers` native branches all exist |
| **E2** User-defined metrics | metric catalog (6 default + 21 catalog), picker, auto-direction + 3 bad-data policies, presets/reset | ⚠️ **UI only → `cap sync`, BUT the 21 catalog metrics need `nativeFundamentals` extended** — see §3/§4 |
| **E3** Statement-driven data | `/api/statements` (fundamentals-timeseries), computed-metric engine (TTM), stock-detail page, compute-from-statements toggle, ADR currency handling | ✅ data done natively (`nativeStatements` mirrors the server); ⚠️ verify on-device |
| **E4** Fundamentals/Screener redesign | declutter allocation panel, per-theme actions, split add-vs-watchlist flow, screener = search+watchlist | ✅ **UI only** → `cap sync` |
| **E4.5** Allocation-panel layout | equal-width split cards, inline direction cue, aligned exception grid | ✅ **UI only** → `cap sync` |

---

## 3. iOS parity status by data-layer function (`www/index.html`)

| `ds*` entry point | Native impl | Mirrors server? | Status |
|-------------------|-------------|-----------------|--------|
| `dsQuotes` | `nativeQuotes` | prices/mcap | ✅ done |
| `dsSearch` | `nativeSearch` | Yahoo search v1 | ✅ done (E1.3) |
| `dsPeers` | inline native branch (Yahoo `recommendationsbysymbol`) | peers | ✅ done (E1.7–E1.9) |
| `dsStatements` | `nativeStatements` | **yes** — same `fundamentals-timeseries` endpoint + `STMT_FIELD_MAP` (= server `_STMT_FIELDS`, 31 keys) | ✅ done (E3) |
| `dsFundamentals` | `nativeFundamentals` | **yes** — now mirrors `_fetch_one_fundamental` (6 factors + the 21 catalog/market fields) | ✅ **done (2026-07-15)** |
| portfolio load/save | `nativeLoadPortfolio`/`nativeSavePortfolio` (localStorage) + Wi-Fi sync | n/a | ✅ done |

### The one real gap: `nativeFundamentals` — ✅ RESOLVED (2026-07-15)
> `nativeFundamentals` now returns all the fields below, mirroring `server.py._fetch_one_fundamental`
> (same Yahoo keys, `debtToEquity` %, raw operands). Verified on the iPhone 17 simulator with live data
> (stock-detail shows the extended metrics populated). **Two iOS-only bugs found & fixed on-device while
> migrating:** (a) a native crash — CapacitorHttp received *numeric* params (E3 `period1/period2`, search
> counts) and cast-crashed (`NSCFNumber → NSString`); now every param is stringified in `yGet`. (b) E3
> stock-detail statement tables scrolled the whole sheet sideways and lost their labels; added
> `.native`-scoped CSS so each `table.mono` scrolls independently with a frozen "Line item" column (web
> unchanged). Below is the field list that was added, for reference:

`server.py._fetch_one_fundamental` returns ~21 extra fields the web app relies on for the E2 catalog and
the E3 "stays-pulled" metrics. `nativeFundamentals` (≈ `www/index.html:884`) now returns them:

```
forwardPE, evRev, ps, pb, grossMargin, opMargin, netMargin, roe, roa,
debtToEquity (Yahoo % — JS getter ÷100), currentRatio, quickRatio,
revGrowth, earnGrowth, divYield, payout, beta,
fcf, ebitda, revenue, cash, debt        (raw TTM operands for JS-derived metrics)
```

They all come from the **same** `quoteSummary` modules `nativeFundamentals` already fetches
(`defaultKeyStatistics,price,financialData,summaryDetail`) — so this is field-mapping work, not a new
request. **Copy the exact key mapping from `server.py._fetch_one_fundamental` (≈ lines 408–440).** With
E3 compute-from-statements ON (default), the currency-neutral ratios are computed from `nativeStatements`;
the market/forward ones (forwardPE, ps, pb, evRev, divYield, payout, beta, and mcap-based for ADRs) stay
pulled and are **blank on iOS until this is done.**

---

## 4. App-development checklist (the APP1 ticket)

1. **Prereqs on the Mac** (one-time): Xcode, Node ≥ 18 (use 20), CocoaPods. See [IOS_BUILD.md](IOS_BUILD.md) §0.
2. **Pull prod:** `git checkout main && git pull`.
3. **Extend `nativeFundamentals`** to return the ~21 fields in §3, mirroring `server.py._fetch_one_fundamental`
   exactly (same Yahoo keys, same `debtToEquity` %, same raw operands). This is the only required native code.
4. **`npm install` → `npx cap sync ios` → `npx cap open ios`** → run on the simulator, then a device.
5. **On-device verification** (the parts that can't be proven on web):
   - E2: add a catalog metric (e.g. ROE, gross margin, P/B) → its column populates (not blank).
   - E3: compute-from-statements toggle on/off flips values; stock-detail shows 3 statements + TTM;
     open a foreign ADR (TSM) → currency note + valuation stays pulled.
   - E4/E4.5: the two allocation cards render side-by-side (and stack acceptably) in the native skin.
   - Regression: E1 theme CRUD, calculator/rebalance, history undo/redo, Wi-Fi sync to `portfolio.json`.
6. **Log any coverage caps** you hit on-device (e.g. Yahoo throttling the crumb) in this doc + the board.
7. On success, set **APP1 → done** on the board and update this file's status table.

---

## 5. Shared project board (both machines)

Both the web session and the app session **work the same board** — it lives in the repo, synced by git:
- **Source of truth:** [`docs/board.json`](board.json). Move a card by editing its `"stage"`.
- **Regenerate views** after editing: `py -3 tools/render_dashboard.py` (Windows) / `python3 …` (Mac)
  → writes [`DASHBOARD.md`](DASHBOARD.md) + `board.js`. Open `dashboard.html` for the kanban.
- **Commit `board.json` + `DASHBOARD.md` + `board.js` together**, then push. The other machine `git pull`s
  to see and edit the same board. (The board is on both `main` and `dev`, so a fresh clone of either has it.)

The `platform` field on each card records where a feature lives: `"web"` = built/shipped on web,
still pending native parity; the **APP** epic tracks the iOS side.
