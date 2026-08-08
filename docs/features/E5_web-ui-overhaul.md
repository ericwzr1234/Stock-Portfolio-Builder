# E5 — Web UI overhaul  *(epic · in progress)*

- **Epic:** E5 · Web UI overhaul
- **Stage:** design approved → implementing on **`dev-newUI`**
- **Platform:** web (iOS handled separately — see §5)
- **Prototype:** [`www/proto/newui.html`](../../www/proto/newui.html) — clickable, mock data, both themes

## 1. What was decided

The user reviewed a clickable prototype of two proposed "directions" and correctly observed they were
**not two designs — they were one design in a light and a dark colour scheme.** The framing was dropped:

> **ONE design, TWO themes: ☀ Light / ☾ Dark.**

The design itself was approved as-is. The job now is to bring **the full legacy feature set** into it,
**tab by tab**, improving interactions where the new design clearly does it better (user's choice:
*"improve as I go"* — keep every capability, but don't slavishly reproduce a worse interaction).

## 2. The design

- **Persistent left rail** (Overview · Model · Rebalance · Research · History) with `1`–`5` keyboard nav.
- **Sticky context bar** — total value / today / invested / max drift stay on screen on *every* page.
  Today that context exists only on the Prices tab and is lost the moment you navigate away.
- **Real charts** where there are currently only numbers: allocation donut, scrubable value-over-time
  area, centred drift bars (left = underweight, right = overweight), per-row sparklines, checkpoint bars.
- **Motion with intent:** animated number counters, view cross-fades, hover elevation, green/red row
  flashes on live price ticks, loading skeletons instead of blank flashes.
- **Themeable by token only.** Every theme-dependent value (colour, radius, row density, numeric font)
  is a CSS custom property on `[data-theme]`. **No layout or component rule branches on the theme.**

## 3. How the port stays safe

The app is **2,472 lines**, **22 render/open functions**, **84 element IDs**.

- **The engine is not touched.** `computeAllocation`, `planTrades`, `applyRebalance`, `computeCarryover`,
  `applyThemeCap`, `stmtTTM`, `computedMetrics`, `rebuildFundamentals`, the metric catalog, the version
  timeline, and the entire `ds*` data layer are out of scope for E5.
- **The 84 element IDs are the contract.** Where the new markup preserves an ID, the existing render and
  listener code keeps working unchanged — the same technique that made E4.5 safe.
- Only **markup + CSS** are rewritten, plus the render functions that must emit richer output (charts).
- `portfolio.json` shape is unchanged, so version history and saved settings keep working.

## 4. Bugs already found and fixed in the prototype (they apply to the real app too)

1. **A theme swap left panels painting the old colours.** Cause: transitioning the **`background`
   shorthand** whose value comes from a `var()` — when the custom property changes, the transition sticks
   at the old value. **Fix:** transition the **`background-color` longhand**, and suppress transitions for
   one frame during the swap (`html.theme-switching`).
2. **The suppression class never cleared.** It was removed via `requestAnimationFrame`, which is paused in
   a background / non-compositing tab — leaving `transition:none !important` applied forever. **Fix:**
   clear it on a **60 ms timer** instead.
3. **Charts kept the old palette** because fills were baked to resolved hex at draw time. **Fix:** bind
   SVG `fill`/`stroke` to `var(--token)` so they recolour with the theme and need no redraw.

## 5. iOS — the platform split (decision, 2026-08-08)

> The iPhone app **does not have to copy the web UI.** Platform and Xcode constraints make a shared
> pixel-level design a poor fit. It **must carry the same content and features.**

So the sharing boundary moves: **engine + data layer + feature set are shared; the presentation layer may
diverge per platform.** During E5 the phone keeps the native UI it just shipped with — the rail and context
bar are **web-only chrome**. The iOS redesign is tracked separately as **APP2**, to be done on the Mac after
E5 settles, starting from a verification that every E5 capability exists on-device.

## 6. Sequence

| # | Card | Replaces | Status |
|---|------|----------|--------|
| 0 | **E5.0 Shell** — rail, context bar, theme tokens | — | design |
| 1 | **E5.1 Overview** | Prices | ideation |
| 2 | **E5.2 Model** (3 sub-steps) | Fundamentals & Allocation | ideation |
| 3 | **E5.3 Rebalance** | Calculator | ideation |
| 4 | **E5.4 Research** | Screener | ideation |
| 5 | **E5.5 History** | History | ideation |
| — | **APP2** iOS redesign | — | ideation (after E5) |

Each card must be working and verified in the browser before the next one starts. `dev` is frozen as the
archive of the legacy UI; `dev-newUI` is the working branch and becomes the path to prod.

## 7. Acceptance (epic-level)

- [ ] Every capability in the legacy app is reachable in the new UI — nothing lost.
- [ ] Light and dark both fully resolve on every surface; the choice persists; OS preference is the default.
- [ ] No console errors; no horizontal overflow; renders at narrow widths.
- [ ] `portfolio.json` round-trips unchanged; version history, undo/redo/revert still work.
- [ ] The iPhone app still builds and runs (its own UI) — no regression from E5.
