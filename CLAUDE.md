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
   Finance. Since **E6 the portfolio persists in the signed-in user's account** (Supabase, one row
   per user, isolated by database row-level security). **E9: nothing about a portfolio is written to
   the device** — no mirror, no stash, no cached copy. A save that cannot reach the account did not
   happen and says so. `portfolio.json` is the *pre-account* file: read once for the import, never
   written. This is the dev path and works on Windows + Mac.
2. **iOS app** — the same `www/` wrapped with **Capacitor**. On iOS there is no server: it fetches
   Yahoo directly on-device (via CapacitorHttp, no CORS) and stores the portfolio on-device
   (localStorage). Private and free. See [`docs/IOS_BUILD.md`](docs/IOS_BUILD.md).

**Status:** **E1–E5 are in `main`/prod** — themes, metrics, statement-driven data, the
Fundamentals/Screener redesign, and the V2 web UI. **E6–E9 are BUILT AND TESTED on `dev-newUI` but
NOT MERGED**: accounts + hosted database (E6), first-run onboarding (E7), the persistence rewrite
with no default themes (E8), and no portfolio data on the device (E9). `main` is 30 commits behind.

**The merge is one short review pass away** — see
[`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md), which is the file to read first.

- **E5** replaced the whole web UI: five views — **Overview · Model · Rebalance · Research ·
  History** — with the allocation donut, the portfolio-value chart against an **Equal-weight
  Strategy** counterfactual, a **$ / %** return chart, and a collapsible holdings table.
  Spec: [`docs/features/E5_web-ui-overhaul.md`](docs/features/E5_web-ui-overhaul.md).
- **E6** put the portfolio behind a **mandatory login**; **E8** rewrote the persistence core after
  seven patch rounds; **E9** deleted every local copy of a portfolio. Read
  [`docs/features/E6_database_design.md`](docs/features/E6_database_design.md) **§16–21 before
  touching the sync layer** — it records ~120 defects across thirteen review rounds, each invariant
  written next to the failure that motivated it. The single most useful lesson: *a guard must
  measure the thing it guards against*, and *a refusal that has already mutated is not a refusal*.
- **iOS is PARKED at V1.** It still runs on a real iPhone, but it predates E5 and E6. Rebuilding it
  is board ticket **APP2**; the hand-off spec is
  [`docs/V2_WEB_BASELINE.md`](docs/V2_WEB_BASELINE.md) (§9 lists the sync rules the native build
  must inherit — they matter more there, because on-device storage is the *only* copy).
  Maintenance while parked: the **weekly re-run from Xcode** to refresh the free personal-team
  signing cert, which expires every 7 days. See [`docs/APP_MIGRATION.md`](docs/APP_MIGRATION.md)
  and [`docs/IOS_BUILD.md`](docs/IOS_BUILD.md).

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
  APP_MIGRATION.md            ← web→iOS parity status + the app-dev checklist (parity complete)
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
- **Current focus: the owner tests from a FRESH ACCOUNT (from 2026-08-16).** Everything through E9
  is in prod. Nothing was migrated from the pre-account book — by their decision, so the first-run
  path gets exercised for real.
  **Before inviting anyone else**, three owner-only Supabase actions remain, in order (see
  [`sql/ISOLATION_TEST.md`](sql/ISOLATION_TEST.md)): **move to a paid tier**, **configure custom
  SMTP** (the built-in sender is capped at 2 emails/hour, so invites and password resets stall), and
  **switch signup to invite-only** (it is currently open).
  Next build tickets: **E10.1 / E10.2** — history retention, requirements captured in
  [`docs/features/E10_history-retention.md`](docs/features/E10_history-retention.md) — then **APP2**
  (rebuild iOS against the V2 baseline).
  **Before touching the persistence layer, read `docs/features/E6_database_design.md` §16–21.** It
  records ~130 defects across fourteen review rounds and states each invariant next to the failure
  that motivated it. The two rules that generalise: *a guard must measure the thing it guards
  against*, and *a refusal that has already mutated is not a refusal*.

## How to run

### Web (Windows or Mac) — the everyday dev path
- **Windows:** double-click `Start Portfolio Builder.bat` (needs Python 3).
- **Mac:** double-click `Start Portfolio Builder.command` (Finder may need right-click → Open the
  first time), or run `python3 server.py`. Then open the printed `http://127.0.0.1:8765/`.
- **You sign in first** — the app opens on a login page and nothing is reachable until you do.
  Your work then saves to your account, with an offline copy in this browser.

### iOS (Mac only) — see [`docs/IOS_BUILD.md`](docs/IOS_BUILD.md) for the full walkthrough
Prerequisites are now **satisfied** on this Mac (Xcode 26.5, Node 24, CocoaPods 1.16.2). The app is
already installed on the iPhone; the everyday task is just the **weekly update/refresh** flow:
```
git pull
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods needs UTF-8 or pod install errors
npx cap sync ios                             # after any change to www/ or plugins
npx cap open ios                             # Xcode → pick the iPhone → Run
```
First-time-on-a-device gotchas (free Apple ID, **no** paid Developer account — full detail in
[`docs/IOS_BUILD.md`](docs/IOS_BUILD.md)):
- **Unique bundle id** — a free personal team can't claim a bundle id another team owns, so the app
  uses `com.ericwzr.portfoliobuilder123453` (team `5F48K52NKV`; matched in `capacitor.config.json`).
- **Connect the device once** before signing, or the team has no device to generate a profile.
- **Developer Mode ON** (Settings → Privacy & Security → Developer Mode → restart), then **trust the
  cert** (Settings → General → VPN & Device Management → your Apple ID → Trust) on first launch.
- **Free signing certs expire after 7 days** → re-run from Xcode ~weekly. Re-running is an in-place
  update that **preserves on-device data**; only deleting the app icon wipes it.
- Skip Xcode's "Update to recommended settings" prompt (User Script Sandboxing breaks the Capacitor
  build scripts); the WKProcessPool / Embed-Pods yellow warnings are harmless.

On-device the portfolio lives in the app's private WebKit **localStorage** (`pb_portfolio_v1`) — no
cloud — and the app fetches **only while foregrounded** (no background refresh). Optional Wi-Fi/LAN
sync (History → Data sync) shares the home computer's `portfolio.json`.

## Feature epics (E1–E4.5 in prod; E5 + E6 built on `dev-newUI`)
The original tool (core 6-factor model, calculator/rebalance, version history, Prices tab) has been
extended by six epics — each with specs under `docs/features/`:
1. **E1 — User-defined themes.** Themes are data-driven: create/rename/recolour/delete, restore
   defaults, add/remove any ticker (search any listed name incl. ADRs), a staging watchlist, and the
   flat Screener → peers recommendations.
2. **E2 — User-defined metrics.** A 27-metric model (6 default + 21 catalog) via a metric picker, with
   auto-direction, three bad-data policies (penalize/carry/ignore), and savable presets. `server.py`
   forwards ~21 extra Yahoo fields for the catalog.
3. **E3 — Statement-driven data.** Metrics computed from the 3 financial statements (Yahoo
   `fundamentals-timeseries`) instead of pre-computed fields; a TTM engine; a stock-detail page (3
   statements × 4 quarters + computed-metrics panel); a compute-from-statements toggle + source
   compare; foreign-ADR currency handling. On iOS both `nativeStatements` and `nativeFundamentals`
   now mirror the server (the E2 catalog fields were added in `8437b93`), closing the last parity gap.
4. **E4 / E4.5 — Fundamentals & Screener redesign.** The allocation panel split into ① Metrics /
   ② Exception handling / ③ Max weight; per-theme actions in each theme card; the **Screener is now
   search + watchlist** (look up a name → watchlist → add-as-new or swap-for-a-holding → rebalance);
   the two-card Fundamentals layout (Target-vs-current | Theme-allocation-model).
5. **E5 — V2 web UI.** The whole web interface, rebuilt: five views (**Overview · Model · Rebalance ·
   Research · History**), a light/dark toggle driven by CSS design tokens, the allocation donut, the
   portfolio-value chart against an **Equal-weight Strategy** counterfactual (rebalanced to exact
   equal weight at every checkpoint, drifting between them, priced from the recorded trade prices), a
   **$ / %** return chart, and a collapsible holdings table. Presentation only — 24 engine functions
   were verified byte-identical to prod.
6. **E6 — Accounts + hosted database.** A mandatory login gate; one row per user in Supabase with
   isolation enforced by **database** row-level security; optimistic concurrency on a monotonic
   `revision` (a save states the revision it was based on; the loser is refused and **kept aside**,
   never auto-merged); a per-user offline copy; and a one-time import of a pre-account
   `portfolio.json`. **§16–17 of the design doc are required reading before changing this layer.**

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
  search, peers, and the six core factors (crumb dance, PEG/EV/PE derivations, momentum). As of
  `8437b93`, `nativeFundamentals` also emits the ~21 extended E2 catalog fields the server does, so the
  data layer is at full parity — see [`docs/APP_MIGRATION.md`](docs/APP_MIGRATION.md).
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
- **macOS web prices used to show `seed`/offline** while Windows worked: the Mac's python.org Python
  couldn't verify Yahoo's TLS cert. `server.py` now **auto-uses `certifi`** (falls back silently if it
  isn't installed), so Mac prices fetch live out of the box; the old manual fix
  (`/Applications/Python 3.xx/Install Certificates.command`) is only a fallback. Only ever affected the
  web server's price proxy on the Mac; the iOS app and LAN sync are unaffected.
- Don't let `node_modules/` and `ios/` bloat OneDrive — they're Mac-only build artifacts (a
  `.gitignore` lists them; consider excluding them from OneDrive sync).
