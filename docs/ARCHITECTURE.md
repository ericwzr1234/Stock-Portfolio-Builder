# Architecture

One codebase (`www/`) runs as a **web app** (served by `server.py`) and as a **native iOS app**
(wrapped by Capacitor). The UI and the entire allocation engine are shared; only the **data layer**
(networking + storage) differs by platform.

```
                        ┌─────────────────────────── www/index.html ───────────────────────────┐
                        │  UI (Prices · Fundamentals · Calculator · Screener · History)          │
                        │  Allocation engine (computeAllocation, planTrades, version timeline)   │
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
| `loadPortfolio` / `savePortfolio` | `GET`/`POST /api/portfolio` → `portfolio.json` | `localStorage["pb_portfolio_v1"]` |
| `dsLoadUniverse()` | `window.__UNIVERSE` (from `data/universe.js`) | same |

The native Yahoo client mirrors `server.py` precisely: the cookie+crumb handshake
(`yEnsureCrumb`), the quote field set, and the fundamentals derivations — Total Debt/FCF, the
`P/E = mcap ÷ net income` and `EV/EBITDA = (mcap + debt − cash) ÷ EBITDA` fallbacks, and the
50/200-day momentum blend. So the allocation math gets identical inputs on both platforms.

`CapacitorHttp` is enabled in `capacitor.config.json`, which (a) guarantees `window.CapacitorHttp`
exists and (b) routes `fetch`/`XHR` through native HTTP. Local assets are intentionally **not**
fetched on native: `universe.js` is a `<script>` that sets `window.__UNIVERSE`, and the portfolio
uses `localStorage` — so nothing depends on `fetch` to a bundled file.

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

## Swap flow (Screener → portfolio)
1. `renderScreener()` lists each theme's `universe.json` stocks, re-sorted by **live** market cap
   (`screenerMcap` falls back to the seed `mcapB` when a live cap is missing), capped at 50.
   Current holdings are tagged `held`.
2. Tap a non-held row → `openSwap(newSym, themeKey)` → modal lists the theme's current holdings.
3. Confirm → `doSwap(themeKey, oldSym, newSym)`: updates `state.themeTickers`, fetches the new
   name's quote+fundamentals, switches to Calculator, and renders a full-realign plan.
4. **Apply & save** → `applyRebalance` (a normal `REBALANCE` version checkpoint; undoable).
   Membership is only persisted on Apply, so navigating away cancels a pending swap.

## The screener universe
`tools/build_universe.py` turns `data/universe-raw.json` (multi-agent curation output) into
`data/universe.json` + `data/universe.js`. It pins the 25 core tickers to their theme, resolves any
ticker that appears in two themes by priority (`stablecoin > robotics > data > enterpriseai >
personalai`), drops placeholder/junk and known-bad symbols, fixes a couple of wrong tickers, sorts
by seed market cap, caps each theme to 55 (the app then shows the live top 50), and asserts mutual
exclusivity + that all cores are present. Re-runnable and idempotent.

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
- Rule: never restyle base selectors for mobile; only add `.native …` overrides. Rebuild with
  `npx cap sync ios` after CSS changes.

## server.py
Python stdlib only. Serves `www/` statically (with a path-traversal guard and a small content-type
map), exposes `/api/quotes`, `/api/fundamentals`, `/api/portfolio`, caches quotes ~15s and
fundamentals ~6h, handles the Yahoo cookie+crumb, and falls back to an embedded `SEED` snapshot for
the 25 core names when Yahoo is unreachable.
