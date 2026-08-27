# Stock Portfolio Builder — Project Board

_Updated 2026-08-24. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow · `E7` E7 · First-run onboarding · `E10` E10 · History retention · `APP` APP · iOS app · `E5` E5 · Web UI overhaul · `E6` E6 · Multi-user platform · `E11` E11 · Online, for invited users

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 1 |
| Design | 13 |
| Implementation | 0 |
| Testing | 0 |
| Refinement | 0 |
| Integration | 1 |
| Done | 75 |

---

## Ideation  (1)
_A half-baked idea; can be pushed further down once fleshed out._

- **E6.0** · _E6 · Multi-user platform_ — **Keep Phase 1 on the multi-user path (no build)** _(web + ios)_ · [spec](features/E6_multi-user-platform.md)
  - ROADMAP (2026-08-08): Phase 1 = solo sandbox, everything free (WE ARE HERE). Phase 2 = me + a handful of INVITED friends for feedback, centralised + secured + per-account, still free tier. Phase 3 = commercial launch, then discuss paid/licensed data APIs.
  - Today web and iOS CAN already share one book via opt-in LAN sync (useRemote -> the web's portfolio.json over Wi-Fi), but with no account, no password, no encryption, same-network only. Fine for one person; not a basis for Phase 2.
  - Cheap do-now items that cost nothing and prevent rework: keep the storage seam pure (UI never touches localStorage/fetch directly - an E5 invariant); add schemaVersion; add a monotonic revision + updatedAt on save; keep the engine free of I/O.
  - NOT being built now. No accounts, no backend, no database, no paid services in Phase 1.

## Design  (13)
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
  - OWNER DECISIONS D6-D8 (2026-08-24), all three open questions now CLOSED: (D6) the phone KEEPS FETCHING YAHOO DIRECTLY on-device via CapacitorHttp - it is Yahoo on every platform, since the web app cannot call Yahoo from a browser (no CORS on Yahoo endpoints) and server.py/the Worker are only proxies; the phone is the one platform that CAN call Yahoo directly, and keeping it means the Cloudflare Pages origin being down or drifting cannot stop the phone pricing a portfolio. (D7) phone idle timeout is 15 MINUTES, web stays at 5. (D8) FREE personal-team signing for now, revisit a paid account at the production/testing stage.
  - START HERE: docs/V2_WEB_BASELINE.md — the definition of what the phone must carry. V2 web shipped to main 2026-08-15 (d2b7405); V1, INCLUDING the shipped iPhone app, is superseded.
  - DECISION (user, 2026-08-15): the iOS app does NOT have to look like the web app — platform constraints make a shared pixel design a poor fit — but it MUST carry the same content and features. Do not reconcile the old .native CSS with V2; it targets V1 markup that no longer exists. Delete it and rebuild from the baseline doc.
  - KNOWN + ACCEPTED V1 debt (audited, deliberately not fixed): every `.native .theme …` rule is dead after the accordion rewrite, so on the V1 phone build the metric table loses its frozen ticker column and phone cell density and the theme header cannot wrap; native header/tab bar also hardcode light colours so dark mode is wrong there.
  - DECISION (2026-08-08): the iPhone app does NOT have to copy the web UI — platform/Xcode constraints make a shared pixel-level design a poor fit. It MUST carry the same CONTENT and FEATURES.
  - So the shared layer is the engine + data layer + feature set; the presentation layer may legitimately diverge per platform. During E5 the phone keeps its current shipped native UI (the rail/context bar are web-only chrome).
  - Do this on the Mac with Xcode after E5 settles: re-verify every E5 capability exists on-device, then redesign the native presentation to suit the phone.
- **APP2.3** · _APP · iOS app_ — **Account on device: Supabase auth** _(depends APP2.2, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - GoTrue over CapacitorHttp. The web calls Supabase with plain fetch and the publishable key, so it ports directly; only the publishable key ever ships - the secret key carries BYPASSRLS and must never enter the repo.
  - The login gate must FAIL CLOSED before any portfolio paint, as web does with its inline pre-paint script.
  - Session persistence and token refresh. A TOKEN REFRESH IS NOT AN IDENTITY CHANGE - counting it as one discarded a live portfolio on every stale reload.
  - OWNER DECISION D7 (2026-08-24): the phone idle timeout is 15 MINUTES; web stays at 5. Keep a visible warning before it fires, as web does for its last 30 seconds.
- **APP2.4** · _APP · iOS app_ — **Storage: cloud-only on native** _(depends APP2.3, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Per D4 the account is the ONLY place a portfolio lives. Retire STORAGE_ADAPTERS.native and the LAN Wi-Fi sync on the phone.
  - Honour C1-C5: one context captured before the first await; one checkpoint after it; baseRevision is a server-confirmed revision or null and saving is refused while null; nothing about a portfolio is written to the device; a save returns true only if the write landed.
  - An unreachable account is REPORTED as unreachable and the user change stays on screen. Never show a cached copy, and DO NOT build a mirror.
  - A refusal must come BEFORE the mutation it prevents, and a guard must measure the thing it guards against - both rules were learned from data-loss findings.
  - Anything stored per-user on the device is keyed by uid and cleared on sign-out: RLS separates accounts, not devices.
- **APP2.5** · _APP · iOS app_ — **Verify the on-device Yahoo client** _(depends APP2.2, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - OWNER DECISION D6 (2026-08-24): the phone KEEPS fetching Yahoo DIRECTLY on-device via CapacitorHttp, as V1 did. This is a VERIFY ticket, not a rewrite.
  - The framing that matters: it is Yahoo Finance on every platform. The web app cannot call Yahoo from a browser because Yahoo sends no CORS headers - that is the entire reason server.py (dev) and worker/src/index.js (prod) exist, as proxies fetching Yahoo on its behalf. The phone is the one platform that CAN call Yahoo directly, because CapacitorHttp is native HTTP and is not subject to CORS.
  - Why keep it: no dependency on the Cloudflare Pages origin. Under D4 the phone needs the network for the portfolio, but that is SUPABASE - so Pages being down, renamed or drifting cannot stop the phone pricing a portfolio. And V1 already proved this path on a physical iPhone with live data, so it is zero new code.
  - Accepted cost: three implementations of one Yahoo surface stay in sync - server.py, the Worker, and the native client. E11.2b confirmed the native JS client ALREADY mirrors server.py exactly. Police any future field change with py -3 tools/diff_proxy.py, and remember that porting logic ports its bugs (the search tie-break was fixed in Python and reintroduced identically in JS the same afternoon).
  - OWNER CAVEAT, answered: does calling Yahoo directly risk a lockout? The evidence says direct is the SAFER side. E11.0 existed to test the OTHER direction and recorded that Yahoo deployed TLS fingerprinting in Apr 2025 and a WORKER cannot control its TLS fingerprint - a datacenter IP with an uncontrollable fingerprint, versus a real iPhone on a residential/carrier IP presenting a stock iOS fingerprint. A proxy also CONCENTRATES all users onto a few shared Cloudflare IPs, so one throttle breaks everyone; a device distributes the load and looks like a person browsing Yahoo. Measured 2026-08-24 from a residential IP through server.py, the same call pattern the phone uses: 100 Yahoo calls in about 4 seconds (forced 25-name fundamentals x3 plus 25-name statements) returned 25/25 live every run with ZERO throttle signals. Y_CONCURRENCY is capped at 4, so the phone never bursts harder. V1 already ran this path on a physical iPhone with live data.
  - FALLBACK if Yahoo ever does lock out direct device calls: this is not a one-way bet. The Worker keeps existing for the web app and the ds* layer already branches, so pointing the phone at the deployed /api/* is a small localised change. APP2.14 must watch for throttling during on-device verification. Degradation is already graceful - the f4eb179 hardening rejects an error body as a crumb, forces a crumb refresh, and falls back to seed rather than crashing.
  - Scope: confirm nativeQuotes/nativeFundamentals/nativeStatements/nativeSearch still match field-for-field on device; keep EVERY CapacitorHttp param stringified (numbers cast-crash NSCFNumber to NSString - the V1 crash); keep search on the local ticker directory www/data/tickers.json, which is client-side and needs no proxy on either platform; and confirm quoteType still arrives so the ETF never-a-theme-member guard holds.
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
- **APP2.12** · _APP · iOS app_ — **Stock-detail sheet** _(depends APP2.7, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - Ticker click-through from any view: header with price, market cap, TTM as-of, the computed-versus-pulled note and the ADR currency-mismatch tag.
  - The 27-metric grid, each tile showing value, formula and source tag.
  - Three financial statements across recent quarters plus TTM, each table scrolling independently with a FROZEN line-item column. That was the V1 fix and must be rebuilt against V2 markup.
- **APP2.13** · _APP · iOS app_ — **Signing and distribution** _(depends APP2.6, APP2.7, APP2.8, APP2.9, APP2.10, ios)_ · [spec](features/APP2_ios-v2-rebuild.md)
  - OWNER DECISION D8 (2026-08-24): stay on the FREE personal team for now, accepting 7-day certs and a weekly Xcode re-run. Upgrade to a paid Apple Developer account ($99/yr: year-long certs plus TestFlight, no cable) at the production/testing stage. Note that under D4 a re-run no longer needs to preserve anything on the device, because the portfolio lives in the account.
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
  - ROUND 6 (2026-08-27) - the first pass over the CLIENT surface; rounds 1-5 were the data layer. Found a real stored XSS: the app had NO escaping helper at all and 49 template interpolations dropped free text straight into innerHTML. PROVEN by executing it, not by reading: a theme name of <img src=x onerror=...> fired SEVEN times per render, and the Supabase session token sits in localStorage where any injected script reads it - so XSS meant account takeover.
  - Severity, stated honestly: in the normal flow it is SELF-XSS - you have to type the payload into your own theme name, and no path shows one account's strings to another (no sharing, no file import, feedback has no select policy). The latent third-party path is the ticker directory: build_ticker_directory.py does no validation and the weekly bot refreshes it, so one upstream row containing < would have reached innerHTML in every user's browser. Today's data is clean - 0 angle brackets, 0 double quotes across 11,317 entries.
  - Fixed at the SINK with esc(), not on input - input-escaping corrupts the stored value and double-escapes on every re-save. tests/security.spec.js proves both halves: hostile markup is inert AND ordinary names like 'Robotics & AI' still read back exactly, because an over-eager escape showing users '&amp;' is also a defect. Two of the five fail against the pre-fix code.
  - Because escaping is now at every sink, input validation in the ticker builder is NOT needed - it would be a second guard on a closed hole.
  - Added www/_headers: the app had NO CSP and NO X-Frame-Options, so it was framable (clickjacking against a signed-in session that can delete its own account). CSP keeps script-src 'unsafe-inline' deliberately - the app is three inline scripts and a stale per-deploy hash would block every one of them, taking the whole app down. So it does not stop injected script RUNNING; it stops it REACHING an attacker (connect-src, img-src, form-action, base-uri, object-src). Honest limit: CSP cannot block top-level navigation, so location=... exfiltration would still work. Verified before deploy by replaying the real policy locally over every view plus the tour and Account sheet: 0 violations, 0 page errors.
  - check_syntax.py now fails if the CSP's connect-src does not name the SB_URL the app actually calls - a drifted origin would break every sign-in as an opaque console block. Mutation-tested.
  - RE-VERIFIED LIVE against prod, not by inspection: anonymous SELECT on portfolios and an anonymous call to delete_own_account are BOTH denied with 42501, at the GRANT level, before RLS is even consulted. The SQL is textbook - FORCE row level security, explicit auth.uid() is not null, to authenticated, and SECURITY DEFINER with search_path pinned to '' and the uid taken from auth.uid() rather than an argument.
  - No SSRF in the proxy: every upstream URL is a hardcoded Yahoo literal and symbols are encodeURIComponent'd, so /api cannot be aimed at another host. It IS an open unauthenticated Yahoo proxy with no rate limit or Origin check - an abuse and quota problem, not a pivot.
  - STILL OPEN, so THE GATE REMAINS CLOSED: (1) custom SMTP - measured this session, mailer_autoconfirm is false and disable_signup is false, so a stranger can start signing up and can never finish. RESOLVED SAME DAY: (2) the Auth redirect allowlist - the owner set it and it is verified, our prod URL now round-trips AND a nested path /reset/x survives, which is what the double asterisk buys, while a non-allowlisted URL falls back to the prod Site URL instead of localhost; (3) pb-proxy deleted with the owner's go-ahead - it now 404s while prod /api still returns live quotes, and worker/wrangler.toml is annotated and set workers_dev=false so an accidental deploy cannot hand out a public URL again. ACCEPTED, not fixed: (4) no size cap on a stored portfolio, since E10.1 bounds history at 10 versions.
  - MOBILE WEB (2026-08-27), found while hardening the demo path: tools/phone/ only ever verified the CAPACITOR build - it stubs window.Capacitor so NATIVE is true. The owner's actual demo is the web app in Mobile Safari, where NATIVE is false, and nothing was watching it. Two defects sat on the first screen a new user sees: nav.tabs still carried the pre-E5 labels (Fundamentals & Allocation, Calculator / Rebalance) so 419px of text in a 390px viewport pushed History off screen and panned the whole page, breaking the owner's own standing rule; and the gate's email and password fields were 14px, which makes iOS Safari zoom the page on the first tap. Same root cause both times - a fact taught to one reader of it: the rail and the native tab bar were renamed and nav.tabs was not, and the 16px rule was written '.native input...' so the browser that actually zooms was never covered. tests/mobileweb.spec.js guards both plus label parity between the strip and the rail; all five fail against the pre-fix code. Header also trimmed 253px to 183px on a 390px screen.

## Done  (75)
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
<details><summary><b>E7 · First-run onboarding</b> — 3 done</summary>

- **E7.1** — Start fresh means a genuinely empty board · [spec](features/E7_first-run-onboarding.md)
- **E7.2** — Guided tour - one per view · [spec](features/E7_first-run-onboarding.md)
- **E7.3** — The guide is shown once, and the button says Help · [spec](features/E7_first-run-onboarding.md)

</details>
<details><summary><b>E10 · History retention</b> — 2 done</summary>

- **E10.1** — Keep only the last 10 checkpoints · [spec](features/E10_history-retention.md)
- **E10.2** — Undo must not silently discard theme/membership/watchlist edits · [spec](features/E10_history-retention.md)

</details>
<details><summary><b>APP · iOS app</b> — 7 done</summary>

- **APP1** — Bring the iOS app to parity with web (E1–E4.5) · [spec](APP_MIGRATION.md)
- **APP2.1** — Strip the dead V1 native skin · [spec](features/APP2_ios-v2-rebuild.md)
- **APP2.2** — Native shell: tab bar, context bar, tokens, sheets · [spec](features/APP2_ios-v2-rebuild.md)
- **APP2.2b** — In-tab paging for the long tabs · [spec](features/APP2_ios-v2-rebuild.md)
- **APP2.2c** — Header chrome moves into the Account sheet · [spec](features/APP2_ios-v2-rebuild.md)
- **APP2.6** — Overview view · [spec](features/APP2_ios-v2-rebuild.md)
- **APP2.11** — Touch pass · [spec](features/APP2_ios-v2-rebuild.md)

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
