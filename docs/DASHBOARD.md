# Stock Portfolio Builder — Project Board

_Updated 2026-08-16. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow · `E7` E7 · First-run onboarding · `E10` E10 · History retention · `APP` APP · iOS app parity · `E5` E5 · Web UI overhaul · `E6` E6 · Multi-user platform · `E11` E11 · Online, for invited users

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 2 |
| Design | 3 |
| Implementation | 0 |
| Testing | 0 |
| Refinement | 0 |
| Integration | 1 |
| Done | 66 |

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

## Design  (3)
_Detailed requirements captured; a spec exists in docs/features/._

- **E11.13** · _E11 · Online, for invited users_ — **Idle session timeout - sign out after inactivity** _(depends E6.4, web)_ · [spec](features/E11_online-deployment.md)
  - OWNER 2026-08-16: sign people out once they have been inactive for 2 minutes or more, for safety. NOT STARTED - captured at the end of the session.
  - WORTH CONFIRMING BEFORE BUILDING: 2 minutes is very short for an idle timeout. Reading the statements table, or thinking about a rebalance plan, routinely takes longer than that, so the likely experience is being signed out mid-thought several times an hour. 15 minutes is the usual floor for a finance tool. The owner said 2 minutes OR MORE, so the requirement is a minimum - worth agreeing the actual number first, and possibly making it a setting.
  - ACTIVITY MUST MEAN THE USER, NOT THE APP. The auto-refresh timer fires every 60s and must NOT count as activity, or the session never expires while a tab is open - which is exactly the case this exists to protect against. Count pointer, key, touch and visibility events only. Same class of mistake as a guard that does not measure the thing it guards against.
  - Warn before acting. A silent logout looks like a crash; a short countdown that any input cancels does not.
  - WHAT IS LOST: nothing already saved. Membership and rebalances persist immediately, and E9 means nothing about the portfolio is on the device anyway. The exception is an UNAPPLIED rebalance plan held in lastPlan - decide whether to warn about that specifically, or accept it.
  - The teardown already exists and is proven: lockOut() clears account state, stops timers and raises the gate. This ticket is the trigger, not the mechanism.
  - Consider whether it should apply while the tab is hidden (probably yes - an unattended screen is the risk) and whether the countdown should survive a reload.
- **E11.4** · _E11 · Online, for invited users_ — **Custom SMTP, so anyone but the owner can sign up** _(depends E11.3, web)_ · [spec](features/E11_online-deployment.md)
  - OWNER-BLOCKING and not a free-tier issue: Supabase's built-in mailer 'will refuse to deliver messages to addresses that are not part of the project's team', per their docs. Paying for Pro does NOT fix it. Custom SMTP does, and is available on the Free plan.
  - Gmail app password (no domain, ~500/day) or Resend plus SPF/DKIM/DMARC (needs a domain). Gmail first; the domain is the upgrade.
  - Gmail/Yahoo moved to PERMANENT 550 rejections for unauthenticated senders in Nov 2025, so a domain sender without SPF/DKIM/DMARC is worse than no domain at all.
  - Turnstile on signup - free, natively supported by Supabase. An unlisted URL still gets found by bots, and scripted signups burn the email quota and wreck sender reputation via bounces.
- **E11.7** · _E11 · Online, for invited users_ — **Error monitoring and a feedback channel** _(depends E11.3, web)_ · [spec](features/E11_online-deployment.md)
  - 19 console.error calls currently vanish into browsers nobody can see. Sentry free tier.
  - Feedback: a form writing to one Supabase table. No inbox, no SLA - the owner explicitly does not want a support channel.

## Implementation  (0)
_Being built on the dev branch._

- _(none)_

## Testing  (0)
_Built; waiting for you to try it._

- _(none)_

## Refinement  (0)
_Tested but not yet approved; new instructions → back to Implementation._

- _(none)_

## Integration  (1)
_Approved; merging dev → main (prod) + updating docs._

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
  - 2026-08-16: ALL E6-E10 CODE IS NOW MERGED TO main/prod. This ticket stays OPEN anyway, because it is a GATE on inviting people, not on shipping code, and all three owner-only actions (paid tier, custom SMTP, invite-only signup) are still outstanding. Signup is OPEN to anyone with the URL right now. The assistant cannot do any of the three - they are Supabase dashboard actions on the owner's account.
  - OWNER DECISION 2026-08-16 - all three DEFERRED, we are not in the testing phase yet: open signup is acceptable for now; custom SMTP and the paid tier will both be resolved when we move to paid at testing time. Interim plan for pausing: resume the project manually from the dashboard (Free projects pause after 7 days of low activity, restorable for up to 1 year - Dashboard > organization > project > Resume project). Better still, simply USING the app once a week is the activity that prevents the pause. This ticket stays open as the reminder, not because anything is broken.

## Done  (66)
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
<details><summary><b>E7 · First-run onboarding</b> — 2 done</summary>

- **E7.1** — Start fresh means a genuinely empty board · [spec](features/E7_first-run-onboarding.md)
- **E7.2** — Guided tour - one per view · [spec](features/E7_first-run-onboarding.md)

</details>
<details><summary><b>E10 · History retention</b> — 2 done</summary>

- **E10.1** — Keep only the last 10 checkpoints · [spec](features/E10_history-retention.md)
- **E10.2** — Undo must not silently discard theme/membership/watchlist edits · [spec](features/E10_history-retention.md)

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
<details><summary><b>E6 · Multi-user platform</b> — 7 done</summary>

- **E6.1** — Forward-compat: schemaVersion + revision + updatedAt · [spec](features/E6_database_design.md)
- **E6.2** — Extract a storage-adapter interface · [spec](features/E6_database_design.md)
- **E6.3** — Choose provider; stand up schema + row-level security · [spec](features/E6_database_design.md)
- **E6.4** — Login / register / logout + session handling · [spec](features/E6_database_design.md)
- **E6.5** — Cloud adapter with optimistic concurrency · [spec](features/E6_database_design.md)
- **E6.6** — Import local portfolio.json + cutover · [spec](features/E6_database_design.md)
- **E6.8** — Login landing page - sign-in required before anything · [spec](features/E6_database_design.md)

</details>
<details><summary><b>E11 · Online, for invited users</b> — 13 done</summary>

- **E11.0** — Spike: does Yahoo work from a Cloudflare IP · [spec](features/E11_online-deployment.md)
- **E11.1** — Nightly pg_dump, and a restore actually performed · [spec](features/E11_online-deployment.md)
- **E11.2a** — Worker: transport + quotes, search, peers · [spec](features/E11_online-deployment.md)
- **E11.2b** — Worker: fundamentals + statements · [spec](features/E11_online-deployment.md)
- **E11.9** — ETFs are researchable, never model members · [spec](features/E11_online-deployment.md)
- **E11.10** — Ticker search runs locally, and covers ETFs · [spec](features/E11_online-deployment.md)
- **E11.3a** — Pre-deploy hygiene: noindex, robots, build stamp · [spec](features/E11_online-deployment.md)
- **E11.11** — Fix: the guided-tour bubble was transparent · [spec](features/E11_online-deployment.md)
- **E11.12** — Fix: money scaled by sign instead of magnitude · [spec](features/E11_online-deployment.md)
- **E11.3** — Deploy to Cloudflare Pages, same-origin /api/* · [spec](features/E11_online-deployment.md)
- **E11.5** — Export and delete: the user's own data, in their hands · [spec](features/E11_online-deployment.md)
- **E11.6** — Disclaimer and privacy note · [spec](features/E11_online-deployment.md)
- **E11.8** — Tests and CI · [spec](features/E11_online-deployment.md)

</details>
