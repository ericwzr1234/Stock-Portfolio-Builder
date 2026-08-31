# Session handoff — read this first

**THE V3 WEB APP IS LIVE:** https://portfolio-builder-esb.pages.dev — app and `/api/*` on one
origin. Unlisted (`robots.txt` + `noindex`), installable to a phone home screen, 5-minute idle
sign-out, Turnstile on the gate, RLS on every table.

## Where it stands (session 6, 2026-08-31)

**E12, the V3 UI revamp, is merged to `main` and deployed.** It is a complete rebuild, not a
restyle: four text lanes replace the rail, every surface is rebuilt on the V3 token sheet, and the
donut, the cards and the shadows are gone. Design of record:
[`features/E12_v3-ui.md`](features/E12_v3-ui.md).

| Card | |
|---|---|
| `E12.0` | Shell: token sheet, four lanes, Archivo self-hosted (so `font-src 'self'` stays) |
| `E12.0b` | Sign-in gate |
| `E12.1` | Overview — hero, honest period return, 1D session view, chart + scrub, allocation bar, holdings |
| `E12.2` | Model — the metric's exception policy now lives in the metric's own row |
| `E12.3` | Trade — three modes with their consequences written out; the plan is always live |
| `E12.4` | Research + the stock panel, reachable from all five places a ticker appears |
| `E12.5` | History — what happened vs what is only redoable |
| `E12.6` | First run — the poster |

**Tests went 85 → 165.** Section 4.9's migration checklist is no longer a document:
`tests/coverage.spec.js` walks its rows and asserts each control *paints*.

### Bugs this epic found, several of which predate it

- A stray `</div>` closed `<main>` early and hoisted four of the five lanes out of it, so **every
  delegated listener was dead on all four** — with no error anywhere and nothing looking wrong.
  `tools/check_syntax.py` now counts div depth inside `<main>` and was verified against the bug.
- `ovPeriodReturn` read a missing `invested` as `0`, printing **−33.5% beside +28.5%** for the same
  book on the same screen.
- The value chart's `ResizeObserver` redrew unconditionally, so **scrubbing wiped itself** ~120ms
  after the user started it.
- A failed save was only a toast; it now replaces the account sentence **in place** (baseline §9 r1).
- `dsQuotes` returns `{quotes, asOf}` and one new caller read the envelope as the map.
- `versionLabel` printed `#undefined` for a checkpoint with no id.
- The `firstrun` fixture wrote `state.membership` / `state.data` — keys the app has never read — so
  "a populated account" was in fact an empty one, and the assertion it carried proved nothing.

### Open, and needing the owner

1. **`IMPORT portfolio.json`** (spec §4.7). Not built. No import path exists anywhere in the app, so
   this is a *new feature* — file parsing plus validation of a whole book — rather than a migration
   of one. Worth doing only if you actually want to move a book in from a file.
2. **`E12.7` dark mode.** Deferred by your own light-only decision. Un-defer when you want it.
3. **`E11.7b` Sentry.** Deferred by your decision, with the revisit trigger recorded.

### Open, and mine

- **`E12.8`** — empty the V2 compat shim. §2 says it must be empty when E12 closes; a leftover alias
  is an unmigrated surface. What remains is on surfaces no lane owns (toasts, coach marks, the sync
  sheet, banners, the iOS LAN chrome). The app *looks* right because every alias resolves to a V3
  value, so this is architecture debt, not a visual defect.
- **`APP2.*`** — the iOS tickets, which need your Mac and a physical iPhone.

### House rules that keep being earned the hard way

- **Assert what PAINTS, not what a property says.** Twice this epic a probe read a property that was
  true while the element was invisible; the screenshot caught what the probe did not.
- **A stub written from the calling code agrees with the calling code's bugs.** Write stubs from the
  contract. One did not, and hid a real defect that was passing.
- **One fact, several readers, only one taught** is still the shape of most bugs here.
- Anything under `tests/` is a real assertion. Anything that writes files is not — the screenshot
  harness lives in `tools/` and runs via `npx playwright test --config playwright.shots.js`.

## Where the phone rebuild stands (session 4, 2026-08-24)

**APP2 is under way and five sub-tickets are merged to prod.** The iOS app now has its own shell
instead of the desktop layout squeezed onto a phone. Spec:
[`features/APP2_ios-v2-rebuild.md`](features/APP2_ios-v2-rebuild.md) (the *how*);
[`V2_WEB_BASELINE.md`](V2_WEB_BASELINE.md) stays the *what*.

| Done | |
|---|---|
| `APP2.1` | Deleted all 90 V1 `.native` rules. Web proven untouched: 293 web-facing selectors before and after, none lost or gained. |
| `APP2.2` | New shell — fixed **bottom tab bar**, sticky context bar on every view, one-line header, bottom sheets, and the phone now **follows the OS light/dark setting** (it never did; `!NATIVE` guards were pinning it to light). |
| `APP2.2b` | **In-tab paging.** Overview 2221px → 874px, exactly one screen. Split on *reading* seams so no action spans two pages. |
| `APP2.2c` | Tour / theme switch / auto-refresh **moved into the Account sheet**. Header 310px → 92px. |
| `APP2.11` | **Charts scrub by touch.** Previously mouse-only, so every checkpoint but the last was unreachable on a phone. |
| `APP2.6` | **Overview: one segmented chart.** `Value / Return % / Return $` in a single card instead of V2's two, per §3. The other four §3 bullets were already built. Web provably untouched: still 3 cards, return chart still in card 2, `.ovseg` `display:none`, chart still 104px. |

**Next: `APP2.3` — Supabase auth on device** (GoTrue over CapacitorHttp, gate fails closed, token
refresh is *not* an identity change, idle timeout **15 min** on the phone per D7). Then `APP2.4`
storage (retire `STORAGE_ADAPTERS.native` and LAN sync), then the per-view tickets `APP2.6`–`APP2.10`.

**Owner decisions taken this session** — all recorded as D4–D8 in the spec: the phone is
**account-only via Supabase**; UI direction is **Robinhood**; it **keeps fetching Yahoo directly
on-device** (it is Yahoo either way — the proxies exist only because a browser cannot call Yahoo);
idle timeout **15 min**; **free** signing until the production/testing stage.

**Standing rule the owner set, after finding the bug on device:** *a user must never scroll the whole
screen sideways. Only a data table may scroll horizontally, and only inside its own card or sheet.*

`shots.js` now also measures **every segment of a segmented chart** (one measurement of a control
that swaps content proves nothing about the states it hides) and takes an optional `WxH` sixth
argument, so a change can be checked against the smallest phone as well as the largest.

**Verify phone work with [`../tools/phone/`](../tools/phone/README.md) — and read that README first.**
It gave me three false passes in one session: it ran signed **out** (the overflow only exists once
the account button holds an email), it measured `scrollWidth` **after** `overflow-x:clip` had hidden
the evidence, and it checked only **page 1** of each tab. All three are fixed and it is now
mutation-tested, but the lesson generalises: *verify in the state the user is actually in.*

**Not yet done on the phone:** the 44pt tap-target audit (rest of `APP2.11`), the stock-detail sheet
(`APP2.12`), and everything from `APP2.3` onward. The demo prototype
[`../docs/prototypes/APP2_phone_demo.html`](prototypes/APP2_phone_demo.html) remains the visual
reference — it is a mock with no engine, not a code source.

---

## 2026-08-30 — the invite path is OPEN

**`E6.7` is closed by the owner.** He registered a real second account, received the confirmation
email and signed in. Turnstile now guards signup, confirmed by his own sign-in. The URL can be sent
to people.

- **Deploys are automatic** (`E11.15`). The `publish` job in `ci.yml` runs on every push to `main`
  *after* the tests pass, skips commits touching nothing under `www/`/`functions/`/`worker/`, stamps
  in the runner without committing, and verifies the live page carries that commit. Hand-made
  "Stamp" commits are retired; `workflow_dispatch` gives it a deploy-now button.
- **`E11.4b` Turnstile.** The secret went into Supabase before the client existed, so enforcement
  went live with nothing to satisfy it and prod sign-in was broken until the client shipped. The
  cause of the *second* failure is worth remembering: the interactive challenge talks to a
  per-region **subdomain**, and a CSP host does not cover its own subdomains.
- **`E11.16`** — the dev server now sends the same headers Pages does, because that CSP bug was
  structurally impossible to reproduce locally. HSTS and `upgrade-insecure-requests` are dropped for
  localhost on purpose; both would break dev, and HSTS is not undone by removing it later.
- **`E1.13`** — per-name Target weights on the Model tab, so the two-level allocation is visible
  where the metrics are tuned.
- **Sentry deferred deliberately** — see `E11.7b`. Do not re-propose without a new reason.

## Fixed on 2026-08-27, live in prod

- **`APP2.6`** — Overview on the phone is one segmented chart (`Value / Return % / Return $`) in a
  single card, instead of V2's two. Web proven untouched.
- **`E6.7` round 6** — first security pass over the **client** surface (rounds 1–5 were the data
  layer). Found and fixed a **real stored XSS** — no escaping helper existed and 49 interpolations
  put free text into `innerHTML`; a theme name of `<img src=x onerror=…>` fired seven times per
  render, and the session token is in `localStorage`. Fixed at the sink with `esc()`, plus
  `www/_headers` (CSP, `X-Frame-Options`, HSTS — the app was framable and had no CSP at all).
  RLS re-verified live: anonymous reads and the delete RPC are both denied at the GRANT level.
  **The invite gate stays CLOSED** — see the ticket for what is still open.
- **`E1.10`** — **two-level allocation.** Capital inside a portfolio is no longer split equally;
  names are ranked on their own metrics by the same weights, bounded by the owner's rule
  (floor `1/(2n)`, ceiling `1/(n-1)`) at **both** levels. The asymmetry in those bounds is
  deliberate — a symmetric alternative was offered and declined in favour of anti-concentration.
- **`E1.11`** — adding a ticker no longer throws you onto Rebalance mid-edit. The refresh had been
  written *as* a navigation.
- **`E1.12`** — a theme is called a **portfolio** in the UI; the whole book is now **Total**, so the
  word means exactly one thing. Internals (`state.themes`, the persisted field) untouched.
- **`E11.14`** — **owner-found in the first real registration, and the most serious bug of the day.**
  Signed in as test-a → idle lock → registered a new account → clicking *that* account's
  verification email landed on **test-a's portfolio**. Two defects had to line up: `lockOut()`
  never ended the *session* (every deliberate exit called `sbSignOut()` first; the idle timeout
  did not, so the one path whose purpose is security left the token in `localStorage`), and
  **nothing read the URL fragment**, so a verification link never signed anyone in — the app just
  restored whatever session was cached in that browser. Both fixed at the root; the link path now
  fails **closed**. `tests/authlink.spec.js`, 3 of 4 fail against the old code.
- **`E7.4`** — the **empty board an invited user lands on** told them two different first steps at
  once: the context bar said *Model*, the Overview hero said *Rebalance* (a dead end with no
  themes). Both now call one `firstStepHint()`. Empty charts also collapse instead of reserving
  full height — desktop Overview 1100px → 383px.
- **Mobile web** — the demo path (the web app in a phone *browser*, where `NATIVE` is false and
  none of the APP2 shell applies) had two defects on the **first screen anyone sees**: the tab strip
  still carried pre-E5 labels, so 419px of text in a 390px viewport pushed *History* off screen and
  panned the whole page; and the gate's fields were 14px, which makes **iOS Safari zoom on the very
  first tap**. Both were the same failure — a fact taught to one reader: the rail and the native bar
  were renamed but `nav.tabs` was not, and the 16px rule was written `.native …` so the browser that
  actually zooms was never told. `tests/mobileweb.spec.js` now guards it (all 5 fail against the old
  code). Header also trimmed 253px → 183px on a phone.
- **`E7.3`** — **the guide no longer reappears at every sign-in** (owner-found). The flag recorded
  *finishing* a tour, not *being shown* one, so every exit but "click Done through all seven steps"
  wrote nothing. Now credited when the bubble goes up. The `?` button reads **Help**. Note for the
  owner: each tab's guide will appear **once more** on the next sign-in — that showing is the one
  that finally gets recorded — and then never again unless Help is clicked.

## Can you send someone the URL yet? No — measured 2026-08-27

Not opinion; probed against the live project.

| Measured | Result |
|---|---|
| `disable_signup` | `false` — the signup form is open to anyone with the URL |
| `mailer_autoconfirm` | `false` — a confirmation email is **required** to finish |
| Confirmation link target | Asked for `https://portfolio-builder-esb.pages.dev/`, got `http://localhost:3000/` — **identical to what a deliberately bogus control URL returns**, so our prod URL is not in the allowlist |
| `public.feedback` | `PGRST205` — still does not exist |
| Project health | `auth/v1/health` 200 — awake |

So a stranger can **start** registering and can never **finish**: the email never arrives (built-in
mailer only delivers to project team members), and if it did, the link points at *their* localhost.
Your own password reset is broken for the same reason. Two owner actions below fix both.

## ⚠ Owner actions — nothing else moves without these

| | Action | What is broken until then |
|---|---|---|
| ~~1~~ | ✅ **DONE 2026-08-27, verified.** ~~Supabase Auth → URL Configuration: Site URL **and** Redirect URLs → `https://portfolio-builder-esb.pages.dev/**` (DOUBLE asterisk; `/*` does not match nested paths). Keep the localhost entries. | Email **confirmation** and **password-reset** links still point at localhost. Signing in with an existing account already works. |
| 2 | **Run `sql/003_feedback.sql`** in the Supabase SQL editor. | The feedback button says the table has not been created — honestly, but it cannot send. |
| ~~3~~ | ✅ **SMTP DONE 2026-08-27** — proven end to end: a non-team address received the confirmation email and signed in. What remains is split out as `E11.4b`: **Turnstile** secret → Supabase, send me only the **site** key. | Bots finding the URL would burn the Gmail send quota and wreck sender reputation through bounces, breaking the confirmation emails that now work. |
| 4 | `E11.7b`: a Sentry account (free tier, no card) → DSN. | ~19 `console.error` calls vanish into browsers nobody can see. |

**Deploying is AUTOMATIC as of 2026-08-30.** The `publish` job in
[`ci.yml`](../.github/workflows/ci.yml) runs on every push to `main`, *after* the gates pass, and
only when something under `www/`, `functions/` or `worker/` actually changed. It stamps in the
runner without committing, so the deployed bundle names its own commit and no bot pushes back into
the branch that triggered it — **the hand-made "Stamp" commits are no longer needed.** It then
proves the live site is serving that commit, because a 200 from Pages proves nothing.

This exists because the weekly ticker bot can commit but cannot deploy, so prod twice served a
stale `www/` while `main` was correct.

To publish by hand anyway (or from a branch):

```
py -3 tools/stamp_version.py
npx wrangler pages deploy www --project-name portfolio-builder --branch main
```

Run it from the repo root so `functions/` is picked up. **`wrangler` is not authenticated on the
Mac**, so the deploy has to run from the Windows machine or after `npx wrangler login` — the Mac
sessions can commit but cannot publish. A docs-only commit moves `main` without
moving the deployed stamp — that is correct, not drift. **Automating this is the most valuable
un-blocked work left** (a GitHub Action on merge to `main`).

**Working agreement (owner, 2026-08-16):** sessions are capped at **4 hours**. Every unit is started,
tested, and merged to prod within the session, or it is not started. Nothing is ever left
outstanding. All docs are current before stopping.

---

## The shape decision — everything follows from this

> *"personal use, with a few, limited users on invite-only basis. This will never go public or
> commercial."* — invite-only meaning **an unlisted URL where anyone who has it signs up normally**.

**Standing constraints:** anything costing money stops for a decision (E11 as scoped is $0); nothing
that creates legal exposure; root causes not patches, in every place the cause lives; concise code
with no abstraction that is not mechanically needed.

**ETFs are researchable, never investable** (owner, `E11.9`): look up and watchlist anything, but a
theme may only contain equities. The model allocates on company fundamentals, and `useMedian` metrics
fill a missing value with the *theme median* — so an ETF left in a theme would receive real capital
on invented inputs, and the output would look reasonable.

---

## Done in E11

| | |
|---|---|
| `E11.0` | Spike — Yahoo works from Cloudflare. 0/10 failures. The one thing that could have invalidated the plan. |
| `E11.1` | Nightly `pg_dump` that **restores into a throwaway Postgres and asserts** the data came back. Supabase Free has zero backups. |
| `E11.2a` | Worker: transport (cookie/crumb by hand, browser UA, cached handshake) + quotes, search, peers. |
| `E11.2b` | Worker: fundamentals + statements. **1,027 fields identical** to `server.py`. |
| `E11.5` | Export + self-serve deletion (`SECURITY DEFINER`, installed). |
| `E11.6` | Disclaimer + what-we-store, reachable from the gate. |
| `E11.8` | 12 engine tests + CI. **Mutation-tested** against the real E10.1 defect. |
| `E11.9` | ETFs blocked from themes at `setMembership`, before it mutates. `quoteType` from all three proxies. |
| `E11.10` | Ticker search is **local**: 11,290 symbols, 5,575 ETFs, 12 queries in 24 ms with zero network calls. |
| `E11.3` | **Deployed.** Pages + a Function that *imports* `worker/src/index.js` — one implementation, not a fourth copy. |
| `E11.13` | Idle sign-out at **5 minutes**, warning for the last 30 s. |
| `E11.7a` | Feedback channel — **write-only**: `INSERT` granted, no select policy at all. |

## Deployment, as it now stands

`wrangler pages deploy www --project-name portfolio-builder --branch main`, run from the repo root so
`functions/` is picked up. `functions/api/[[path]].js` is a four-line adapter that **imports**
`worker/src/index.js` — one implementation, not a fourth copy. Re-stamp first with
`py -3 tools/stamp_version.py` so the deployed build names its own commit.

**A 200 from Pages does not prove a file exists.** Unknown paths return `index.html` with HTTP 200,
byte-identical. Verify deployments by comparing **content**, not status codes. The Function's own
404 for an unknown `/api` route is not shadowed by this.

`pb-proxy` (standalone Worker) was **deleted on 2026-08-27** with the owner's go-ahead: Pages
serves the same code on the app's own origin, so a second unauthenticated public Yahoo proxy bought
nothing and doubled the abuse surface. `worker/src/index.js` is untouched and still the code behind
`/api/*`; only the standalone deployment is gone. Verified: `pb-proxy…workers.dev` now 404s while
prod `/api` still returns live quotes.

<details><summary>Original E11.3 plan, for reference</summary>

1. Cloudflare Pages project serving `www/`. `/api/*` **must be same-origin** — `api()` uses relative
   paths — so put the Worker's code in Pages Functions rather than gluing two services together.
2. `robots.txt` + `noindex`. The URL is meant to be unlisted; an indexed sign-in page defeats that.
3. Web app manifest + icon, so it opens from the phone home screen with no URL bar. **That is the
   owner's actual demo requirement.**
4. Show the app version in the UI, or the first bug report is unanswerable.
5. **Owner action:** Supabase Auth → Site URL + Redirect URLs as `https://<host>/**` — note the
   *double* asterisk; `/*` does not match nested paths. Keep the localhost entries.
6. Delete the `pb-yahoo-spike` Worker at cutover. — done.
</details>

---

## Gates — run these, they all fail properly now

```
py -3 tools/check_syntax.py                      # exits 1 when unbalanced
npx playwright test                              # 12 engine tests, no credentials needed
py -3 tools/diff_proxy.py <server.py> <worker>   # field-by-field proxy parity
py -3 tools/build_ticker_directory.py            # refuses to write a truncated index
```

CI runs the first two on every push. `db-backup` and `ticker-directory` run weekly.

---

## Rules earned the hard way — worth more than the rest of this file

- **A guard must measure the thing it guards against.** The crumb validator's comment said "no
  spaces" and never tested for them, so `"Edge: Too Many Requests"` passed as a crumb.
  `check_syntax.py` only printed, so as a CI gate it could not fail.
- **A refusal that has already mutated is not a refusal.** Five findings now, most recently the
  ETF guard, which had to sit above `setMembership`'s first write.
- **When you teach the code a new fact, teach every reader of it.** E10.1 made `versions()[0]` no
  longer the initial build; `canUndo()` learned it, `valueHistory()` did not, and the Overview
  reported a fabricated return.
- **Porting logic ports its bugs.** The search tie-break was fixed in Python in the morning and
  rewritten with the identical flaw in JavaScript the same afternoon. Concurrency likewise.
- **A test named after the user's own example beats a general one.** *"If you type appl…"* is what
  caught the second tie-break bug.

---

## Test accounts and data

`test-a@example.com` — its history holds throwaway synthetic checkpoints from the E10 tests, so its
Overview shows no equal-weight line (those record no trades, hence no prices — honest absence).
**Sign in again to resume cloud testing;** the session was invalidated during testing.
`test-b` was deleted to prove the cascade.

The real `portfolio.json` has never left the machine — md5 `39FB8991E3BCDEACE4F51460C497F2DB`,
unchanged since 2026-07-13, re-verified after every step.

Dev server port **8766** (`PB_DB=portfolio.dev.json`); tests use **8767** and `portfolio.test.json`
so a run can never collide with it. The proxy in prod is the Pages Function at
`/api/*`, which imports `worker/src/index.js`; the standalone `pb-proxy` Worker was deleted
2026-08-27 and there is no second public proxy any more.
