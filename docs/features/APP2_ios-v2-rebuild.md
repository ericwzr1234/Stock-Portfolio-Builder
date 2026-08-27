# APP2 — Rebuild the iOS app against the V2 web baseline

> **Board:** epic `APP`, ticket **APP2** → **design**, broken into `APP2.1`–`APP2.14`.
> **Progress (2026-08-24):** `APP2.1`, `APP2.2`, `APP2.2b`, `APP2.2c` and `APP2.11` are **done and
> merged**. The phone now has its own shell — bottom tab bar, sticky context bar, in-tab paging,
> OS-following theme, touch-scrubbable charts. **Next: `APP2.3` (Supabase auth on device).**
> **Depends:** E5.5 (done), E6/E8/E9 (done), E11.2–E11.3 (done).
> **The contract:** [`V2_WEB_BASELINE.md`](../V2_WEB_BASELINE.md) defines what the phone must carry.
> This file is *how*. Read §9 of the baseline before touching the sync layer.
>
> **Prototype:** [`../prototypes/APP2_phone_demo.html`](../prototypes/APP2_phone_demo.html) — an
> interactive, self-contained mock of all five views in the agreed visual direction. Open it on a
> phone. It is a **design reference, not a code source**: it carries no engine and fakes its data.

---

## 1. The decisions this rebuild starts from

| # | Decision | Date / source |
|---|---|---|
| D1 | **Native Capacitor app**, not a PWA. Rebuilt in Xcode on the Mac. | owner, 2026-08-08 and 2026-08-15 (APP2 notes) |
| D2 | It **need not look like the web app**, but must carry the **same content and features**. Presentation may diverge per platform; the engine, data layer and feature set are shared. | owner, 2026-08-08 / 2026-08-15 |
| D3 | **Delete the V1 `.native` CSS** rather than repair it. 91 rules target V1 markup V2 no longer emits. | owner, 2026-08-15 |
| D4 | **The phone uses Supabase for account-based data**, exactly as the web does. | owner, 2026-08-24 |
| D5 | **UI direction: Robinhood** — clean, simple, easy to follow. | owner, 2026-08-24 |
| D6 | **The phone keeps fetching Yahoo directly on-device** via CapacitorHttp, not through the deployed `/api/*`. It is Yahoo either way; this removes any dependency on the Pages origin. | owner, 2026-08-24 |
| D7 | **Idle timeout on the phone is 15 minutes** (web stays at 5). | owner, 2026-08-24 |
| D8 | **Free personal-team signing for now**; revisit a paid account at the production/testing stage. | owner, 2026-08-24 |

### D4 in full, because it settles the question the baseline flagged

`V2_WEB_BASELINE.md` §9.1 says the native storage model "needs a deliberate answer, not a
copy-paste": either the app is account-only, or on-device storage stays its primary store.
**The answer is account-only.** Consequences, accepted deliberately:

- The app **requires a network and a signed-in session** to show a portfolio. There is no offline
  read. An unreachable account is **reported as unreachable** — never replaced with a cached copy.
- `STORAGE_ADAPTERS.native` (localStorage, `pb_portfolio_v1`) and the **LAN Wi-Fi sync** are
  **retired on the phone**. They were V1's answer to having no server; the account replaces both.
- **Do not build a mirror.** A local copy that shadows an account is precisely the hybrid that
  produced the ~120 defects of E6–E9. E9 deleted it on web; it must not return on iOS.
- Market data is unaffected — quotes/fundamentals/statements are not portfolio data and may be
  fetched and cached freely.

### D6 — the phone keeps fetching Yahoo directly on-device (owner, 2026-08-24)

**It is Yahoo Finance on every platform.** The web app cannot call Yahoo from the browser — Yahoo's
endpoints send no CORS headers — which is the entire reason `server.py` (dev) and the Cloudflare
Worker (prod) exist: they are proxies that fetch Yahoo on the web app's behalf. The phone is the one
platform that **can** call Yahoo directly, because **CapacitorHttp is native HTTP and is not subject
to CORS**. So this decision was never about the data source, only about who makes the call.

**Decision: keep the V1 approach** — `nativeQuotes` / `nativeFundamentals` / `nativeStatements` /
`nativeSearch` continue to hit Yahoo directly through CapacitorHttp.

Why this is the robust choice:

- **No dependency on the Cloudflare Pages origin.** Under D4 the phone needs the network for the
  portfolio, but that is *Supabase*. Keeping Yahoo on-device means Pages being down, renamed, or
  drifting cannot stop the phone from pricing a portfolio.
- **Zero new code.** V1 proved this path on a physical iPhone with live data. APP2.5 becomes a
  *verification* ticket, not a rewrite.
- **Search needs no proxy anyway.** E11.10 made ticker search local and client-side
  (`www/data/tickers.json`, 11k+ symbols), so it reaches the phone through `cap sync` regardless.
- **The ETF guard already works natively.** E11.9 put `quoteType` in all three proxies, so
  "researchable, never a theme member" holds unchanged.

**Does this risk Yahoo locking us out? The evidence says direct is the *safer* side.** The owner
raised this as the one caveat, and it is the right question to ask:

- **The Worker is the risky path, not the phone.** `E11.0` existed precisely to test it: *"Yahoo
  deployed TLS fingerprinting in Apr 2025 and a Worker cannot control its TLS fingerprint. This is
  the only evidence that exists either way for Cloudflare specifically."* A Worker is a datacenter IP
  with an uncontrollable fingerprint; a real iPhone is a residential/carrier IP presenting a stock
  iOS fingerprint — the most ordinary-looking client available.
- **A proxy concentrates, a device distributes.** Routed through the Worker, every user's traffic
  exits a handful of shared Cloudflare IPs, so a throttle takes everyone down at once. Direct from
  the phone, one device's traffic is indistinguishable from a person using Yahoo's site.
- **Volume is nowhere near a limit.** Measured 2026-08-24 from a residential IP through `server.py`
  (the same call pattern the phone uses): the heaviest realistic operation — a forced 25-name
  fundamentals refresh, three times, plus 25-name statements, i.e. **100 Yahoo calls in ~4 seconds** —
  returned **25/25 live every run with zero throttle signals**. The client also caps fan-out at
  `Y_CONCURRENCY = 4` (matching `server.py`), so a phone never bursts harder than that; steady-state
  use is one quote call per refresh.
- **Already proven on the device.** V1 ran direct-to-Yahoo on a physical iPhone with live data.

**The fallback, if Yahoo ever does lock out direct device calls.** This is deliberately not a one-way
bet: the Worker keeps existing for the web app, and the `ds*` layer already branches, so switching
the phone to the deployed `/api/*` is a small, localised change. `APP2.14` must therefore watch for
throttling during on-device verification, and degradation is already graceful — the hardening from
`f4eb179` rejects an error body as a crumb, forces a crumb refresh, and falls back to seed rather
than crashing.

**Accepted cost:** three implementations of one Yahoo surface must stay in sync — `server.py` (dev),
`worker/src/index.js` (prod web), and the native client (phone). `E11.2b` confirmed the native JS
client **already mirrors `server.py` exactly**. Police any future field change with
`py -3 tools/diff_proxy.py`, and remember the rule that earned itself here: **porting logic ports its
bugs** — the search tie-break was fixed in Python and reintroduced identically in JavaScript the same
afternoon.

---

## 2. What the phone inherits for free, and what must be built

`npx cap sync ios` copies `www/` into the bundle, so **the engine, the whole feature set and every
V2 fix arrive automatically**. The engine stays untouched: `computeAllocation`, `planTrades`,
`applyRebalance`, `computeCarryover`, `applyThemeCap`, `stmtTTM`, `computedMetrics`,
`rebuildFundamentals`, the metric catalog and the version timeline are pure and must remain
byte-identical.

What genuinely needs work:

1. **Presentation.** V2's five views live behind a desktop left rail with two-column layouts. The
   phone needs its own layout — bottom tab bar, sticky context bar, stacked sections, sheets.
2. **Touch.** Chart scrubbing is **mouse-only** on web (`onmousemove` / `onmouseleave`, no
   `touchstart`/`pointermove` anywhere). The scrub is the *only* way to read any checkpoint but the
   last, so on a phone that data is currently unreachable. Same for the donut's and history bars'
   `<title>` tooltips and 48 other `title=` attributes.
3. **The storage adapter** (D4) and **auth on device** (Supabase GoTrue over CapacitorHttp).
4. **The data layer** (D6).
5. **Native chrome.** V1's header and tab bar hardcode light colours, so dark mode is wrong there.
   Everything theme-dependent must be a token.

---

## 3. The phone layout, as prototyped

Five sections keep their V2 names and intent; internal view ids stay `prices` / `fundamentals` /
`calc` / `screener` / `history`.

| Tab | Carries |
|---|---|
| **Overview** | hero value + today + all-time; value chart with the dashed equal-weight counterfactual, **scrubbable by touch**; `Value / Return % / Return $` as one segmented chart rather than V2's two cards; allocation donut + per-theme legend with target and drift; four stat tiles; holdings-by-theme accordion showing **% of book · Market value · Cost basis · Profit / loss · Return** spelled out, expanding to per-ticker price/day/value |
| **Model** | drift table + stacked allocation bar; ① metrics & weights; ② exception handling per metric; ③ max weight per theme; compute-from-statements toggle + compare sources + coverage note; presets; per-theme metric tables — **horizontal scroll with a frozen ticker column** (the V1 pattern the owner explicitly liked), inline overrides, source tags; theme add/rename/delete; metric picker as a sheet |
| **Rebalance** | first-run build; add capital; full-rebalance / new-cash-only; realign-only; by-theme table; per-stock instructions with buy/sell badges; **Apply & save docked as an opaque action bar** — never buried in a nested scroll; holdings with per-name remove, cost basis, start date |
| **Research** | local search (11k+ symbols, no network) with the stale-response guard; watchlist quote table (last, change %, 52-week high/low, volume, average volume); add-to-theme → new name *or* swap → rebalance review; ETFs researchable, never theme members |
| **History** | value-per-checkpoint bars; undo / redo / revert-to-any-point with git-style forking, redoable futures visually distinct; per-checkpoint allocation + trade list; reset portfolio; **Account card** (signed in as, export, sign out) replacing V1's Wi-Fi data-sync card |

**Carried from V2 and non-negotiable:** the **context bar on every screen** — Total value · Today ·
Invested · Gain · Max drift — refreshed on the **price-refresh path**, not only on structural
re-renders. Losing portfolio context on navigation was V1's flaw; showing stale money beside live
money was a real V2 bug.

**Design language.** Dark-first with a full light theme, following the OS by default and remembering
an explicit choice; every theme-dependent value a token. Semantic gain/loss green/red kept
**separate** from the brand teal used for the strategy line, with the equal-weight line dashed blue —
the same encoding as web. Detail collapses by default with open state in module state, so a
background refresh never collapses what the user opened. Wide tables scroll inside their own card;
the page body never scrolls sideways.

---

## 4. Execution tickets

Each is sized to be started, tested and merged inside one session, per the 4-hour working agreement.

**What APP2.6 cost, and why:** the first attempt built the segmented chart in CSS alone — leaving both
cards in place and stripping card 2's border so the pair would *read* as one. It did not: two sibling
cards are two boxes, and the chart visibly escaped the card it was supposed to be inside. **CSS can
restyle a structure; it cannot merge one.** The fix moves the return chart's three nodes into card 1
at boot. Card 2 itself stays in the DOM, emptied and hidden, because the paging manifest selects
Allocation as `.card:nth-of-type(3)` — removing the card would silently renumber it.

| Ticket | Scope | Depends |
|---|---|---|
| **APP2.1** | ✅ done — Strip the dead V1 native skin — delete all 91 `.native` rules and the V1-only native chrome; tokenise header/tab bar so dark mode is correct. Baseline for everything after. | — |
| **APP2.2** | ✅ done — Native shell: bottom tab bar, sticky context bar, safe-area insets, bottom sheets, light/dark tokens, 16px form fields (iOS auto-zooms below that and mis-places every sheet). | 2.1 |
| **APP2.3** | Account on device: Supabase GoTrue over CapacitorHttp, login gate that fails closed, session persistence and token refresh (**a token refresh is not an identity change**), idle timeout at **15 minutes** on the phone. | 2.2 |
| **APP2.4** | Storage: cloud adapter only on native; retire `STORAGE_ADAPTERS.native` and LAN sync; honour C1–C5; unreachable account reported, never cached. | 2.3 |
| **APP2.5** | Verify the on-device Yahoo client still mirrors the Worker field-for-field (D6 keeps it); keep every CapacitorHttp param stringified; keep the local ticker directory for search. | 2.2 |
| **APP2.6** | ✅ done — Overview view. Four of the five §3 bullets were already in place (hero, scrubbable value chart with the dashed equal-weight counterfactual, donut + drift legend, spelled-out holdings stats). The missing one was the **segmented chart**: `Value / Return % / Return $` in one card instead of V2's two. | 2.2 |
| **APP2.7** | Model view, incl. per-theme metric tables with a frozen ticker column, inline overrides, and the metric-picker sheet. | 2.2 |
| **APP2.8** | Rebalance view, incl. first-run build and the docked Apply & save. | 2.2 |
| **APP2.9** | Research view: local search, watchlist table, add/swap flow. | 2.2, 2.5 |
| **APP2.10** | History view + Account card (replaces the Wi-Fi sync card). | 2.2, 2.4 |
| **APP2.11** | ✅ done (chart scrubbing; 44pt audit remains) — Touch pass: pointer-based chart scrubbing (replaces mouse-only), tap-target audit, no hover-only or `title`-only information anywhere. | 2.6, 2.10 |
| **APP2.12** | Stock-detail sheet: 27-metric grid with source tags + three statement tables with a frozen line-item column. | 2.7 |
| **APP2.13** | Signing & distribution: **free personal team** for now (7-day certs, weekly Xcode re-run); revisit a paid account at the production/testing stage. Then install. | 2.6-2.10 |
| **APP2.2b** | ✅ done — in-tab paging: long tabs split into swipeable pages, split on reading seams so no action spans two pages. | 2.2 |
| **APP2.2c** | ✅ done — header chrome (tour, theme switch, auto-refresh) moved into the Account sheet; header 310px → 92px. | 2.2 |
| **APP2.14** | On-device verification against the §3 feature contract + regression of theme CRUD, rebalance, history forking, and account isolation. | all |

---

## 4b. Rules this rebuild earned on the device

- **A user must NEVER scroll the whole screen sideways.** Only a data table may scroll
  horizontally, and only inside its own card or sheet. *(Owner, 2026-08-24, after the signed-in
  header pushed the page 65px wide.)*
- **A page split separates reading, never a transaction.** The whole rebalance — capital, mode,
  Calculate, the plan, Apply and save — stays on one page.
- **Move a control, don't duplicate it.** Everything here is wired by element, so relocating the
  real node keeps its handler and its state; a copy needs both mirrored, and shadow state is what
  E6–E9 bled over.
- **Anything unbounded in a fixed row will overflow eventually.** The account button becomes an
  email once signed in. Cap it, and let the row wrap.
- **A guard can hide the bug it was meant to catch.** `body{overflow-x:hidden}` made
  `scrollWidth` read clean while the device still panned. Measure the cause, not the clipped result.
- **Verify in the state the user is actually in.** Signed out, on page 1, is not that state.

## 5. Landmines

From `E6_database_design.md` §16–21 and the baseline's §9, all learned by breaking them:

- **A guard must measure the thing it guards against.** An "identity" counter that also counted token
  refreshes discarded a live portfolio on every stale reload.
- **A refusal that has already mutated is not a refusal.** Five findings were a guard sitting one
  line below the write it was meant to stop.
- **One context captured before the first `await`**; **one checkpoint** after it. Nothing is applied
  or written for a context that is no longer current.
- **`state.baseRevision` is a server-confirmed revision or `null`**, and saving is refused while
  null. Never derived from the document, never adopted from a conflict error.
- **A save returns `true` only if the write landed**, and callers that announce success check it.
- **RLS separates accounts, not devices.** Anything stored per-user on a shared device is keyed by
  uid and cleared on sign-out.
- **`state.pulled` is the authoritative base** — never write `state.fundamentals` directly.
- **Porting logic ports its bugs.** The search tie-break was fixed in Python and reintroduced
  identically in JavaScript the same afternoon. If APP2.5 is rejected, this applies to every field.
- **There are no default themes (E8).** Do not rebuild `noDefaults` or a "Use the built-in 5" button;
  both were deleted.

## 6. Owner decisions, now settled

1. **D6 - market data:** the phone keeps fetching **Yahoo directly on-device** (see above). Three
   proxies stay in sync; `tools/diff_proxy.py` polices it.
2. **Idle timeout:** **15 minutes** on the phone (web stays at 5). Set in APP2.3.
3. **Signing:** **free personal team** for now, accepting the 7-day cert and a weekly Xcode re-run.
   Upgrade to a paid account at the production/testing stage, which is also when TestFlight becomes
   worth it.

Still worth doing independently of APP2: prod serves an older ticker directory than `main`
(`460edaa` vs HEAD) because the weekly workflow commits without deploying. That affects the **web**
app, not the phone, now that D6 keeps the phone off that origin - but it widens every Sunday.
