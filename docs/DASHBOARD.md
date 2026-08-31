# Stock Portfolio Builder — Project Board

_Updated 2026-08-24. Auto-generated from [`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._

**Epics:** `core` Core tool (shipped) · `E1` E1 · User-Defined Themes · `E2` E2 · User-Defined Metrics · `E3` E3 · Statement-Driven Data · `E4` E4 · Fundamentals & Screener workflow · `E7` E7 · First-run onboarding · `E10` E10 · History retention · `APP` APP · iOS app · `E5` E5 · Web UI overhaul · `E6` E6 · Multi-user platform · `E11` E11 · Online, for invited users · `E12` E12 · V3 UI

**Pipeline:** Ideation → Design → Implementation → Testing → Refinement → Integration → Done

| Stage | Count |
|---|---:|
| Ideation | 1 |
| Design | 19 |
| Implementation | 0 |
| Testing | 0 |
| Refinement | 0 |
| Integration | 0 |
| Done | 90 |

---

## Ideation  (1)
_A half-baked idea; can be pushed further down once fleshed out._

- **E6.0** · _E6 · Multi-user platform_ — **Keep Phase 1 on the multi-user path (no build)** _(web + ios)_ · [spec](features/E6_multi-user-platform.md)
  - ROADMAP (2026-08-08): Phase 1 = solo sandbox, everything free (WE ARE HERE). Phase 2 = me + a handful of INVITED friends for feedback, centralised + secured + per-account, still free tier. Phase 3 = commercial launch, then discuss paid/licensed data APIs.
  - Today web and iOS CAN already share one book via opt-in LAN sync (useRemote -> the web's portfolio.json over Wi-Fi), but with no account, no password, no encryption, same-network only. Fine for one person; not a basis for Phase 2.
  - Cheap do-now items that cost nothing and prevent rework: keep the storage seam pure (UI never touches localStorage/fetch directly - an E5 invariant); add schemaVersion; add a monotonic revision + updatedAt on save; keep the engine free of I/O.
  - NOT being built now. No accounts, no backend, no database, no paid services in Phase 1.

## Design  (19)
_Detailed requirements captured; a spec exists in docs/features/._

- **E11.7b** · _E11 · Online, for invited users_ — **Error monitoring (Sentry)** _(depends E11.3, web)_ · [spec](features/E11_online-deployment.md)
  - NOT STARTED - blocked on an account only the owner can create. Sentry's free Developer tier is 5k errors/month and needs no card.
  - WHY IT MATTERS: there are ~19 console.error calls that vanish into browsers nobody can see. Now that the app is deployed and reachable from a phone, a failure the owner hits away from the laptop leaves no trace at all.
  - When the DSN exists this is small: init early, and let it capture what already gets logged. Do not add a second error path.
  - DEFERRED BY THE OWNER 2026-08-30, not abandoned and not forgotten - do NOT re-propose it without a new reason. The scale does not justify it yet: a handful of invited users he can phone, so he hears about breakage directly rather than needing telemetry to discover it.
  - The costs weighed and found to outrun the benefit at this size: it puts a third-party script inside the page with full DOM access; it widens connect-src, which exists specifically to stop XSS reaching an attacker; and it moves error data out of Canada, where Supabase keeps everything else, to either the US or the EU since Sentry offers no Canadian region.
  - REVISIT WHEN: someone reports a bug that cannot be reproduced. That is the concrete trigger. Until then roughly 19 console.error calls stay invisible, which is an accepted cost, not an oversight.
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
- **E12.1** · _E12 · V3 UI_ — **Overview** _(depends E11.16, web)_ · [spec](features/E12_v3-ui.md)
  - Section 4.2. 1D default, honest period return net of contributions, dashed ink invested line, scrub with number retarget, five-cell grid with the conditional accent action, allocation bar plus drift legend, holdings accordion. Donut deleted.
  - OWNER DECISION on the 1D series: draw the real intraday line. /v8/finance/chart needs no cookie and no crumb (E11.0 measured it), so it is one call per holding once per session; the app already bursts 100 calls in 4 seconds with zero throttle signals. The live continuation costs nothing extra because it appends points from the 60s quote poll that already runs. A straight line from previous close to login value was rejected - it asserts prices that never happened.
- **E12.2** · _E12 · V3 UI_ — **Model** _(depends E11.16, web)_ · [spec](features/E12_v3-ui.md)
  - Section 4.3. Inline exception chips on each metric row, catalog modal, cap row, target/drift column, per-portfolio accordions with overrides and source tags, presets, portfolio editing.
- **E12.3** · _E12 · V3 UI_ — **Trade** _(depends E11.16, web)_ · [spec](features/E12_v3-ui.md)
  - Section 4.4. Cash input, three modes as radios with a consequence sentence each, plan table, where-it-lands, commit button outside every nested scroll, account-failure message in place.
- **E12.4** · _E12 · V3 UI_ — **Research + stock panel** _(depends E11.16, web)_ · [spec](features/E12_v3-ui.md)
  - Sections 4.4b and 4.6. Search line, watchlist with the 52-week track, add/swap flow, the 640px stock panel. Rows 45, 48 and 57 have no pixel in the mockup and are the likeliest features to be lost.
- **E12.5** · _E12 · V3 UI_ — **History** _(depends E11.16, web)_ · [spec](features/E12_v3-ui.md)
  - Section 4.5. Ledger with square markers, bar chart with dashed redoable futures, selected detail, revert, reset.
- **E12.6** · _E12 · V3 UI_ — **First run** _(depends E11.16, web)_ · [spec](features/E12_v3-ui.md)
  - Section 4.7. The accent poster, three numbered steps, starting capital, import.
- **E12.7** · _E12 · V3 UI_ — **Dark as a true inversion** _(depends E11.16, web)_ · [spec](features/E12_v3-ui.md)
  - Section 6. Same radius, density, type scale and numerals as light; only token values change. E12 ships light-only first, following the spec's own recommendation.

## Implementation  (0)
_Being built on the dev branch._

- _(none)_

## Testing  (0)
_Built; waiting for you to try it._

- _(none)_

## Refinement  (0)
_Tested but not yet approved; new instructions → back to Implementation._

- _(none)_

## Integration  (0)
_Approved; merging dev → main (prod) + updating docs._

- _(none)_

## Done  (90)
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
<details><summary><b>E1 · User-Defined Themes</b> — 13 done</summary>

- **E1.1** — Data-driven theme list (foundation) · [spec](features/E1.1_data-driven-themes.md)
- **E1.2** — Add / remove a ticker in a theme · [spec](features/E1.2_add-remove-ticker.md)
- **E1.3** — Ticker search & validate · [spec](features/E1.3_ticker-search.md)
- **E1.4** — Create a new theme · [spec](features/E1.4_create-theme.md)
- **E1.5** — Rename / recolour a theme · [spec](features/E1.5_rename-recolour.md)
- **E1.6** — Delete a theme / restore defaults · [spec](features/E1.6_delete-theme.md)
- **E1.7** — Similar-stock recommendations (peers of picks)
- **E1.8** — Seed recommendations from a new theme's name
- **E1.9** — Flat Screener: pooled recommendations + actions · [spec](features/E1.9_flat-screener-recommendations.md)
- **E1.10** — Two-level allocation: rank tickers inside a theme, not just themes · [spec](features/E1.1_data-driven-themes.md)
- **E1.11** — Editing a portfolio no longer throws you onto Rebalance · [spec](features/E1.2_add-remove-ticker.md)
- **E1.12** — UI vocabulary: a theme is called a portfolio · [spec](features/E1.1_data-driven-themes.md)
- **E1.13** — Per-name target weight on the Model tab · [spec](features/E1.1_data-driven-themes.md)

</details>
<details><summary><b>E2 · User-Defined Metrics</b> — 6 done</summary>

- **E2.1** — Data-driven metric list (foundation) · [spec](features/E2.1_data-driven-metrics.md)
- **E2.2** — Metric catalog + compute layer · [spec](features/E2.2_metric-catalog.md)
- **E2.3** — Choose your metrics (picker UI) · [spec](features/E2.3_metric-picker.md)
- **E2.4** — Per-metric direction & bad-data handling · [spec](features/E2.4_metric-direction-baddata.md)
- **E2.5** — Metric presets / reset to default 6 · [spec](features/E2.5_presets-reset.md)
- **E2.7** — Day P/L counted a whole day's move on shares bought minutes ago · [spec](features/E2_user-defined-metrics.md)

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
<details><summary><b>E7 · First-run onboarding</b> — 4 done</summary>

- **E7.1** — Start fresh means a genuinely empty board · [spec](features/E7_first-run-onboarding.md)
- **E7.2** — Guided tour - one per view · [spec](features/E7_first-run-onboarding.md)
- **E7.3** — The guide is shown once, and the button says Help · [spec](features/E7_first-run-onboarding.md)
- **E7.4** — The empty board an invited user actually lands on · [spec](features/E7_first-run-onboarding.md)

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
<details><summary><b>E5 · Web UI overhaul</b> — 8 done</summary>

- **E5.0** — App shell — rail, context bar, theme tokens · [spec](features/E5_web-ui-overhaul.md)
- **E5.1** — Overview tab (replaces Prices)
- **E5.2** — Model tab (replaces Fundamentals & Allocation)
- **E5.3** — Rebalance tab (replaces Calculator)
- **E5.4** — Research tab (replaces Screener)
- **E5.5** — History tab
- **E5.6** — Equal-weight benchmark + return chart
- **E5.8** — Every table sorts by its headers · [spec](features/E5_web-ui-overhaul.md)

</details>
<details><summary><b>E6 · Multi-user platform</b> — 8 done</summary>

- **E6.1** — Forward-compat: schemaVersion + revision + updatedAt · [spec](features/E6_database_design.md)
- **E6.2** — Extract a storage-adapter interface · [spec](features/E6_database_design.md)
- **E6.3** — Choose provider; stand up schema + row-level security · [spec](features/E6_database_design.md)
- **E6.4** — Login / register / logout + session handling · [spec](features/E6_database_design.md)
- **E6.5** — Cloud adapter with optimistic concurrency · [spec](features/E6_database_design.md)
- **E6.6** — Import local portfolio.json + cutover · [spec](features/E6_database_design.md)
- **E6.8** — Login landing page - sign-in required before anything · [spec](features/E6_database_design.md)
- **E6.7** — Security review - GATE before inviting anyone · [spec](features/E6_database_design.md)

</details>
<details><summary><b>E11 · Online, for invited users</b> — 20 done</summary>

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
- **E11.4** — Custom SMTP, so anyone but the owner can sign up · [spec](features/E11_online-deployment.md)
- **E11.5** — Export and delete: the user's own data, in their hands · [spec](features/E11_online-deployment.md)
- **E11.6** — Disclaimer and privacy note · [spec](features/E11_online-deployment.md)
- **E11.7a** — Feedback channel · [spec](features/E11_online-deployment.md)
- **E11.4b** — Turnstile on signup, so bots cannot burn the email quota · [spec](features/E11_online-deployment.md)
- **E11.8** — Tests and CI · [spec](features/E11_online-deployment.md)
- **E11.14** — Idle lock did not sign out; verification links landed in the cached account · [spec](features/E11_online-deployment.md)
- **E11.15** — Deploy automatically on merge to main · [spec](features/E11_online-deployment.md)
- **E11.16** — The dev server sends the same headers prod does · [spec](features/E11_online-deployment.md)

</details>
<details><summary><b>E12 · V3 UI</b> — 2 done</summary>

- **E12.0** — Shell: token sheet, four text lanes, rail deleted · [spec](features/E12_v3-ui.md)
- **E12.0b** — Sign-in gate · [spec](features/E12_v3-ui.md)

</details>
