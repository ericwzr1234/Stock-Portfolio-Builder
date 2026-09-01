# E13 — Security, data protection, and a hostile-path review of the app logic

**Status:** design · opened 2026-08-31
**Owner decision required on:** E13.1 (single-file architecture), E13.4 (who may call `/api`), E13.10 (Yahoo posture)

---

## 0. Why this epic exists, and what triggered it

On 2026-08-31 a real stored-XSS defect was found and fixed: a hostile **ticker symbol** executed
12 times per render, because symbols reached `innerHTML` unescaped in four places. The impact was
not theoretical — the Supabase session token lives in `localStorage`, so an executing script can
take it and act as the user.

The defect itself was ordinary. **How it survived is the reason for this epic.** `tests/security.spec.js`
had covered exactly this since E6.7 and passed continuously, because its fixture wrote
`state.membership` / `state.data` / `state.holdings` — keys this app has never read. The hostile
value was therefore never rendered, and nothing was ever escaped. *"No payload fired"* and *"no
payload was present"* are indistinguishable from outside a test.

So the premise here is not "add some security". It is: **we do not currently know which of our
security controls are actually load-bearing and which only appear to be.** Every ticket below ends
with evidence, not with an assertion.

Two supporting facts, both established 2026-08-31:

- The XSS **predates E12**. Running the corrected test against `fb68ac5` fails worse (3 failures vs
  2), so the V3 revamp did not introduce it and its new lanes were already escaping correctly.
- A scan of **781 blobs across all git history** found no secret-shaped strings, and
  `portfolio.json` has never been committed in any variant. Given the repository's visibility was
  changed, that mattered; it came back clean.

---

## 0b. The owner's three objectives (2026-09-01)

He reframed this epic into three workstreams. They are broader than the security-only shape it was
opened with, and the shape is better: two of the three were missing.

**W1 — dead and stale code.** Find code that is completely not needed any more, remove it, and prove
CI is still green. *Started 2026-09-01: 7 dead declarations removed, and a control that rendered
and did nothing (`#ovAllHistory`) found and fixed. See `E13.12`, `E13.13`.*

**W2 — scan for critical security issues and fix them.** The original eleven tickets, now with two
decisions taken (§0c).

**W3 — pressure-test robustness** from five standpoints: the **user story**, **core functions**,
**core calculation methods**, **data quality**, and **cybersecurity**. Scan for potential issues and
fix them. *The engine already has strong invariant coverage — allocation sums to 1, bounds respected,
cash conserved exactly, no zero-sum fallback. The gap is adversarial input to those same functions:
`NaN`, `null` prices, wrong types, 5,000 tickers. That is where a number gets mis-stated silently,
which is worse than a crash because the user acts on it.* See `E13.14`–`E13.16`.

## 0c. Decisions taken

**CSP (`E13.1`) — split approach.** The owner delegated the call with four constraints: must keep
working, lose no capability, stay fast, stay free. Chosen: **extract the 373 KB app block to
`www/app.js`, and fingerprint the three small pre-paint blocks in the CSP.**
*Why not pure hashing:* a hash on the block that changes every edit turns a stale hash into a
**blank app**, which violates "must keep working" outright. *Why not pure extraction:* the three
small blocks (Turnstile callback, native check, gate-visible fix) exist to run **before first
paint** — the gate-visible one is what stops the sign-in screen flashing — and putting network
round-trips in front of that is a real regression. The split has no staleness on the volatile part
and no extra requests before paint, and is *faster* on repeat visits: `index.html` drops to ~120 KB
and `app.js` caches separately. The app already loads `data/universe.js` externally, so this is not
a new pattern.

**`/api` (`E13.4`) — require sign-in plus a rate limit.** Confirmed with the owner that this costs
the *user* nothing: the browser already holds the Supabase session and the app already sends it on
portfolio calls. **It costs him one action:** the Supabase JWT secret must be set as a Cloudflare
environment variable so the Worker can verify a token's signature. Without it the Worker could only
check that a token *looks* right, which anyone can forge.

## 1. Scope

**In scope**
- Client-side output escaping and DOM injection, across all 94 `innerHTML` sites.
- Content Security Policy and the headers in `www/_headers`.
- Authentication, session lifetime, and token storage.
- Supabase Row Level Security — *proving* it, not trusting it.
- The `/api/*` proxy: who may call it, what it accepts, what it forwards.
- Untrusted inputs: Yahoo responses, the generated ticker directory, the stored portfolio payload,
  URL fragments, and everything the user types.
- A logic review for hostile call paths — places where data from outside decides control flow.

**Out of scope**
- Penetration testing of Supabase or Cloudflare themselves. We rely on them; we do not audit them.
- Anything costing money without a separate decision (standing constraint).
- iOS (`APP2.*`), which has its own storage and auth story and gets its own pass afterwards.

---

## 2. The attack surface, as it actually is

| # | Surface | Where | Trust |
|---|---|---|---|
| 1 | Yahoo quote / fundamentals / statement / search responses | `worker/src/index.js`, `server.py` | **untrusted** — third party, unauthenticated, shape not guaranteed |
| 2 | The generated ticker directory | `www/data/tickers.json` | **untrusted** — built from an external source, then *shipped by us*, which makes it look trusted |
| 3 | The stored portfolio payload | Supabase → `state` | semi-trusted — it is the user's own, but it round-trips through a database and is deserialised without a schema check |
| 4 | Everything the user types | portfolio names, preset names, overrides, capital | **untrusted** for output purposes |
| 5 | URL fragment | `#access_token=…&type=recovery` | **untrusted** — anyone can craft the link that lands here |
| 6 | `localStorage` | session token, tour flags, theme | readable by any script that executes on the page |
| 7 | `/api/*` | Pages Function → `worker/src/index.js` | **open** — unauthenticated, unthrottled, same-origin only by convention |

---

## 3. Tickets

### P0 — do these first

#### E13.1 · Remove `'unsafe-inline'` from `script-src`
**Risk.** The CSP currently reads
`script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com …`. `'unsafe-inline'` is what
turns *any* successful injection into *full account compromise*: without it, today's XSS would have
been inert. It is there because the entire app is one inline `<script>` block, which is a
deliberate architectural choice.

**This is the single highest-value change in the epic.** It converts the whole class of escaping
bugs from "critical" to "cosmetic".

**Approach — owner decision.** Either (a) extract the inline script to `www/app.js` and drop
`'unsafe-inline'`, which ends the single-file property the project has valued; or (b) keep one file
and ship a `sha256-` hash of the script block in the CSP, which preserves single-file but means the
hash must be regenerated on every build — a job for `tools/stamp_version.py` and a CI gate that
fails if the hash is stale.

**Done when.** `'unsafe-inline'` is absent from `script-src` on the live response, the app works,
and a test injects a script into the page and proves the browser refuses to run it.

---

#### E13.2 · Prove Row Level Security, do not assume it
**Risk.** RLS is the control that stops one signed-in user reading another's holdings. It is
described in `docs/ARCHITECTURE.md` and enforced in the database, and **there is no automated test
of it anywhere.** It is simultaneously the most important data-protection control in the product
and the least verified. Today proved what an unverified control is worth.

**Done when.** A test signs in as user A, writes a portfolio, signs in as user B, and demonstrates
that B's reads return nothing and B's writes to A's row are rejected — against the real Supabase
project, with the policy `FORCE`d. It runs on demand (it needs two real accounts), and its result is
recorded in the board with a date.

**2026-09-01 — owner ran it manually, both directions. PARTIAL PASS.** Signed into account A, made
changes, signed out; signed into B and A's portfolios were absent. Reversed it: B's changes were
absent from A. Two accounts, both directions, against the real project.

**What that proves, and what it does not.** It proves the app never shows one account's book to
another, which was the user-facing worry, and it rules out the class of bugs where a stale cache or
a shared key leaks a book across a sign-out. It does **not** prove RLS is the thing stopping it.
Every read in the client is already scoped client-side —
`/rest/v1/portfolios?user_id=eq.<uid>` at `www/app.js:1288`, `:1317`, `:1327` — so an
RLS-disabled database and a correctly-enforcing one produce **identical** results through the UI.
The manual test cannot separate them. If RLS were off, a request that simply omits that filter
would return every user's holdings, and nothing in the app or in its tests would notice.

**2026-09-01, dashboard checked. RLS IS ENABLED**, with four policies on `portfolios`, one per
operation — `portfolios_select_own` (SELECT), `_insert_own` (INSERT), `_update_own` (UPDATE),
`_delete_own` (DELETE) — every one of them applied to **`authenticated`** and none to `anon`. So an
anonymous request matches no policy and returns nothing, which is the probe that would otherwise
have needed running against the live project.

The table also carries an **`API DISABLED`** badge and "custom Data API permissions", meaning its
grants have been narrowed independently of RLS: `anon` is refused at the grant layer before a
policy is consulted at all. Two independent layers, which is the right shape — a misconfigured
policy alone would not open the table to the internet.

**Still unverified: the policy EXPRESSIONS.** The names say `_own` and the roles are right, but
names are not enforcement. `portfolios_select_own` applied to `authenticated` with `USING (true)`
would let any signed-in user read every row and would look identical on that screen. The owner's
two-account test cannot catch it either, for the same reason it could not settle RLS: the client
always sends `user_id=eq.<uid>`, so it never asks for another user's rows whatever the policy says.
Closing it is one click — the policy's Edit view — and the expression wanted is
`auth.uid() = user_id`.

This is judged low risk, since the policies were named deliberately. It is written down anyway
because this epic exists precisely because two XSS tests passed vacuously for weeks while a live
hole sat behind them; "the name says so" is the class of evidence that turned out to be worth
nothing.

**Superseded, kept for the record — the dashboard check this called for has now been done:**

**Remaining gap, and the cheapest way to close it.** One look in the Supabase dashboard settles it:
Table Editor → `portfolios` → the row-level-security badge, and the policies listed against it.
Definitive for *is it on*, under a minute, no credentials anywhere near this repo. The automated
version — issuing a deliberately UNFILTERED read with a real session token and asserting it returns
only that user's row — is what turns a one-off observation into a regression test; it needs two sets
of credentials supplied through the environment, never committed.

---

#### E13.3 · Escaping audit of all 94 `innerHTML` sites, plus a gate
**Risk.** Today's fix was reactive: it closed the sites a single payload happened to reach.
94 `innerHTML` assignments exist. Nothing prevents the next one from interpolating an unescaped
value, and the test that should have caught the last one was inert for weeks.

**Done when.** Every interpolation into markup is either a number, a literal, or wrapped in `esc()`;
each exception is annotated with why it is safe. `tools/check_syntax.py` grows a check that fails
on an interpolation of a known-untrusted accessor (`nameOf(`, `.name`, a bare symbol variable,
`.label`, `.exchange`) that is not inside `esc(`. Verified the way the div-balance gate was: by
reintroducing a real unescaped site and watching the gate exit non-zero.

---

### P1

#### E13.4 · Decide who may call `/api/*`, and throttle it
**Risk.** `/api/quotes`, `/api/fundamentals`, `/api/statements`, `/api/search` and `/api/peers` are
**unauthenticated and unthrottled**, and accept up to **200 symbols per request**
(`symbolsOf()`, `worker/src/index.js:294`). The page is unlisted, but the API is not a secret — anyone
who has the URL has a free, anonymous Yahoo proxy running under our Cloudflare account and our
outbound reputation.

Three distinct exposures, and they compound: **cost** (free-tier request limits), **abuse** (we are
the amplifier), and **the Yahoo relationship** — traffic generated by a stranger is indistinguishable
from traffic generated by us, and it is our endpoint that gets blocked.

**Approach.** Require the Supabase session on the data routes (the client already holds one), or
gate on a signed same-origin token, plus a per-IP rate limit. Note the honest tension: requiring
auth means the API is no longer usable before sign-in, which is currently true of the app anyway.

**Done when.** An unauthenticated request from outside the app is refused, a signed-in one succeeds,
a burst is throttled, and the limits are written down.

---

#### E13.5 · Validate what the proxy forwards upstream
**Risk.** `symbolsOf()` trims, uppercases and caps at 200 but applies **no character allowlist**;
`/api/search` forwards `q` with only `.trim()`. Parameters are assembled through `URLSearchParams`,
which *should* encode them, so this is probably safe — **"probably" is the problem.** A parameter
that escapes encoding could inject query parameters into the upstream Yahoo request, or be used to
reach a different upstream path.

**Done when.** Symbols match a strict allowlist and anything else is rejected rather than silently
passed; a test feeds `A&crumb=x`, `../`, a 10 KB symbol, 5,000 symbols, unicode and null bytes, and
asserts the upstream URL is exactly what we intended.

**DONE 2026-09-01**, alongside `/api/history`. That route made it mechanically necessary rather
than merely prudent: unlike every other route it interpolates the symbol into a URL **path**, where
`../` walks out of it and points this proxy — authenticated, on the owner's Cloudflare reputation —
wherever the caller likes.

`SYM_OK = /^\^?[A-Za-z0-9][A-Za-z0-9.\-=]{0,19}$/`, applied in `symbolsOf()` so it covers **every**
route, not only the new one. Mirrored byte-for-byte in `server.py`.

The allowlist proposed above (`^[A-Z0-9.\-]{1,12}$`) would have been a **live outage**: it refuses
`^GSPC` and every other index, and `EURUSD=X`. My own first implementation made the same mistake in
a subtler way — it required the first character to be alphanumeric, which silently 400s every index
symbol. `tests/apihistory.spec.js` caught it, and now covers `BRK-B`, `^GSPC`, `7203.T` and
`EURUSD=X` so the next tightening cannot quietly break them either. The caret is permitted **only**
as the first character; a leading dot or slash is what a traversal needs, and neither can start a
symbol.

Seven hostile symbols are tested. Each asserts a 400, but the assertion that matters is the second
one: that **no upstream fetch happened at all**. A 400 with the request already sent would pass a
status check while having done the damage.

---

#### E13.6 · Session token storage and lifetime
**Risk.** The Supabase session sits in `localStorage` under `pb_sb_session`, readable by any script
that executes on the page. Idle sign-out is 5 minutes, which limits the window but does not close
it. What is right here **depends on E13.1**: with `'unsafe-inline'` gone, this risk drops sharply.

**Done when.** A decision is recorded — keep `localStorage` with a hardened CSP, or move to a
storage the page's own scripts cannot read — with the reasoning written down rather than implied.

---

#### E13.7 · The auth token in the URL fragment
**Risk.** Recovery and signup links arrive as `#access_token=…&refresh_token=…&type=recovery`
(`www/index.html:2677`). Fragments are not sent to servers, which is good, but they persist in
browser history and can leak through anything that reads `location`.

**Done when.** The fragment is consumed and cleared immediately via `history.replaceState`, a
`type` we did not expect is refused rather than best-effort parsed, and a test asserts the token is
gone from `location.hash` after handling.

---

### P2

#### E13.8 · Treat the ticker directory as untrusted input
**Risk.** `www/data/tickers.json` is generated from an external source by
`tools/build_ticker_directory.py`, committed, and shipped — so it *looks* like our data while
carrying someone else's. It is the most plausible delivery route for exactly the hostile symbol
that was exploitable until today, and a weekly bot refreshes it.

**Done when.** The builder validates every symbol and name against an allowlist before writing, the
refresh fails loudly on anything that does not match, and a test feeds a poisoned directory and
shows nothing executes.

---

#### E13.9 · Make secret and dependency hygiene automatic
**Risk.** Today's history scan was manual and came back clean (781 blobs, nothing found). Manual
means it will not happen again.

**Done when.** CI runs a secret scan on every push and fails on a match; the check is proved by
committing a fake key on a scratch branch and watching it fail. Also record the dependency
position: there are **no runtime npm dependencies** — Playwright is dev-only — which is a real
strength worth stating and preserving.

---

#### E13.10 · The Yahoo data posture — owner decision
**Not a code ticket.** The app reads Yahoo Finance's free, undocumented endpoints, with no API key,
and says so on screen ("Prices via Yahoo Finance (free, delayed up to ~15 min for some tickers)…
no key is used"). That is a product and terms question, not an engineering one, and it wants a
deliberate answer rather than an inherited default.

Points to weigh: these endpoints carry no usage agreement granting us access; availability can be
withdrawn without notice; and **E13.4 matters here** — an open proxy means someone else's volume
arrives under our name. I am not the right source for a legal reading of Yahoo's terms; if this
matters commercially, it wants a professional opinion, and the alternative is a licensed feed,
which costs money and is therefore your call.

**What E12 changed here: almost nothing, and deliberately.** Measured 2026-08-31 against `fb68ac5`:
`dsFundamentals`, `dsStatements`, `dsSearch` and `dsPeers` call sites are unchanged; `dsQuotes` went
from 8 sites to 9. The one addition is a **single batched** quote lookup for search results, fired
once per *settled* search behind a 250 ms debounce — far below the 60 s poll the app already runs.
The 60 s auto-refresh interval is unchanged. The `1D` chart was deliberately built from ticks
accumulated during the session **instead of** a `dsIntraday` adapter, precisely because the adapter
would have roughly doubled the call rate against a free, unkeyed, rate-limited endpoint.

---

#### E13.11 · Hostile-path review of the app logic
**Risk.** Beyond injection, the question is where data from outside *decides control flow*: a
portfolio payload with an unexpected shape, a quote with `null` where a number is required, a
checkpoint with a missing snapshot, a `NaN` reaching an allocation. E12 already found several of
these by accident — `ovPeriodReturn` reading a missing `invested` as `0` printed −33.5% beside
+28.5%; `versionLabel` printed `#undefined`; a checkpoint with no recorded allocation drew a
3-pixel bar that read as "everything is in one portfolio". Each was a *display* consequence of
trusting a shape. The same class of assumption on a **write** path is how a book gets corrupted.

**Done when.** Every entry point that deserialises or ingests (portfolio load, quote merge,
statement merge, watchlist, versions) validates shape before use; a fuzz test feeds each one
`null`, `NaN`, `Infinity`, wrong types, missing fields, extra fields, huge arrays and deep nesting,
and asserts the app degrades visibly rather than silently mis-stating a number or writing a bad
book. **Anything that would mis-state money is a defect of the same severity as an injection.**

---

## 4. Method — the part that is not a ticket

Two rules, both earned today.

1. **Every control gets a test that is proved to fail without it.** Reverting the fix must turn the
   test red. Today's XSS test was green for weeks while testing nothing; a green test is not
   evidence, a *falsifiable* one is.
2. **Every fixture must prove it reached the DOM.** The vacuity guard added to
   `tests/security.spec.js` is the pattern: assert the hostile value is *present* in escaped form,
   not merely that nothing fired.

## 5. Existing verification worth reusing

- `tools/styleprint.spec.js` — 68 computed properties on every element across 37 screens; proves a
  CSS change is inert.
- `tests/noerrors.spec.js` — fails on any uncaught exception, `console.error` or failed same-origin
  request, on every screen.
- `tools/check_syntax.py` — brace balance, `<div>` depth inside `<main>`, CSP contents, and the V2
  compat shim staying empty. **This is where E13.3's escaping gate belongs.**
- `tools/diff_proxy.py` — proves the Worker and `server.py` are interchangeable (1,035 fields).
