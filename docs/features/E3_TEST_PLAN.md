# E3 — Test plan & results

Executed 2026-07-13 on `dev` against the live server (`http://127.0.0.1:8765`) via a Python server harness +
a browser assertion harness. **All feature test cases pass.** (Two initial "failures" were wrong expected
values in the harness, not product defects — noted below. One issue found was stale *test* data in
`portfolio.json`, cleaned, not a code bug.)

## 0. Free-data / no-API-key audit  — PASS
- Every external call is a **free public endpoint**: Yahoo Finance (`query1/query2.finance.yahoo.com`,
  `fc.yahoo.com` — quotes, quoteSummary, **fundamentals-timeseries [E3]**, search, peers) via the free
  cookie+crumb mechanism; the SEC's free `sec.gov/files/company_tickers.json`. **Python stdlib only.**
- Grep of the whole repo for `api[_-]?key|token|secret|Authorization|Bearer|rapidapi|subscription`: **no keys,
  tokens, or paid auth** (only matches are docs stating it's free + "dividendsPaid" line items).
- **E3 added exactly one new source** — Yahoo `fundamentals-timeseries` — same free host, same free crumb, no key.
- `T-FREE` (harness): the statements endpoint returns 200 with only the crumb (no key/token param). PASS.

## 1. E3.1 Statement data layer (server)  — 12/12 PASS
- `T1.1` AAPL → 5 quarters; latest has finite revenue/netIncome/equity/fcf; **no null fields**; `source:live`.
- `T1.2` JPM (bank) → quarters present but **omits gross profit** (banks report differently) → fallback path.
- `T1.3` nonsense symbol (`ZZZZ`) → **clean-empty sentinel** (`quarters:[]`, `source:empty`) or absent — no crash.
- `T1.4` per-symbol cache: a **warm** call is far faster than the **cold** fetch (cache hit).
- `T1.6` `force=1` refetches.
- `T5.4a/b` **server `_STMT_FIELDS` and client `STMT_FIELD_MAP` are byte-identical (31 keys, same mapping)** —
  guarantees web/iOS parity.

## 2. E3.2 Computed-metric engine  — PASS
- `T2.1` TTM revenue = **sum of the last 4 quarters** (exact).
- `T2.2` computed P/E = market cap ÷ TTM net income (matches `computedMetrics`).
- `T2.4` `debtToEquity` stored as a **percent**, the getter ÷100 → correct ratio.
- `T2.5` computed fields tagged `computed`; **a bank's gross margin falls back to `pulled`** (statement input missing).
- `T2.6` the overlay **does not mutate `state.pulled`** (clean revert).
- `T2.8` allocation **finite and sums to 1**; **no NaN/Inf** in any computed field across all holdings.
- `T2.9` YoY growth = (latest Q − year-ago Q)/|year-ago Q| (exact).
- *(Formula accuracy vs Yahoo validated separately in Python: P/E, EV/EBITDA, margins, P/S, P/B, current
  ratio, D/E match ≤3%; ROE/ROA match via average-equity.)*

## 3. E3.3 Stock-detail page  — PASS
- `T3.1` detail renders **3 statement tables** + metrics panel.
- `T3.2` flow rows carry a **TTM column** (= sum of the 4 quarterly cells); balance sheet is point-in-time.
- `T3.3` forward/market metrics (PEG, Fwd P/E, beta, div yield) tagged **`pulled`**; computed tagged **`calc`**.
- `T3.6` a no-statement name → **fallback note, no crash**; metrics still shown (pulled).
- `T3.7` opening a **non-holding** (Screener) name **lazy-loads** its statements on demand.
- Click-through: a real ticker-cell click opens the detail; clicking an inline-edit value or a control does **not**.

## 4. E3.4 Integration / toggle / labeling  — PASS
- `T4.1` `computeFromStatements` **persists to `portfolio.json`** and reloads (round-trip verified false→true).
- `T4.2` the toggle is **NOT captured in version snapshots** (undo/redo can't silently flip the data source).
- `T4.4` toggle **off → reverts every field to the pulled value** + clears provenance (regression to the shipped
  E2 pulled model); **on → re-applies computed**. Compare surface renders computed-vs-pulled deltas.

## 5. E3.5 Performance / iOS parity  — PASS
- Per-symbol cache with a negative TTL (`T1.4`); holdings-only warm daemon (server log); Screener lazy-load (`T3.7`).
- iOS parity: `nativeStatements` uses the identical field map (`T5.4`) and normalized shape.

## Regression (E1/E2 still work) — PASS
- `TR.1` default metric set = the 6; `TR.2` activating a catalog metric still yields a finite Σ=1 allocation;
  `TR.3` Fundamentals + Calculator render without error; **no console errors** on load.

## Adversarial code review + fixes (22-agent workflow)
A separate multi-dimension review found **16 confirmed items**; all real ones fixed and re-verified (10/10):
- **HIGH (regression I introduced):** `addToWatchlist` / `setMembership` wrote fundamentals into the *derived*
  `state.fundamentals`, which `rebuildFundamentals()` wipes — watchlist/newly-swapped names lost their data. **Fixed:**
  both now write the **pulled base** (`state.pulled`) + `loadStatements` + rebuild. Verified: a `state.pulled` entry
  survives a rebuild; a bare `state.fundamentals` entry is derived away (proves the base is authoritative).
- **MEDIUM:** computed EV / net-cash used cash-only → **now use STI-inclusive cash** (`cashAndSTI`) to match Yahoo's
  `totalCash`; **P/E now uses net income to common**. Both recompute within 8% of Yahoo.
- **LOW/NIT:** `loadStatements([])` no longer fetches the whole universe; `metricSourceOf` now checks each derived
  metric's real operands (net-cash → cash/debt); `openStockDetail` guards the lazy-load **race** (open A then B → B
  wins, verified); iOS `nativeStatements` emits the empty sentinel; the Compare button is disabled when the toggle is off.
- The reviewer separately **verified clean**: toggle persistence/versioning, server cache selection, and the E2
  regression path.

## Post-testing fixes (user-found, 2026-07-13)
User opened **TSM** (a Screener name, not a holding) and saw all metrics blank + tagged `pulled`. Two real bugs found & fixed:
1. **`openStockDetail` only lazy-loaded statements, not the quote + pulled fundamentals** → for a non-holding, `state.pulled[sym]`
   was absent, so `rebuildFundamentals()` (which derives from `state.pulled`) never created `state.fundamentals[sym]` and every
   getter returned nothing. **Fixed:** `openStockDetail` now loads quote + pulled fundamentals + statements on demand, then rebuilds.
2. **Foreign ADR currency mismatch** (TSM files in **TWD**, market cap in **USD**): computing `mcap ÷ statement` gives wrong
   valuation ratios. **Fixed:** server forwards `financialCurrency` + trading `currency`; when they differ, the **market-cap-based
   metrics** (P/E, P/S, P/B, EV/EBITDA, EV/Rev, P/FCF, net-cash) stay **pulled** (Yahoo currency-adjusts them), while the
   **currency-neutral** ratios (margins, ROE/ROA, current/quick, D/E, Debt/FCF, payout, growth) are still **computed**. The detail
   header notes "statements in TWD — valuation kept pulled" and a "Figures in TWD" line above the tables. Verified: TSM → 14 computed
   (neutral) + 13 pulled (7 mcap-based + 6 market/forward), correct real values (gross margin 61.9%, ROE 36.5%); US names unaffected.

## Notes / artifacts (not product bugs)
- The harness `STMT_FIELD_MAP` count assertion expected 30; the real (correct) count is **31** — the server test
  confirms server==client==31. Fixed expectation.
- `portfolio.json` held stale **test** metrics (`roa`/`fcfMargin` active + an `ev` policy override) left by earlier
  UI-automation; reset to the shipped default-6 model **preserving all real data** (27 holdings, 9 versions,
  $95k contributed, themes, cap).
