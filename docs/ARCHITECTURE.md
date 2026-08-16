# Architecture

One codebase (`www/`) runs as a **web app** (served by `server.py`) and as a **native iOS app**
(wrapped by Capacitor). The UI and the entire allocation engine are shared; only the **data layer**
(networking + storage) differs by platform.

```
                        ┌─────────────────────────── www/index.html ───────────────────────────┐
                        │  UI (Prices · Fundamentals · Calculator · Screener · History)          │
                        │  Allocation + metric engine (metrics/computeAllocation, statement-      │
                        │    driven compute [E3], planTrades, version timeline)                  │
                        │  Dynamic membership (tickersOf / membership / tradeUniverse)           │
                        └───────────────┬───────────────────────────────────┬───────────────────┘
                                        │  dsQuotes/dsFundamentals           │  loadPortfolio/savePortfolio
                          NATIVE? ──────┴───────────────┐                    │
                                        │               │                    │
                web (browser)           │   iOS (Capacitor native)           │
        ┌───────────────────────┐      │     ┌──────────────────────────┐    │
        │ fetch /api/* →         │      │     │ CapacitorHttp → Yahoo     │   │
        │ server.py (Yahoo proxy │◄─────┘     │ (no CORS, on-device)      │   │
        │ + portfolio.json)      │            │ localStorage (on-device)  │◄──┘
        └───────────────────────┘            └──────────────────────────┘
```

## The data layer (`www/index.html`, "Data layer" section)
`const NATIVE = Capacitor.isNativePlatform()`. Every higher-level call goes through unified entry
points that branch on `NATIVE`:

| Call | Web | iOS (native) |
|---|---|---|
| `dsQuotes(syms)` | `GET /api/quotes` (server proxies Yahoo) | `nativeQuotes` → `CapacitorHttp` to Yahoo v7 quote |
| `dsFundamentals(syms)` | `GET /api/fundamentals` | `nativeFundamentals` → `CapacitorHttp` to Yahoo v10 quoteSummary |
| `dsStatements(syms)` *(E3)* | `GET /api/statements` | `nativeStatements` → `CapacitorHttp` to Yahoo `fundamentals-timeseries` |
| `dsSearch(q)` *(E1)* | `GET /api/search` | `nativeSearch` → Yahoo search v1 |
| `dsPeers(sym)` *(E1)* | `GET /api/peers` | native branch → Yahoo `recommendationsbysymbol` |
| `loadPortfolio` / `savePortfolio` | **the signed-in account only** (E9: no local copy); `portfolio.json` is read once for the import | `localStorage["pb_portfolio_v1"]` |
| `dsLoadUniverse()` | `window.__UNIVERSE` (from `data/universe.js`) | same |

The native Yahoo client mirrors `server.py` for the cookie+crumb handshake (`yEnsureCrumb`), quotes,
statements (`nativeStatements` ↔ server `_STMT_FIELDS`, byte-identical), search, and peers — plus the
fundamentals derivations (Total Debt/FCF, the `P/E = mcap ÷ net income` and
`EV/EBITDA = (mcap + debt − cash) ÷ EBITDA` fallbacks, and the 50/200-day momentum blend).
**Data-layer parity is complete (as of `8437b93`):** `nativeFundamentals` now also emits the ~21 extra
E2 catalog / E3 market fields that `server.py._fetch_one_fundamental` returns (forwardPE, ps, pb, evRev,
margins, roe, roa, debtToEquity, current/quick, growth, divYield, payout, beta, raw operands) — so the
E2 catalog and the E3 pulled/market metrics populate on-device. The old gap is closed and verified on a
physical iPhone (see [`APP_MIGRATION.md`](APP_MIGRATION.md)).

Quotes now also carry **52-week high/low, today's volume, and average volume** (Yahoo v7 fields
`fiftyTwoWeekHigh` / `fiftyTwoWeekLow` / `regularMarketVolume` / `averageDailyVolume3Month`, falling
back to `averageDailyVolume10Day`; stored under keys `high52` / `low52` / `vol` / `avgVol`). This is
mirrored in **both** data layers — `server.py.fetch_quotes_live` and the on-device `nativeQuotes` — and
consumed by the Screener watchlist table (`volFmt` renders the share counts, e.g. `12.3M` / `1.2B`).

`CapacitorHttp` is enabled in `capacitor.config.json`, which (a) guarantees `window.CapacitorHttp`
exists and (b) routes `fetch`/`XHR` through native HTTP. Local assets are intentionally **not**
fetched on native: `universe.js` is a `<script>` that sets `window.__UNIVERSE`, and the portfolio
uses `localStorage` — so nothing depends on `fetch` to a bundled file.

### Storage adapters and accounts (E6)

`loadPortfolio`/`savePortfolio` no longer branch inline. They resolve one entry from a registry, and
that is the single seam between the pure engine and wherever the bytes live:

```js
const STORAGE_ADAPTERS = { cloud, lan, native, web };
function storageAdapter(){
  if(signedIn()) return STORAGE_ADAPTERS.cloud;   // an account beats local storage
  if(useRemote()) return STORAGE_ADAPTERS.lan;    // iOS + a configured computer URL
  if(NATIVE)      return STORAGE_ADAPTERS.native;
  return STORAGE_ADAPTERS.web;
}
```

The `cloud` adapter talks to Supabase: GoTrue for auth (`/auth/v1/`), PostgREST for the document
(`/rest/v1/portfolios`), one row per user, isolation enforced by **database** row-level security
rather than by this code. Only the *publishable* key is in the client — it is public by design; the
secret key carries `BYPASSRLS` and must never enter the repo.

**The rules this layer must obey are not obvious, and were learned by breaking them.** Thirteen
adversarial review rounds found ~120 defects here. Before changing anything in this area, read
[`features/E6_database_design.md`](features/E6_database_design.md) §16–21, which states each
invariant next to the failure that motivated it. The contract, as implemented (E8):

- **C1 — one context, captured before the first `await`** (`pctx()`: adapter, owner, identity).
  Nothing after an await re-reads live state to decide what the operation meant.
- **C2 — one checkpoint** (`ctxCurrent()`). Nothing is applied or written for a context that is no
  longer current: app locked, identity changed, adapter changed, or a different signed-in user.
  A **token refresh is not an identity change** — treating it as one discarded a live portfolio on
  every stale reload.
- **C3 — `state.baseRevision` is a server-confirmed revision or `null`**, and saving is refused
  while it is null. It is never derived from the document and never taken from a conflict error.
- **C4 (E9) — nothing about a portfolio is written to this device.** The account is the single
  source of truth. A save that cannot reach it did not happen and says so; an account that cannot
  be read is reported, not replaced by a cached copy. The mirror, the two status bits and the
  kept-aside stashes were **deleted** — they produced most of the defects of rounds 3–6, including
  ones that could hand a user stale work which overwrote a good portfolio.
- **C5 — a save returns `true` only if the write landed**, and callers that announce success check it.

Two rules generalise beyond this file: *a guard must measure the thing it guards against* (an epoch
that counted token refreshes discarded good data), and *a refusal that has already mutated is not a
refusal* (three separate HIGH findings were a guard placed below the mutation it prevented).

### LAN sync (iOS and web share one portfolio.json)
On iOS, `state.serverUrl` (persisted as `localStorage["pb_server_url"]`, set via History → Data sync)
switches portfolio persistence to the home computer: `useRemote()` → `remoteGetPortfolio` /
`remotePutPortfolio` hit `<serverUrl>/api/portfolio` over `CapacitorHttp` — the same endpoint and
file the web uses. Every remote read/write also mirrors to `localStorage`, so the phone falls back to
the last-synced copy when the computer is unreachable. Quotes/fundamentals stay on-device regardless.
`server.py` binds `0.0.0.0` and prints the LAN address to enter on the phone; iOS ATS permits the
plaintext-LAN call via `NSAllowsLocalNetworking` + `NSLocalNetworkUsageDescription` in `Info.plist`.

## Dynamic theme membership (what makes "swap" possible)
Originally `const ALL` and `themeOf` were static. Now:
- `THEMES[].tickers` are **defaults** only.
- `state.themeTickers` (`{themeKey: [syms]}`) holds the live membership; `null` ⇒ use defaults.
- `tickersOf(key)` → a theme's current names; `membership()` → all themed names; `holdingSyms()` →
  whatever is held; `tradeUniverse()` → `membership() ∪ holdingSyms()` (the union so that a
  swapped-out, still-held name gets liquidated).
- `rebuildThemeOf()` rebuilds the `sym → theme` map; call it after any membership change,
  `loadPortfolio`, or `restoreVersion`. `themeOfSym(s)` is the null-safe lookup (returns an
  "Exiting position" placeholder for held-but-unthemed names).
- `state.themeTickers` is persisted in `portfolio.json` and in **every version snapshot**, so
  undo/redo/revert restore membership alongside holdings.

### `planTrades(addCash, mode)` generalization
Trades are computed over `tradeUniverse()`. Names in a theme get their model target; held names
**not** in any theme get target `$0` (full liquidation). For a swap we run a full realign
(`planTrades(0, "full")`): the removed name sells to $0 and its cash redeploys into the model —
net trade ≈ the added cash (0 for a pure swap). `applyRebalance` then deletes any zero-share,
unthemed positions so the book stays clean.

## Screener → watchlist → add/swap flow (E4.4)
The Screener is a **search box + a watchlist** (the old universe grid was removed in E4.4).
1. Search any ticker (`dsSearch`) → `addToWatchlist(sym, theme?)` stages it in `state.watchlist`
   (no theme; never in the portfolio yet). `renderScreener()` = `renderWatchlist()` + a hint note.
2. On a watchlisted (or screener) name, `openStockActions(sym, themeKey)` is the action sheet: **Add to
   theme** (`addTicker`), **Swap in…** (`openSwap`), **Remove** (`removeTicker`), or **Watchlist**.
3. **Swap:** `openSwap(newSym, themeKey)` → radio list of the theme's current holdings →
   `doSwap(themeKey, oldSym, newSym)` updates `state.themeTickers` (via `setMembership`), fetches the
   new name's quote+fundamentals+statements, switches to the Calculator, and renders a full-realign plan.
4. **Apply & save** → `applyRebalance` (a normal `REBALANCE` version checkpoint; undoable). Membership is
   only persisted on Apply, so navigating away cancels a pending change.

## The candidate universe
`tools/build_universe.py` turns `data/universe-raw.json` (multi-agent curation output) into
`data/universe.json` + `data/universe.js` (`window.__UNIVERSE`). It pins the core tickers to their
theme, resolves any ticker that appears in two themes by priority (`stablecoin > robotics > data >
enterpriseai > personalai`), drops placeholder/junk and known-bad symbols, fixes a couple of wrong
tickers, sorts by seed market cap, caps each theme, and asserts mutual exclusivity + that all cores are
present. Re-runnable and idempotent. (Since E4.4 the Screener UI no longer renders this as a grid; the
dataset remains as a curated, mutually-exclusive candidate/market-cap reference loaded via
`dsLoadUniverse`.)

## Native UI skin (iOS look without changing the web app)
The iOS app is mobile-redesigned purely with CSS scoped to `html.native`:
- The class is set only inside Capacitor — an early `<head>` script
  (`Capacitor.isNativePlatform()`) plus a fallback in `init()`. The web/desktop app never gets the
  class, so it renders exactly as before.
- All native styling lives in one `.native { … }` block at the end of `<style>`: a fixed bottom tab
  bar with masked-SVG icons (tinted by `currentColor`, teal when active) and short `::after` labels,
  `env(safe-area-inset-*)` padding for the notch and home indicator, single-column theme cards
  (the desktop grid's 470px min track would overflow a phone), a screener with the rank column
  hidden, 16px inputs (avoid iOS focus-zoom), and a slide-up bottom-sheet for the swap dialog.
- `capacitor.config.json` uses `ios.contentInset: "never"` + `viewport-fit=cover`; safe areas are
  handled in CSS. **Gotcha:** a `position:fixed` bottom bar is trapped if any ancestor establishes a
  containing block, so `.native header.top` clears the inherited `backdrop-filter`.
- **Gotcha (focus-zoom):** WKWebView auto-zooms the *whole page* whenever a focused field has
  `font-size < 16px` (some inputs carried an inline 14px), which made every pop-up render oversized and
  pushed its left edge off-screen. All native form fields are therefore pinned to 16px —
  `.native input` (excluding checkbox/radio), `.native textarea`, `.native select { font-size:16px !important }`.
- **Gotcha (watchlist ticker column):** the flat-Screener rank-hiding rule
  `.native #view-screener table td:first-child { display:none }` also hid the watchlist's first
  (ticker) column. The watchlist table is tagged `.wl-table` and opts out via a higher-specificity
  override so its frozen ticker column stays visible.
- Rule: never restyle base selectors for mobile; only add `.native …` overrides. Rebuild with
  `npx cap sync ios` after CSS changes.

## server.py
Python stdlib only. Serves `www/` statically (with a path-traversal guard and a small content-type
map), exposes `/api/quotes`, `/api/fundamentals` (with the ~21 E2 catalog fields),
`/api/statements` (E3, over Yahoo `fundamentals-timeseries`, per-symbol cache + warm-holdings daemon),
`/api/search` and `/api/peers` (E1), and `/api/portfolio`. Caches quotes ~15s and fundamentals ~6h,
handles the Yahoo cookie+crumb, and falls back to an embedded `SEED` snapshot for the core names when
Yahoo is unreachable. `PB_DB` / `PB_PORT` env vars override the data file + port (dev isolation);
`PB_SEC_CONTACT` opts into the SEC ticker cache used by search.
