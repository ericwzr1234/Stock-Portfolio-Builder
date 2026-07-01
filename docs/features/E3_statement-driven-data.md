# E3 — Statement-Driven Data & Metrics  *(epic · ideation)*

- **Epic:** E3 · Statement-Driven Data
- **Stage:** ideation  *(gist captured 2026-07-01; details to be worked out later, then broken into cards)*
- **Platform:** web (then iOS)
- **Relates to:** **E2** (which *defines* the selectable metrics) — E3 changes *how those metrics are sourced*.

## The idea (user's words, paraphrased)
Fundamentally change the **data source / how we pull data**. Instead of pulling **pre-calculated metrics**
straight from Yahoo Finance, **load the three financial statements (TTM)** — income statement, balance
sheet, cash-flow statement — for every company in the portfolio **and** in the Screener. Then:

- **Stock detail page.** Click/open a stock → a page that **shows its financial statements over the last
  4 quarters (TTM)**, and **offers to calculate metrics / KPIs / ratios** from them (the catalog defined
  in **E2**) — so the user can build the portfolio and assign weights the way they prefer.
- **Metrics become calculated, not pulled.** Valuation / profitability / health / growth / operational
  metrics are **derived from the loaded statements**, not read as Yahoo's ready-made fields. (We already
  do a *fallback* computation for missing P/E & EV/EBITDA — E3 makes computation the **primary** path.)
- **Exception — forward-looking metrics.** Values that **aren't in the historical statements** — e.g.
  **Forward P/E, PEG (forward growth)** — are still **pulled** (from Yahoo estimates), since they can't be
  computed from trailing statements.

## Why (rationale)
- **Transparency & trust:** the user sees the raw statements and exactly how each ratio is derived, rather
  than trusting a black-box vendor number.
- **Consistency:** one computation method for everyone (no vendor definitional quirks across names).
- **Unlocks E2:** a rich, user-selectable metric catalog is only credible if we can *compute* each metric
  from primary data on demand.

## Open questions for design (later)
- **Data source for the 3 statements:** does Yahoo's `quoteSummary` (`incomeStatementHistory[Quarterly]`,
  `balanceSheetHistory[Quarterly]`, `cashflowStatementHistory[Quarterly]`) give clean quarterly line items?
  (Prior note: Yahoo's raw quarterly modules came back empty/garbled once, which is why today's fallback
  uses TTM line items — **verify at design**; may need a different/again-Yahoo endpoint or a fallback source.)
- **TTM assembly:** sum the last 4 quarters for flow statements (income, cash-flow); use the latest quarter
  for the balance sheet (point-in-time). Handle missing/late filings.
- **Metric formulas:** a computation layer mapping each E2 catalog metric → a formula over statement line
  items (P/E = price·shares ÷ TTM net income; EV/EBITDA = (mktcap+debt−cash) ÷ TTM EBITDA; margins,
  ROE/ROA/ROIC, leverage, turnover, growth vs. year-ago quarter, etc.).
- **Caching & performance:** statements are heavier than a quote — cache per symbol (they change quarterly),
  lazy-load for Screener names, prefetch for holdings. Server route + iOS on-device parity (like the
  other `ds*` calls).
- **UI:** the stock detail page (statement tables ×4 quarters + a computed-metrics panel with the E2
  picker); how it's reached from the Screener/Prices/holdings; how forward-looking fields are labelled as
  "pulled, not computed."
- **Migration:** keep the current live-metric path working until the computed path is validated
  (regression: computed values should match today's within tolerance on a test set).

## Notes
- Brand-new epic, **not yet scheduled**. Detail into small, foundation-first cards later (likely first
  card: a statement-fetch data layer + cache; then the detail page; then the computed-metric layer that
  feeds E2). Sequenced **after** Epic 1 and the Epic 2 breakdown.
