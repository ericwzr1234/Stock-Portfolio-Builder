# E12 — V3 UI  *(epic · design approved, implementation not started)*

- **Epic:** E12 · V3 UI
- **Stage:** design approved (owner, this session) → **E12.0 is next**
- **Platform:** web and iOS, same information architecture
- **Mockup:** `Portfolio Builder V3.dc.html` (clickable, mock data, desktop + 390×844 phone)
- **Design system:** Modernist — Archivo, flat, zero radius, 2px rules, modular grid, single accent
- **Supersedes the presentation layer of:** E5. Leaves E5's engine, `ds*` data layer, and the E6/E8/E9
  account rules **untouched**.
- **Branch:** `dev-v3ui` off `main`. One commit per card. Merge to `main` only after the whole epic
  has been clicked through by the owner.

---

## 0. Read this before writing any code

Three documents govern this work and they are not optional reading:

| File | What you must take from it |
|---|---|
| `docs/V2_WEB_BASELINE.md` | §4 is the feature contract — every capability listed there must still be reachable when E12 is done. §7 lists bugs already fixed; §9 lists the account rules. |
| `docs/features/E5_web-ui-overhaul.md` | §3 (the 84 element IDs are the contract) and the *Conventions established* list. |
| This file | The design. §2 is the only permitted set of visual values. |

**What is out of scope, permanently.** Do not touch, refactor, "improve" or move:
`computeAllocation`, `planTrades`, `applyRebalance`, `computeCarryover`, `applyThemeCap`, `stmtTTM`,
`computedMetrics`, `rebuildFundamentals`, the metric catalog, the version timeline, and the entire
`ds*` data layer (`dsQuotes` / `dsFundamentals` / `dsStatements` / `dsSearch` / `dsPeers`).
All storage still goes through `loadPortfolio()` / `savePortfolio()`. UI code still never calls
`localStorage`, `fetch`, or a file path directly. `state.pulled` is still authoritative and
`state.fundamentals` is still derived.

**E12 changes markup, CSS, and only those render functions whose output shape changes.** If a diff
touches a function in the list above, the diff is wrong.

---

## 1. Why V3 exists

V2 is feature-complete and the owner's objection is not about features:

> *"It feels very engineered and basic. Due to legacy design, there are texts and icons that are
> relatively randomly placed. The icons don't follow logical order. The pages are not very intuitive."*

Three root causes, each with a structural fix in this document:

| Cause | Fix |
|---|---|
| Placement is decided per page, so nothing lines up across pages | A **visible modular grid** with 2px rules. Position is derived from the grid, never chosen. |
| Icons carry meaning they can't carry, in an order nobody designed | **Nav is text.** The whole app ships **six** icons (§2 rule 4). There is no order left to get wrong. |
| Every page presents everything at once, so no page has a subject | **Each lane has one job**, stated in §4, and the largest object on any screen is the number that screen is about. |

The owner also named the model: **Robinhood** — specifically one giant number and one chart, rows that
open into focused screens, tactile motion, and the phone and desktop feeling like the same product.
And named two anti-models: Fidelity and IBKR — *"engineered"*, dense, chrome-first.

---

## 2. The token sheet — the only permitted values

Paste this into `www/index.html` replacing the existing `[data-theme="light"]` / `[data-theme="dark"]`
blocks. **Every colour, size, and spacing value in the app must come from here.** A hard-coded hex
anywhere outside this block is a bug, and CI should eventually grep for one.

```css
:root {
  /* ground and ink */
  --bg:            #f3f2f2;   /* page */
  --surface:       #eae9e9;   /* context bar, expanded rows, inputs */
  --ink:           #201e1d;   /* all text, neutral numbers, filled bars */
  --ink-75:        rgba(32,30,29,.75);
  --ink-62:        rgba(32,30,29,.62);   /* secondary copy */
  --ink-50:        rgba(32,30,29,.50);   /* labels */
  --ink-45:        rgba(32,30,29,.45);   /* axis, disabled meta */

  /* accent — green, because up is good */
  --accent:        #00A05C;   /* fills, primary button, active markers, poster field */
  --accent-600:    #008A4E;   /* primary hover */
  --accent-700:    #04703F;   /* ALL accent text <=14px, and every gain figure */
  --accent-100:    #E4F4EA;   /* selected / active row tint */

  /* the one alarm */
  --neg:           #C0331B;   /* a loss, an overweight drift, a destructive action. Nothing else. */
  --neg-100:       #FBE9E5;   /* destructive hover tint */

  /* rules — these organise the app; whitespace does not */
  --rule-strong:   2px solid rgba(32,30,29,.4);   /* between major sections */
  --rule-hair:     1px solid rgba(32,30,29,.13);  /* between table rows */
  --rule-faint:    1px solid rgba(32,30,29,.09);  /* inside an expanded row */

  /* the five portfolio colours — a green tonal ramp, dark to light */
  --portfolio-1: #0E3D26;  --portfolio-2: #276B48;  --portfolio-3: #4F9370;
  --portfolio-4: #8CBBA1;  --portfolio-5: #C6DCCF;

  /* type — one family, three weights, nothing else */
  --font: "Archivo", system-ui, sans-serif;

  /* spacing — the ONLY permitted values */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s6: 24px; --s8: 32px;

  --radius: 0;   /* everywhere, on purpose */
}
```

### Type scale

| Role | Spec |
|---|---|
| Hero value | `800 84px/0.95`, `letter-spacing:-.04em` (phone: `800 46px/1`, `-.035em`) |
| First-run poster | `800 68px/0.98`, `-.035em` |
| Big number in a cell | `800 26px/1`, `-.02em` |
| Section heading | `800 21px/1`, `-.015em` |
| Screen heading | `800 30px/1`, `-.025em` |
| Row / body | `400` or `600 13–15px` |
| Emphasised number in a row | `800 14px/1` |
| **Label** | `600 9–10px/1`, `letter-spacing:.14em`, `text-transform:uppercase`, `--ink-50` |
| Nav lane | `800 13px/1`, `letter-spacing:.06em` |
| Button | `800 13–15px/1`, `letter-spacing:.06em` |

`font-variant-numeric: tabular-nums; font-feature-settings:"tnum" 1` on `body`, globally. Archivo
carries tabular figures — V2's `--num-font` (which flipped to mono in dark) is **deleted**.

### The eight rules that do the actual work

1. **Zero corner radius. No shadow on content.** Shadows exist only on things that genuinely float
   over the page: the stock panel (`-12px 0 32px rgba(45,43,43,.14)`), a dialog
   (`0 12px 32px rgba(45,43,43,.22)`), a phone sheet. A card does not float, because there are no cards.
2. **2px rules organise; whitespace does not.** Major sections are separated by `--rule-strong`
   running edge to edge. Table rows by `--rule-hair`. Never a hairline where a 2px rule belongs, and
   never whitespace instead of a rule.
3. **Everything flush left**, including labels inside wide buttons — `justify-content:flex-start`.
   The commit button reads `APPLY & SAVE CHECKPOINT` at the left padding edge, with `undoable` pushed
   right by `margin-left:auto`. Never centre a button label or a heading.
4. **Six icons in the entire app**: chevron-right (disclosure, rotated 90° when open), search, X
   (close), and the three text glyphs that carry direction (`▲ ▼ ↓ ↑ →`). Lucide, 2–2.5px stroke,
   `currentColor`. Nav lanes, sub-tabs, tab bar items and buttons are **text**. If you find yourself
   choosing an icon for a nav item, stop — that is the bug this rule exists to prevent.
5. **The number is the largest object.** On every screen, the figure that screen is about is the
   biggest thing on it. Labels are 9–10px. Chrome never out-sizes data.
6. **Accent text at 14px or below uses `--accent-700`.** `#00A05C` on `#f3f2f2` is about 3.3:1 —
   fine for a fill or a 34px numeral, not for a label. This is the design system's own rule.
7. **Red is scarce so that red is legible.** A loss, a negative drift, a destructive action — and, on
   a down day, the accent itself (rule 9). That is the whole list.
8. **The invested reference line on every chart is ink, dashed** — not accent. A green dashed line
   beside a green value line cannot be told apart. It is **hidden on the 1D view**, where the invested
   level is far off-screen and the chart frames the day instead.
9. **The accent IS today.** On a down day every accent surface turns red: the primary button, the
   Rebalance cell, the active lane underline and sub-tab underline, the brand square, selected-row
   tints, the metric-weight bar, active radio and checkbox marks, the signal rule. Implement this by
   deriving the four accent tokens from the day rather than by special-casing components:

   ```css
   /* up day */                          /* down day */
   --accent:      #00A05C;               --accent:      #C0331B;
   --accent-600:  #008A4E;               --accent-600:  #A62C17;
   --accent-700:  #04703F;               --accent-700:  #96280F;
   --accent-100:  #E4F4EA;               --accent-100:  #FBE9E5;
   ```

   Set them on `:root` from the day figure on the **price-refresh path**, the same place the context
   bar updates. No component rule may branch on the day — if one does, the next component will forget to.

   **Two things never follow the day:**
   - **The allocation ramp** (`--portfolio-1..5`). It identifies a portfolio; it does not measure it.
   - **The gain/loss semantics.** `--pos` (`#04703F`) and `--neg` (`#C0331B`) are fixed. A portfolio that
     is up prints green on a red day, because it is up. All-time gain likewise. The only figures that
     move with the day are today's figures.

   Three measurements, three colours, never averaged:

   | Measurement | What it colours |
   |---|---|
   | **Today** (prev close → now) | the accent tokens, therefore every accent surface; every *Today* figure |
   | **The selected range** | the chart line and the big period figure |
   | **All-time gain** | the *All-time gain* cell, per-portfolio profit and return — fixed `--pos`/`--neg` |

   **The signal rule** is 6px, full-bleed, `position:sticky; top:0; z-index:31`, filled with
   `--accent`, above the top bar (which sticks at `top:6px`, context bar at `top:66px`).

10. **Drift is signed, not judged.** `drift = current − target`. **Positive is green, negative is red**,
    and the bar grows right of the midline when positive, left when negative. Do not colour by
    "overweight is bad" — the model has no opinion about which side of the target you are on, and the
    owner reads `+` as green. `Max drift` is a **magnitude**, so it prints in ink with the sign shown
    (`+8.1pp`) and the direction spelled out in words underneath — colouring an absolute maximum green
    or red would claim a judgement the number does not carry.

### Portfolio colours are now a ramp, not user hues

`--portfolio-1..5` replaces user-chosen portfolio colours in the UI. This deletes V2's trap #4 (a user hue had
to be `color-mix()`ed toward the ground or dark-mode contrast failed). **If the owner wants to keep
choosing colours**, keep the picker but snap the chosen hue onto the ramp's five lightness steps —
store the hue, render at the ramp's L and C. Do not render a raw user hex.

---

## 3. Information architecture — decided

> **Vocabulary.** A **portfolio** is one of the user's named groups of stocks (Stablecoin, Personal AI,
> Robotics…) — what V1 and V2 called a *theme*. The whole thing, all portfolios together, is **the
> book**. Nothing in the UI says "theme" any more, and lane 1 is therefore called **Overview**, not
> Portfolio. The word *theme* survives in exactly two places, both of them code: the light/dark colour
> theme, and `applyThemeCap` / `themes()` in the engine, which are out of scope (§0) and must not be
> renamed. If you rename anything in the engine, the diff is wrong.

**Four lanes, on web and iOS, one-to-one.**

```
OVERVIEW       MODEL              TRADE                        HISTORY
keys 1         2                  3                            4
where I stand  what I should own  what I trade, and what next  what I did, and undo it
               and why            └ REBALANCE | RESEARCH · WATCHLIST
```

- **Lane labels are text**, flush left in the top bar, `800 13px/.06em`. Active lane: ink text plus
  `box-shadow: inset 0 -2px 0 0 var(--accent)` (a 2px accent underline drawn on the bar's own edge —
  no extra element, no layout shift).
- **Research is a sub-tab of Trade**, not a fifth lane. It is the step before a trade, and this keeps
  the count at four, which is what a phone tab bar can hold without a `More` item.
- **`1`–`4` keyboard nav** is preserved, and must still be suppressed while an `<input>` has focus
  (V2 already does this — keep the guard).
- **The context bar is conditional.** It appears only when the active lane is *not* Overview. On
  Overview the hero number **is** the context, so the total value never renders twice on one screen.
  This is a change from V2, where it was always on. It still must refresh on the **price-refresh
  path**, not only on structural re-renders (V2 bug, baseline §7).
- **Stock detail is a panel, not a lane** — a 640px right-anchored overlay on web, a sheet on phone,
  openable from any ticker anywhere.
- **First run** replaces the whole shell; no nav, no context bar.

---

## 4. Screens

Each subsection is written to be implementable with this file alone. Paste the relevant one in as the
card's acceptance text.

### 4.1 Shell

**Signal rule** — 6px, full-bleed, above everything, coloured by today (§2 rule 9).

**Top bar** — 60px, `border-bottom: var(--rule-strong)`, `position:sticky; top:6px; z-index:30`,
`padding: 0 28px`, `display:flex; align-items:center; gap:26px`.

- Brand: a **22×22 solid `--accent` square** (no logo, no radius) + `PORTFOLIO BUILDER` at
  `800 13px/.02em`.
- The four lanes, `gap:26px`, each a full-height `<button>` so the underline sits on the bar's edge.
- Right, `margin-left:auto`, `gap:20px`: a 7×7 `--accent-700` square + `LIVE · 60s` at
  `600 11px/.06em` in `--ink-50`; the refresh interval control; the account initials in a
  `1px solid rgba(32,30,29,.4)` box. No avatar image.

**Context bar** — only when not on Portfolio. `--surface`, `border-bottom: var(--rule-strong)`,
`position:sticky; top:60px; z-index:29`, and a 220ms `translateY(-4px)`+fade entrance. Five cells in a
row, each `padding:11px 22px` with `border-right: var(--rule-hair)`:
`Total value` · `Today` · `Invested` · `Max drift` · `Last saved`.
Label `600 9px/.14em` uppercase `--ink-50`; value `800 16px/1.2`. `Today` uses `--accent-700` when
positive, `--neg` when negative. `Max drift` is `--neg`. `Last saved` reads
`03 Jul · in your account` in `--ink-50` — a standing reminder of the E9 rule that the account is the
only copy.

### 4.2 Overview

Vertical order, full-bleed, 28px gutters:

1. **Hero band** (`padding: 32px 28px 24px`)
   - Label: `TOTAL VALUE · LIVE`, or `TOTAL VALUE · JUL` while scrubbing.
   - The value at 84px.
   - One row (`gap:24px`, wrapping): period return · `Today +$1,284 · +1.24%` · `Invested $88,000`.
   - **No slot may state the same measurement twice.** On `1D` the selected period *is* today, so the
     big figure and a `Today` item would be the same number side by side — on that range the second
     slot carries `All-time +$16,821 · +19.1%` instead. On every other range it carries `Today`. The
     third slot is always `Invested`.
   - **The period figure must be a return, not a value delta.** Carry a contributions series on the
     same axis as the value series and compute
     `(value − invested)ₑₙᵈ − (value − invested)ₛₜₐᵣₜ`, as a percentage of invested at the end of the
     window. `last − first` is **wrong**: it books every deposit as a gain, which over the whole
     history overstates the return by roughly 3× and contradicts the *All-time gain* cell three
     sections below. Any window in which capital was added must say so in words beneath the row:
     *"Return over this window, measured against money invested — the $8,000 you added along the way
     is not counted as gain."* This is baseline §4's "all-time gain vs invested" applied to **every**
     range, not only to ALL.
   - Range strip `1D 1W 1M 3M 1Y ALL`: one bordered box, `1px solid rgba(32,30,29,.4)`, options divided
     by `border-left`, `padding:9px 15px`, `800 12px/.06em`, active = `--ink` fill on `--bg` text.
   - **`1D` is the default range**, so the app opens on today. It is the reason the day-state colour
     means anything: the first screen after sign-in is the day. On `1D` the series is intraday
     (prev close → now), the percentage basis is the **previous close**, not invested, the contributions
     note is replaced by *"Today, since the open. All-time you are up $16,821 — 19.1% on the $88,000
     invested."*, and the invested reference line is hidden. On every other range the basis is invested
     and the contributions rule below applies.

2. **Chart** — full width, 300px, `viewBox="0 0 1376 300" preserveAspectRatio="none"`.
   - Value line: 2.5px, `stroke-linejoin:round`, coloured `--accent-700` when the period return is
     positive, `--neg` when negative.
   - **Invested reference line**: 1.5px `--ink`, `stroke-dasharray="7 5"`, at the invested level,
     labelled in the caption row beneath (`— — INVESTED $88,000`, `--ink-50`).
   - Caption row: `from-label` · invested legend · `Today`, `600 10px/.1em`, `--ink-45`.
   - **Scrub** on `mousemove`: a 1px `rgba(32,30,29,.4)` vertical rule, a 9×9 square marker in the
     line colour, the hero label switches to the checkpoint's month, and the hero number **retargets
     with a 420ms cubic ease-out** (`1-(1-k)³`). On `mouseleave` it returns to live. Convert pointer
     position through the bounding rect; if you ever give the SVG a `viewBox` whose aspect differs
     from its CSS box, go through `getScreenCTM()` instead (baseline §5 trap 6).
   - Clear scrub handlers when the chart empties, or a reset portfolio still reports its old dollars
     (baseline §7).

3. **Five-cell modular grid** — `grid-template-columns: repeat(5,1fr)`, `border-top`/`border-bottom`
   `var(--rule-strong)`, `border-right: var(--rule-strong)` between cells, `padding: 20px 22px` each.
   `All-time gain` · `Portfolios` · `Max drift` · `Last checkpoint` · **and the fifth cell is a solid
   `--accent` button**: the reason above it (`DRIFT IS PAST YOUR BAND`), `Rebalance →` at 26px, the
   consequence below (`9 trades · net $4,000`). Hover `--accent-600`.
   This is the one place the app tells you what to do next; it must be driven by real drift against
   the cap, and must **not render at all** when drift is inside the band — replace it with a
   `NOTHING TO DO` cell in `--ink-50`.

4. **Allocation** — a 16px stacked bar of **current** weights, segments `gap:2px`, `flex-grow` per
   weight, coloured `--portfolio-1..5`. Beneath it a five-column legend grid divided by `--rule-hair`;
   each cell: an 9×9 portfolio square + name, current % at 25px, `target 24.0%` in `--ink-50`, and a
   **centred drift bar** — a 5px track with a 1px midline at 50%, the bar growing right when drift is
   positive and left when negative, capped at ±10pp, with the signed `pp` figure at the end —
   **positive green, negative red** (§2 rule 10).
   **No donut.** A donut cannot show target against current; this reads in one line.
   Any value held outside a portfolio is an explicit `Exiting / unassigned` segment. **Never renormalise
   current weights to the assigned subtotal** (baseline §4, §7).

5. **Holdings** — a 6-column grid, header row `600 9px/.14em` uppercase `--ink-50` over
   `var(--rule-strong)`:
   `Portfolio · % of book · Market value · Cost basis · Profit or loss · Return`
   — spelled out. The owner explicitly rejected abbreviations; do not shorten to P/L.
   Portfolio row: chevron (rotates 90° when open) + portfolio square + name at `800 15px` + `5 names` in
   `--ink-50`, then the five figures right-aligned; profit and return in `--accent-700` / `--neg`.
   `--rule-hair` below each; hover `rgba(32,30,29,.04)`.
   Expanded: `--surface` background, rows indented 33px, `--rule-faint` between,
   `Ticker · Price · Today · Shares · Value · Weight`. Any row opens the stock panel.
   **Open state lives in module state**, keyed as a **string** through `dataset`, so a 60s price
   refresh never collapses what the user opened (baseline §7).

6. **Recent checkpoints** — four cells over `var(--rule-strong)`, each tagged
   `APPLIED` / `CURRENT` (`--accent`) / `REDOABLE` (`--ink-45`), and a flush-right
   `ALL HISTORY · UNDO →` in `--accent-700` that switches to lane 4.

7. **Also on this lane — the mockup does not show these, and they must not be dropped:**
   - **Live prices by portfolio**: every name in every portfolio with its price and day change, plus each
     portfolio's **live value and weight**. This is V2's old *Prices* tab. It belongs as a second
     expandable block under Holdings (`LIVE PRICES` label), not as its own destination.
   - **Auto-refresh control**: the interval selector (default **60s**) and a manual `REFRESH`, in the
     top bar beside `LIVE · 60s` — which states the current interval rather than decorating it.
   - **The equal-weight counterfactual** on the value chart: what the same book would be worth had
     every holding been rebalanced to equal weight at each checkpoint. A 1.5px `--ink-45` line with a
     legend entry, toggleable.
   - **The `$ / %` toggle** on the return chart: a two-option segmented control.
   - **Seed flagging**: when Yahoo is unreachable the app falls back to a built-in snapshot and tags
     those values `seed`. Keep the tag, and keep `REFRESH` reachable so the user can go live again.

### 4.3 Model

Two columns, `grid-template-columns: 1.35fr 1fr`, divided by `var(--rule-strong)`.

**Left — the inputs.**

- Heading `The model` at 30px, then one sentence: *"Three inputs decide every target weight. Change
  one and the targets on the right re-flow immediately — nothing is saved until you rebalance."*
- `① METRIC WEIGHTS` label in `--accent-700`, and flush right a
  `CATALOG · 6 OF 27` secondary button.
- **One row per active metric**, `grid-template-columns: 1fr 150px 118px`, `gap:16px`,
  `--rule-hair` between:
  - direction arrow (`↓`/`↑`) in `--ink-45` + metric name at `600 14px`;
  - **beneath the name, inline, the three exception-handling chips** — `PENALIZE | CARRY OVER |
    IGNORE` in one 1px-bordered box, `600 10px/.05em`, active = `--ink` fill;
  - a 9px weight bar (`rgba(32,30,29,.13)` track, `--ink` fill, `--accent` for the momentum row),
    `transition: width .3s cubic-bezier(.22,1,.36,1)`;
  - a `− nn% +` stepper: two 28×28 bordered buttons, hover `--accent` fill, and the normalised
    percentage between them at `800 15px`.
  - **This is the change worth defending.** V2 put exception handling in a separate table, so you had
    to hold two lists in your head to answer one question. The policy is a property of the metric, so
    it lives in the metric's row.
- Normalised split printed underneath: *"Normalised to 20/20/20/15/10/15%."*
- `③ MAX PER PORTFOLIO` as one row over `--rule-hair`: label, `30%` at 22px, a bar, and the arithmetic in
  words — *"1.5 ÷ 5 portfolios. Excess is redistributed, repeatedly, until every portfolio fits."*

**Right — the consequence.**

- `TARGET AGAINST CURRENT` label, the target stacked bar, then one row per portfolio
  (`1fr 74px 74px`): square + name, target %, drift in `--accent-700`/`--neg`.
- One sentence: *"Right column is drift: how far today's weight sits from the target. Green is above
  target, red is below."*
- `PER-PORTFOLIO METRIC DETAIL` — the accordions, collapsed. Inline overrides on click, `↺` resets to
  live, source tags `prem` `qual` `calc` `ovr` `na` `live` `seed` rendered as 9px uppercase chips
  (`--ink` fill for computed, outline for pulled).
- Keep the **compute-from-statements toggle** and **Compare sources** here, as two secondary buttons
  under the detail heading. Do not lose them — they are baseline §4 features.
- **Presets** — a row above `①`: a select of saved presets plus `SAVE`, `LOAD`, `DELETE`, and
  `RESET TO THE DEFAULT SIX`. A preset stores the whole metric setup: which metrics are on, their
  weights, their exception policies, and the cap.
- **Portfolio editing lives here**, inside the per-portfolio detail section. Per portfolio: `ADD TICKER` (the same
  `dsSearch` field as Research), per-name **remove**, `RENAME`, **recolour** (see §2's ramp note),
  `DELETE`. Above the list: `CREATE PORTFOLIO` and `RESTORE DEFAULTS`. A newly created empty portfolio holds
  0% until it has names, so it cannot siphon the book. Names inside a portfolio are always equal-weighted,
  and the cap auto-scales as `1.5 ÷ (number of portfolios)`.
- **Every ticker in these tables opens the stock-detail panel (§4.6).**

**Catalog modal** — `2px solid var(--ink)` on the dialog, 760px, backdrop `rgba(32,30,29,.42)`.
Header: `Metric catalog` at 20px + `6 of 27 active` + a 30×30 close button. Body: all 27 in a
`repeat(3,1fr)` grid divided by `--rule-hair`; each a button with a 13×13 checkbox
(`--accent` fill when on), the name, and its group tag (`VAL` `QUAL` `LEV` `GROW` `MKT` `SIZE`)
right-aligned in `--ink-45`; active rows tinted `--accent-100`. Footer over `var(--rule-strong)`:
the direction sentence, and a `DONE` primary button flush right.

In a narrower container (phone sheet, or the panel) `grid-template-columns` collapses to `1fr` and
the catalog to `repeat(2,1fr)`. Nothing else changes.

### 4.4 Trade

Sub-tabs over `var(--rule-strong)`: `REBALANCE` | `RESEARCH · WATCHLIST`, `800 13px/.06em`, active
gets the accent underline. Then two columns, `1.35fr 1fr`.

**Rebalance — left**

- `CASH YOU'RE ADDING` label, the amount at **62px**, with a `− +` pair beside it (34×34, ±1000).
  Typing must be possible too; the steppers are the coarse control.
- **The three modes as a radio list with a consequence sentence each** (V2 offered three bare
  buttons, which is the whole reason the modes were unclear):
  - `Full rebalance` — *"Move every position to its new model target. Buys and sells; the net is
    exactly your new cash."*
  - `Deploy new cash only` — *"Steer the new money into the most underweight names. No sells, no tax
    events."*
  - `Realign only · no new money` — *"Re-align the whole book to today's targets at the current value.
    Use it after you change the model."*
  Selected row tinted `--accent-100`, marker a 14×14 square `--accent` fill (a square, not a circle —
  there is no radius in this system).
- `The plan` at 19px + `9 trades · net $4,000 · nothing is sent to a broker`.
- Plan rows, `grid-template-columns: 64px 1fr 90px 110px` over `var(--rule-strong)`:
  a `BUY`/`SELL` chip (`800 10px/.1em`, `--ink` fill for buy, `--neg` fill for sell, `--bg` text),
  ticker + portfolio, shares, and the amount at `800 14px` (`--ink` for a buy, `--neg` for a sell).

**Rebalance — right**

- `WHERE IT LANDS`: the after stacked bar, then per-portfolio `now → after` rows, with a
  `Portfolio / Now → after` caption beneath.
- `BOOK`: `Book start date` · `Total invested` · `Unrealised gain` · `After this trade`.
- Over `var(--rule-strong)`, the commit button: full width, `--accent` fill, `padding:18px 20px`,
  `APPLY & SAVE CHECKPOINT` flush left with `undoable` pushed right. **Outside every nested scroll** —
  E5's rule, and it is the one button in the app you must never have to hunt for.
- Under it, the account rule in one sentence: *"Saving writes one checkpoint to your account. If it
  can't reach your account it is not saved, and this screen tells you so."* When a save fails, that
  sentence is replaced in place by the failure, in `--neg`, and **the user's change stays on screen**
  (baseline §9 rule 1).
- Below the commit block, over `var(--rule-strong)`: **`CURRENT HOLDINGS`** — every name with its
  shares, cost basis, market value, unrealised gain, and a **per-name remove**. Plus the **portfolio
  start date**. V2 has all of this on the Calculator tab; it is easy to drop because the mockup's
  right column ends at the button.
- Defaults, both prefilled and both editable: **$80,000** initial capital, **$4,000** added capital.

**Research** — *see §4.4b. The mockup renders the resting watchlist only; the search-result rows and
the add-to-portfolio dialog are specified there and must both be built.*

### 4.4b Research — the whole flow

Four interactions hang off the resting state, and all four exist in V2 today:

**1. Search.** A search line, not a pill: 26px placeholder text over `var(--rule-strong)`, search icon
at 19px, `SYMBOL OR COMPANY` in `--ink-45` flush right. Pills are round; this system has no radius.
Queries any listed name — including NYSE names and ADRs — by **symbol or company name**, through
`dsSearch`. Keep the **debounce** and the **stale-response guard** (a slower earlier request must never
overwrite a faster later one).

**2. Results.** Results render as rows directly beneath the line, divided by `var(--rule-hair)`: symbol
at `800 14px` + company name in `--ink-50`, exchange/type in `--ink-45`, last price, day change, then an
`ADD TO WATCHLIST` outline button. A name already in the book carries a `HELD` tag (`--ink` fill).
**Clicking the row itself opens the stock-detail panel (§4.6) — not the watchlist.** Reading a
company's financials must not require adding it to anything, and that panel works identically for a
name you do not own. This is the single most droppable interaction in the whole migration.

**3. Watchlist.** Columns: `Name · Last · Today · 52-week range · Volume · Avg volume · P/E · Then
what`. The 52-week range is a 5px track with a 2px ink tick at the price's position and lo/hi printed at
10px beneath. **Volume and average volume are both real columns** — V2 has them. Every row's name
opens the stock-detail panel. Per-row remove. A watchlisted name **never touches the portfolio**; the
watchlist is storage, not intent.

**4. Into the book.** `Then what` is a tag (`HELD` = `--ink` fill; `NO PORTFOLIO` = `--ink-45` on
transparent; a portfolio name = `--accent-700` on `--accent-100`) plus an `ADD TO PORTFOLIO` button. That opens
a dialog: **pick a portfolio**, then choose **add as a new name** *or* **swap for a holding** (with a picker
of that portfolio's current names). Confirming does **not** trade — it stages the change and moves you to
the Rebalance sub-tab with the resulting plan shown, where `Apply & save` commits it as a normal
checkpoint. **Undo on a swap must restore both the old holding and the prior portfolio membership.**

### 4.5 History

Two columns, `1.35fr 1fr`.

**Left** — `History` at 30px, one sentence about forking, then a three-button bordered group:
`← UNDO` | `REDO →` | `RESET PORTFOLIO…` (the last in `--neg`, hover `--neg-100`).
Then the ledger over `var(--rule-strong)`, one row per checkpoint,
`grid-template-columns: 14px 1fr 120px 110px`:
a 12×12 square marker (`--accent` fill + border for current; `rgba(32,30,29,.3)` for past;
**transparent with a border for a redoable future**), title at `800 15px` + mode/trade meta in
`--ink-50`, the tag, then value at `800 15px` with the delta beneath in `--accent-700`/`--neg`.
Selected row tinted `--accent-100`.

**Right** — `RECORDED VALUE AT EACH CHECKPOINT`, a 540×240 bar chart: selected bar `--ink`, past bars
`rgba(32,30,29,.3)`, **redoable futures outlined and dashed** (`stroke-dasharray="5 4"`), month labels
at 10px beneath. Values come from each version's **recorded `valueAfter`**, never a re-derivation, and
`valueHistory()` must respect the version **head** — `restoreVersion()` moves `head` without
truncating `versions`, so plotting the whole array charts undone checkpoints (baseline §7).
Then, over `var(--rule-strong)`, the selected checkpoint: `SELECTED · REALIGN ONLY` in
`--accent-700`, its meta, its allocation bar, its trade list, and a `REVERT TO HERE` button
(`1px solid var(--accent)`, `--accent-700` text, hover `--accent` fill).

### 4.6 Stock detail

A **640px right-anchored panel**, `border-left: var(--rule-strong)`,
`box-shadow: -12px 0 32px rgba(45,43,43,.14)`, `z-index:40`, `overflow:auto`, entering with a 260ms
`translateX(28px)` + fade.

**Reachable from every place a ticker appears — all five:** a holdings row on Overview, a per-portfolio
metric row on Model, a trade row on the plan, a **search result** on Research, a **watchlist row** on
Research. One panel, one code path. If any of the five does not open it, the migration lost a feature.
It must work for names you do **not** own — a searched company has statements and computed metrics just
like a holding, and that is most of the point of Research.

- Header over `var(--rule-strong)`: ticker at 34px + company name, then price at 26px + day change +
  `18.0 shares · Robotics`, and a 32×32 close button flush right.
- **`WHAT THE MODEL USED`** — the honest answer to *why does this name have this weight*. One row per
  active metric, `1fr 84px 62px`: the metric name, **its formula in 11px `--ink-50`**
  (`(mcap + debt − cash) ÷ TTM EBITDA`), its value at `800 15px`, and a `CALC` / `PULLED` tag
  (`--ink` fill for calc, outline for pulled).
- **Statements** — three tabs (`INCOME` | `BALANCE SHEET` | `CASH FLOW`) over `var(--rule-strong)`,
  then `1.5fr repeat(5,1fr)`: four quarters plus a **TTM column whose header is `--accent-700`** so
  the derived column is visibly derived, and whose values are `800` against the quarters' `400`.

On phone this is a full-height sheet with the same content order.

### 4.7 First run

The one poster moment the design system allows.

- Top bar reduced to brand + `EW · SIGNED IN`.
- A **full-bleed `--accent` field**, `padding: 64px 28px 56px`, `--bg` text: 68px display type —
  *"You own the model. It owns the weights."* — then one paragraph at 17px/0.9 opacity:
  *"Pick the portfolios you believe in. Pick the fundamentals that decide who wins. The model does the
  arithmetic — every month, on live statement data."*
- Three numbered steps in a `repeat(3,1fr)` grid divided by `var(--rule-strong)`: the numeral at
  `800 34px` in `--accent`, a 19px title, a 14px paragraph in `--ink-62`.
  1. **Build your portfolios** — *"There are no default portfolios. Name a thesis, add the names you'd own
     inside it. Equal weight within, model weight across."* (E8: `themes()` is simply the list.)
  2. **Choose the metrics** — *"Six to start, twenty-one more in the catalog. Weight them. Decide what
     happens when a company reports something negative or nothing at all."*
  3. **Fund it once** — *"Enter your starting capital. Every rebalance after this is a checkpoint you
     can undo."*
- Then `STARTING CAPITAL`, `$80,000` at 58px, `BUILD INITIAL PORTFOLIO` (`--accent` fill) and
  `IMPORT portfolio.json` (outline) side by side, and the account rule in one sentence:
  *"Nothing is written to this device. Your book lives in your account only."*

### 4.8 Sign-in gate

The first screen anyone sees, and the only place the account rule is explained — state it here plainly
so it never has to be explained again inside the app. No nav, no context bar, no signal rule.

**Element IDs to preserve** (they already exist in `www/index.html` around line 750 and the auth code
is wired to them): `gate`, `gateTitle`, `gateSub`, `gateEmail`, `gatePass`, `gateCaptcha`, `gateMsg`,
`gateGo`, `gateToggle`, `gateForgot`, `gateLegal`. **Only the markup and CSS around them change.**
Keep `autocomplete="username"` / `autocomplete="current-password"`, and keep the captcha mount point
exactly where the captcha code expects it.

**Layout** — `grid-template-columns: 1.05fr 1fr`, full height, no max-width.

**Left cell — an ink field** (`background: var(--ink)`, `color: var(--bg)`, `padding: 48px 44px`).
Ink, not accent: the accent field is reserved for the first-run poster, and a full green screen at the
front door over-promises before the user has any numbers. **The gate and the first-run screen never
take the day accent** — there is no portfolio yet, so there is no day; both stay green.

- Top: the 22×22 `--accent` brand square + `PORTFOLIO BUILDER`, and flush right
  `MODEL-DRIVEN · NO API KEYS` at `600 10px/.14em` in inverse-ink 45%.
- Pushed to the bottom (`margin-top:auto`): the statement at `800 54px/0.97`, `-.035em`, max 20ch —
  *"Your book lives in your account. Nowhere else."*
- Then **three** rows over a `2px solid rgba(243,242,242,.32)` rule, each an 8×8 `--accent` square plus
  a bolded lead-in and one sentence at `400 15px/1.5` in inverse-ink 82%, divided by
  `1px solid rgba(243,242,242,.16)`. In this order — what it does, then who can see it, then where the
  data comes from:
  1. **Allocate on performance, not on a hunch.** Capital is split across your portfolios by how the
     companies inside them actually perform — valuation, balance-sheet strength, margins and growth —
     blended with each name's price momentum, and re-derived every time you rebalance.
  2. **Your book is yours alone.** Row-level security separates accounts — another signed-in user
     cannot read your holdings, and the database enforces that rather than this code. Nothing is
     cached on this device, so you are never shown a stale number.
  3. **Free public data, no API keys.** Prices come from Yahoo Finance's free endpoints; fundamentals
     are assembled from the companies' own SEC filings — three statements, trailing twelve months.
     Some prices can be delayed up to fifteen minutes.
- Bottom, at `400 12px/1.6` in inverse-ink 45%: **the disclaimer, and nothing else.** Data sourcing
  moved up into bullet 3 precisely so this line is purely legal — not investment advice, arithmetic on
  public data, no forecast, past performance is not a promise, no recommendation to buy or sell, and
  every trade is the user's to place or not.

**Right cell — the form**, vertically centred, `max-width: 430px`, everything flush left.

- `ACCOUNT` label, then the title at `800 38px/1`, `-.03em`, then the sub at `400 15px/1.5` in
  `--ink-62` — keep the existing copy: *"Your portfolio and its rebalance history — kept to your
  account, and nowhere else."*
- Over `var(--rule-strong)`: Email and Password fields — `600 12px` label at 70% ink, input
  **46px tall** (44px minimum touch target), `--surface` background, `1px solid rgba(32,30,29,.4)`,
  zero radius, `caret-color: var(--accent)`, and on focus `border-color: var(--accent)` plus
  `box-shadow: 0 0 0 2px var(--accent-100)` — never the browser's default ring.
  *Forgot password?* sits on the password label's row, flush right, `600 12px` `--accent-700`.
- Create-account mode additionally shows *Confirm password* and the captcha mount — a 64px box,
  `1px dashed rgba(32,30,29,.4)` on `--surface`, labelled `CAPTCHA MOUNTS HERE` until the widget
  loads, so the layout never jumps when it does.
- The message line is a **reserved 20px row above the button** — reserved, so an error does not shift
  the button under the user's cursor. Errors render in `--neg` at `400 13px/1.5`.
- The submit button: full width, `--accent` fill, `padding:18px 20px`, label flush left with `→` pushed
  right by `margin-left:auto`.
- Over a second `var(--rule-strong)`: the sign-in/create toggle as an outline button (label switches
  between *Create an account* and *I already have an account*) and the legal link as quiet 12px text.

**iOS** uses the same form, stacked: the ink field becomes a short header band (the statement only, at
32px), the three assurance rows collapse into one line, and the form fills the rest. Inputs stay 46px.

### 4.9 Feature coverage — the migration checklist

**The mockup is a visual reference, not an inventory.** It renders resting states; several V2
capabilities have no visible pixel in it (a search result, a preset dropdown, a rename dialog) and are
therefore the ones most likely to be lost. This table is the contract: every row must be reachable in
V3, and each card's definition of done includes ticking its rows. Sources: `docs/V2_WEB_BASELINE.md`
§4, `README.md`, and the `docs/features/` cards.

| # | Capability | Where it lives in V3 | How it is reached |
|---|---|---|---|
| **Overview** ||||
| 1 | Hero value, today's move, all-time gain vs invested | §4.2 hero | lane 1 |
| 2 | Value-over-time chart across every checkpoint, from recorded `valueAfter` | §4.2 chart | lane 1 |
| 3 | Invested reference line | §4.2 chart | visible on every range except 1D |
| 4 | Scrub the chart to read any checkpoint | §4.2 chart | hover / drag |
| 5 | Equal-weight-strategy counterfactual line | §4.2 item 7 | legend toggle on the chart |
| 6 | Return chart `$ / %` toggle | §4.2 item 7 | segmented control on the chart |
| 7 | Allocation, current weights when a book exists, else the model target | §4.2 item 4 | lane 1 |
| 8 | `Exiting / unassigned` segment for value held outside a portfolio | §4.2 item 4 | appears only when non-zero |
| 9 | Holdings by portfolio, collapsed: % of book / market value / cost basis / profit or loss / return | §4.2 item 5 | lane 1 |
| 10 | Per-name detail inside a portfolio: price, day change, shares, value, weight | §4.2 item 5 | click a portfolio row |
| 11 | Live prices by portfolio, with each portfolio's live value and weight | §4.2 item 7 | `LIVE PRICES` block under Holdings |
| 12 | Auto-refresh interval (default 60s) + manual refresh | §4.2 item 7 | top bar |
| 13 | `seed` flagging when Yahoo is unreachable | §4.2 item 7 | tag on affected values |
| **Model** ||||
| 14 | 27-metric catalog, 6 on by default | §4.3 catalog modal | `CATALOG · 6 OF 27` |
| 15 | Per-metric weight, auto-normalised | §4.3 metric rows | steppers |
| 16 | Metric direction (higher/lower is better) set automatically | §4.3 metric rows | the `↓`/`↑` glyph |
| 17 | Exception handling per metric: penalize / carry over / ignore | §4.3 metric rows | the three inline chips |
| 18 | Max weight per portfolio, auto-scaling as `1.5 ÷ n` | §4.3 `③` | slider row |
| 19 | Presets: save / load / delete / reset to the default six | §4.3 presets row | above `①` |
| 20 | Compute-from-statements toggle (default on) | §4.3 | secondary button |
| 21 | Compare sources (computed vs pulled) | §4.3 | secondary button |
| 22 | Target vs current drift table + allocation bar and legend | §4.3 right column | lane 2 |
| 23 | Per-portfolio metric tables, collapsed by default | §4.3 detail section | click a portfolio |
| 24 | Inline metric override — click a value and type your own | §4.3 detail section | click any cell |
| 25 | `↺` reset an override to live | §4.3 detail section | beside an overridden value |
| 26 | Source tags `prem` `qual` `calc` `ovr` `na` `live` `seed` | §4.3 detail section | on every value |
| 27 | Add a ticker to a portfolio (search by symbol or company) | §4.3 detail section | `ADD TICKER` |
| 28 | Remove a ticker from a portfolio | §4.3 detail section | per-name remove |
| 29 | Rename a portfolio | §4.3 detail section | `RENAME` |
| 30 | Recolour a portfolio | §4.3 detail section | `RECOLOUR` (see §2's ramp note) |
| 31 | Delete a portfolio | §4.3 detail section | `DELETE` |
| 32 | Create a portfolio (empty holds 0% until filled) | §4.3 detail section | `CREATE PORTFOLIO` |
| 33 | Restore the default portfolios | §4.3 detail section | `RESTORE DEFAULTS` |
| **Trade — rebalance** ||||
| 34 | First-run build from starting capital (default $80,000) | §4.7 first run | first sign-in |
| 35 | Add capital (default $4,000) | §4.4 left | the 62px input |
| 36 | Mode: full rebalance | §4.4 left | radio |
| 37 | Mode: deploy new cash only | §4.4 left | radio |
| 38 | Mode: realign only, no new money | §4.4 left | radio |
| 39 | The trade plan — which names to increase and decrease, with shares and amounts | §4.4 left | after `CALCULATE` |
| 40 | `Apply & save` → a version checkpoint | §4.4 right | commit button |
| 41 | Current holdings with per-name remove | §4.4 right | below the commit block |
| 42 | Cost basis, unrealised gain, book start date | §4.4 right | `BOOK` block |
| **Trade — research** ||||
| 43 | Live search of any listed name by symbol or company, incl. NYSE and ADRs | §4.4b step 1 | the search line |
| 44 | Debounce + stale-response guard | §4.4b step 1 | behavioural |
| 45 | **Open a searched name's financial detail without adding it anywhere** | §4.4b step 2 → §4.6 | click the result row |
| 46 | Add a searched name to the watchlist | §4.4b step 2 | `ADD TO WATCHLIST` |
| 47 | Watchlist quotes: last, change %, 52-week high/low, volume, average volume, P/E | §4.4b step 3 | lane 3, Research |
| 48 | **Open a watchlisted name's financial detail** | §4.4b step 3 → §4.6 | click the row name |
| 49 | `HELD` tag on names already in the book | §4.4b steps 2–3 | automatic |
| 50 | Remove from watchlist | §4.4b step 3 | per-row remove |
| 51 | Assign a watchlisted name to a portfolio | §4.4b step 4 | `ADD TO PORTFOLIO` |
| 52 | Choose: add as a new name **or** swap for a holding | §4.4b step 4 | the dialog |
| 53 | Review the resulting rebalance before saving | §4.4b step 4 | lands on the Rebalance sub-tab |
| 54 | Undo a swap restores both the holding and the prior membership | §4.4b step 4 | lane 4 |
| **Stock detail** ||||
| 55 | Three statements × the last four quarters + a TTM column | §4.6 | the panel |
| 56 | Computed-metrics panel: value, formula, and computed-vs-pulled source | §4.6 | the panel |
| 57 | Works for names you do not own | §4.6 | from a search result |
| **History** ||||
| 58 | Every build/rebalance is a checkpoint: date, mode, cash added, trade count, value before → after, delta | §4.5 ledger | lane 4 |
| 59 | Per-checkpoint allocation and full trade list | §4.5 right | select a checkpoint |
| 60 | Undo one checkpoint | §4.5 | `← UNDO` |
| 61 | Redo one checkpoint | §4.5 | `REDO →` |
| 62 | Revert to any past checkpoint | §4.5 | `REVERT TO HERE` |
| 63 | Git-style forking: applying from a reverted point drops the redo future | §4.5 | behavioural |
| 64 | Redoable futures visually distinct (outlined, dashed) | §4.5 ledger + chart | automatic |
| 65 | Recorded-value chart per checkpoint | §4.5 right | lane 4 |
| 66 | Reset portfolio | §4.5 | `RESET PORTFOLIO…` + confirm |
| 67 | Rolling retention of the 10 most recent checkpoints (E10) | §4.5 | behavioural |
| 68 | Wi-Fi data-sync card (iOS only, if native storage survives — see §10 open question 4) | §5 | iOS History |
| **Account and chrome** ||||
| 69 | Sign in | §4.8 | the gate |
| 70 | Create an account (+ captcha) | §4.8 | toggle on the gate |
| 71 | Forgot password | §4.8 | link on the gate |
| 72 | Legal / what-we-store link | §4.8 | link on the gate |
| 73 | One-time `portfolio.json` import when the account is empty | §4.7 | `IMPORT portfolio.json` |
| 74 | Save refused on a revision conflict, stated plainly, change stays on screen | §4.4 right | on save failure |
| 75 | Account unreachable → say so, never show a cached copy | global | on load failure |
| 76 | Delete own account (`sql/002`) | account menu | top-bar initials |
| 77 | Feedback (`sql/003`) | account menu | top-bar initials |
| 78 | First-run guides / page tours (E7) | §4.7 + per-lane | first visit, dismissible |
| 79 | Light/dark colour theme, persisted, OS default | E12.7 | top bar |
| 80 | Keyboard `1`–`4` lane nav, suppressed in inputs | §4.1 | keyboard |

If a row has no home in V3, that is a design gap — raise it rather than dropping the feature.

---

## 5. iOS — the same four lanes

The V2 baseline granted the platforms separate presentation layers. The owner has chosen **not** to
use that freedom: iOS gets the same IA, the same tokens, and the same components. What differs is
only what the platform forces.

| Web | iOS |
|---|---|
| Four lanes in the top bar | The same four as a **bottom tab bar**, 84px + `env(safe-area-inset-bottom)`, `border-top: var(--rule-strong)`, four equal cells divided by `--rule-hair`. Each cell: a 16×3 marker bar (`--accent` when active, transparent otherwise) above a `800 10px/.06em` label. **Text labels, no icons** — same rule as the web. Active cell tinted `--surface`. |
| Two-column screens | Stacked, single column, same order: left column first. |
| Stock panel / catalog modal | **Bottom sheets**, 640px tall, `border-top: 2px solid var(--ink)`, entering with a 300ms `translateY(100%)` on `cubic-bezier(.22,1,.36,1)`, over a `rgba(32,30,29,.38)` backdrop. |
| Hero 84px | Hero **46px**, `-.035em`. Chart 168px. Grid cells two-up. |
| Hover states | Deleted. Every hover-only affordance needs a resting state. |
| 6px signal rule | 5px, at the very top of the viewport, same colours. It is the one piece of chrome that earns its pixels on a phone. |
| — | **Minimum 44px hit targets.** The steppers become 34–40px squares with 44px touch padding; the tab cells are 84px tall. |
| — | Respect `viewport-fit=cover` and both safe-area insets. |

**Start APP2 by deleting, not adapting.** Every `.native .theme …` rule in the current CSS matches
nothing — V2 replaced the `.card.theme` / `.head` / `.lhs` / `.theme-grid` markup with the
`.thm` / `.thm-head` / `.thm-body` accordion. Baseline §6 is explicit: delete the V1 native CSS and
start from the token sheet. Also tokenise the native header and tab bar, which V1 hardcoded to light
colours.

`nativeFundamentals()` remains the one genuine native gap (it must mirror `server.py`'s ~21 E2
fields). Everything else reaches iOS through `npx cap sync ios`.

---

## 6. Delete these

Deleting is most of the work, and each item below is a source of the "randomly placed" feeling.
An implementer will otherwise keep them, because they are already there and already passing tests.

| Delete | Why |
|---|---|
| **The left rail** (`.rail`, `.navlink`, `.railsec`, `.brand` block) | 212px of permanent chrome holding five labels and a stat block. The lanes replace it. |
| **The panel / card metaphor** — `.panel`, `--shadow`, `--shadow-lift`, `.hoverable`, `transform:translateY(-2px)` on hover | Sections are separated by rules, not floated on cards. Nothing in this design elevates on hover. |
| **The donut** — `drawDonut()`, `.seg`, `.donut-hole`, `#donut`, `#donutLegend` | Replaced by the stacked bar + drift legend, which answers the actual question. |
| **Every nav icon** | Rule 4. Six icons total, none of them navigational. |
| **`--num-font`, `--row-pad`, `--panel-pad`, `--label-tt`, `--label-ls`** | These tokens existed only so the dark theme could be a *different design*. Density, casing and numerals are now theme-independent. |
| **The dark theme as it exists** | See below. |
| **`.pill`, `.skinsw`, `.search` (round)** and every `border-radius:99px` | `--radius` is 0 on purpose. |

### The dark theme

V2's dark theme is not a dark version of the light theme: it changes radius (16px → 5px), row padding
(13px → 7px), the numeric font (sans → mono), label casing, and the meaning of `--shadow`. It is a
second, denser design — precisely the terminal aesthetic the owner named as the thing to avoid.

**Do not port it.** Ship E12 light-only if that is faster, then rebuild dark as a **true inversion**
in E12.7: ground `#151413`, ink `#f3f2f2`, rules at inverse-ink 40%, `--accent` unchanged,
`--accent-700` → `--accent-400` for text on the dark ground, `--neg` lightened one OKLCH step. **Radius,
density, spacing, type scale and numerals stay byte-identical to light.** No component rule branches
on the portfolio; only token values change.

---

## 7. Regressions not to cause

Each of these cost real debugging time in E5. They are much cheaper to re-state than to re-find.

1. Transitioning the `background` **shorthand** over a `var()` sticks at the old colour on a portfolio
   swap — use the `background-color` **longhand**, and suppress transitions for one frame during the
   swap (`html.theme-switching`).
2. Clear that suppression on a **60ms timer, not `requestAnimationFrame`** — rAF is paused in
   background tabs, which would disable all motion permanently.
3. SVG `fill`/`stroke` baked to resolved hex don't recolour — bind to `var(--token)`.
4. Wide-screen media queries must be **last in the stylesheet** — equal-specificity base rules
   otherwise win and the query silently loses.
5. An `<svg>` `viewBox` whose aspect differs from its CSS box gets letterboxed; pointer maths against
   the bounding rect goes out of register — convert through `getScreenCTM()`.
6. A `keydown` handler on a container that calls `preventDefault()` swallows activation of any button
   inside it — guard on `e.target.closest("button,…")` first.
7. Accordion open-state keys round-trip through `dataset` as **strings** — compare as strings.
8. The context bar must refresh on the **price-refresh path**, not only on structural re-renders.
9. `valueHistory()` must respect the version **head**.
10. Clear chart scrub handlers when the chart empties.
11. Never renormalise current weights to the assigned subtotal.
12. A guard must come **before** the mutation it prevents, and must measure the thing it guards
    against (baseline §9 rules 6 and 7).
13. A token refresh is **not** an identity change (baseline §9 rule 3).

---

## 8. Card sequence

Each card must be working and clicked through in the browser before the next one starts.
Commit per card on `dev-v3ui`. Run `py -3 tools/check_syntax.py` and the Playwright suite each time.

| # | Card | Deliverable | Verify |
|---|---|---|---|
| 0 | **E12.0 Shell** | Token sheet replaces the `[data-theme]` blocks. Rail deleted. Top bar with four text lanes + accent underline + `1`–`4`. Context bar conditional on lane ≠ Portfolio. `.panel` / shadow / radius rules deleted. Light only. | `tests/navigation.spec.js`, `tests/mobileweb.spec.js`. No console errors. No radius > 0 in computed styles. |
| 0b | **E12.0b Sign-in gate** | §4.8. Markup + CSS only — every `gate*` element ID preserved, captcha mount unmoved, `autocomplete` attributes intact. | `tests/authlink.spec.js`, `tests/captcha.spec.js`, `tests/security.spec.js`. Sign in, create an account, fail a password, and confirm the button does not move when the error appears. |
| 1 | **E12.1 Overview** | `1D` default + the 6px signal rule + the day/range/all-time colour split (§2 rule 9); hero + honest period return + range strip; chart with dashed ink invested line (hidden on 1D) and scrub with number retarget; five-cell grid with the conditional accent action; allocation bar + drift legend; holdings accordion; checkpoint strip. Donut deleted. | `tests/daypl.spec.js`, `tests/sorting.spec.js`, `tests/within.spec.js`. Hero return at ALL equals the *All-time gain* cell exactly. |
| 2 | **E12.2 Model** | Metric rows with inline exception chips; catalog modal; cap row; target/drift column; per-portfolio accordions with overrides + source tags; statements toggle + compare sources. | `tests/weights.spec.js`, `tests/modelweights.spec.js`, `tests/engine.spec.js`. Engine diff is empty. |
| 3 | **E12.3 Trade** | Cash input; three modes as radios with consequence sentences; plan table; where-it-lands; commit button outside all nested scrolls; account-failure message in place. | `tests/engine.spec.js`. Manually: fail a save and confirm the change stays on screen. |
| 4 | **E12.4 Research + stock panel** | Search line, watchlist with 52-week track, add/swap flow, the 640px stock panel with formulas and the accent TTM column. | Manually: search → watchlist → swap → undo restores both the holding and the portfolio membership. |
| 5 | **E12.5 History** | Ledger with square markers; bar chart with dashed futures; selected detail; revert; reset. | `tests/history` behaviour: undo/redo/revert/fork. `valueHistory()` respects head. |
| 6 | **E12.6 First run** | The accent poster, three steps, capital, import. | `tests/firstrun.spec.js`, `tests/tour.spec.js`. |
| 7 | **E12.7 Dark** | True inversion. Same radius, density, type, numerals. | Both themes fully resolve on every surface; choice persists; OS preference is the default. |
| 8 | **APP2 iOS** | Bottom tab bar, stacked screens, sheets, 44px targets, safe areas, V1 native CSS deleted. | Builds and runs on a physical iPhone. Every baseline §4 capability reachable on-device. |

**Always test against the dev database** — `portfolio-dev` on port **8766** using `portfolio.dev.json`.
`portfolio.json` is real personal financial data: gitignored, never committed, and md5-checked against
`C:\dev\portfolio-builder-backups\` after any session that could have touched it.

Add this epic to `docs/board.json` and re-render with `py -3 tools/render_dashboard.py`.

---

## 9. Epic-level acceptance

- [ ] Every capability in `docs/V2_WEB_BASELINE.md` §4 is reachable — checked line by line, not assumed.
- [ ] **Every row of §4.9 is ticked.** Rows 45, 48 and 57 (opening a *searched* or *watchlisted* name's
      financial detail) and rows 19, 27–33 (presets and portfolio editing) have no pixel in the mockup
      and are the ones most likely to be lost.
- [ ] Nothing in the UI says "theme" — the user's groups are **portfolios** and lane 1 is **Overview**.
      `applyThemeCap`, `themes()` and the light/dark colour theme keep their names.
- [ ] No colour, radius, font or spacing value anywhere outside the §2 token block.
- [ ] No corner radius anywhere. No shadow on a non-floating element.
- [ ] Nav is text-only; the app ships at most six distinct icons.
- [ ] Spacing uses only 4 / 8 / 12 / 16 / 24 / 32.
- [ ] On every screen, the figure the screen is about is the largest element, at every width.
- [ ] The hero period figure is a return net of contributions, and equals the *All-time gain* cell at ALL.
- [ ] The invested reference line is present, ink, dashed, and labelled on every value chart.
- [ ] Commit buttons sit outside every nested scroll.
- [ ] Accent text ≤14px uses `--accent-700`; red appears only on a loss, a drift, a down day, or a destructive action.
- [ ] The app opens on `1D`. The signal rule, the Today figures and the context bar's Today cell all
      agree, and all three update on the price-refresh path.
- [ ] On a down day **every** accent surface is red — primary button, Rebalance cell, lane underline,
      brand square, tints, metric bars — and the allocation ramp plus every gain/loss figure are unchanged.
- [ ] Drift is signed: positive green, negative red. `Max drift` is ink with its sign shown.
- [ ] The gate and first-run screens are green regardless of the day.
- [ ] Every `gate*` element ID still exists and the auth flow works unchanged.
- [ ] Sign-in inputs are ≥44px tall and focus with the accent ring, never the browser default.
- [ ] `portfolio.json` round-trips unchanged; undo / redo / revert / fork still work.
- [ ] No console errors, no horizontal overflow; renders at 1024 / 1440 / 1800 and at 390 wide.
- [ ] The engine and `ds*` diff is empty.
- [ ] The iPhone app builds and runs.

---

## 10. How to run this with Claude Code

**Do not hand over the whole epic at once.** One card per session, in order, each ending in a commit
and a browser click-through by the owner.

### Session opener (paste verbatim, once)

> Read `docs/features/E12_v3-ui.md` in full, then `docs/V2_WEB_BASELINE.md` §4, §7 and §9, then
> `docs/features/E5_web-ui-overhaul.md` §3 and the *Conventions established* list. Do not write any
> code yet. Then tell me, in your own words: what is out of scope, what §6 says to delete, what the
> hero period figure must be computed against, and which rows of §4.9 have no pixel in the mockup. If
> any of those four is wrong I will correct you before we start.

That read-back is worth the tokens: the three things it asks about are the three an implementer gets
wrong by default (it refactors the engine, it keeps the rail and the cards because they exist, and it
computes the return as `last − first`).

### Per-card prompt

> Implement **E12.<n> <name>** only. Branch `dev-v3ui`.
> Acceptance is §4.<x> of `E12_v3-ui.md` **plus that card's rows in §4.9** — treat every sentence as a
> requirement, and list the §4.9 rows you implemented and any you could not.
> Constraints: only the §2 tokens; the §6 deletions apply to this card's surface; do not cause any of
> the §7 regressions; do not touch the engine or `ds*`; preserve every element ID you can, and list
> the ones you had to move.
> When it renders, run `py -3 tools/check_syntax.py` and `npx playwright test <the card's specs>`,
> then stop and tell me what to click. Do not start the next card.

### Rules for the session

1. **Card 0 alone first.** It is the riskiest change (it deletes the rail and rewrites the token
   block) and everything else depends on it being right.
2. **Give it §2 as a closed set.** "These are the only permitted values" is a much stronger
   instruction than "use the design system".
3. **Give it §6 as an explicit deletion list**, or it will keep the rail and the cards.
4. **Give it §7 as regressions to not cause**, framed as *already fixed once* — that framing stops it
   from "improving" the 60ms timer back into a `requestAnimationFrame`.
5. **Ask for the element-ID diff at the end of every card**, and the §4.9 row list. The 84 IDs are the
   contract that keeps the render and listener code working; a moved ID is the most likely source of a
   silent break, and an unticked §4.9 row is the most likely lost feature.
6. **Never let it merge to `main`.** The owner merges, after clicking through the whole epic.
7. If it proposes a change to a number, a policy, or a copy string that is not in this document, it
   should ask rather than choose — this file is the design of record.

### Still open — decide these before card 0

1. **Light-only for E12, or dark in the same epic?** Light-only is faster and E12.7 is a clean,
   separable card. Recommended: light-only.
2. **Portfolio colours** — adopt the `--portfolio-1..5` ramp (§2), or keep the user's picker and snap the hue
   onto the ramp's lightness steps? Recommended: adopt the ramp; add the picker back only if it is
   missed.
3. **The intraday series.** `1D` needs prev-close → now at some tick interval. `dsQuotes` already
   returns a previous close and a live price, which is enough for the *number* but not for a *line*.
   Decide: either draw 1D from points accumulated during the session (nothing persisted, resets on
   reload — cheap, and honest about being a session view), or add a `dsIntraday` adapter behind the
   same `ds*` seam. Do **not** fake it from the daily series. If neither is wanted, keep `1W` as the
   default range and colour the signal rule from the day figure alone — the mechanic still works, the
   chart just doesn't show today.
4. **iOS storage** — baseline §9 rule 1 flags this as needing a deliberate answer, not a copy-paste:
   is the native app **account-only** (and therefore needs a network to show anything), or does it
   keep on-device storage as its *primary* store for a single user? Do not reintroduce a mirror that
   shadows an account. This blocks APP2, not the web cards, so it can be answered later — but answer
   it before card 8, not during it.
