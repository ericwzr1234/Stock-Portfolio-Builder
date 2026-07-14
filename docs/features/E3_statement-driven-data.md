# E3 — Statement-Driven Data & Metrics  *(epic · shipped)*

- **Epic:** E3 · Statement-Driven Data
- **Stage:** done  *(all cards E3.1–E3.5 shipped to `main` 2026-07-13)*
- **Platform:** web (then iOS)
- **Relates to:** **E2** (defines the selectable metrics) — E3 changes *how those metrics are sourced*.

## The idea
Stop pulling **pre-calculated** metric fields from Yahoo. Instead **load the 3 financial statements** (income,
balance sheet, cash flow) per company and **compute** each metric from them. Add a **stock-detail page** showing
the statements over the last 4 quarters (TTM). **Forward-looking / market** metrics stay pulled.

## Validated architecture (tested live 2026-07-13)
- **Source:** the **`fundamentals-timeseries`** endpoint (what Yahoo's own statements pages use), *not* the old
  `quoteSummary` statement modules (those are dead — balance sheet returns only `endDate`, cash-flow only
  `netIncome`, income `grossProfit`/`ebit` come back 0). Same cookie+crumb as the existing calls.
  `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{SYM}?symbol={SYM}&type=<comma
  list of quarterly* keys>&period1=<~6y>&period2=<now>&merge=false&padTimeSeries=true&lang=en-US&region=US&crumb=…`
  Returns `timeseries.result[]`; each element `meta.type[0]` = the key with an array of `{asOfDate,
  reportedValue:{raw}}`. ~5–8 quarters/series, clean values (AAPL 30/31 keys, NVDA 31/31; **banks like JPM
  legitimately lack gross profit / operating income / current assets** — expected, they file differently).
- **TTM assembly:** flows (income + cash-flow) = **sum of the last 4 quarters**; balance sheet = **latest quarter**
  (point-in-time). Growth = TTM(latest 4Q) vs TTM(prior 4Q) → store ~8 quarters.
- **Formula validation** (computed-from-statements vs Yahoo pre-computed, live): **P/E, EV/EBITDA, gross/op/net
  margin, P/S, P/B, current ratio, Debt/Equity match to ≤3%.** ROE / ROA / quick ratio diverge 10–30% because
  Yahoo uses **average** equity/assets, a different quick-ratio numerator, and lease-inclusive debt — a single
  transparent computed definition is the *point* (E3's rationale). MA's Yahoo gross margin is a bogus 100% while
  the computed 77.6% is meaningful.
- **Metric source split:**
  - **Computed from statements (primary):** pe, ev, evRev, ps, pb, pfcf, dfcf, debtToEquity, gross/op/net/EBITDA/
    FCF margin, roe, roa, currentRatio, quickRatio, netCashPct, revGrowth, earnGrowth, payout (+ ROIC / interest
    coverage where the data exists).
  - **Still pulled (market / forward-looking):** marketCap, price, momentum, forwardPE, peg, beta, divYield.
    (marketCap is a market value, needed by many computed ratios.)

## Why
Transparency & trust (see the raw statements + how each ratio is derived), consistency (one method, no vendor
quirks), and it makes E2's rich metric catalog credible (compute each metric from primary data on demand).

## Card breakdown (foundation-first)
- **E3.1 — Statement fetch + cache (server).** `/api/statements` route (+ prefetch) over `fundamentals-timeseries`;
  fetch ~8 quarters of the 3 statements; normalize to `{sym, quarters:[{date, <lineItems>}], asOf}`; cache per
  symbol with a long (quarterly) TTL + seed fallback. **Foundation.**
- **E3.2 — Computed-metric engine (client).** Assemble TTM from the loaded statements and compute each catalog
  metric via a documented formula, producing the **same `state.fundamentals[sym].<field>` values** the E2 getters
  read — so the model keeps working, now statement-sourced. Forward/market metrics stay pulled; **graceful fallback
  to the pulled field when a statement input is missing** (banks). Per-field source tag (`computed`/`pulled`/`carry`).
- **E3.3 — Stock-detail page (UI).** Click a ticker (Prices / Screener / fundamentals table) → a detail view: the
  3 statements × last 4 quarters (+ a TTM column) and a computed-metrics panel (each metric: value + formula +
  source). Forward-looking fields labelled "pulled, not computed."
- **E3.4 — Integration + source labeling + toggle.** Model consumes computed metrics as primary; a **"compute from
  statements" toggle** (default on) with fallback; per-metric source tags in the fundamentals table; a compare
  (computed vs pulled) surface.
- **E3.5 — Performance + iOS parity.** Cache tuning, **prefetch holdings' statements, lazy-load Screener names**,
  and iOS on-device fetch parity (mirror the `ds*` pattern). Log any coverage caps.

## Cross-cutting requirements
- **Never break** when statements are unavailable → fall back to today's pulled fields (critical for banks / thin
  names). This is a **new source**, so the default allocation *will* shift vs the pulled path — that is intended.
- Python **stdlib only**, server changes need a **restart**, no hardcoded email, `portfolio.json` never
  committed/test-written, and the client fetches through the **same server/LAN-sync indirection** so iOS works.

## Status
Per-card specs `docs/features/E3.{1..5}_*.md`. **All cards E3.1–E3.5 tested (see `E3_TEST_PLAN.md`) and
merged `dev` → `main` on 2026-07-13.** (iOS parity gap for the E2 fundamentals fields tracked in `APP_MIGRATION.md`.)
