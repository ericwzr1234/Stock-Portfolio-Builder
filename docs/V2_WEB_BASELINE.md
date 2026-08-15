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

## 9. Accounts and sync (E6) — the rules the native build MUST inherit

E6 put the portfolio in a hosted database behind a login. Two adversarial reviews of that work
found **66 defects**, and the native build is where several of them are *worse*, because on iOS
`pb_portfolio_v1` is not a cache — it is the only copy of the user's book. Full reasoning lives in
`docs/features/E6_database_design.md` sections 16 and 17. The short version, as rules:

1. **A document remembers where it came from.** `state.docSource` (`"cloud"`/`"local"`/`"remote"`)
   and `state.docOwner` (the uid) are captured at load time, *before any await*. A document loaded
   from an account may never be written to on-device storage, and vice versa. On web this bug
   overwrote a shared server file; on native it would overwrite the user's only book with an empty
   "start fresh" document. Do not let `storageAdapter()` be re-evaluated as the authority on where
   an already-loaded document belongs.

2. **`state.baseRevision` holds only a SERVER-CONFIRMED revision, or null.** Never
   `document.revision - 1`, never a number taken from a conflict error. While it is null, saving
   is refused with a message telling the user to reload. This is what stops a stale document from
   matching the PATCH filter and silently overwriting a newer one.

3. **A lost session re-gates the app.** Only HTTP 400/401 may destroy a session (a network blip or
   a paused project must not — the offline fallback exists precisely for that). When one *is*
   destroyed, clear all account state, stop the refresh timer, and return to the gate. Never keep
   running unauthenticated.

4. **Nothing is discarded silently.** Work that cannot reach the server goes to
   `pb_cloud_mirror_<uid>`, `pb_unsynced_<uid>_<ts>` or `pb_conflict_<uid>_<ts>` — always keyed by
   an explicitly-passed uid, never a lazily-resolved one (the session can die mid-request and file
   it under `anon`, where nothing will ever read it). And whatever writes those keys, **something
   must read them back**: the web build has `offerStashRecovery()`. Without a reader, "your edit
   was kept aside" is a lie.

5. **`savePortfolio()` returns true only if the write landed**, and callers must not announce
   success without checking. A persistent indicator (the web build's `#syncBadge`) carries the
   state — "did my rebalance save?" is not a question a three-second toast can answer.

6. **Saves are serialised.** Two overlapping saves otherwise read the same base and the second is
   reported as a cross-device conflict, triggering a destructive reload from a single-device race.

7. **Isolation the database cannot provide.** RLS separates accounts, not devices. The on-device
   book is claimed by the first uid to import or decline it (`pb_local_claim`) and is never shown
   to a different account. An import offer requires a *successful* account read — a failed read is
   not an empty account.

8. **An import must go through the same hydration a normal load uses.** Assigning the document
   directly and saving uploads a stripped book (themes, membership, watchlist, metrics, presets,
   overrides, cap, weights, penalty all replaced by defaults) and skips `migrateVersions()`, after
   which a legacy file can never migrate. Reuse `hydrateFromDocument()`.

9. **`null` is meaningful for `themes` and `themeTickers`** — it is what "restore the defaults" and
   "delete a theme" persist. A truthiness guard can never move state back to null, so a deletion on
   one device gets resurrected by the next save from another.

`nativeFundamentals()` remains the one genuine native gap (it must mirror `server.py`'s ~21 E2
fields); everything above is shared logic that reaches iOS through `npx cap sync ios`.
