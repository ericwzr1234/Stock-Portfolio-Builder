# Stock Portfolio Builder — Project Board

_Updated 2026-06-26. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 2 |
| Design | 4 |
| Implementation | 0 |
| Testing | 6 |
| Refinement | 0 |
| Integration | 0 |
| Done | 17 |

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

## Testing  (6)
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
- **E4.1** · _E4 · Fundamentals & Screener workflow_ — **Declutter the allocation-model panel** _(web)_
  - Top 'Theme allocation model' card keeps only: the user inputs, the % weight summary per theme, and New theme / Restore defaults.
  - Three clearly-named input groups by purpose: ① Metrics — assign weights; ② Exception handling — the artificial value to use when a metric is negative or not found; ③ Maximum weight per theme.
  - Spell metrics out fully (e.g. PEG = P/E ÷ Growth%, EV/EBITDA = Enterprise Value ÷ EBITDA, Debt/FCF = Total Debt ÷ Free Cash Flow, P/E, Avg market cap, Price momentum).
  - Remove all inline explanations from the top; keep them in the collapsible 'How the math works & data-quality notes' (hidden by default).
- **E4.2** · _E4 · Fundamentals & Screener workflow_ — **Per-theme actions in each theme's section** _(depends E4.1, web)_
  - Move add-ticker / rename-theme / delete-theme out of the top allocation legend and into each theme's own section header (the #fundGrid cards), next to the theme name.
  - The top legend becomes a clean read-only % summary.
- **E4.3** · _E4 · Fundamentals & Screener workflow_ — **Split add flow — Fundamentals adds directly, Screener watchlists** _(depends E4.2, web)_
  - Adding a ticker from Fundamentals & Allocation is a DECISION → add it directly to that theme and run the rebalance preview (no watchlist).
  - Searching in the Screener is BROWSING → add the found name to the watchlist, defaulting to NO theme.
  - Once a watchlist name is assigned a theme, the user is ready → trigger the add-to-portfolio + rebalance.
  - Revises E1.3 (which currently routes both entry points to the watchlist).
- **E4.4** · _E4 · Fundamentals & Screener workflow_ — **Screener = search + watchlist; add-vs-swap confirmation** _(depends E4.3, web)_
  - Remove the pooled recommendations list from the Screener (unwanted). Screener = a search box + the watchlist.
  - Flow: 1) look up a stock → add to watchlist (no theme); 2) when decided, choose 'add to theme' → a confirmation to either (a) add the ticker to the portfolio or (b) swap it for an existing holding; 3) on confirm, run the rebalance.
  - Keeps the tap-to-swap capability, integrated into the watchlist commit.
  - Revises E1.9 (the flat recommendation Screener).

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
