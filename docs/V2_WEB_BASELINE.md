# V2 web baseline — the spec the iOS app should be rebuilt against

> **Read this first if you are picking up App (iOS) development.**
> The web app was rebuilt as **V2** (epic E5, shipped to `main` 2026-08-15, commit `d2b7405`).
> **V1 — including the shipped iPhone app — is superseded.** Do not try to reconcile the current
> `.native` CSS with V2; it was written for V1 markup that no longer exists (see §6). Rebuild the
> phone UI against *this* document.
>
> **The rule agreed with the user:** the iOS app **does not have to look like the web app** —
> platform constraints make a shared pixel design a poor fit — but it **must carry the same content
> and the same features.** This file is the definition of "same".

---

## 1. What the app is

A free, no-API-key tool that builds and rebalances a **themed, market-cap-weighted** stock portfolio
from a **user-defined fundamentals model**. One codebase (`www/index.html` + `server.py`), no build
step, no dependencies. Data comes from Yahoo's free public endpoints and the SEC's free ticker file.

## 2. Architecture that must not change

- **The engine is pure and platform-agnostic.** `computeAllocation`, `planTrades`, `applyRebalance`,
  `computeCarryover`, `applyThemeCap`, `stmtTTM`, `computedMetrics`, `rebuildFundamentals`, the metric
  catalog and the version timeline take state in and return results, with **no I/O**. E5 left all 24 of
  these **byte-identical** to V1 — verified, not assumed. A UI rewrite must not touch them.
- **All storage goes through one seam:** `loadPortfolio()` / `savePortfolio()`. Market data goes through
  `dsQuotes` / `dsFundamentals` / `dsStatements` / `dsSearch` / `dsPeers`, which branch on `NATIVE`.
  **UI code must never call `localStorage`, `fetch`, or a file path directly.** This is what makes the
  future database (epic E6) a drop-in fourth adapter.
- **`state.pulled` is the authoritative base.** Anything fetching fundamentals writes `state.pulled`
  then calls `rebuildFundamentals()`. Never write `state.fundamentals` directly — it is derived.

## 3. Information architecture (V2)

Five sections, renamed by **intent** rather than mechanism. On web these live behind a persistent left
rail; on a phone they should be a bottom tab bar (V1's pattern was right).

| V2 section | V1 name | Purpose |
|---|---|---|
| **Overview** | Prices | Where do I stand right now |
| **Model** | Fundamentals & Allocation | What should I own, and why |
| **Rebalance** | Calculator | What do I trade to get there |
| **Research** | Screener | What might I add |
| **History** | History | What did I do, and undo it |

**The one structural idea worth carrying to the phone:** a **persistent context bar** showing
**Total value · Today · Invested · Gain · Max drift** on *every* screen. In V1 those numbers existed
only on the Prices tab, so you lost all portfolio context the moment you navigated away. On a phone
this can be a compact sticky header. It must update on the **price-refresh path**, not only on full
re-renders (that was a real V2 bug — see §7).

## 4. Feature inventory — the "same features" contract

Everything below works in V2 web and must exist on the phone.

### Overview
- Hero portfolio value; today's move; all-time gain vs invested.
- **Value-over-time chart** across every checkpoint, with an *Invested* reference line, scrubbable to
  read any checkpoint. Values come from each version's **recorded `valueAfter`**, not a re-derivation.
- **Allocation donut** — current weights when a portfolio exists, else the model target. Any value held
  outside a theme appears as an explicit *"Exiting / unthemed"* segment; never silently renormalise.
- **Holdings by theme**, collapsed by default, each showing **% of book · Market value · Cost basis ·
  Profit / loss · Return** (spelled out — the user explicitly rejected abbreviations). Expanding shows
  per-ticker price / day-change / value.

### Model
- **27-metric catalog** (6 default + 21 optional) with a picker; per-metric **weights**; **exception
  handling** per metric (penalize / carry-over / ignore); **max weight per theme**; **presets**
  (save / load / delete / reset-to-default-6).
- **Compute-from-statements toggle** (default on) + **Compare sources** (computed vs pulled).
- **Target vs current** drift table + allocation bar & legend.
- Per-theme metric tables (collapsed by default) with **inline overrides** (click any value to type
  your own), **reset-to-live**, and source tags: `prem` `qual` `calc` `ovr` `na` `live` `seed`.
- Per-theme **add ticker / rename / delete**; create theme; restore defaults.
- **Ticker click-through** to the stock-detail page: 3 financial statements × recent quarters + TTM,
  plus a computed-metrics panel showing each metric's value, formula and source.

### Rebalance
- First-run **build** flow; **add capital**; modes **full rebalance** / **cash-only**; **realign only**
  (no new money); the **trade plan**; **Apply & save** → creates a version checkpoint.
- Current holdings with per-name remove; cost basis, unrealised gain and **portfolio start date**.

### Research
- **Inline live search** of any listed name (debounced, with a stale-response guard) → adds to a
  **watchlist**, which never touches the portfolio.
- Watchlist quote table: last, change %, 52-week high/low, volume, average volume.
- From the watchlist: pick a theme → confirm **add as a new name** *or* **swap for a holding** →
  review the rebalance → save.

### History
- Every build/rebalance is a **checkpoint**: date, mode, cash added, trade count, value before → after
  with the delta, and the per-theme allocation + full trade list.
- **Undo / redo / revert-to-any-point**, with **git-style forking** (applying from a reverted point
  drops the redo future). Redoable futures are visually distinct.
- Recorded-value chart; **reset portfolio**; (iOS only) the Wi-Fi **data-sync** card.

## 5. Design language (adapt, don't copy)

- **One design, two themes — light and dark**, defaulting to the OS setting and remembering an explicit
  choice. **Everything theme-dependent is a CSS token**; no component rule branches on the theme.
- **Two-column on wide screens**: charts/controls left, detail right. On a phone this becomes stacked
  sections — the *content grouping* is what matters, not the columns.
- **Detail collapses by default**, expandable, with open state kept in module state so a background
  refresh never collapses what the user opened.
- **Contain, don't stretch:** long lists scroll inside their own card. **Never** bury a commit button
  (*Apply & save*) inside a nested scroll.
- **Fill the window** — no fixed max-width.

### Traps worth inheriting (each cost real debugging time)
1. Transitioning the `background` **shorthand** over a `var()` sticks at the old colour on a theme swap
   — use the `background-color` **longhand**, and suppress transitions for one frame during the swap.
2. Clear that suppression on a **timer, not `requestAnimationFrame`** — rAF is paused in background
   tabs, which would disable all motion permanently.
3. SVG fills **baked to resolved hex** don't recolour with the theme — bind to `var(--token)`.
4. **Theme colours are user data** and don't adapt; `color-mix()` them toward the foreground before
   using one as text, or dark-mode contrast fails.
5. Wide-screen media queries must be **last in the stylesheet** — they override equal-specificity base
   rules, and an earlier placement silently loses.
6. An `<svg>` `viewBox` whose aspect differs from its CSS box gets **letterboxed**, and any pointer
   maths done against the bounding rect goes out of register — convert through `getScreenCTM()`.
7. A `keydown` handler on a container that calls `preventDefault()` will **swallow activation of any
   button inside it** — guard on `e.target.closest("button,…")` first.

## 6. The iOS debt this created — deliberate, and accepted

V2 replaced V1's `<div class="card theme">` / `.head` / `.lhs` / `.theme-grid` markup with a
`.thm` / `.thm-head` / `.thm-body` accordion. **Every `.native .theme …` rule therefore matches
nothing**, which on the V1 phone build means the metric table loses its frozen ticker column and phone
cell density, and the theme header can't wrap (name and target pill clip). A pre-merge audit confirmed
these; the user's explicit decision was to **not fix them**, because the phone UI is being rebuilt
anyway. **Do not spend time repairing the V1 native CSS — delete it and start from this document.**

Also note: **dark mode is reachable on native but V1's native header/tab bar hardcode light colours**,
so a rebuilt phone UI must tokenise those too.

## 7. Bugs V2 already fixed — don't reintroduce them

- The context bar must be refreshed on the **price-refresh path**, not just on structural re-renders,
  or it shows stale money beside live money.
- `valueHistory()` must respect the **version head** — `restoreVersion()` moves `head` but never
  truncates `versions`, so plotting the whole array charts undone checkpoints.
- Accordion open-state keys round-trip through `dataset` as **strings**; compare as strings.
- Clear chart scrub handlers when the chart empties, or a reset portfolio still reports its old dollars.
- Don't renormalise current weights to the themed subtotal (see the donut note in §4).

## 8. Where things are

| | |
|---|---|
| Repo | `https://github.com/ericwzr1234/Stock-Portfolio-Builder` (private) |
| Windows working copy | `C:\dev\portfolio-builder` (**outside** OneDrive — keep it that way) |
| Mac working copy | `~/Developer/portfolio-builder` |
| **V2 (current)** | branch `main` @ `d2b7405`, and `dev-newUI` |
| **V1 archive** | branch `dev` @ `e5ceb39` — frozen on purpose, includes the shipped iOS app |
| Board | `docs/DASHBOARD.md` (source `docs/board.json` → `py -3 tools/render_dashboard.py`) |
| Next epic | **E6** — accounts + hosted database (`docs/features/E6_multi-user-platform.md`) |

**Test against the dev database**, never the real book: `portfolio-dev` on port **8766** using
`portfolio.dev.json`. `portfolio.json` is real personal financial data — gitignored, never committed,
and backed up at `C:\dev\portfolio-builder-backups\`.
