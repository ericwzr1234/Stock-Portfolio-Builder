# E15 · Stock splits are not handled anywhere

**Found 2026-09-01** while specifying E14. Not a chart bug — a live data-quality bug in the real
portfolio.

## The defect

`grep -niE 'split|corporate.?action|adjclose|adjusted'` across `www/app.js` and
`worker/src/index.js` returns **no handling of corporate actions at all**. Every hit is
`String.split` or the word "split" in prose about capital allocation.

Share counts are recorded from trades and never revised. Prices come live from Yahoo, which quotes
**post-split**. So for any name held across a split, the book holds pre-split shares and marks them
at post-split prices:

> NVDA split **10:1** on 2024-06-10 (confirmed from Yahoo's own event data, below). A position held
> through it is marked at one tenth of its true value, and shows as a **−90% loss that never
> happened.**

This silently understates the portfolio, the all-time gain, every checkpoint's recorded value, and
every return figure derived from them. It is wrong in the user's actual book today, not merely in a
chart being designed.

## The data, and why no heuristic is needed

Yahoo returns exact split events in the **same request** as the daily closes:

```
GET /v8/finance/chart/NVDA?range=5y&interval=1d&events=div%2Csplit
  → 1254 daily closes, 142 KB
  → events.splits: [{ "date": 1718026200, "numerator": 10,
                      "denominator": 1, "splitRatio": "10:1" }]
```

Exact numerator and denominator, with the effective date. Nothing to infer.

### Why the "detect a big overnight move, then search the news" approach was rejected

The owner proposed detecting a halving/doubling and scraping the ratio from news. It is worse than
the bug it fixes, in three separate ways:

1. **It misses most splits.** The real NVDA event was **10:1** — a 90% overnight drop, not the
   assumed 2:1. And 3:2, 4:3 and 5:4 splits are common, producing 33%, 25% and 20% moves that sit
   comfortably inside ordinary volatility. A threshold wide enough to catch those catches everything.
2. **It corrupts real data on false positives.** Biotech readouts, earnings gaps and squeezes move
   names 50%+ overnight routinely. Misreading a genuine 50% loss as a 2:1 split would *invent
   shares and money* in the user's book. Writing a plausible-looking wrong number into someone's
   financial record is worse than leaving the known bug visible.
3. **Scraping news for a ratio** is fragile, unattributable, and a materially different legal
   posture from calling an API — against the owner's standing constraint on legal exposure.

## Approach

Use the split events. On refresh, for every symbol ever held, apply any split whose effective date
falls after the trade that established the position: multiply shares by `numerator/denominator` and
divide the recorded price by the same. Value is unchanged across the event, which is the invariant
to test.

Mark with **raw `close`**, not `adjclose`. `adjclose` also back-adjusts for dividends, which would
report a return the user did not receive unless dividends were reinvested — which this app does not
model. Splits are corrected explicitly; dividends are left alone.

## Done when

- A position held across a real split is valued correctly, tested against NVDA's 10:1 with recorded
  prices either side.
- The invariant is asserted: portfolio value is **continuous** across a split event.
- Historical checkpoints are corrected too, or the board records explicitly why they are not.
- No heuristic and no news scraping anywhere in the implementation.
