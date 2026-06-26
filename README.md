# Portfolio Builder

A free, local, no-API-key web tool to **build and rebalance** your 5-theme stock portfolio
using a **market-cap-weighted PEG + EV/EBITDA (TTM)** allocation model.

Nothing here costs money. No accounts, no keys. Data comes from Yahoo Finance's free
endpoints; your portfolio lives in a plain `portfolio.json` file next to this README.

---

## How to run

**Windows:** double-click **`Start Portfolio Builder.bat`**.
**Mac:** double-click **`Start Portfolio Builder.command`** (the first time, right-click → Open),
or run `python3 server.py` in this folder.

A small window opens (the local server) and your browser opens to the app automatically. Everything
you do is saved to `portfolio.json` in this folder. To stop, close the window (or press `Ctrl+C`).

> Requires Python 3. The app itself lives in **`www/index.html`** (the server just serves it and
> proxies free data). On Windows, if the window flashes and closes, run `py server.py` in this
> folder to see any message.

> **Want it as an iPhone app?** The same tool can be built as a private, free iOS app — see
> [`docs/IOS_BUILD.md`](docs/IOS_BUILD.md). Developing across two machines? Read
> [`CLAUDE.md`](CLAUDE.md) first.

---

## The three pieces

### 1. Prices (by theme)
Live-ish prices for all 25 tickers grouped into the 5 themes, with day change and — once you've
started a portfolio — the live value and weight of each theme. Auto-refreshes on the interval you
pick (default 60s). Yahoo's free feed can be delayed up to ~15 min for some names; most US names
update near real-time during market hours.

### 2. Fundamentals & Allocation
- For each theme it pulls **PEG**, **EV/EBITDA**, **Total Debt/FCF** and **P/E** (all TTM) for the 5 names and
  computes the **market-cap-weighted** value for the theme — lower = cheaper / more sustainable = more weight.
- It also scores each theme on **average market cap** (log scale — bigger = steadier) and **price momentum**
  (how far price sits above its 50- &amp; 200-day moving averages, blended 0.6 / 0.4 — higher = stronger uptrend;
  a theme in a downtrend scores 0). The six **weight fields** blend the scores (default
  **PEG 20 / EV·EBITDA 20 / Debt·FCF 20 / P·E 15 / mkt-cap 10 / momentum 15**, fully adjustable; auto-normalized).
- **Bad values:** a *reported negative* ratio (negative EBITDA, FCF, or earnings) is **penalized** — replaced by a
  penalty multiple (EV/EBITDA 1000×, P/E 200×, Debt/FCF 50×, PEG 10×) so it drags the theme up. A ratio that's
  *not applicable* (e.g. a bank reports no EV/EBITDA or Free Cash Flow) is filled by **quality carry-over** — the name
  inherits its standing on the factors it *does* report (PEG, P/E, market cap, momentum), so a dominant, cheap name like a
  big bank actively *lifts* its sector instead of sitting out. Imputed values are flagged **`qual`**. A **Debt/FCF of 0** (debt-free) is the *best* case.
- **Computation fallback:** if the data source is missing a ready-made **P/E** or **EV/EBITDA**, the tool derives it
  from the TTM statements it already pulls — `P/E = market cap ÷ net income`, `EV/EBITDA = (market cap + total debt −
  cash) ÷ EBITDA` (matches the source's own ratios within ~2%). Derived values are flagged **`calc`**. It won't invent
  numbers that don't exist: a loss-maker still has no P/E (→ penalized); a name with no EBITDA/FCF at all (a bank) is handled by the quality carry-over above.
- **Click any PEG / EV·EBITDA / Debt·FCF / P·E number to override it** with your own figure. Overrides are saved
  and flagged `ovr`; momentum is computed (not overridable).

### 3. Calculator / Rebalance
- **First run:** enter your starting capital (defaults to **$80,000**) and click *Build initial
  portfolio*. It splits capital across themes by the model, equal-weights the 5 names in each
  theme, and converts to share counts at live prices. This is remembered.
- **Each month:** type the cash you're adding (defaults to **$4,000**), pick a mode, and click
  *Calculate*:
  - **Full rebalance** — moves every position to its new model target. Tells you exactly which
    stocks to **increase** and by how much, and which to **decrease** and by how much (buys + sells,
    net = your new cash).
  - **Deploy new cash only** — steers just the new money into the most underweight names, no sells.
- **Realign only (no new $)** — a shortcut that rebalances the *whole* book to today's target weights at
  the current value, adding zero capital. Use it after you change the slider/penalty and just want to
  re-align (it's the same as entering $0 with Full rebalance).
- Click *Apply & save* to record it. It updates holdings, bumps total invested, and saves a **version**.

### 4. History — version control (undo / redo / revert)
Every build and rebalance is a **checkpoint** that snapshots your whole setup (holdings, contributions,
weights, penalty, overrides).
- **Undo / Redo** step one checkpoint back/forward — undo a rebalance you didn't mean to apply, then redo
  it if you change your mind. The calculator shows an *Undo* button right after you apply.
- **Revert to here** jumps to any past checkpoint. Newer checkpoints stay **redoable** (shown dashed) until
  you apply a *new* rebalance from the reverted point — which forks a fresh timeline and drops the old
  future (just like git). Undoing past the very first build returns you to the empty "start" screen.

### 5. Screener
A browsable universe of the **top ~50 stocks by live market cap in each theme**, **mutually
exclusive** across themes — a company shown under one theme never appears under another, and the 25
core holdings are pinned to their theme. Each row shows live market cap, price and day move; names
already in your portfolio are tagged **held**. Sorted fresh by live market cap on every refresh.

### 6. Swap a stock into your portfolio
**Tap any stock** in the Screener. It asks which current holding **in the same theme** you want to
replace, then swaps it in: the removed name is sold to $0, the new one is bought, and the whole book
**rebalances with the same model logic** (you review the buy/sell plan on the Calculator, then
*Apply & save*). The swap is a normal version checkpoint — **undo** restores both the old holding
and the prior theme membership.

---

## The strategy, precisely

1. Portfolio is managed at the level of the **5 themes**, not individual stocks.
2. For each theme: `theme PEG = Σ(mcap_i · PEG_i) / Σ(mcap_i)` over all 5 names (a reported-negative ratio is
   substituted with the penalty multiple; a not-applicable one is excluded); same for EV/EBITDA, Debt/FCF and P/E.
   Also `theme avg mcap = mean(mcap_i)` and `theme momentum = mcap-weighted mean of each name's price-vs-MA score`.
3. Theme target weight = blend of six normalized scores — `1/PEG`, `1/EV·EBITDA`, `1/(Debt/FCF)`, `1/PE` (cheaper /
   more sustainable ⇒ higher), `log(avg mcap)` (bigger ⇒ higher) and `momentum` (higher ⇒ higher, downtrend ⇒ 0) —
   by your weights (default 20/20/20/15/10/15), normalized to 100%.
4. **Per-theme cap (default 30%):** no single theme may exceed the cap. Excess from a leading theme is
   redistributed to the others in proportion to their weights, repeated until every theme fits (so 2+ themes
   can end up pinned at the cap). 30% = 1.5× the 20% equal-weight base. Adjustable on the Fundamentals tab.
5. Inside a theme, the 5 names are **equal-weighted** (20% of the theme's capital each).

---

## Your data

`portfolio.json` holds your current holdings (share counts + cost basis), total invested, your metric
weights, penalty, any manual overrides, and the full **version timeline** (`versions[]` + a `head`
pointer to the active checkpoint, each with its own state snapshot). Back it up by copying that one
file. Delete it (or use *Reset portfolio…* in History) to start over.

## Cost / limits

100% free. The server caches prices ~15s and fundamentals ~6h so it never hammers Yahoo. If Yahoo
is ever unreachable, the app falls back to a built-in snapshot (values flagged `seed`) so it still
works — hit *Refresh* to go live again.
