# Stock Portfolio Builder — Project Board

_Updated 2026-06-26. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 3 |
| Design | 2 |
| Implementation | 0 |
| Testing | 1 |
| Refinement | 0 |
| Integration | 0 |
| Done | 13 |

---

## Ideation  (3)
_A half-baked idea; can be pushed further down once fleshed out._

- **E1.7** · _E1 · User-Defined Themes_ — **Similar-stock recommendations** _(depends E1.3, web)_
  - For any theme — especially custom ones — recommend names similar to its current picks.
  - Likely approach: expand to live sector / industry peers via Yahoo, then rank them by the same 6-factor model.
  - Works free on both web and on-device iOS; the exact method is finalized at design.
- **E1.8** · _E1 · User-Defined Themes_ — **Seed recommendations from a new theme's name** _(depends E1.4, web)_
  - When a user creates a theme, use the theme NAME's keywords (e.g. 'Semiconductors') to recommend stocks immediately — before it has any picks.
  - Feeds the Screener so a brand-new theme isn't empty: keyword / sector match → candidate names to add with one tap.
  - Complements E1.7 (which recommends from a theme's existing PICKS); this one bootstraps from the name alone.
  - Method TBD at design — e.g. map keywords to a sector/industry, or run a Yahoo search on the name.
  - Brand-new idea, captured as ideation (per user request).
- **E2.1** · _E2 · User-Defined Metrics_ — **User-selectable scoring metrics** _(web)_ · [spec](features/E2_user-defined-metrics.md)
  - Today the 6 scoring factors (PEG, EV/EBITDA, Debt/FCF, P/E, market cap, momentum) are hardcoded; only their weights are adjustable.
  - Let users choose WHICH metrics drive the model from a catalog of common valuation, profitability, financial-health, growth, dividend, size and momentum metrics — and set each one's weight.
  - Only metrics available or computable from our data source (Yahoo) are offered; the current 6 stay the default set (regression-safe).
  - Mirrors E1.1's pattern: a hardcoded list becomes data-driven, persisted and version-snapshotted.
  - Brand-new epic — captured as ideation, to be detailed into foundation-first cards later. Starter metric catalog is in the spec.

## Design  (2)
_Detailed requirements captured; a spec exists in docs/features/._

- **E1.5** · _E1 · User-Defined Themes_ — **Rename / recolour a theme** _(depends E1.4, web)_
  - Edit an existing theme's display name and colour.
  - Updates consistently everywhere — Prices, allocation legend, screener swatch, and history.
- **E1.6** · _E1 · User-Defined Themes_ — **Delete a theme / delete-all / restore defaults** _(depends E1.4, web)_
  - Delete a single theme, clear all themes, or restore the default 5.
  - Removing a theme turns its held names into exiting positions (sold on the next realign).
  - Surfaces a clear warning in the rebalance preview before any liquidation.

## Implementation  (0)
_Being built on the dev branch._

- _(none)_

## Testing  (1)
_Built; waiting for you to try it._

- **E1.3** · _E1 · User-Defined Themes_ — **Ticker search & validate** _(depends E1.2, web)_ · [spec](features/E1.3_ticker-search.md)
  - Search any symbol or company — including names outside the curated screener (e.g. AMD, TSM, AVGO) — via Yahoo's search.
  - Add it directly to a theme from the Fundamentals tab ('＋ name' per theme) — no Screener detour — and from the Screener too (with a theme picker).
  - New plumbing: /api/search proxy in server.py + a platform-agnostic dsSearch (web → server, iOS → Yahoo on-device); the add reuses the E1.2 rail.
  - Thin-data names use the existing penalty/compute path (no special code).
  - Built on dev & verified live (search, add, real position) — awaiting your click-through. NOTE: this card touches server.py + the iOS data layer, so the Mac syncs both.

## Refinement  (0)
_Tested but not yet approved; new instructions → back to Implementation._

- _(none)_

## Integration  (0)
_Approved; merging dev → main (prod) + updating docs._

- _(none)_

## Done  (13)
_Integrated into the product (on main)._

- **C1** · _Core tool (shipped)_ — **Themed 6-factor allocation model**
  - Splits the book across the themes, then equal-weights the names inside each theme.
  - Scores each theme on a market-cap-weighted blend of 6 factors: PEG, EV/EBITDA, Debt/FCF, P/E (cheaper ⇒ higher), log average market cap, and price momentum.
  - Factor weights are adjustable (default 20/20/20/15/10/15) and re-normalized live.
  - A per-theme cap limits concentration; the excess spills to the other themes iteratively.
- **C2** · _Core tool (shipped)_ — **Bad / missing data handling**
  - Reported-negative ratios are penalized with a configurable multiple instead of breaking the score.
  - Not-applicable metrics (e.g. a bank's EV/EBITDA) carry over a value imputed from the name's quality.
  - Missing-but-computable values are derived from the trailing-twelve-month statements.
  - Any individual cell can be manually overridden.
- **C3** · _Core tool (shipped)_ — **Free live-data layer (Yahoo)**
  - Pulls quotes and fundamentals from Yahoo Finance with no API key.
  - Caches results (~15s for quotes, ~6h for fundamentals) and falls back to an embedded seed snapshot if a fetch fails.
  - Web fetches through the local Python server proxy; iOS fetches on-device via CapacitorHttp (no CORS).
- **C4** · _Core tool (shipped)_ — **Calculator / Rebalance**
  - Builds the initial portfolio, or rebalances an existing one to the model targets.
  - Three modes: full rebalance (buys + sells), cash-only deploy (no sells), and realign-only.
  - Self-funding — the net cash change equals the amount you add.
- **C5** · _Core tool (shipped)_ — **Version history (undo / redo / revert)**
  - Saves every build and rebalance as a checkpoint.
  - Each checkpoint snapshots holdings, settings, and theme membership together, so undo restores everything in lock-step.
  - Supports undo, redo, revert-to-any-point, and git-style forking of the timeline.
- **C6** · _Core tool (shipped)_ — **Prices tab**
  - Live prices and day moves for every name, grouped by theme.
  - Shows each theme's current value and weight once a portfolio exists.
- **C7** · _Core tool (shipped)_ — **Screener tab**
  - Lists the top ~50 stocks by live market cap in each theme.
  - Themes are mutually exclusive — a name shown under one theme never appears under another.
  - The universe is curated by tools/build_universe.py.
- **C8** · _Core tool (shipped)_ — **Swap a stock in**
  - Tap a screener stock to replace a same-theme holding.
  - Triggers a full realign — sells the removed name to $0 and redeploys its cash to the model.
  - Recorded as an undoable checkpoint when you Apply & save.
- **C9** · _Core tool (shipped)_ — **Dynamic theme membership**
  - Which tickers belong to each theme is data, not hardcoded.
  - Stored in state.themeTickers — persisted and captured in every version snapshot.
  - Read through tickersOf / membership / tradeUniverse helpers; the foundation the E1 epic builds on.
- **C10** · _Core tool (shipped)_ — **Cross-platform: web + iOS**
  - One www/ codebase runs as both the web app and a native iOS app (via Capacitor).
  - A platform-agnostic data layer talks to the Python server on web, and to Yahoo + localStorage on iOS.
  - LAN sync lets the phone share the computer's portfolio.json; a .native CSS skin gives iOS a mobile UI.
  - (The iOS build itself is the Mac's domain.)
- **E1.1** · _E1 · User-Defined Themes_ — **Data-driven theme list (foundation)** _(web)_ · [spec](features/E1.1_data-driven-themes.md)
  - Makes the set of themes — which exist, plus each one's key, name and colour — data (state.themes), not a hardcoded list.
  - The whole app now reads the live theme list through new themes() / themeByKey() accessors (14 call sites converted).
  - The per-theme cap auto-scales as 1.5 ÷ N themes (30% at 5 themes, 50% at 3, ~21% at 7); a cap you set by hand is still honoured.
  - The theme list is persisted and saved into every version snapshot, so undo / redo restores it too.
  - Invisible at the default 5 themes — verified byte-for-behaviour identical, and proven to adapt cleanly at 3 and 7 themes.
  - Integrated to main 2026-06-26.
- **E1.2** · _E1 · User-Defined Themes_ — **Add / remove a ticker in a theme** _(depends E1.1, web)_ · [spec](features/E1.2_add-remove-ticker.md)
  - Adds two actions alongside Swap: add a stock to a theme (it grows) or remove one (it shrinks).
  - Add is a button in the screener-tap modal; remove is an ✕ on each holding in the Calculator.
  - Both reuse the existing preview → Apply & save → version rail, so every change is one undoable checkpoint.
  - One theme per ticker: adding a stock that already sits in another theme moves it out of the old one.
  - Changing a theme's names re-ranks the whole portfolio (the theme's blended fundamentals shift) and re-sizes every position automatically — not just the added name.
  - Integrated to main 2026-06-26.
- **E1.4** · _E1 · User-Defined Themes_ — **Create a new theme** _(depends E1.1, web)_ · [spec](features/E1.4_create-theme.md)
  - Create a brand-new theme with a name and a colour via a '➕ New theme' button in the Fundamentals tab.
  - It appears across every tab and starts empty, ready to fill via Add (E1.2) or Search (E1.3).
  - Model rule (built + verified): an empty theme takes 0% of the allocation until it has names — otherwise it would siphon ~14% of the book into something with nothing to buy.
  - Funded themes still sum to 100% and the book fully deploys; with the default 5 (all funded) behaviour is byte-identical (verified maxDiff=0).
  - Integrated to main 2026-06-26.
