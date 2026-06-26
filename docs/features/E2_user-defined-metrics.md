# E2 — User-Defined Scoring Metrics  *(epic · ideation)*

- **Epic:** E2 · User-Defined Metrics
- **Stage:** ideation  *(idea captured; to be detailed into design cards later)*
- **Platform:** web (then iOS)

## The idea
Today the **set** of factors that score each theme is hardcoded — PEG, EV/EBITDA, Debt/FCF, P/E, log
average market cap, and price momentum — and only their **weights** are adjustable (the Fundamentals
tab). Just as E1 makes *themes* user-defined, **E2 makes the *metrics* user-defined**: let the user pick
**which** metrics drive the model from a catalog of common ones, and set each one's weight. Same engine
(market-cap-weighted blend per theme → normalize across themes → cap), but the factor list becomes data.

This mirrors E1.1's pattern: a hardcoded list → `state`-driven list read through accessors, persisted +
version-snapshotted, regression-safe at the current default set.

## Candidate metric catalog
Only metrics that are **available** from our data source (Yahoo Finance) or **computable** from the
TTM statements it returns. (✓ = the server already fetches it or it's a direct field; ◐ = derivable
from statements; ? = verify availability/quality at design.) **Cheaper/healthier ⇒ higher score**; each
metric needs a direction + a penalty/cap for bad/missing values, like today's factors.

**Valuation**
- ✓ P/E (trailing), ? P/E (forward)
- ✓ PEG
- ✓ EV/EBITDA, ? EV/Revenue
- ◐ Price/Sales (P/S), ◐ Price/Book (P/B)
- ◐ Price/Free-Cash-Flow (P/FCF)

**Profitability & margins**
- ◐ Gross / Operating / Net profit margin, ? EBITDA margin
- ✓/? Return on Equity (ROE), ◐ Return on Assets (ROA), ◐ Return on Invested Capital (ROIC, approx)

**Financial health / leverage**
- ✓ Debt/FCF (current factor)
- ◐ Debt/Equity, ◐ Current ratio, ◐ Quick ratio
- ◐ Interest coverage, ◐ Net cash position

**Growth**
- ✓/? Revenue growth (YoY), ✓/? Earnings growth (YoY), ◐ EPS growth

**Dividends / shareholder return**
- ✓ Dividend yield, ◐ Payout ratio, ◐ Buyback / shares-outstanding change

**Size & momentum (current)**
- ✓ Market cap (log) — current factor
- ✓ Price momentum / 52-week change — current factor
- ? Price vs 50/200-day moving average, ? Beta

**Operational (statement-derived, approximate)**
- ◐ Asset turnover, ◐ Inventory turnover, ◐ FCF margin, ◐ R&D intensity

## Open questions for design (later)
- Data model: `state.metrics` = ordered list of `{key, label, dir, weight, penalty, source}`; the current
  6 become the default set (regression-safe). Engine reads the active metrics through an accessor.
- How each metric maps to a per-name value + a theme aggregate (reuse `themeMetric`), and its bad/missing
  handling (penalty/carry-over/compute — like C2).
- UI: a metric picker (catalog grouped by category) + the existing weight sliders, generalized to N
  metrics; show which are missing data for the current book.
- Which catalog metrics are reliably available from Yahoo's free endpoints (audit at design — some need
  extra `quoteSummary` modules in `server.py` and the iOS data layer).
- Interaction with E1 (works for any theme set) and with version history (snapshot the metric config).

## Notes
- Brand-new epic; **not yet scheduled**. Detail into small cards (foundation first, like E1) when we pick
  it up. Likely first card: "Metric list is data-driven (default = the current 6)", mirroring E1.1.
