# Stock Portfolio Builder — Project Board

_Updated 2026-06-26. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow · `APP` APP · iOS app parity · `E5` E5 · Web UI overhaul · `E6` E6 · Multi-user platform

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 5 |
| Design | 0 |
| Implementation | 1 |
| Testing | 3 |
| Refinement | 0 |
| Integration | 0 |
| Done | 35 |

---

## Ideation  (5)
_A half-baked idea; can be pushed further down once fleshed out._

- **E5.4** · _E5 · Web UI overhaul_ — **Research tab (replaces Screener)** _(depends E5.0, web)_
  - Ticker search, the watchlist quote table, the per-stock action sheet, and the add-vs-swap confirmation flow.
- **E5.5** · _E5 · Web UI overhaul_ — **History tab** _(depends E5.0, web)_
  - Checkpoint timeline, undo / redo / revert-to-here with the fork behaviour, value-at-checkpoint chart, reset portfolio, and the data-sync sheet.
- **APP2** · _APP · iOS app parity_ — **Redesign the iOS app against the new feature set** _(depends E5.5, ios)_
  - DECISION (2026-08-08): the iPhone app does NOT have to copy the web UI — platform/Xcode constraints make a shared pixel-level design a poor fit. It MUST carry the same CONTENT and FEATURES.
  - So the shared layer is the engine + data layer + feature set; the presentation layer may legitimately diverge per platform. During E5 the phone keeps its current shipped native UI (the rail/context bar are web-only chrome).
  - Do this on the Mac with Xcode after E5 settles: re-verify every E5 capability exists on-device, then redesign the native presentation to suit the phone.
- **E6.0** · _E6 · Multi-user platform_ — **Keep Phase 1 on the multi-user path (no build)** _(web + ios)_ · [spec](features/E6_multi-user-platform.md)
  - ROADMAP (2026-08-08): Phase 1 = solo sandbox, everything free (WE ARE HERE). Phase 2 = me + a handful of INVITED friends for feedback, centralised + secured + per-account, still free tier. Phase 3 = commercial launch, then discuss paid/licensed data APIs.
  - Today web and iOS CAN already share one book via opt-in LAN sync (useRemote -> the web's portfolio.json over Wi-Fi), but with no account, no password, no encryption, same-network only. Fine for one person; not a basis for Phase 2.
  - Cheap do-now items that cost nothing and prevent rework: keep the storage seam pure (UI never touches localStorage/fetch directly - an E5 invariant); add schemaVersion; add a monotonic revision + updatedAt on save; keep the engine free of I/O.
  - NOT being built now. No accounts, no backend, no database, no paid services in Phase 1.
- **E6.1** · _E6 · Multi-user platform_ — **Phase 2: accounts + hosted sync (free tier)** _(depends E6.0, web + ios)_ · [spec](features/E6_multi-user-platform.md)
  - The five gaps to close: identity (managed provider - never hand-roll password storage), server-side authorisation scoped to the authenticated user, HTTPS everywhere, conflict resolution via a monotonic revision + optimistic concurrency (one account editing on phone AND web), and a per-user storage row instead of one whole-file rewrite.
  - Add a FOURTH adapter behind the existing loadPortfolio/savePortfolio seam - the engine and UI should need no changes.
  - Includes a migration that imports the existing local portfolio.json into an account.
  - Starts only after E5 ships and the user explicitly opens Phase 2.

## Design  (0)
_Detailed requirements captured; a spec exists in docs/features/._

- _(none)_

## Implementation  (1)
_Being built on the dev branch._

- **E5.3** · _E5 · Web UI overhaul_ — **Rebalance tab (replaces Calculator)** _(depends E5.0, web)_
  - Initial build, add-cash, full / cash-only / realign modes, the trade plan, and Apply & save as a version checkpoint.

## Testing  (3)
_Built; waiting for you to try it._

- **E5.0** · _E5 · Web UI overhaul_ — **App shell — rail, context bar, theme tokens** _(web)_ · [spec](features/E5_web-ui-overhaul.md)
  - Approved from the clickable prototype (www/proto/newui.html): persistent left rail + a sticky context bar that keeps total value / today / invested / max drift on screen on EVERY page (today that context is lost the moment you leave Prices).
  - ONE design in TWO themes — ☀ Light / ☾ Dark (defaults to the OS setting, remembers the choice). Everything theme-dependent is a CSS token; no layout rule branches on the theme.
  - Gotchas already proven in the prototype: transition the `background-color` LONGHAND (the shorthand over a var() sticks at the old colour on a theme swap), and clear the transition-suppression class on a TIMER, not requestAnimationFrame (rAF is paused in background tabs and would disable all motion permanently).
- **E5.1** · _E5 · Web UI overhaul_ — **Overview tab (replaces Prices)** _(depends E5.0, web)_
  - Hero portfolio value + scrubable value-over-time area chart across the version timeline; theme breakdown donut; holdings table with per-row sparklines and live day-change.
- **E5.2** · _E5 · Web UI overhaul_ — **Model tab (replaces Fundamentals & Allocation)** _(depends E5.0, web)_
  - The biggest card — to be split into sub-steps: (a) metric weights + the 27-metric picker + exception handling + cap + presets; (b) targets/drift/allocation visuals + compute-from-statements toggle + source compare; (c) per-theme tables with inline overrides, source tags, per-theme add/rename/delete, and the stock-detail statement page.

## Refinement  (0)
_Tested but not yet approved; new instructions → back to Implementation._

- _(none)_

## Integration  (0)
_Approved; merging dev → main (prod) + updating docs._

- _(none)_

## Done  (35)
_Integrated into the product (on main)._

<details><summary><b>Core tool (shipped)</b> — 10 done</summary>

- **C1** — Themed 6-factor allocation model
- **C2** — Bad / missing data handling
- **C3** — Free live-data layer (Yahoo)
- **C4** — Calculator / Rebalance
- **C5** — Version history (undo / redo / revert)
- **C6** — Prices tab
- **C7** — Screener tab
- **C8** — Swap a stock in
- **C9** — Dynamic theme membership
- **C10** — Cross-platform: web + iOS

</details>
<details><summary><b>E1 · User-Defined Themes</b> — 9 done</summary>

- **E1.1** — Data-driven theme list (foundation) · [spec](features/E1.1_data-driven-themes.md)
- **E1.2** — Add / remove a ticker in a theme · [spec](features/E1.2_add-remove-ticker.md)
- **E1.3** — Ticker search & validate · [spec](features/E1.3_ticker-search.md)
- **E1.4** — Create a new theme · [spec](features/E1.4_create-theme.md)
- **E1.5** — Rename / recolour a theme · [spec](features/E1.5_rename-recolour.md)
- **E1.6** — Delete a theme / restore defaults · [spec](features/E1.6_delete-theme.md)
- **E1.7** — Similar-stock recommendations (peers of picks)
- **E1.8** — Seed recommendations from a new theme's name
- **E1.9** — Flat Screener: pooled recommendations + actions · [spec](features/E1.9_flat-screener-recommendations.md)

</details>
<details><summary><b>E2 · User-Defined Metrics</b> — 5 done</summary>

- **E2.1** — Data-driven metric list (foundation) · [spec](features/E2.1_data-driven-metrics.md)
- **E2.2** — Metric catalog + compute layer · [spec](features/E2.2_metric-catalog.md)
- **E2.3** — Choose your metrics (picker UI) · [spec](features/E2.3_metric-picker.md)
- **E2.4** — Per-metric direction & bad-data handling · [spec](features/E2.4_metric-direction-baddata.md)
- **E2.5** — Metric presets / reset to default 6 · [spec](features/E2.5_presets-reset.md)

</details>
<details><summary><b>E3 · Statement-Driven Data</b> — 5 done</summary>

- **E3.1** — Statement fetch + cache (server) · [spec](features/E3.1_statement-data-layer.md)
- **E3.2** — Computed-metric engine (client) · [spec](features/E3.2_computed-metric-engine.md)
- **E3.3** — Stock-detail page (UI) · [spec](features/E3.3_stock-detail-page.md)
- **E3.4** — Integration + source labeling + toggle · [spec](features/E3.4_source-integration.md)
- **E3.5** — Performance + iOS parity · [spec](features/E3.5_performance-ios.md)

</details>
<details><summary><b>E4 · Fundamentals & Screener workflow</b> — 5 done</summary>

- **E4.1** — Declutter the allocation-model panel
- **E4.2** — Per-theme actions in each theme's section
- **E4.3** — Split add flow — Fundamentals adds directly, Screener watchlists
- **E4.4** — Screener = search + watchlist; add-vs-swap confirmation
- **E4.5** — Allocation-model panel layout · [spec](features/E4.5_allocation-panel-layout.md)

</details>
<details><summary><b>APP · iOS app parity</b> — 1 done</summary>

- **APP1** — Bring the iOS app to parity with web (E1–E4.5) · [spec](APP_MIGRATION.md)

</details>
