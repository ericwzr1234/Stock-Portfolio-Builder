# Portfolio Builder — project guide (read this first)

> **Cross-machine note.** Developed on **two machines** — a Windows laptop (focus: the web app) and a
> MacBook (focus: the native iOS app). **Sync is now via git/GitHub** (private repo:
> https://github.com/ericwzr1234/Stock-Portfolio-Builder), **not OneDrive**. Before developing, read
> [`docs/DEV_WORKFLOW.md`](docs/DEV_WORKFLOW.md) for the setup (clone the repo *outside* OneDrive on
> each machine) and the `main`(prod)/`dev` branch + feature-pipeline process. This `CLAUDE.md` +
> `docs/` are the source of truth (versioned now); Claude's per-machine memory does **not** sync.
> iOS/Xcode work is **Mac only**.

## What this is
A free, no-API-key tool that **builds and rebalances** a themed, market-cap-weighted stock portfolio
from a **user-defined fundamentals model** (pick your themes, pick your metrics, computed from live
data or straight from the financial statements). It runs in two forms from **one codebase** (`www/`):

1. **Web app** — `server.py` (Python standard library only) serves `www/` and proxies Yahoo
   Finance; data persists in `portfolio.json`. This is the dev path and works on Windows + Mac.
2. **iOS app** — the same `www/` wrapped with **Capacitor**. On iOS there is no server: it fetches
   Yahoo directly on-device (via CapacitorHttp, no CORS) and stores the portfolio on-device
   (localStorage). Private and free. See [`docs/IOS_BUILD.md`](docs/IOS_BUILD.md).

**Status (2026-07-13):** the web app is feature-complete — Epics **E1** (user-defined themes),
**E2** (user-defined metrics), **E3** (statement-driven data), and **E4/E4.5** (Fundamentals/Screener
redesign) are all shipped to `main`/prod (`a3353ae`). Current phase = **iOS app parity** (board epic
`APP`; see [`docs/APP_MIGRATION.md`](docs/APP_MIGRATION.md)).

## The default themes (user-editable since E1)
Themes and their names are no longer hardcoded — the user can create/rename/recolour/delete themes and
add/remove any ticker (E1). The tool **starts** with five themes of five "core" names each:

| key | name | default core tickers |
|---|---|---|
| `stablecoin` | Stablecoin | CRCL, MA, V, COIN, JPM |
| `personalai` | Personal AI | AAPL, AMZN, META, GOOGL, IBM |
| `enterpriseai` | Enterprise AI | NOW, PLTR, MSFT, CRM, PATH |
| `robotics` | Robotics | ISRG, ROK, NVDA, SYM, TSLA |
| `data` | Data Providers | SNOW, SPGI, MCO, MSCI, RDDT |

## The allocation model
Per theme, a **market-cap-weighted** blend of the active metrics, normalized across the themes, with a
per-theme cap (default 30%, auto-scaling `1.5 / N`) and equal weight within a theme. The metric set is
**user-defined** (E2): six on by default — **PEG, EV/EBITDA, Debt/FCF, P/E** (TTM, cheaper ⇒ higher) +
**log avg market cap** + **momentum** (default weights 20/20/20/15/10/15) — plus a **catalog of 21
more** (ROE/ROA/margins/P·S/P·B/current·quick/D·E/growth/div-yield/payout/beta/fwd-P·E/EV·Rev/P·FCF/
net-cash…), each with an auto-assigned direction and a per-metric bad-data policy (penalize / carry-over
/ ignore). By default every metric is **computed from the three financial statements** (E3, TTM from the
last 4 quarters); forward/market metrics stay pulled, with a toggle + source-compare + a stock-detail
page. Full spec is in [`README.md`](README.md) ("The strategy, precisely") and the code comments.

## Repo layout
```
CLAUDE.md                     ← you are here (hub)
README.md                     ← end-user description of the web tool + strategy
docs/
  DEV_WORKFLOW.md             ← git/GitHub setup, dev/prod branches, the feature pipeline (READ FIRST)
  DASHBOARD.md                ← the live project board (generated; renders on GitHub)
  board.json                  ← project-board source of truth (edit this, then render)
  board.js                    ← board as window.__BOARD (generated; read by dashboard.html)
  features/                   ← one spec per feature (design → impl notes → iOS migration)
  ARCHITECTURE.md             ← how the code is organized; the web↔iOS split
  IOS_BUILD.md                ← step-by-step: build & run the iOS app (free, private)
  APP_MIGRATION.md            ← web→iOS parity status + the app-dev checklist (current focus)
dashboard.html                ← visual project-board kanban (double-click; reads docs/board.js)
server.py                     ← Python stdlib server: serves www/ + Yahoo proxy + portfolio.json
                                 (PB_DB / PB_PORT env override the db file + port for dev)
portfolio.json                ← the web app's saved data (holdings, versions, settings)
Start Portfolio Builder.bat   ← Windows launcher (double-click → runs server.py, opens browser)
Start Portfolio Builder.command ← macOS launcher (double-click in Finder; runs server.py)
package.json                  ← Capacitor/npm manifest (iOS build)
capacitor.config.json         ← Capacitor config (webDir=www, CapacitorHttp enabled)
www/                          ← THE APP (single source of truth for UI + logic)
  index.html                  ← entire single-page app (markup + CSS + JS)
  data/
    universe.json             ← screener universe (5 themes × ~50 mutually-exclusive stocks)
    universe.js               ← same data as `window.__UNIVERSE` (script-loadable; used on iOS)
    universe-raw.json         ← raw multi-agent curation output (provenance; input to the builder)
tools/
  build_universe.py           ← cleans universe-raw.json → universe.json + universe.js (re-runnable)
  render_dashboard.py         ← board.json → DASHBOARD.md + board.js (re-runnable)
.claude/launch.json           ← preview config (GIT-IGNORED; per-OS runtime — see DEV_WORKFLOW.md)
ios/                          ← Capacitor iOS project (committed, minus build output; built on Mac)
node_modules/                 ← GENERATED by `npm install` (git-ignored; Mac only)
```
**The app lives in `www/index.html`.** There is no root `index.html` anymore — don't recreate one.

## Development workflow & project board
This is now a managed, git-synced project. **Before developing, read
[`docs/DEV_WORKFLOW.md`](docs/DEV_WORKFLOW.md)** — GitHub setup (clone *outside* OneDrive), the
`main`(prod)/`dev`(work) branch model, the dev server with isolated test data
(`PB_DB=portfolio.dev.json`, port 8766), and the feature pipeline with approval gates
(`ideation → design → implementation → testing → refinement → integration → done`).
- **Live status:** the [project board](docs/DASHBOARD.md) (or open `dashboard.html`). Source of truth
  is [`docs/board.json`](docs/board.json); regenerate the views with `tools/render_dashboard.py`.
- **Each feature** has a spec in `docs/features/<id>_<name>.md`; its **iOS migration notes** are what
  the Mac session reads to replicate the web feature natively.
- **Current focus:** the **iOS app** (epic `APP`, ticket `APP1`) — bring the native app to parity with
  the web. Web epics E1–E4.5 are all shipped to prod. Plan: [`docs/APP_MIGRATION.md`](docs/APP_MIGRATION.md).

## How to run

### Web (Windows or Mac) — the everyday dev path
- **Windows:** double-click `Start Portfolio Builder.bat` (needs Python 3).
- **Mac:** double-click `Start Portfolio Builder.command` (Finder may need right-click → Open the
  first time), or run `python3 server.py`. Then open the printed `http://127.0.0.1:8765/`.
- Everything you do saves to `portfolio.json`.

### iOS (Mac only) — see [`docs/IOS_BUILD.md`](docs/IOS_BUILD.md) for the full walkthrough
Prerequisites this Mac is currently **missing**: **Xcode** (free, App Store) and **Node 18+**
(it has Node 10, too old for Capacitor 6). Once those are installed:
```
npm install
npx cap add ios       # first time only — generates ios/
npx cap sync ios      # after any change to www/ or plugins
npx cap open ios      # opens Xcode; set Signing team, pick a simulator/device, Run
```

## Feature epics (all shipped to prod)
The original tool (core 6-factor model, calculator/rebalance, version history, Prices tab) has been
extended by four epics — each with specs under `docs/features/`:
1. **E1 — User-defined themes.** Themes are data-driven: create/rename/recolour/delete, restore
   defaults, add/remove any ticker (search any listed name incl. ADRs), a staging watchlist, and the
   flat Screener → peers recommendations.
2. **E2 — User-defined metrics.** A 27-metric model (6 default + 21 catalog) via a metric picker, with
   auto-direction, three bad-data policies (penalize/carry/ignore), and savable presets. `server.py`
   forwards ~21 extra Yahoo fields for the catalog.
3. **E3 — Statement-driven data.** Metrics computed from the 3 financial statements (Yahoo
   `fundamentals-timeseries`) instead of pre-computed fields; a TTM engine; a stock-detail page (3
   statements × 4 quarters + computed-metrics panel); a compute-from-statements toggle + source
   compare; foreign-ADR currency handling. On iOS, `nativeStatements` mirrors the server — but
   `nativeFundamentals` still needs the E2 fields (the one open parity gap; see `docs/APP_MIGRATION.md`).
4. **E4 / E4.5 — Fundamentals & Screener redesign.** The allocation panel split into ① Metrics /
   ② Exception handling / ③ Max weight; per-theme actions in each theme card; the **Screener is now
   search + watchlist** (look up a name → watchlist → add-as-new or swap-for-a-holding → rebalance);
   the two-card Fundamentals layout (Target-vs-current | Theme-allocation-model).

**Swap** (still core, now driven from the watchlist): choosing a theme for a watchlisted name asks
whether to add it or replace a **same-theme** holding → the Calculator shows a full realign (sell the
removed name to $0, buy the new one, rebalance) → **Apply & save** is a normal, undoable version
checkpoint that also restores the prior membership on undo.

## Architecture you must know before editing (details in docs/ARCHITECTURE.md)
- **Dynamic theme membership.** Theme tickers are no longer hardcoded. `THEMES[].tickers` are only
  *defaults*; the live membership is `state.themeTickers` (persisted in `portfolio.json` and in
  every version snapshot). Always read membership through `tickersOf(key)` / `membership()`, never a
  static `ALL`. Held-but-unthemed names (a swapped-out position to liquidate) come from
  `tradeUniverse()` = `membership() ∪ holdings`.
- **Platform-agnostic data layer.** Code calls `loadQuotes` / `loadFundamentals` / `loadStatements` /
  `loadPortfolio` / `savePortfolio` over the platform-branching `ds*` layer (`dsQuotes` /
  `dsFundamentals` / `dsStatements` / `dsSearch` / `dsPeers` / `dsLoadUniverse`). These branch on
  `NATIVE` (Capacitor): web → the Python server; iOS → Yahoo via `CapacitorHttp` + `localStorage`. The
  iOS parsing mirrors `server.py` for quotes, **statements** (`nativeStatements` ↔ server `_STMT_FIELDS`),
  search, peers, and the six core factors (crumb dance, PEG/EV/PE derivations, momentum). **One open
  parity gap:** `nativeFundamentals` doesn't yet emit the ~21 extended E2 catalog fields the server does
  — see [`docs/APP_MIGRATION.md`](docs/APP_MIGRATION.md).
- **LAN sync (iOS ↔ web share one database).** On iOS you can set a **server URL** (History → Data
  sync sheet, stored as `localStorage["pb_server_url"]`). When set (`useRemote()`),
  `loadPortfolio`/`savePortfolio` read/write the **same `portfolio.json`** as the web via the home
  computer's `server.py` (`CapacitorHttp` to `<url>/api/portfolio`), keeping a `localStorage` mirror
  and falling back to it when unreachable. Quotes/fundamentals stay on-device regardless. `server.py`
  binds `0.0.0.0` and prints the LAN address to enter on the phone; iOS needs the
  `NSAllowsLocalNetworking` + `NSLocalNetworkUsageDescription` keys in `ios/App/App/Info.plist`.
- **Version control** (undo/redo/revert) snapshots `themeTickers` too, so undoing a swap restores
  the prior membership *and* holdings.
- **Native iOS UI skin.** The iOS app gets a mobile redesign (bottom icon tab bar, safe-area insets
  for notch/home indicator, bottom-sheet swap dialog, larger touch targets) via CSS scoped to
  `html.native`. That class is added **only** inside Capacitor (an early `<head>` script + `init()`),
  so the web/desktop version is visually identical to before. **Put all iOS-only styling in the
  `.native { … }` block at the end of `<style>`; never restyle base selectors for mobile** or you'll
  change the web look. (Gotcha: a `position:fixed` element can't live under an ancestor with
  `backdrop-filter`/`transform` — that's why `.native header.top` clears `backdrop-filter`.) Rebuild
  with `npx cap sync ios` + Xcode after any `www/` change.

## Common tasks
- **Change a theme's default names:** edit `THEMES` in `www/index.html` (and keep the `core` arrays
  in `www/data/universe.json` in sync). Re-run `python3 tools/build_universe.py` if you touched the
  universe inputs.
- **Re-curate / refresh the screener universe:** replace `www/data/universe-raw.json` with new
  curation output, then `python3 tools/build_universe.py` (it de-dupes, fixes known-bad tickers,
  enforces mutual exclusivity, writes `universe.json` + `universe.js`).
- **After editing `www/` for iOS:** run `npx cap sync ios` before rebuilding in Xcode.

## Gotchas
- Yahoo's free endpoints need a cookie+crumb; `server.py` and the iOS data layer both handle it.
  Values can be delayed ~15 min; if a request fails the web server falls back to a `seed` snapshot.
- The iOS on-device Yahoo path uses `CapacitorHttp` (enabled in `capacitor.config.json`). If quotes
  don't load on device, that's the first thing to check — see `docs/IOS_BUILD.md` troubleshooting.
- iOS portfolio defaults to on-device; **LAN sync** (History → Data sync) makes it share the web's
  `portfolio.json` over Wi-Fi (see `docs/IOS_BUILD.md`).
- **macOS web prices show `seed`/offline** while Windows works: the Mac's python.org Python can't
  verify Yahoo's TLS cert — run `/Applications/Python 3.xx/Install Certificates.command` once. Only
  affects the web server's price proxy on the Mac; the iOS app and LAN sync are unaffected.
- Don't let `node_modules/` and `ios/` bloat OneDrive — they're Mac-only build artifacts (a
  `.gitignore` lists them; consider excluding them from OneDrive sync).
