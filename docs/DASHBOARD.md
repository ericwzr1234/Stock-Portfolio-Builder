# Stock Portfolio Builder — Project Board

_Updated 2026-06-26. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 0 |
| Design | 0 |
| Implementation | 0 |
| Testing | 5 |
| Refinement | 0 |
| Integration | 0 |
| Done | 28 |

---

## Ideation  (0)
_A half-baked idea; can be pushed further down once fleshed out._

- _(none)_

## Design  (0)
_Detailed requirements captured; a spec exists in docs/features/._

- _(none)_

## Implementation  (0)
_Being built on the dev branch._

- _(none)_

## Testing  (5)
_Built; waiting for you to try it._

- **E3.1** · _E3 · Statement-Driven Data_ — **Statement fetch + cache (server)** _(web)_ · [spec](features/E3.1_statement-data-layer.md)
  - /api/statements route (+ prefetch) over Yahoo's fundamentals-timeseries endpoint (the old v10 quoteSummary statement modules are DEAD — validated). Same cookie+crumb.
  - Fetch ~8 quarters of the 3 statements; normalize to {sym, quarters:[{date, <lineItems>}], asOf}; cache per symbol with a long quarterly TTL + seed fallback. Foundation card.
  - Data source + line-item availability validated live 2026-07-13 (AAPL 30/31 keys, NVDA 31/31; banks legitimately lack gross profit / current assets).
- **E3.2** · _E3 · Statement-Driven Data_ — **Computed-metric engine (client)** _(depends E3.1, web)_ · [spec](features/E3.2_computed-metric-engine.md)
  - Assemble TTM (sum-4Q flows, latest-Q balance) from the loaded statements; compute each E2 catalog metric via a documented formula -> the SAME state.fundamentals[sym].<field> the getters read.
  - Forward/market metrics stay pulled (marketCap, price, momentum, forwardPE, peg, beta, divYield). Graceful fallback to the pulled field when a statement input is missing (banks). Per-field source tag.
  - Formulas validated vs Yahoo pre-computed (P/E, EV/EBITDA, margins, P/S, P/B, current ratio, D/E match <=3%; ROE/ROA/quick differ by methodology — transparent single definition is the point).
- **E3.3** · _E3 · Statement-Driven Data_ — **Stock-detail page (UI)** _(depends E3.2, web)_ · [spec](features/E3.3_stock-detail-page.md)
  - Click a ticker (Prices / Screener / fundamentals table) -> a detail view: the 3 statements x last 4 quarters (+ a TTM column) + a computed-metrics panel (each metric: value + formula + source).
  - Forward-looking fields labelled 'pulled, not computed'. Reuse the app's modal/view patterns.
- **E3.4** · _E3 · Statement-Driven Data_ — **Integration + source labeling + toggle** _(depends E3.2, web)_ · [spec](features/E3.4_source-integration.md)
  - Model consumes computed metrics as PRIMARY; a 'compute from statements' toggle (default on) with fallback to pulled; per-metric source tags in the fundamentals table; a compare (computed vs pulled) surface.
  - New source => the default allocation shifts vs the pulled path (intended).
- **E3.5** · _E3 · Statement-Driven Data_ — **Performance + iOS parity** _(depends E3.1, web)_ · [spec](features/E3.5_performance-ios.md)
  - Cache tuning; prefetch holdings' statements; lazy-load Screener names on demand; iOS on-device fetch parity (mirror the ds* pattern). Log any coverage caps.

## Refinement  (0)
_Tested but not yet approved; new instructions → back to Implementation._

- _(none)_

## Integration  (0)
_Approved; merging dev → main (prod) + updating docs._

- _(none)_

## Done  (28)
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
<details><summary><b>E2 · User-Defined Metrics</b> — 5 done</summary>

- **E2.1** — Data-driven metric list (foundation) · [spec](features/E2.1_data-driven-metrics.md)
- **E2.2** — Metric catalog + compute layer · [spec](features/E2.2_metric-catalog.md)
- **E2.3** — Choose your metrics (picker UI) · [spec](features/E2.3_metric-picker.md)
- **E2.4** — Per-metric direction & bad-data handling · [spec](features/E2.4_metric-direction-baddata.md)
- **E2.5** — Metric presets / reset to default 6 · [spec](features/E2.5_presets-reset.md)

</details>
<details><summary><b>E4 · Fundamentals & Screener workflow</b> — 4 done</summary>

- **E4.1** — Declutter the allocation-model panel
- **E4.2** — Per-theme actions in each theme's section
- **E4.3** — Split add flow — Fundamentals adds directly, Screener watchlists
- **E4.4** — Screener = search + watchlist; add-vs-swap confirmation

</details>
