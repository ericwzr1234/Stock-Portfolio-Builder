# Stock Portfolio Builder — Project Board

_Updated 2026-06-26. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 2 |
| Design | 4 |
| Implementation | 0 |
| Testing | 0 |
| Refinement | 0 |
| Integration | 0 |
| Done | 23 |

---

## Ideation  (2)
_A half-baked idea; can be pushed further down once fleshed out._

- **E2.5** · _E2 · User-Defined Metrics_ — **Metric presets / reset to default 6** _(depends E2.3, web)_ · [spec](features/E2_user-defined-metrics.md)
  - Reset the metric set + weights back to the default 6 in one click.
  - Optionally save named metric presets (e.g. 'Deep value', 'Quality growth') to switch strategies.
  - Quality-of-life; sequenced last.
- **E3.1** · _E3 · Statement-Driven Data_ — **Statement-driven data: load TTM statements, compute metrics, stock detail page** _(web)_ · [spec](features/E3_statement-driven-data.md)
  - Fundamentally change the data source: instead of pulling Yahoo's pre-calculated metrics, LOAD the 3 financial statements (income, balance sheet, cash flow) over the last 4 quarters (TTM) for portfolio + screener names.
  - A stock DETAIL PAGE: open a stock → see its TTM statements and a panel that CALCULATES metrics/KPIs/ratios (the E2 catalog) from them, to help build the portfolio and set weights.
  - Metrics become CALCULATED from the statements, not read straight from Yahoo (we already do this as a fallback — E3 makes it primary).
  - Exception: forward-looking metrics not in the statements (Forward P/E, forward PEG) are still pulled from Yahoo estimates.
  - Ties into E2 (which defines the metrics). Gist captured; details + card breakdown later — sequenced after E1 + the E2 breakdown.

## Design  (4)
_Detailed requirements captured; a spec exists in docs/features/._

- **E2.1** · _E2 · User-Defined Metrics_ — **Data-driven metric list (foundation)** _(web)_ · [spec](features/E2_user-defined-metrics.md)
  - Make the SET of scoring metrics data (state.metrics = ordered list of {key,label,weight,dir,penalty,source}), not the hardcoded 6 — mirroring E1.1's move for themes.
  - computeAllocation iterates state.metrics instead of the hardcoded PEG/EV/Debt-FCF/PE/mcap/momentum; default = today's 6 with their weights, so it's byte-identical until changed.
  - Persisted in portfolio.json + captured in every version snapshot (undo/redo); old portfolios migrate to the default 6.
  - Invisible & regression-safe foundation that the rest of E2 builds on.
- **E2.2** · _E2 · User-Defined Metrics_ — **Metric catalog + compute layer** _(depends E2.1, web)_ · [spec](features/E2_user-defined-metrics.md)
  - A catalog of common metrics grouped by category (valuation, profitability, financial-health, growth, dividend, size, momentum, operational) — the starter list is in the spec.
  - Only metrics AVAILABLE or COMPUTABLE from the data source are offered.
  - A per-metric getter/formula yields a per-stock value with its direction (cheaper / higher / lower-is-better). Source is Yahoo fields today; E3 later switches the SOURCE to computed-from-statements.
  - Lets the engine score ANY catalog metric, not just the original 6.
- **E2.3** · _E2 · User-Defined Metrics_ — **Choose your metrics (picker UI)** _(depends E2.2, web)_ · [spec](features/E2_user-defined-metrics.md)
  - Add or remove which catalog metrics are active in the model, from the Fundamentals tab.
  - The weights panel generalizes from the fixed 6 sliders to N chosen metrics (weights re-normalize live).
  - Flag metrics that are missing data for the current book so the user knows what actually drives the score.
- **E2.4** · _E2 · User-Defined Metrics_ — **Per-metric direction & bad-data handling** _(depends E2.2, web)_ · [spec](features/E2_user-defined-metrics.md)
  - For each active metric: its direction (cheaper-is-better / higher-is-better / lower-is-better) and how bad/missing values are handled — penalty, quality carry-over, or compute-from-statements.
  - Generalizes the existing C2 data-quality handling (prem / calc / qual / ovr) from the fixed 6 to any chosen metric.

## Implementation  (0)
_Being built on the dev branch._

- _(none)_

## Testing  (0)
_Built; waiting for you to try it._

- _(none)_

## Refinement  (0)
_Tested but not yet approved; new instructions → back to Implementation._

- _(none)_

## Integration  (0)
_Approved; merging dev → main (prod) + updating docs._

- _(none)_

## Done  (23)
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
<details><summary><b>E1 · User-Defined Themes</b> — 9 done</summary>

- **E1.1** — Data-driven theme list (foundation) · [spec](features/E1.1_data-driven-themes.md)
- **E1.2** — Add / remove a ticker in a theme · [spec](features/E1.2_add-remove-ticker.md)
- **E1.3** — Ticker search & validate · [spec](features/E1.3_ticker-search.md)
- **E1.4** — Create a new theme · [spec](features/E1.4_create-theme.md)
- **E1.5** — Rename / recolour a theme · [spec](features/E1.5_rename-recolour.md)
- **E1.6** — Delete a theme / restore defaults · [spec](features/E1.6_delete-theme.md)
- **E1.7** — Similar-stock recommendations (peers of picks)
- **E1.8** — Seed recommendations from a new theme's name
- **E1.9** — Flat Screener: pooled recommendations + actions · [spec](features/E1.9_flat-screener-recommendations.md)

</details>
<details><summary><b>E4 · Fundamentals & Screener workflow</b> — 4 done</summary>

- **E4.1** — Declutter the allocation-model panel
- **E4.2** — Per-theme actions in each theme's section
- **E4.3** — Split add flow — Fundamentals adds directly, Screener watchlists
- **E4.4** — Screener = search + watchlist; add-vs-swap confirmation

</details>
