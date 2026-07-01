# Stock Portfolio Builder — Project Board

_Updated 2026-06-26. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 1 |
| Design | 0 |
| Implementation | 0 |
| Testing | 5 |
| Refinement | 0 |
| Integration | 0 |
| Done | 23 |

---

## Ideation  (1)
_A half-baked idea; can be pushed further down once fleshed out._

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

## Testing  (5)
_Built; waiting for you to try it._

- **E2.1** · _E2 · User-Defined Metrics_ — **Data-driven metric list (foundation)** _(web)_ · [spec](features/E2.1_data-driven-metrics.md)
  - Make the SET of scoring metrics data (DEFAULT_METRICS + state.metrics + a metrics() accessor), not the hardcoded 6 — mirroring E1.1's move for themes.
  - computeAllocation loops over metrics() instead of the hardcoded PEG/EV/Debt-FCF/PE/mcap/momentum; each descriptor keeps its own score formula (log mcap, momentum floor, Debt/FCF 1/max(x,0.1), carry-over) so the default 6 stay BYTE-IDENTICAL (fixed iteration order = identical float sums).
  - Weights/penalties stay in state.weights/state.penalty (untouched); state.metrics only governs which keys exist + their order. Persisted as [{key}] + version-snapshotted; old portfolios migrate to the default 6.
  - ENGINE-ONLY foundation (the weight/penalty inputs, notes, and fundamentals table stay hardcoded until E2.2).
  - BUILT + self-verified on dev 2026-07-01: byte-identity maxDiff=0 across 968 comparisons x 8 scenarios (on frozen inputs); generality proof (drop/reorder/single/revert); validateMetrics dedupe+drop-unknown; persistence round-trip; no console errors. Awaiting user click-through + merge to main.
- **E2.2** · _E2 · User-Defined Metrics_ — **Metric catalog + compute layer** _(depends E2.1, web)_ · [spec](features/E2.2_metric-catalog.md)
  - METRIC_CATALOG: the 6 defaults VERBATIM + 21 inactive catalog metrics (built via catMetric()); DEFAULT_METRICS = filter(defaultActive).
  - Compute layer: dirScore(m,x) (higher => max(0,x); lower => 1/max(x,scoreFloor)); scoreOf dispatches per descriptor. themeMetric gained a null-penalty exclude guard.
  - server.py forwards ~21 null-safe Yahoo fields (roe/roa/ps/pb/margins/debtToEquity[%]/current+quick ratio/growth/divYield/payout/beta/forwardPE/evRev + raw fcf/ebitda/revenue/cash/debt). Restart done.
  - BUILT + verified on dev: default-6 byte-identical; catalog metrics score finite; derived getters null-safe (D/E /100); divYield zero-policy. Awaiting click-through + merge.
- **E2.3** · _E2 · User-Defined Metrics_ — **Choose your metrics (picker UI)** _(depends E2.2, web)_ · [spec](features/E2.3_metric-picker.md)
  - ✎ Choose metrics picker: catalog grouped by category, checkboxes, per-book data-coverage badges, >=1 enforced, exactly-default-6 normalizes to state.metrics=null.
  - Generalized the weights panel (#wInputs, signature-rebuild + focus-guarded), the per-theme table (Cap special always-2nd column; other cols loop metrics()), and the notes — all from metrics().
  - BUILT + verified on dev: default-6 DOM byte-identical (weight boxes, wEffNote, per-theme tables incl tags/editables); activate/deactivate shifts blend + persists. Awaiting click-through + merge.
- **E2.4** · _E2 · User-Defined Metrics_ — **Per-metric direction & bad-data handling** _(depends E2.2, web)_ · [spec](features/E2.4_metric-direction-baddata.md)
  - Group ② -> one row per active metric: direction (read-only badge for the 6, editable toggle for catalog), policy select (penalize/carry/exclude/[compute=E3]/zero), conditional penalty input.
  - state.metricCfg {key:{penalty?,badData?,direction?}} pruned-on-default (null => baked-in defaults). Penalty routes by penaltyKey -> state.penalty else metricCfg. computeCarryover impute list derived.
  - BUILT + verified on dev: default-6 engine + penalized/excluded lists byte-identical; edit/toggle rescore + prune-to-null; metricCfg round-trips save/load/undo. Awaiting click-through + merge.
- **E2.5** · _E2 · User-Defined Metrics_ — **Metric presets / reset to default 6** _(depends E2.3, web)_ · [spec](features/E2.5_presets-reset.md)
  - ↺ Reset to default 6 (metrics+weights+exception handling; cap NOT reset) + named preset library (save/load/delete) via a select under the theme buttons.
  - applyConfig replaces weights/penalty/metricCfg wholesale; presets persisted but EXCLUDED from version snapshots (undo/redo never touches presets); sanitizePreset drops malformed.
  - BUILT + verified on dev: save/reset/load round-trip; presets survive reload + are untouched by undo/redo. Awaiting click-through + merge.

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
