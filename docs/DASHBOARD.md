# Stock Portfolio Builder — Project Board

_Updated 2026-08-15. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow · `E7` E7 · First-run onboarding · `APP` APP · iOS app parity · `E5` E5 · Web UI overhaul · `E6` E6 · Multi-user platform

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 2 |
| Design | 0 |
| Implementation | 0 |
| Testing | 10 |
| Refinement | 0 |
| Integration | 0 |
| Done | 42 |

---

## Ideation  (2)
_A half-baked idea; can be pushed further down once fleshed out._

- **APP2** · _APP · iOS app parity_ — **Rebuild the iOS app against the V2 web baseline** _(depends E5.5, ios)_
  - START HERE: docs/V2_WEB_BASELINE.md — the definition of what the phone must carry. V2 web shipped to main 2026-08-15 (d2b7405); V1, INCLUDING the shipped iPhone app, is superseded.
  - DECISION (user, 2026-08-15): the iOS app does NOT have to look like the web app — platform constraints make a shared pixel design a poor fit — but it MUST carry the same content and features. Do not reconcile the old .native CSS with V2; it targets V1 markup that no longer exists. Delete it and rebuild from the baseline doc.
  - KNOWN + ACCEPTED V1 debt (audited, deliberately not fixed): every `.native .theme …` rule is dead after the accordion rewrite, so on the V1 phone build the metric table loses its frozen ticker column and phone cell density and the theme header cannot wrap; native header/tab bar also hardcode light colours so dark mode is wrong there.
  - DECISION (2026-08-08): the iPhone app does NOT have to copy the web UI — platform/Xcode constraints make a shared pixel-level design a poor fit. It MUST carry the same CONTENT and FEATURES.
  - So the shared layer is the engine + data layer + feature set; the presentation layer may legitimately diverge per platform. During E5 the phone keeps its current shipped native UI (the rail/context bar are web-only chrome).
  - Do this on the Mac with Xcode after E5 settles: re-verify every E5 capability exists on-device, then redesign the native presentation to suit the phone.
- **E6.0** · _E6 · Multi-user platform_ — **Keep Phase 1 on the multi-user path (no build)** _(web + ios)_ · [spec](features/E6_multi-user-platform.md)
  - ROADMAP (2026-08-08): Phase 1 = solo sandbox, everything free (WE ARE HERE). Phase 2 = me + a handful of INVITED friends for feedback, centralised + secured + per-account, still free tier. Phase 3 = commercial launch, then discuss paid/licensed data APIs.
  - Today web and iOS CAN already share one book via opt-in LAN sync (useRemote -> the web's portfolio.json over Wi-Fi), but with no account, no password, no encryption, same-network only. Fine for one person; not a basis for Phase 2.
  - Cheap do-now items that cost nothing and prevent rework: keep the storage seam pure (UI never touches localStorage/fetch directly - an E5 invariant); add schemaVersion; add a monotonic revision + updatedAt on save; keep the engine free of I/O.
  - NOT being built now. No accounts, no backend, no database, no paid services in Phase 1.

## Design  (0)
_Detailed requirements captured; a spec exists in docs/features/._

- _(none)_

## Implementation  (0)
_Being built on the dev branch._

- _(none)_

## Testing  (10)
_Built; waiting for you to try it._

- **E6.1** · _E6 · Multi-user platform_ — **Forward-compat: schemaVersion + revision + updatedAt** _(depends E6.0, web)_ · [spec](features/E6_database_design.md)
  - Add schemaVersion, a MONOTONIC revision, and updatedAt to the saved portfolio document. Local only - no backend, no vendor decision.
  - revision is the optimistic-concurrency token E6.5 needs; schemaVersion makes any future server-side migration mechanical.
  - Deliberately kept OUT of E5 so savePortfolio stayed byte-identical to prod for a provably safe merge. Do this FIRST.
- **E6.2** · _E6 · Multi-user platform_ — **Extract a storage-adapter interface** _(depends E6.1, web)_ · [spec](features/E6_database_design.md)
  - Formalise the existing loadPortfolio/savePortfolio seam into a named adapter interface so the cloud backend becomes a 4th implementation alongside web-file / iOS-localStorage / LAN-sync.
  - No behaviour change and no vendor decision - a pure refactor, verified by the app behaving identically.
- **E6.3** · _E6 · Multi-user platform_ — **Choose provider; stand up schema + row-level security** _(depends E6.2, web)_ · [spec](features/E6_database_design.md)
  - NEEDS USER INPUT (design doc S9): managed backend-as-a-service (recommended) vs self-hosting server.py + Postgres; acceptance that a public anon key in the client ends the 'no API keys' character; which region the data may live in; invite-only vs open registration.
  - Schema: one row per user - user_id, schema_version, revision, updated_at, data JSONB (exactly today's portfolio.json shape); RLS policy scoping every read/write to auth.uid().
  - Document-not-normalised on purpose: the version timeline (undo/redo/fork) is the trickiest logic in the app and must not be re-expressed as rows in the same step that introduces auth.
- **E6.4** · _E6 · Multi-user platform_ — **Login / register / logout + session handling** _(depends E6.3, web)_ · [spec](features/E6_database_design.md)
  - First real UI addition since E5. Use the provider's auth - never hand-roll password storage, reset or lockout.
  - Sign-out now clears every trace of the account (portfolio, revision, themes, watchlist, metrics, presets, weights, penalty, cap) - without it a different, empty account was offered the previous user's book to import. Verified with per-account markers across repeated sign-in cycles.
  - A session that dies mid-use (revoked/expired refresh token, paused project) now re-gates the app. It used to keep running unauthenticated: the adapter fell through to the identity-free store and the next save wrote the account's portfolio over the shared server file.
- **E6.5** · _E6 · Multi-user platform_ — **Cloud adapter with optimistic concurrency** _(depends E6.4, web)_ · [spec](features/E6_database_design.md)
  - Every save carries the revision it was based on; the server updates only if it still matches, else 409 Conflict.
  - On conflict, reload the server copy and tell the user plainly - financial records must NEVER be auto-merged.
  - Keep a local mirror after every successful save (the iOS LAN-sync adapter already does this) so offline reads work and the cloud is not a single point of failure.
  - HARDENED over three review rounds. baseRevision holds only a SERVER-CONFIRMED revision (null means saving is refused); the offline mirror moved off STORE_KEY to pb_cloud_mirror_<uid>; savePortfolio() returns true/false; kept-aside work is stashed AND readable back. Contract: E6_database_design.md sections 16-17.
  - Stashing decides by CONTENT, not revision number: two devices editing from the same base both stamp base+1, so the old 'mirror revision is not ahead' test discarded genuine offline work. Verified live: divergent edits at equal revisions are kept, distinct edits both survive, identical repeats dedupe.
  - ROUND 5 (2026-08-15) = NOT CONVERGED: 3 defects that lose data or cross accounts, 2 of them regressions from round 4's own fixes. Fixed but NOT yet re-verified. (a) loadPortfolio's FAILURE branch had no session guard, so a stalled request from a signed-out user hydrated that account's mirror into the next user's session; (b) dropMirror ignored stashUnsyncedMirror's 'failed' sentinel and deleted the only copy of an unsaved edit; (c) 'Start fresh' resolved its modal before its own INSERT, letting a stash restore interleave and drop a document that was never written.
  - DO NOT MERGE until a sixth review round comes back converged. Findings per round so far: 36, 30, 19, 6, 3 - and EVERY round has contained defects introduced by the previous round's fix. The invariants and the failure that motivated each one are in E6_database_design.md sections 16-18.
  - ROUND 6 (2026-08-15) = NOT CONVERGED. The critical one was a guard measuring the wrong thing: sbEpoch bumped on EVERY session write, and a token refresh is one - so on the commonest path in the app (any reload more than an hour after signing in) the 401 -> refresh -> retry succeeded and then stale() threw the recovered portfolio away. The user saw 'No portfolio yet' over a live account and their first click blanked the offline mirror. Now the epoch tracks USER IDENTITY only. Verified live: expired-token reload restores 25 holdings at revision 19, mirror intact.
  - ROUND 7 (2026-08-15) = NOT CONVERGED: 5 findings, 2 again regressions from round 6. (a) HIGH - the epoch guard round 6 put on the mirror write meant a session REJECTED DURING a save skipped the rescue entirely, so the commonest way to lose a session also lost the edit while the toast said it was kept; now the work goes to the owner's stash without resurrecting the plaintext mirror. (b) MEDIUM - 'dirty' and 'could not be filed' were the same bit, so an ordinary failed-then-retried save filed its own ancestor as unsaved work and restoring it reverted the account; they are now separate bits. Plus: a restored stash is consumed by the first successful save, and nativeSavePortfolio now throws instead of reporting success on a full localStorage.
  - E8 REWRITE (2026-08-15): after 7 patch rounds and ~96 defects with a regression rate that never fell, loadPortfolio/_savePortfolioInner/the cloud adapter were rewritten around ONE context and ONE checkpoint (contract C1-C5, stated once). Six audits of the rewrite found 7/6/4/1/5/6 - the core loop held throughout; almost every finding was in the kept-aside recovery subsystem.
  - E9 (2026-08-15, OWNER'S DECISION): NOTHING about a portfolio is written to the device. Deleted the mirror, the dirty/unfiled bits, the unsynced/conflict stashes, the recovery prompt and 11 functions. A save that cannot reach the account did not happen and says so; an unreachable account is reported, not replaced by a cached copy. purgeLegacyLocalCopies() clears anything earlier versions left behind. COST: reverses E6.8's 'a stored session keeps working while the backend is paused' - during a free-tier pause the app cannot show the portfolio.
- **E6.6** · _E6 · Multi-user platform_ — **Import local portfolio.json + cutover** _(depends E6.5, web)_ · [spec](features/E6_database_design.md)
  - On first login with an empty account, offer to import the local file as-is. Keep portfolio.json on disk untouched as the pre-migration backup.
  - Import re-checks for an existing row, hydrates through the SAME path a normal load uses (it previously uploaded a book stripped of themes, watchlist, metrics, presets, cap, weights and penalty), and fails loudly instead of reporting success. 'Empty account' now means no row - not a holdings count of zero.
  - Cross-user guards verified as a truth table: claimed by another account, not offered; account read failed, not offered; clean and unclaimed, offered; claimed by me, offered. pb_portfolio_v1 stayed byte-identical (18,871 bytes) through every test.
- **E6.8** · _E6 · Multi-user platform_ — **Login landing page - sign-in required before anything** _(depends E6.4, web)_ · [spec](features/E6_database_design.md)
  - USER REQUEST (2026-08-15): a proper log-in landing page. Nobody reaches the app without signing in first.
  - This CHANGES THE APP'S CHARACTER: today it runs fine signed-out on local storage. With a hard gate, no account = no app, and the local portfolio.json path becomes reachable only through the E6.6 import.
  - OPERATIONAL RISK to design around: the free tier PAUSES after a week idle. A naive gate would lock the user out of their own portfolio whenever the backend is asleep or offline. So: a VALID STORED SESSION must still open the app against the local mirror when the backend is unreachable — the gate blocks strangers, it must not block the owner during an outage.
  - Sign out returns to the landing page.
  - The gate is visible in markup and taken down pre-paint only when a stored session exists, so the page fails closed if a boot fetch hangs. It lifts only AFTER the account's data has loaded - previously a new user saw the previous user's holdings for the seconds boot spent on the network.
  - init() and the sign-in path now share one boot function; they had drifted, so reloading the page skipped the sync badge, the import offer and the kept-aside-work prompt.
- **E6.7** · _E6 · Multi-user platform_ — **Security review - GATE before inviting anyone** _(depends E6.6, web)_ · [spec](features/E6_database_design.md)
  - Prove isolation with a SECOND account: cross-user read/write must fail at the DATABASE, not just in the UI.
  - Confirm no service key ships in the client bundle, TLS is enforced end to end, and delete-account removes the row.
  - No tester is invited until this passes.
  - THREE adversarial review rounds over E6.4-E6.8. Round 1: 36 confirmed. Round 2: 30 more, including three HIGH data-loss paths INTRODUCED by the round-1 fixes (lockOut cleared the very state its own save guards read). Engine re-verified untouched after every round - 28 functions byte-identical to main.
  - Proven live, not by inspection: a session dying mid-save with another save queued behind it writes NOTHING to the shared /api/portfolio (0 writes; portfolio.dev.json byte-identical) and both edits are rescued; a forged session with no refresh token cannot pass the gate or reach the offline mirror.
  - OUTSTANDING, needs the dashboard: (1) check 6, confirm account deletion cascades; (2) custom SMTP before ANY invite (the built-in sender is capped at 2 emails/hour); (3) flip signup to invite-only. See sql/ISOLATION_TEST.md.
  - Round 5 verdict: NOT CONVERGED. The gate for inviting anyone is therefore still CLOSED, independently of the three outstanding Supabase dashboard actions.
  - Check 6 is now PARTLY evidenced: the owner registered a real account with email confirmation, deleted it, and the DB shows the account gone with ZERO orphaned rows. Still not decisive - both remaining rows belong to the two test accounts, so we cannot tell whether the deleted account ever had one. To close it: delete test-b (confirmed to hold a row, revision 2 / 4 checkpoints) and re-run the count - portfolio_rows must drop 2 -> 1. See sql/ISOLATION_TEST.md.
  - CHECK 6 CLOSED 2026-08-15: the owner listed the rows (test-a rev 19 / 3 checkpoints, test-b rev 2 / 4 checkpoints), deleted test-b, and portfolio_rows dropped 2 -> 1 with orphaned_rows still 0. That is on-delete-cascade firing on a row KNOWN to exist, not a vacuous zero. **The isolation gate is now 8 of 8.**
  - NOTE: test-b@example.com no longer exists. Any future cross-account test needs a second account created from the dashboard (the assistant does not create accounts). test-a@example.com / Test@1234 survives.
  - REMAINING before inviting anyone: custom SMTP (built-in sender is capped at 2 emails/hour, so invites and password resets stall) and flipping signup to invite-only (currently OPEN - the owner's own registration with a real email confirmed that).
  - PRE-TESTING (owner, 2026-08-15): move Supabase to a PAID tier before formal testing. Free projects pause after a week idle and, since E9 removed every local copy, a paused project means testers see nothing rather than a cached portfolio. This retires the old E6.8 requirement that a stored session must keep working while the backend is asleep. Remaining pre-invite items: custom SMTP (built-in sender is 2 emails/hour) and invite-only signup.
- **E7.1** · _E7 · First-run onboarding_ — **Start fresh means a genuinely empty board** _(depends E6.6, web)_ · [spec](features/E7_first-run-onboarding.md)
  - USER-FOUND (2026-08-15): choosing Start fresh still showed the five built-in themes with no stocks in them, and a donut of target weights computed over themes the user never chose.
  - Cause: state.themes=null MEANS 'use the defaults', and Start fresh left it null. Fixed with an explicit, persisted noDefaults flag rather than by changing what null means - every existing portfolio relies on that meaning, so no existing document changes behaviour.
  - Empty states added: Model shows 'No themes yet' with Create your first theme / Use the built-in 5 / Show me how; Rebalance says 'Build your themes first'; the context bar points at Model instead of Rebalance; the donut already said 'No themes yet'. defaultCap() guards the 1.5/N division against zero themes.
  - Start fresh now lands the user on Model with the guide open, because that is where a portfolio actually starts.
  - E8: there are no default themes at all now (owner's decision) - the 5 built-ins were a single-user legacy. themes() is simply the list; 'Restore default 5' is deleted; deleting your last theme is allowed. Pre-E8 documents are migrated once, keyed on schemaVersion, handling the theme list and the membership independently (they were separate fallbacks) and covering version snapshots.
- **E7.2** · _E7 · First-run onboarding_ — **Guided tour - one per view** _(depends E7.1, web)_ · [spec](features/E7_first-run-onboarding.md)
  - USER REQUEST (2026-08-15): floating-bubble prompts that walk a first-time user through creating their first portfolio, one guide per page.
  - Five tours: Model (7 steps: create a theme, add tickers, choose metrics, weight them, bad-data policy, cap, targets), Overview (4), Rebalance (4), Research (2), History (2).
  - Anchored to real controls. The ring is drawn by an OVERLAY, not by restyling the target - restyling would move the very element being pointed at. Steps whose anchor is not on screen are skipped, so a tour written for a full board still reads correctly on an empty one.
  - Shown once per ACCOUNT per view (pb_tour_<uid>_<view>), so a second person on the same browser gets their own walkthrough. Replay any time from the ? button in the header. Switching views ends the tour.
  - Verified: all five run end to end, bubbles stay on screen, rings anchor, full teardown with no leftover DOM, seen tours do not reappear, a fresh user auto-opens.
  - FIRST REVIEW (2026-08-15) found 10, incl. a CRITICAL of my own making: restoreDefaultThemes() never cleared noDefaults, so on a start-fresh account the always-visible 'Restore default 5' button DELETED the user's themes and restored nothing, while toasting success. themes/noDefaults now move together through useDefaultThemes()/useNoThemes(). Also fixed: a tour could outlive its session and be inherited by the next account (its Done then wrote 'seen' against the WRONG uid); the bubble covered modals (a modal now stands the tour down via MutationObserver); Back could not step past a skipped step; a zero-height anchor could be ringed; the calc tour was a silent dead button on an empty board; and impNo started the tour twice.

## Refinement  (0)
_Tested but not yet approved; new instructions → back to Implementation._

- _(none)_

## Integration  (0)
_Approved; merging dev → main (prod) + updating docs._

- _(none)_

## Done  (42)
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
<details><summary><b>E5 · Web UI overhaul</b> — 7 done</summary>

- **E5.0** — App shell — rail, context bar, theme tokens · [spec](features/E5_web-ui-overhaul.md)
- **E5.1** — Overview tab (replaces Prices)
- **E5.2** — Model tab (replaces Fundamentals & Allocation)
- **E5.3** — Rebalance tab (replaces Calculator)
- **E5.4** — Research tab (replaces Screener)
- **E5.5** — History tab
- **E5.6** — Equal-weight benchmark + return chart

</details>
