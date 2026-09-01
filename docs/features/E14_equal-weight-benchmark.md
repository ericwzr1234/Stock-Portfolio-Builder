# E14 · The equal-weight benchmark chart

**Raised by the owner, 2026-09-01.** Status: specified, not started. Sequenced after E13.

---

## What this chart is for

It is **not** an absolute-investment-return chart. It answers one question:

> From the moment the portfolio was built — had the user simply equal-weighted every stock they
> picked, what would they have earned, versus what our optimiser actually earned them?

The names are the user's either way. The capital is the same either way. The only difference is the
**weighting**, so the gap between the two lines is the value the tool added, isolated from stock
selection and from cash flow timing. That framing is the whole point of the chart, and the current
implementation does not present it that way.

---

## The method the owner specified

Absolute dollars only — **never percent**. There is no comparable percentage basis between the two
strategies, so a percentage would invite a comparison that does not mean anything.

At each rebalancing checkpoint:

1. Take the stocks held in the portfolio at that checkpoint.
2. Take the total capital at that checkpoint, and split it **equally** across those stocks, at
   that checkpoint's prices.
3. Carry that basket forward to the next checkpoint and measure the **absolute return over that
   segment alone**.
4. At the next checkpoint, discard the basket and repeat from step 1 with the new membership, the
   new capital, and the new prices.

The equal-weight line is then the **running sum of the per-segment returns** — a discrete line,
stepping at each checkpoint. The real portfolio's line is its actual continuous return curve.

**This is deliberately non-compounding.** Each segment restarts from the same capital base as the
real portfolio, so neither strategy gets to compound a lucky early segment into a larger base for
the next one. Every segment is a fair, independent head-to-head, and the sum is the total edge.

### How that differs from what is implemented today

`valueHistory()` (`www/app.js`) currently maintains **one continuously-carried equal-weight book**:
`ewShares` persists across checkpoints, is marked at each checkpoint's traded prices, takes on the
new cash, and is redistributed to equal weight. It compounds. Its value at checkpoint *N* depends
on every segment before it.

That is a legitimate counterfactual, but it is **not the one specified above**, and it is more
fragile: one bad price anywhere in the chain corrupts every later point. The specified method is
self-contained per segment, so a bad price damages one segment and no others. Fixing the current
implementation would therefore be wasted work — this is a replacement, not a repair.

---

## The three defects the owner reported

**1 · The equal-weight line does not move.** Reproduced against the standard test book
(`tests/book.js`): `ew` equals `invested` at **every** historical checkpoint, so `ew − invested`
is exactly `0` at every point except the live "now" point. The line is pinned flat to the zero
axis across the entire history, which is precisely what the owner describes.

```
checkpoint    value     ew        invested   real P&L   EW P&L
2024-11-04    91,932    91,932    91,932     0          0
2025-03-18    130,485   127,519   127,519    +2,966     0      <- real book moved, EW did not
2025-07-22    148,278   148,278   148,278    0          0
now           190,597   206,383   148,278    +42,319    +58,105
```

Root cause **not yet established** — it must be, before anything is rebuilt, because the same
mistake will otherwise be carried into the replacement. The leading candidate: `px[sym]` only ever
advances from `v.trades`, the trades executed *at that checkpoint*. A rebalance trades deltas, so a
name whose weight did not change generates no trade and keeps a stale price, contributing exactly
zero return forever. It is also possible the fixture happens to record identical prices at each
checkpoint; the two must be told apart with real data before any conclusion is drawn.

**2 · The line is hard to see.** It renders as `var(--portfolio-2)` dashed, 2px. Pinned to the zero
axis (defect 1) it is easy to mistake for the zero gridline, which is *also* dashed. Even once it
moves, the benchmark needs to be visually distinct from a gridline.

**3 · It is not sliceable.** Confirmed: `renderOverview` calls `renderReturnChart(valueHistory())`
— the **whole** history — while the value chart above it uses `ovSeries()` and honours the
1D/1W/1M/3M/1Y/ALL chips. The two charts on the same screen therefore disagree about what period
they cover, with nothing on screen saying so.

---

## Open questions — these change the arithmetic, so they are settled before any code

**Q1 · "The total capital invested at that checkpoint" — which figure?**
Either (a) the book's **market value** at that checkpoint, so both strategies begin every segment
from an identical base and the segment comparison is like-for-like; or (b) **cumulative
contributions**, which ignores accumulated gains and lets the equal-weight base drift away from the
real book's base, making later segments incomparable. (a) is what makes the method coherent and is
the assumed reading, but it must be confirmed rather than inferred.

**Q2 · What does a time slice mean when it contains no checkpoint?**
Checkpoints exist only when the user rebalances, and only 10 are retained. A 1D or 1W window will
usually contain **zero** of them. The sensible reading: both lines run cumulatively from the window
start, with the equal-weight basket being whatever the last checkpoint before the window
established, marked forward. Needs confirmation.

**Q3 · 1D and 1W may not be plottable at all, and this is a hard data constraint.**
The only time points that exist in the app are checkpoints, plus live quotes. There is no daily or
intraday price history per symbol — nothing fetches or stores one. So the equal-weight basket can
only be marked at dates where prices are known: checkpoint dates and today. Slicing to 1M/3M/1Y/ALL
works with what exists; 1D and 1W would show a single segment or nothing. Fetching a real price
series per symbol is possible but is a materially larger piece of work with its own quota and
caching consequences, and would be its own ticket.

---

## Done when

- The equal-weight series is computed segment-wise per the method above, in absolute dollars.
- The percent toggle is removed from this chart, or justified in writing if it survives.
- The chart honours the range chips, and says which period it covers.
- The benchmark line is unmistakably distinct from the zero gridline.
- A test asserts the equal-weight line actually **moves** when prices move between checkpoints —
  the defect above existed because nothing checked that, and the series being pinned to zero was
  indistinguishable from "the tool exactly matched equal weight."
- A test asserts the segment sum equals the sum of the individually computed segments, so the
  discrete line cannot silently drift from its own definition.
