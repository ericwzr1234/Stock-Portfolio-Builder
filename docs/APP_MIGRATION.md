# Web → iOS app migration — status & checklist

> ## ⚠️ SUPERSEDED FOR NEW WORK — read [`V2_WEB_BASELINE.md`](V2_WEB_BASELINE.md) first,
> then [`features/APP2_ios-v2-rebuild.md`](features/APP2_ios-v2-rebuild.md), which is the live
> plan and is **in progress** (APP2.1, .2, .2b, .2c and .11 merged as of 2026-08-24).
> This file documents how the **V1** iOS app reached parity with the **V1** web app (that work is
> done and shipped). The web app has since been **rebuilt as V2** (epic E5, on `main` since
> 2026-08-15). **V1 — including the shipped iPhone app — is superseded.**
>
> The V1 native CSS keys off markup V2 no longer emits, so parts of it are dead by design. Per the
> user's decision, that is **not** to be repaired: the phone UI is being rebuilt against
> [`V2_WEB_BASELINE.md`](V2_WEB_BASELINE.md), which defines the content and features the app must
> carry. Board ticket: **APP2**.
>
> Everything below remains accurate as **V1 history** — in particular §1 (how the platforms relate)
> and §3 (the `ds*` data-layer table), which are still true and still the right architecture.

> **The shared record of what's been built on the web side and how the iOS app reached parity — now complete.**
> The Windows machine builds features on the web (`www/index.html` + `server.py`); the Mac brought the
> **native iOS app** (Capacitor) to parity and shipped it to a physical device. Both machines share **one**
> project board — see §5.
> Board card: **APP1** (epic `APP`, now **done** — merged `dev→main`). Last synced **2026-07-15** (web `main` =
> E1–E4.5 shipped; iOS parity + a phone-first native pass shipped to prod). **Parity is complete: the app is
> now built, installed, and running on a real iPhone** (iPhone 16 Pro Max, iOS 26.5.2) via Xcode free
> personal-team signing, with live on-device Yahoo data confirmed. What remains is operational only — a
> weekly re-run to refresh the 7-day free-signing cert (see §4 / `IOS_BUILD.md`).

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

## 2. Web progress — shipped to prod (`main`), all live on device

Every web epic below is now not just synced into the app but **verified running on a physical iPhone** with
live on-device Yahoo data. iOS parity is **complete**.

| Epic | What shipped | iOS reach |
|------|--------------|-----------|
| **Core** (C1–C10) | 6-factor allocation model, bad-data handling, Yahoo data layer, calculator/rebalance, version history, Prices/Screener tabs, swap, dynamic membership, cross-platform shell | ✅ native (built cross-platform from day one) |
| **E1** User-defined themes | data-driven theme list, add/remove ticker, ticker search+validate, create/rename/recolour/delete theme, restore defaults, peers recommendations, flat screener | ✅ on-device. Data: `nativeQuotes`/`nativeSearch`/`dsPeers` native branches all verified |
| **E2** User-defined metrics | metric catalog (6 default + 21 catalog), picker, auto-direction + 3 bad-data policies, presets/reset | ✅ on-device — `nativeFundamentals` extended with the 21 catalog/market fields (`8437b93`); catalog columns populate |
| **E3** Statement-driven data | `/api/statements` (fundamentals-timeseries), computed-metric engine (TTM), stock-detail page, compute-from-statements toggle, ADR currency handling | ✅ on-device (`nativeStatements` mirrors the server; stock-detail tables scroll with a frozen "Line item" column) |
| **E4** Fundamentals/Screener redesign | declutter allocation panel, per-theme actions, split add-vs-watchlist flow, screener = search+watchlist | ✅ on-device (native skin polished this session — see below) |
| **E4.5** Allocation-panel layout | equal-width split cards, inline direction cue, aligned exception grid | ✅ on-device |

### Shipped this session (2026-07-15) — native-only UI polish (`html.native` skin; web/desktop look unchanged)
- **One-row Model-tab theme actions.** Per-theme actions now sit on a single full-width row with text
  labels ("+ Add ticker", "Edit name", "Delete"), left-aligned under the theme title, with the target-%
  pill floated to the card's top-right; the Exception-handling sub-section was tidied into an aligned grid.
- **iOS auto-zoom fix.** WKWebView magnified the whole page whenever a focused field had font-size < 16px
  (some inputs were an inline 14px), throwing pop-ups oversized and off-screen. Fixed by pinning all native
  form fields to 16px (`.native input`/`textarea`/`select`, excluding checkbox/radio).
- **Scrollable Screener watchlist quote table** with a frozen ticker column (Ticker, Company, Last, Chg%,
  52W High, 52W Low, Volume, Avg Vol, add-to-theme, remove). Root cause of the old broken look: the flat-
  screener rank-hiding rule was also hiding the watchlist's ticker column; the new `wl-table` opts out via a
  higher-specificity override. To populate it, **52-week high/low + today's volume + average volume were
  added to BOTH data layers** — `server.py` `fetch_quotes_live` and on-device `nativeQuotes` — using Yahoo v7
  fields `fiftyTwoWeekHigh`/`fiftyTwoWeekLow`/`regularMarketVolume`/`averageDailyVolume3Month` (fallback
  `…10Day`), stored as `high52`/`low52`/`vol`/`avgVol`, with a `volFmt()` helper (12.3M / 1.2B).

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
> (same Yahoo keys, `debtToEquity` %, raw operands). Verified first on the iPhone 17 simulator and now on a
> **physical iPhone 16 Pro Max (iOS 26.5.2)** with live data (stock-detail shows the extended metrics
> populated). **Two iOS-only bugs found & fixed on-device while
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

## 4. App-development checklist (the APP1 ticket) — ✅ COMPLETE

All build, install, and on-device verification steps are done; APP1 is `done` and merged `dev→main`.

1. ✅ **Prereqs on the Mac** (one-time): Xcode 26.5, Node 24, CocoaPods 1.16.2 (Homebrew at `/opt/homebrew`).
   See [IOS_BUILD.md](IOS_BUILD.md) §0. (CocoaPods needs `LANG`/`LC_ALL=en_US.UTF-8` exported or `pod install`
   throws a Unicode error; build from the git clone **outside** OneDrive at `~/Developer/portfolio-builder`.)
2. ✅ **Pull prod:** `git checkout main && git pull`.
3. ✅ **`nativeFundamentals` extended** to return the ~21 fields in §3 (`8437b93`) — mirrors
   `server.py._fetch_one_fundamental` (same Yahoo keys, `debtToEquity` %, raw operands).
4. ✅ **`npm install` → `npx cap sync ios` → `npx cap open ios`** → ran on the simulator, then installed on a
   **physical iPhone 16 Pro Max (iOS 26.5.2)** via Xcode free personal-team signing.
5. ✅ **On-device verification** (the parts that can't be proven on web):
   - E2: catalog-metric columns (ROE, gross margin, P/B, …) populate, not blank.
   - E3: compute-from-statements toggle flips values; stock-detail shows 3 statements + TTM with a frozen
     "Line item" column; foreign ADRs keep the currency note + pulled valuation.
   - E4/E4.5: the two allocation cards render in the native skin; watchlist quote table scrolls with a
     frozen ticker column and live 52-week/volume fields.
   - Regression: E1 theme CRUD, calculator/rebalance, history undo/redo, live prices — all confirmed.

### Ongoing operational reality (free Apple ID, no paid Developer account)
- **Weekly re-run.** Free personal-team signing certs **expire after 7 days** — re-run from Xcode about weekly
  to refresh. Re-running is an **in-place update that preserves on-device data**; only deleting the app icon
  wipes it.
- **Update flow (pull latest → phone):** `git pull` → `export PATH` + `LANG`/`LC_ALL=en_US.UTF-8` →
  `npx cap sync ios` → `npx cap open ios` → pick the iPhone → **Run**.
- **Signing gotchas** (see [IOS_BUILD.md](IOS_BUILD.md) / session facts): a free team can't reuse a bundle id
  another team owns, so `appId` is `com.ericwzr.portfoliobuilder123453` (`DEVELOPMENT_TEAM 5F48K52NKV`); the
  device must be connected once to mint a profile; Developer Mode must be ON; **skip** Xcode's "Update to
  recommended settings" (User Script Sandboxing breaks the Capacitor build scripts).

### Operational notes (what the running app actually does)
- **Data lives on-device.** The portfolio (holdings/themes/watchlist/versions/settings) persists in the app's
  private WebKit `localStorage` (`pb_portfolio_v1`) — not in any cloud. Deleting the app wipes it. Optional
  Wi-Fi/LAN sync (History → Data sync) shares the home computer's `portfolio.json` over the local network.
- **No background refresh.** The app fetches data only while foregrounded — no `UIBackgroundModes`/background-
  fetch; iOS suspends the webview when backgrounded/closed. No background battery or data use.
- **Free.** Reads Yahoo Finance's free public endpoints on-device — no API key, no subscription, no server.
- **Security posture.** The user's own sandboxed code with minimal permissions (only Local Network, for the
  optional LAN sync); outbound HTTPS to Yahoo only; loads **no remote code** (runs the bundled `www/`).
  Developer Mode's only added exposure is physical-access (needs the unlocked phone + passcode); it opens no
  remote hole and can't be enabled remotely.

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
