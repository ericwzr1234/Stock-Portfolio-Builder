# Stock Portfolio Builder — Project Board

_Updated 2026-08-24. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow · `E7` E7 · First-run onboarding · `E10` E10 · History retention · `APP` APP · iOS app · `E5` E5 · Web UI overhaul · `E6` E6 · Multi-user platform · `E11` E11 · Online, for invited users

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 1 |
| Design | 17 |
| Implementation | 0 |
| Testing | 0 |
| Refinement | 0 |
| Integration | 1 |
| Done | 68 |

---

## Ideation  (1)
_A half-baked idea; can be pushed further down once fleshed out._

- **E6.0** · _E6 · Multi-user platform_ — **Keep Phase 1 on the multi-user path (no build)** _(web + ios)_ · [spec](features/E6_multi-user-platform.md)
  - ROADMAP (2026-08-08): Phase 1 = solo sandbox, everything free (WE ARE HERE). Phase 2 = me + a handful of INVITED friends for feedback, centralised + secured + per-account, still free tier. Phase 3 = commercial launch, then discuss paid/licensed data APIs.
  - Today web and iOS CAN already share one book via opt-in LAN sync (useRemote -> the web's portfolio.json over Wi-Fi), but with no account, no password, no encryption, same-network only. Fine for one person; not a basis for Phase 2.
  - Cheap do-now items that cost nothing and prevent rework: keep the storage seam pure (UI never touches localStorage/fetch directly - an E5 invariant); add schemaVersion; add a monotonic revision + updatedAt on save; keep the engine free of I/O.
  - NOT being built now. No accounts, no backend, no database, no paid services in Phase 1.

## Design  (17)
_Detailed requirements captured; a spec exists in docs/features/._

- **E11.4** · _E11 · Online, for invited users_ — **Custom SMTP, so anyone but the owner can sign up** _(depends E11.3, web)_ · [spec](features/E11_online-deployment.md)
  - OWNER-BLOCKING and not a free-tier issue: Supabase's built-in mailer 'will refuse to deliver messages to addresses that are not part of the project's team', per their docs. Paying for Pro does NOT fix it. Custom SMTP does, and is available on the Free plan.
  - Gmail app password (no domain, ~500/day) or Resend plus SPF/DKIM/DMARC (needs a domain). Gmail first; the domain is the upgrade.
  - Gmail/Yahoo moved to PERMANENT 550 rejections for unauthenticated senders in Nov 2025, so a domain sender without SPF/DKIM/DMARC is worse than no domain at all.
  - Turnstile on signup - free, natively supported by Supabase. An unlisted URL still gets found by bots, and scripted signups burn the email quota and wreck sender reputation via bounces.
- **E11.7b** · _E11 · Online, for invited users_ — **Error monitoring (Sentry)** _(depends E11.3, web)_ · [spec](features/E11_online-deployment.md)
  - NOT STARTED - blocked on an account only the owner can create. Sentry's free Developer tier is 5k errors/month and needs no card.
  - WHY IT MATTERS: there are ~19 console.error calls that vanish into browsers nobody can see. Now that the app is deployed and reachable from a phone, a failure the owner hits away from the laptop leaves no trace at all.
  - When the DSN exists this is small: init early, and let it capture what already gets logged. Do not add a second error path.
- **APP2** · _APP · iOS app_ — **Rebuild the iOS app against the V2 web baseline** _(depends E5.5, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - DESIGN 2026-08-24: ideation CLOSED, broken into APP2.1-APP2.14. Spec: docs/features/APP2_ios-v2-rebuild.md. Interactive visual reference: docs/prototypes/APP2_phone_demo.html (open on a phone; design reference only - no engine, faked data).
  - OWNER DECISION D4 (2026-08-24): the phone uses SUPABASE for account-based data, exactly as web. The native app is therefore ACCOUNT-ONLY: no offline read, STORAGE_ADAPTERS.native (localStorage pb_portfolio_v1) and the LAN Wi-Fi sync are RETIRED, and a mirror must never come back - that hybrid is what produced the ~120 defects of E6-E9. This settles the question V2_WEB_BASELINE.md 9.1 flagged as needing a deliberate answer rather than a copy-paste.
  - OWNER DECISION D5 (2026-08-24): UI direction is ROBINHOOD - clean, simple, easy to follow - carrying identical content and features to V2 web.
  - STILL OPEN for the owner: (D6) market data via the deployed /api/* [recommended] vs keeping on-device Yahoo; the phone idle-timeout value [web signs out at 5 min]; and APP2.13 signing [free weekly re-sign vs paid].
  - START HERE: docs/V2_WEB_BASELINE.md — the definition of what the phone must carry. V2 web shipped to main 2026-08-15 (d2b7405); V1, INCLUDING the shipped iPhone app, is superseded.
  - DECISION (user, 2026-08-15): the iOS app does NOT have to look like the web app — platform constraints make a shared pixel design a poor fit — but it MUST carry the same content and features. Do not reconcile the old .native CSS with V2; it targets V1 markup that no longer exists. Delete it and rebuild from the baseline doc.
  - KNOWN + ACCEPTED V1 debt (audited, deliberately not fixed): every `.native .theme …` rule is dead after the accordion rewrite, so on the V1 phone build the metric table loses its frozen ticker column and phone cell density and the theme header cannot wrap; native header/tab bar also hardcode light colours so dark mode is wrong there.
  - DECISION (2026-08-08): the iPhone app does NOT have to copy the web UI — platform/Xcode constraints make a shared pixel-level design a poor fit. It MUST carry the same CONTENT and FEATURES.
  - So the shared layer is the engine + data layer + feature set; the presentation layer may legitimately diverge per platform. During E5 the phone keeps its current shipped native UI (the rail/context bar are web-only chrome).
  - Do this on the Mac with Xcode after E5 settles: re-verify every E5 capability exists on-device, then redesign the native presentation to suit the phone.
- **APP2.1** · _APP · iOS app_ — **Strip the dead V1 native skin** _(depends APP2, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Delete all 91 `.native` rules: they target V1 markup (.theme/.head/.lhs/.theme-grid) that the E5 accordion rewrite replaced, so they already match nothing. Owner decision 2026-08-15 was to delete, not repair.
  - Tokenise the native header and tab bar - V1 hardcodes light colours there, so dark mode is wrong on the phone.
  - This is the clean baseline every other APP2 ticket builds on.
- **APP2.2** · _APP · iOS app_ — **Native shell: tab bar, context bar, tokens, sheets** _(depends APP2.1, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Bottom tab bar for the five V2 sections (Overview/Model/Rebalance/Research/History); internal view ids stay prices/fundamentals/calc/screener/history.
  - Sticky CONTEXT BAR on every screen: Total value / Today / Invested / Gain / Max drift. It must refresh on the PRICE-REFRESH path, not only on structural re-renders - stale money beside live money was a real V2 bug.
  - Safe-area insets, bottom sheets, and light+dark through tokens: follow the OS by default, remember an explicit choice, and let no component rule branch on the theme.
  - Every form field at least 16px: iOS auto-zooms the whole page below that and throws every sheet oversized and off-screen. Fixed once in V1; must not regress.
- **APP2.3** · _APP · iOS app_ — **Account on device: Supabase auth** _(depends APP2.2, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - GoTrue over CapacitorHttp. The web calls Supabase with plain fetch and the publishable key, so it ports directly; only the publishable key ever ships - the secret key carries BYPASSRLS and must never enter the repo.
  - The login gate must FAIL CLOSED before any portfolio paint, as web does with its inline pre-paint script.
  - Session persistence and token refresh. A TOKEN REFRESH IS NOT AN IDENTITY CHANGE - counting it as one discarded a live portfolio on every stale reload.
  - OWNER DECISION needed: web signs out after 5 minutes idle, which is likely too aggressive on a phone. Alternatives are a longer window or Face ID re-unlock instead of sign-out.
- **APP2.4** · _APP · iOS app_ — **Storage: cloud-only on native** _(depends APP2.3, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Per D4 the account is the ONLY place a portfolio lives. Retire STORAGE_ADAPTERS.native and the LAN Wi-Fi sync on the phone.
  - Honour C1-C5: one context captured before the first await; one checkpoint after it; baseRevision is a server-confirmed revision or null and saving is refused while null; nothing about a portfolio is written to the device; a save returns true only if the write landed.
  - An unreachable account is REPORTED as unreachable and the user change stays on screen. Never show a cached copy, and DO NOT build a mirror.
  - A refusal must come BEFORE the mutation it prevents, and a guard must measure the thing it guards against - both rules were learned from data-loss findings.
  - Anything stored per-user on the device is keyed by uid and cleared on sign-out: RLS separates accounts, not devices.
- **APP2.5** · _APP · iOS app_ — **Market data via the deployed /api/*** _(depends APP2.2, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - GATED ON OWNER DECISION D6. Recommended: point ds* at https://portfolio-builder-esb.pages.dev/api/* through CapacitorHttp and DELETE the native Yahoo client (nativeQuotes/nativeFundamentals/nativeStatements/nativeSearch).
  - Why: E11 added the Cloudflare Worker as a second proxy, and E11.2b needed 1027 fields to match server.py. Keeping the native path means maintaining THREE proxies of one Yahoo surface forever, plus re-porting the E11.9 ETF quoteType guard and E11.10 local ticker search by hand. Porting logic ports its bugs.
  - CORS: the Worker sends NO CORS headers, so a browser fetch from a capacitor:// origin would fail - but CapacitorHttp is native HTTP and is not subject to CORS. It is already enabled in capacitor.config.json and must be the transport.
  - Cost accepted: the phone needs that origin reachable. D4 already requires the network for the portfolio, so this adds no new failure mode.
  - Bundle or lazy-load www/data/tickers.json so search stays local (11k+ symbols, zero network calls). NOTE: prod currently serves an older directory than main because the weekly workflow commits without deploying.
- **APP2.6** · _APP · iOS app_ — **Overview view** _(depends APP2.2, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Hero value, today move, all-time gain vs invested.
  - Value chart across every checkpoint from each version RECORDED valueAfter (never re-derived), with the Invested reference and the dashed equal-weight counterfactual. valueHistory() must respect the version HEAD: restoreVersion moves head but never truncates versions, so plotting the whole array charts undone checkpoints.
  - V2 two chart cards (value, and the $ / % return chart) collapse into ONE segmented chart - Value / Return % / Return $ - which keeps every feature and suits a phone. Legend and the honest note line are kept.
  - Allocation donut with a per-theme legend showing current %, target and drift pp. NEVER renormalise to the themed subtotal: value held outside a theme is an explicit Exiting / unthemed segment.
  - Four stat tiles, then holdings-by-theme collapsed by default, each showing % of book / Market value / Cost basis / Profit / loss / Return SPELLED OUT (the owner rejected abbreviations), expanding to per-ticker price, day change and value.
- **APP2.7** · _APP · iOS app_ — **Model view** _(depends APP2.2, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Drift table (theme / target / current / drift pp) and the stacked allocation bar with its cap annotations.
  - The model: 1 metrics and weights, 2 exception handling per metric (penalize / carry-over / ignore plus penalty value), 3 maximum weight per theme. Compute-from-statements toggle (default on), Compare sources, and the coverage note. Presets: save / load / delete / reset-to-default-6.
  - Per-theme metric tables: 7 columns at defaults, up to 27 fully loaded. Horizontal scroll with a FROZEN TICKER COLUMN - the V1 pattern the owner explicitly asked to keep. Inline click-to-edit overrides with reset-to-live and the prem / qual / calc / ovr / na / live / seed tags.
  - Metric picker (6 of 27 active) as a bottom sheet. Per-theme add ticker / rename and recolour / delete, and create theme. There is NO restore-defaults: E8 deleted default themes and that button, so do not rebuild noDefaults.
  - Accordion open state lives in module state so a background refresh never collapses what the user opened, and dataset keys round-trip as strings so they must be compared as strings.
- **APP2.8** · _APP · iOS app_ — **Rebalance view** _(depends APP2.2, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - First-run build flow (starting capital, then build initial portfolio) with its preview table, and the banner for a portfolio whose build was undone.
  - Add capital; modes full rebalance and new-cash-only; realign-only with no new money; the trade plan as a by-theme table plus per-stock instructions with buy/sell badges, amount, shares, price and value before to after; the amber warning when names will be sold to zero.
  - APPLY AND SAVE must never be buried in a nested scroll - dock it as an opaque action bar. A translucent sticky button reads as broken overlap; that was found in the prototype.
  - Current holdings with per-name remove, cost basis, unrealised gain and the portfolio start date. Applying creates a version checkpoint.
- **APP2.9** · _APP · iOS app_ — **Research view** _(depends APP2.2, APP2.5, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Inline local search over the bundled ticker directory: debounced, and the STALE-RESPONSE GUARD is kept so a newer keystroke supersedes an older result.
  - Watchlist quote table: last, change %, 52-week high and low, volume, average volume. The watchlist never touches the portfolio.
  - From the watchlist: pick a theme, then add as a new name OR swap for a holding, then review the rebalance before saving.
  - ETFs are researchable but can NEVER join a theme (E11.9). The guard sits above the first write in setMembership, because a refusal that has already mutated is not a refusal.
- **APP2.10** · _APP · iOS app_ — **History view + Account card** _(depends APP2.2, APP2.4, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Value-per-checkpoint chart, and every build or rebalance as a checkpoint: date, mode, cash added, trade count, value before to after with the delta, the per-theme allocation and the full trade list.
  - Undo / redo / revert-to-any-point with git-style forking - applying from a reverted point drops the redo future, and redoable futures are visually distinct. Rolling 10-checkpoint retention (E10).
  - Clear chart scrub handlers when the chart empties, or a reset portfolio still reports its old dollars.
  - Replace the V1 Wi-Fi data-sync card with an ACCOUNT card: signed in as, portfolio stored in your account only, export my data, sign out. The danger zone keeps Reset portfolio.
- **APP2.11** · _APP · iOS app_ — **Touch pass** _(depends APP2.6, APP2.10, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Chart scrubbing is MOUSE-ONLY on web (onmousemove / onmouseleave; there is no touchstart, touchmove or pointermove anywhere in www/index.html). The scrub is the only way to read any checkpoint but the last, so on a phone that data is unreachable today. Replace with pointer events.
  - Convert pointer maths through getScreenCTM(): an svg viewBox whose aspect differs from its CSS box is letterboxed, and bounding-rect maths goes out of register.
  - No information may live only in a title attribute or a hover state - the donut segments, the history bars and 48 other title attributes all need a tap affordance.
  - Tap-target audit at 44pt minimum, and check the keydown trap: a container handler calling preventDefault() swallows activation of any button inside it unless it guards on e.target.closest.
- **APP2.12** · _APP · iOS app_ — **Stock-detail sheet** _(depends APP2.7, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Ticker click-through from any view: header with price, market cap, TTM as-of, the computed-versus-pulled note and the ADR currency-mismatch tag.
  - The 27-metric grid, each tile showing value, formula and source tag.
  - Three financial statements across recent quarters plus TTM, each table scrolling independently with a FROZEN line-item column. That was the V1 fix and must be rebuilt against V2 markup.
- **APP2.13** · _APP · iOS app_ — **Signing and distribution** _(depends APP2.6, APP2.7, APP2.8, APP2.9, APP2.10, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - OWNER DECISION: free personal team (certs expire every 7 days, so a weekly Xcode re-run) versus a paid Apple Developer account at $99/yr (year-long certs plus TestFlight, no cable). Note that under D4 an in-place re-run no longer preserves anything on the device, because the portfolio lives in the account.
  - Known-good setup from APP1: the bundle id must be globally unique for a free team (com.ericwzr.portfoliobuilder123453, team 5F48K52NKV); a device must be connected once to mint a provisioning profile; Developer Mode on; trust the cert on first launch; and SKIP the Xcode Update to recommended settings prompt, because its User Script Sandboxing breaks the CocoaPods build. Full walkthrough in docs/IOS_BUILD.md.
  - CocoaPods needs LANG and LC_ALL set to en_US.UTF-8 or pod install throws a Unicode ASCII-8BIT error. Build from the clone OUTSIDE OneDrive.
- **APP2.14** · _APP · iOS app_ — **On-device verification** _(depends APP2.11, APP2.12, APP2.13, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Verify every item of the feature contract on a physical iPhone with live data - the same discipline APP1 used, which is how the CapacitorHttp numeric-param crash and the auto-zoom bug were both found.
  - Regression: theme CRUD, metric overrides, build then rebalance then apply, history undo / redo / revert forking, watchlist add and swap, ETF rejection, and both themes.
  - Account isolation on the device: sign-out clears everything keyed by uid, and a second account sees only its own portfolio.
  - Then APP2 to done, and update docs/APP_MIGRATION.md plus V2_WEB_BASELINE.md 9.1 to record the account-only outcome.

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

## Done  (68)
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
<details><summary><b>APP · iOS app</b> — 1 done</summary>

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
<details><summary><b>E11 · Online, for invited users</b> — 15 done</summary>

- **E11.0** — Spike: does Yahoo work from a Cloudflare IP · [spec](features/E11_online-deployment.md)
- **E11.1** — Nightly pg_dump, and a restore actually performed · [spec](features/E11_online-deployment.md)
- **E11.2a** — Worker: transport + quotes, search, peers · [spec](features/E11_online-deployment.md)
- **E11.2b** — Worker: fundamentals + statements · [spec](features/E11_online-deployment.md)
- **E11.9** — ETFs are researchable, never model members · [spec](features/E11_online-deployment.md)
- **E11.10** — Ticker search runs locally, and covers ETFs · [spec](features/E11_online-deployment.md)
- **E11.3a** — Pre-deploy hygiene: noindex, robots, build stamp · [spec](features/E11_online-deployment.md)
- **E11.11** — Fix: the guided-tour bubble was transparent · [spec](features/E11_online-deployment.md)
- **E11.12** — Fix: money scaled by sign instead of magnitude · [spec](features/E11_online-deployment.md)
- **E11.13** — Idle session timeout - sign out after inactivity · [spec](features/E11_online-deployment.md)
- **E11.3** — Deploy to Cloudflare Pages, same-origin /api/* · [spec](features/E11_online-deployment.md)
- **E11.5** — Export and delete: the user's own data, in their hands · [spec](features/E11_online-deployment.md)
- **E11.6** — Disclaimer and privacy note · [spec](features/E11_online-deployment.md)
- **E11.7a** — Feedback channel · [spec](features/E11_online-deployment.md)
- **E11.8** — Tests and CI · [spec](features/E11_online-deployment.md)

</details>
