# Stock Portfolio Builder — Project Board

_Updated 2026-06-26. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 1 |
| Design | 4 |
| Implementation | 0 |
| Testing | 1 |
| Refinement | 0 |
| Integration | 0 |
| Done | 11 |

---

## Ideation  (1)
_A half-baked idea; can be pushed further down once fleshed out._

- **E1.7** · _E1 · User-Defined Themes_ — **Similar-stock recommendations** _(depends E1.3, web)_
  <br>For any theme (esp. custom), recommend names similar to its picks. Likely method: live sector/industry-peer expansion via Yahoo, ranked by the 6-factor model (works free on web AND on-device iOS). Method to be finalized at design.

## Design  (4)
_Detailed requirements captured; a spec exists in docs/features/._

- **E1.3** · _E1 · User-Defined Themes_ — **Ticker search & validate** _(depends E1.2, web)_
  <br>Search any symbol (even outside the curated universe) → validate via Yahoo → preview → add to a chosen theme.
- **E1.4** · _E1 · User-Defined Themes_ — **Create a new theme** _(depends E1.1, web)_
  <br>Name + colour; appears across all tabs; starts empty.
- **E1.5** · _E1 · User-Defined Themes_ — **Rename / recolour a theme** _(depends E1.4, web)_
  <br>Edit a theme's name and colour.
- **E1.6** · _E1 · User-Defined Themes_ — **Delete a theme / delete-all / restore defaults** _(depends E1.4, web)_
  <br>Removing a theme makes its held names exiting positions (liquidate on realign). Plus reset-to-default-5.

## Implementation  (0)
_Being built on the dev branch._

- _(none)_

## Testing  (1)
_Built; waiting for you to try it._

- **E1.2** · _E1 · User-Defined Themes_ — **Add / remove a single ticker in a theme** _(depends E1.1, web)_ · [spec](features/E1.2_add-remove-ticker.md)
  <br>Built on dev: setMembership() helper (move semantics, one theme per ticker) + addTicker/removeTicker; doSwap rewired through it. UI: '➕ Add as a new name' in the swap modal + ✕ remove in the holdings table. Verified live — add/move/remove/swap-regression all pass. Awaiting your click-through before merge.

## Refinement  (0)
_Tested but not yet approved; new instructions → back to Implementation._

- _(none)_

## Integration  (0)
_Approved; merging dev → main (prod) + updating docs._

- _(none)_

## Done  (11)
_Integrated into the product (on main)._

- **C1** · _Core tool (shipped)_ — **Themed 6-factor allocation model**
  <br>PEG / EV-EBITDA / Debt-FCF / P-E (cheaper⇒higher) + log avg market cap + price momentum; adjustable weights (20/20/20/15/10/15); 30% per-theme cap; equal-weight within theme.
- **C2** · _Core tool (shipped)_ — **Bad / missing data handling**
  <br>Reported-negative ⇒ penalty (prem); not-applicable (banks) ⇒ quality carry-over (qual); missing-but-computable ⇒ derive from TTM statements (calc); manual cell overrides (ovr).
- **C3** · _Core tool (shipped)_ — **Free live-data layer (Yahoo)**
  <br>No keys. Quotes + fundamentals, ~15s/6h caching, embedded seed fallback. Web via server.py proxy; iOS on-device via CapacitorHttp.
- **C4** · _Core tool (shipped)_ — **Calculator / Rebalance**
  <br>Build initial · full rebalance (buys+sells) · cash-only · realign-only; self-funding (net = cash added).
- **C5** · _Core tool (shipped)_ — **Version history (undo/redo/revert)**
  <br>Every build/rebalance is a checkpoint snapshotting holdings + settings + theme membership; git-style fork.
- **C6** · _Core tool (shipped)_ — **Prices tab**
  <br>Live prices grouped by theme; per-theme value & weight once a portfolio exists.
- **C7** · _Core tool (shipped)_ — **Screener tab**
  <br>Top ~50 by live market cap per theme, mutually exclusive across themes; curated universe (tools/build_universe.py).
- **C8** · _Core tool (shipped)_ — **Swap a stock in**
  <br>Tap a screener stock ⇒ replace a same-theme holding ⇒ full realign ⇒ Apply & save (undoable checkpoint).
- **C9** · _Core tool (shipped)_ — **Dynamic theme membership**
  <br>state.themeTickers (persisted + snapshotted); tickersOf / membership / tradeUniverse. Foundation the E1 epic builds on.
- **C10** · _Core tool (shipped)_ — **Cross-platform: web + iOS**
  <br>One www/ codebase; platform-agnostic data layer; Capacitor iOS wrapper; LAN sync; .native UI skin. (iOS build is the Mac's domain.)
- **E1.1** · _E1 · User-Defined Themes_ — **Data-driven theme list (foundation)** _(web)_ · [spec](features/E1.1_data-driven-themes.md)
  <br>Integrated to main 2026-06-26. state.themes + themes()/themeByKey() accessors; 14 THEMES sites converted; cap auto-scales 1.5/N; persisted + version-snapshotted. Verified live — regression maxDiff=0 vs default, generality proven at N=3/5/7. The foundation E1.2–E1.7 build on.
