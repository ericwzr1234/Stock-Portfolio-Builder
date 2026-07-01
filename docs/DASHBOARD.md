# Stock Portfolio Builder — Project Board

_Updated 2026-06-26. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 2 |
| Design | 0 |
| Implementation | 0 |
| Testing | 2 |
| Refinement | 0 |
| Integration | 0 |
| Done | 17 |

---

## Ideation  (2)
_A half-baked idea; can be pushed further down once fleshed out._

- **E2.1** · _E2 · User-Defined Metrics_ — **User-selectable scoring metrics** _(web)_ · [spec](features/E2_user-defined-metrics.md)
  - Today the 6 scoring factors (PEG, EV/EBITDA, Debt/FCF, P/E, market cap, momentum) are hardcoded; only their weights are adjustable.
  - Let users choose WHICH metrics drive the model from a catalog of common valuation, profitability, financial-health, growth, dividend, size and momentum metrics — and set each one's weight.
  - Only metrics available or computable from our data source (Yahoo) are offered; the current 6 stay the default set (regression-safe).
  - Mirrors E1.1's pattern: a hardcoded list becomes data-driven, persisted and version-snapshotted.
  - Brand-new epic — captured as ideation, to be detailed into foundation-first cards later. Starter metric catalog is in the spec.
- **E3.1** · _E3 · Statement-Driven Data_ — **Statement-driven data: load TTM statements, compute metrics, stock detail page** _(web)_ · [spec](features/E3_statement-driven-data.md)
  - Fundamentally change the data source: instead of pulling Yahoo's pre-calculated metrics, LOAD the 3 financial statements (income, balance sheet, cash flow) over the last 4 quarters (TTM) for portfolio + screener names.
  - A stock DETAIL PAGE: open a stock → see its TTM statements and a panel that CALCULATES metrics/KPIs/ratios (the E2 catalog) from them, to help build the portfolio and set weights.
  - Metrics become CALCULATED from the statements, not read straight from Yahoo (we already do this as a fallback — E3 makes it primary).
  - Exception: forward-looking metrics not in the statements (Forward P/E, forward PEG) are still pulled from Yahoo estimates.
  - Ties into E2 (which defines the metrics). Gist captured; details + card breakdown later — sequenced after E1 + the E2 breakdown.

## Design  (0)
_Detailed requirements captured; a spec exists in docs/features/._

- _(none)_

## Implementation  (0)
_Being built on the dev branch._

- _(none)_

## Testing  (2)
_Built; waiting for you to try it._

- **E1.5** · _E1 · User-Defined Themes_ — **Rename / recolour a theme** _(depends E1.4, web)_ · [spec](features/E1.5_rename-recolour.md)
  - Edit an existing theme's display name and colour via a ✎ button next to each theme in the Fundamentals allocation legend.
  - Updates consistently everywhere (Prices, allocation legend/bar, screener chips, holdings, history) because E1.1 routes all reads through themes()/themeByKey().
  - The theme's KEY never changes on rename — so membership, the curated Screener list, and past version snapshots stay intact; a pure rename changes no allocations (verified maxDiff=0).
  - Built & verified on dev — awaiting your click-through.
- **E1.6** · _E1 · User-Defined Themes_ — **Delete a theme / restore defaults** _(depends E1.4, web)_ · [spec](features/E1.6_delete-theme.md)
  - Delete a single theme (✕ per theme in the Fundamentals legend) or restore the default 5 (↺ button).
  - Removing a theme turns its held names into exiting positions — sold to $0 on the next rebalance; a warning banner in the rebalance preview lists them before any liquidation.
  - Deleting your only remaining theme is blocked (use Restore defaults). Note: a true 'zero themes' state isn't meaningful — the allocator needs ≥1 theme, so 'clear all' is served by Restore defaults.
  - Built & verified on dev (delete → exiting + preview warning, last-theme block, restore to the 5) — awaiting your click-through.

## Refinement  (0)
_Tested but not yet approved; new instructions → back to Implementation._

- _(none)_

## Integration  (0)
_Approved; merging dev → main (prod) + updating docs._

- _(none)_

## Done  (17)
_Integrated into the product (on main)._

<details><summary><b>Core tool (shipped)</b> — 10 done</summary>

- **C1** — Themed 6-factor allocation model
- **C2** — Bad / missing data handling
- **C3** — Free live-data layer (Yahoo)
- **C4** — Calculator / Rebalance
- **C5** — Version history (undo / redo / revert)
- **C6** — Prices tab
- **C7** — Screener tab
- **C8** — Swap a stock in
- **C9** — Dynamic theme membership
- **C10** — Cross-platform: web + iOS

</details>
<details><summary><b>E1 · User-Defined Themes</b> — 7 done</summary>

- **E1.1** — Data-driven theme list (foundation) · [spec](features/E1.1_data-driven-themes.md)
- **E1.2** — Add / remove a ticker in a theme · [spec](features/E1.2_add-remove-ticker.md)
- **E1.3** — Ticker search & validate · [spec](features/E1.3_ticker-search.md)
- **E1.4** — Create a new theme · [spec](features/E1.4_create-theme.md)
- **E1.7** — Similar-stock recommendations (peers of picks)
- **E1.8** — Seed recommendations from a new theme's name
- **E1.9** — Flat Screener: pooled recommendations + actions · [spec](features/E1.9_flat-screener-recommendations.md)

</details>
