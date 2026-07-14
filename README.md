# Portfolio Builder

A free, no-API-key tool to **build and rebalance** a themed, market-cap-weighted stock portfolio
from a **fundamentals model you control** — pick your themes, pick your metrics, and let the model
compute target weights from live data (or straight from the companies' financial statements).

Nothing here costs money. No accounts, no keys. Data comes from Yahoo Finance's free endpoints; your
portfolio lives in a plain `portfolio.json` file next to this README (or on-device in the iOS app).

> **Project status (2026-07-13):** the **web app is feature-complete** — user-defined themes,
> user-defined metrics, statement-driven data, and the redesigned Fundamentals/Screener are all
> shipped. The native **iOS app is in progress** (bringing the on-device data layer to parity). Live
> progress board: [`docs/DASHBOARD.md`](docs/DASHBOARD.md).

---

## How to run

### Web (Windows or Mac)
**Windows:** double-click **`Start Portfolio Builder.bat`**.
**Mac:** double-click **`Start Portfolio Builder.command`** (the first time, right-click → Open),
or run `python3 server.py` in this folder.

A small window opens (the local server) and your browser opens to the app automatically. Everything
you do is saved to `portfolio.json` in this folder. To stop, close the window (or press `Ctrl+C`).

> Requires Python 3 (standard library only — nothing to install). The app itself lives in
> **`www/index.html`**; the server just serves it and proxies free data. On Windows, if the window
> flashes and closes, run `py server.py` in this folder to see any message.

### iPhone (private, free)
The same tool builds as a private, free iOS app via Capacitor — it fetches data on-device and stores
your portfolio on the phone, with optional Wi-Fi sync to share the computer's `portfolio.json`. See
[`docs/IOS_BUILD.md`](docs/IOS_BUILD.md). Developing across two machines? Read [`CLAUDE.md`](CLAUDE.md)
and [`docs/DEV_WORKFLOW.md`](docs/DEV_WORKFLOW.md) first.

---

## What it does — five tabs

**Prices · Fundamentals & Allocation · Calculator / Rebalance · Screener · History.**

### 1. Prices (by theme)
Live-ish prices for every name in your themes, grouped by theme, with day change and — once you've
started a portfolio — the live value and weight of each theme. Auto-refreshes on the interval you
pick (default 60s). Yahoo's free feed can be delayed up to ~15 min for some names; most US names
update near real-time during market hours.

### 2. Your themes (fully editable)
The portfolio is managed at the level of **themes**, not individual stocks. It starts with five
themes of five names each, but everything is yours to change:

| Theme | Starting names |
|---|---|
| **Stablecoin** | CRCL, MA, V, COIN, JPM |
| **Personal AI** | AAPL, AMZN, META, GOOGL, IBM |
| **Enterprise AI** | NOW, PLTR, MSFT, CRM, PATH |
| **Robotics** | ISRG, ROK, NVDA, SYM, TSLA |
| **Data Providers** | SNOW, SPGI, MCO, MSCI, RDDT |

- **Create, rename, recolour, or delete** a theme (and restore the defaults).
- **Add or remove any ticker** in a theme — search any listed stock (incl. NYSE names / ADRs) by symbol
  or company name. A new empty theme holds 0% until you fill it, so it can't siphon the book.
- Within a theme, names are **equal-weighted**, and the per-theme cap auto-scales with how many themes
  you have.

### 3. Fundamentals & Allocation
This is the model. Two cards side by side:

- **Target vs current weight** — the drift table (target vs your live weights), a colored allocation
  bar, and the theme/preset controls.
- **Theme allocation model** — the inputs: **① Metrics** (assign a weight to each), **② Exception
  handling** (what to do when a value is negative or missing), and **③ Maximum weight per theme**.

**Choose your metrics.** Six are on by default — **PEG, EV/EBITDA, Debt/FCF, P/E** (TTM, cheaper ⇒
more weight), **average market cap** (log scale — bigger = steadier), and **price momentum** (price vs
its 50- & 200-day moving averages, blended 0.6/0.4 — a downtrend scores 0). Default weights
**20 / 20 / 20 / 15 / 10 / 15**, fully adjustable and auto-normalized. Beyond those, a **catalog of 21
more** metrics is one click away (27 in all) — ROE, ROA, P/S, P/B, gross/operating/net margins, current & quick
ratios, Debt/Equity, revenue & earnings growth, dividend yield, payout ratio, beta, forward P/E,
EV/Revenue, P/FCF, net-cash, and more. Each metric's **direction** (higher- vs lower-is-better) is set
automatically.

**Computed straight from the financial statements.** By default the model computes each metric from
the company's **three financial statements** (income, balance sheet, cash flow — trailing twelve
months, assembled from the last four quarters) rather than a pre-computed number, so every figure has
one transparent definition. Forward-looking and market metrics (forward P/E, PEG, beta, dividend
yield, market cap, momentum) stay **pulled** from Yahoo, and for foreign ADRs (e.g. TSM, filed in a
non-USD currency) the market-cap-based valuations stay pulled too. A **"Compute metrics from
statements"** toggle turns this off (reverting to pulled values), and **Compare sources** shows the
computed-vs-pulled difference for every metric.

**Handling bad or missing data** — per metric, choose one of three policies in ② Exception handling:
- **Penalize** — substitute an artificial worst-case value (e.g. a reported-negative EV/EBITDA, P/E,
  or Debt/FCF is replaced by a large multiple so it drags the theme up). Tagged `prem`.
- **Carry over** — impute the missing factor from the name's standing on the factors it *does* report,
  so a dominant, cheap name (like a big bank with no EV/EBITDA) actively *lifts* its theme instead of
  sitting out. Tagged `qual`.
- **Ignore** — exclude the name from that metric entirely.

Values computed from statements are tagged `calc` / `computed`; pulled ones `pulled`. **Click any
metric cell to override it** with your own figure (saved, tagged `ovr`, `↺` resets to live). Save your
whole metric setup as a **preset**, or reset to the default six.

**Stock detail.** Click any ticker to open a detail view: its **three statements × the last four
quarters** (plus a TTM column) and a **computed-metrics panel** showing each metric's value, its
formula, and whether it was computed or pulled.

### 4. Calculator / Rebalance
- **First run:** enter your starting capital (defaults to **$80,000**) and click *Build initial
  portfolio*. It splits capital across themes by the model, equal-weights the names in each theme, and
  converts to share counts at live prices.
- **Each month:** type the cash you're adding (defaults to **$4,000**), pick a mode, and *Calculate*:
  - **Full rebalance** — moves every position to its new model target; tells you exactly which stocks
    to increase and which to decrease (buys + sells, net = your new cash).
  - **Deploy new cash only** — steers just the new money into the most underweight names, no sells.
- **Realign only (no new $)** — rebalances the whole book to today's targets at the current value,
  adding zero capital (use it after you change metrics/weights/cap and just want to re-align).
- Click *Apply & save* to record it — it updates holdings, bumps total invested, and saves a version.

### 5. Screener — search & watchlist
Look up **any** stock and add it to your **watchlist** (no theme yet — just browsing). When you're
ready, pick a theme on a watchlisted name and confirm whether to **add it as a new name** or **swap**
it for an existing holding; then review the rebalance on the Calculator and *Apply & save*. Names
already in your portfolio are tagged **held**. A swap is a normal version checkpoint — **undo**
restores both the old holding and the prior theme membership.

### 6. History — version control (undo / redo / revert)
Every build and rebalance is a **checkpoint** that snapshots your whole setup (holdings, contributions,
themes, metrics, weights, overrides).
- **Undo / Redo** step one checkpoint back/forward.
- **Revert to here** jumps to any past checkpoint. Newer checkpoints stay **redoable** (shown dashed)
  until you apply a *new* rebalance from the reverted point — which forks a fresh timeline and drops
  the old future (just like git). Undoing past the very first build returns you to the empty start.

---

## The strategy, precisely

1. The portfolio is managed at the level of your **themes**, not individual stocks.
2. For each theme and each active metric, the theme's value is the **market-cap-weighted** blend of the
   names' values (a *penalized* value substitutes the penalty; an *ignored* one is excluded; a
   *carried-over* one is imputed from quality). Market cap uses `log(avg mcap)`; momentum uses the
   cap-weighted mean of each name's price-vs-moving-average score.
3. Each metric is scored in its natural direction (cheaper/lower ⇒ higher for valuation ratios; higher
   ⇒ higher for quality/growth/momentum), the scores are blended by **your weights** (default
   20/20/20/15/10/15 over the six defaults), and normalized across themes to 100%.
4. **Per-theme cap (default 30%):** no theme may exceed the cap; the excess from a leading theme is
   redistributed to the others in proportion to their weights, repeated until every theme fits. 30% =
   1.5× the 20% equal-weight base at five themes; the cap auto-scales as `1.5 / (number of themes)` and
   is adjustable on the Fundamentals tab.
5. Inside a theme, the names are **equal-weighted**.

---

## Your data

`portfolio.json` holds your current holdings (share counts + cost basis), total invested, your themes,
your metric model (metrics, weights, exception-handling policies, cap, presets), any manual overrides,
and the full **version timeline** (`versions[]` + a `head` pointer to the active checkpoint, each with
its own state snapshot). Back it up by copying that one file. Delete it (or use *Reset portfolio…* in
History) to start over. On the iPhone app the same data lives on-device, and can optionally sync with
this file over Wi-Fi.

## Cross-platform

There is **one codebase** (`www/index.html`). The web app runs it via `server.py`; the iOS app wraps
the very same files with **Capacitor** and fetches Yahoo directly on-device (no server, no CORS). Only
the data layer differs by platform. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the split
and [`docs/IOS_BUILD.md`](docs/IOS_BUILD.md) to build the app.

## Cost / limits

100% free — Yahoo Finance's free public endpoints (cookie + crumb handled for you) plus the SEC's free
ticker list; Python standard library only, no API keys. The server caches prices ~15s and fundamentals
~6h so it never hammers Yahoo. If Yahoo is ever unreachable, the app falls back to a built-in snapshot
(values flagged `seed`) so it still works — hit *Refresh* to go live again.
