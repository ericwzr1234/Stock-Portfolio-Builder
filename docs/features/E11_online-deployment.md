# E11 — Online, for invited users

**Status (2026-08-18, session 3): 15 of 17 done. THE APP IS LIVE at
https://portfolio-builder-esb.pages.dev** — app and `/api/*` on one origin, proven identical to
`server.py` across 1,035 fields, unlisted, installable to a phone home screen, 5-minute idle sign-out.

Built, tested, merged and deployed: `E11.0` `E11.1` `E11.2a` `E11.2b` `E11.3` `E11.3a` `E11.5`
`E11.6` `E11.7a` `E11.8` `E11.9` `E11.10` `E11.11` `E11.12` `E11.13`.

**Everything buildable without the owner's accounts is done.** The two remaining tickets are blocked
on credentials: `E11.4` (custom SMTP) and `E11.7b` (Sentry). Two owner actions also unblock features
already shipped — the Supabase Auth URLs, and running `sql/003_feedback.sql`. See the handoff.

## What the diff harness bought

`tools/diff_proxy.py` compares the Worker against `server.py` field by field. It found **three real
bugs across its first runs, and only one was in the new code**:

1. **`server.py` had been degrading every ETF to a placeholder.** It judged whether a live response
   was usable by testing peg-or-ev — *stock* metrics an ETF can never have — so SPY, VOO and QQQ had
   their real name, price, P/E and dividend yield discarded for an empty seed row.
2. **`server.py`'s search tie-broke on symbol length**, so "Maui Land & Pineapple" (MLP) outranked
   "Apple Inc." (AAPL) for the query *apple*.
3. The Worker's value unwrapper returned Yahoo's bare empty object instead of null — and
   `JSON.stringify` **drops undefined keys**, so sparse symbols came back missing a dozen fields the
   client expects to exist.

None would have been found by reading the code. All three produce entirely plausible JSON. That is
the argument for diffing a data-layer rewrite rather than reviewing it.

## The rule this epic keeps proving

**Porting logic ports its bugs.** The search tie-break was fixed in `server.py` in the morning, then
written again from scratch in JavaScript in the afternoon — where it produced the identical wrong
answer for the identical query. Concurrency was capped in `server.py` and missed in the JS client the
same day. A test named after the owner's own example (*"if you type appl…"*) caught the second one; a
general test would not have.

## The shape, decided by the owner (2026-08-16)

> *"I will fix the app to be just personal use, with a few, limited users on invite-only basis.
> This will never go public or commercial."*

and, on what "invite-only" means:

> *"a URL, where I can load once and demo off of it, but no one can see the url, unless I send it to
> them… if someone does get that url, they can go to our website, and sign up normally."*

So: **an unlisted URL, normal sign-up for anyone who has it, free, non-commercial, forever.** That is
obscurity for discovery plus ordinary auth for access — not an access-control system. Design to it.

Everything in this epic follows from that sentence. It is why there is no ToS/LLC/insurance stack,
why the data provider does not change, and why the domain is optional.

## The owner's standing constraints

1. **Anything that costs money stops for a decision.** E11 as scoped costs **$0**. The two possible
   spend items — a domain (~$10/yr) and the Workers paid tier ($5/mo, only if the statements endpoint
   exceeds the 10 ms CPU limit) — are both deferred and both need asking.
2. **Nothing that creates legal exposure.** In practice: never charge money (that is the
   investment-adviser bright line), ship the disclaimer and privacy note, JSON endpoints only, and do
   not widen the Yahoo ToS exposure beyond invited personal use.
3. **Root causes, not patches** — in every place the cause lives, not just where it surfaced.
4. **Concise, precise code.** No abstraction, options or features that are not mechanically needed.

## Architecture: what actually moves

| Piece | Today | After |
|---|---|---|
| Accounts + portfolio data | Supabase | **unchanged — already online** |
| `www/` (index.html + universe.js, 384 KB) | laptop | Cloudflare Pages |
| `/api/*` market proxy (`server.py`) | laptop | Cloudflare Worker, **same origin** |
| `server.py` | the app | **stays, as the local dev server** |

`api()` uses **relative** paths, so `/api/*` must be same-origin with the page. That single fact is
why this is Pages + a Worker route rather than two services glued together, and it means the client
needs no change.

The alternative — `server.py` on a free Python host — was rejected: Render is the only remaining free
option and it sleeps after 15 minutes with a ~60 s cold start, which is fatal for a live demo.

## E11.0 — the spike (done, passed)

The only thing that could have invalidated the plan: Yahoo deployed **TLS fingerprinting** in April
2025, and a Worker cannot control its TLS fingerprint. A web search found **no evidence either way**
about Cloudflare Workers specifically, so we measured it.

A throwaway Worker doing only the cookie/crumb handshake plus one quote call:

- **0 failures in 10 runs**, no rate limiting
- 25-symbol batch: 200, 24 results, 70 ms
- avg **310 ms** for five Yahoo calls with a *fresh crumb every time* — the worst case; real use caches it
- `/v8/finance/chart` needs **no cookie and no crumb**
- all of that latency is I/O, which does not count against the 10 ms CPU budget

**Verdict: the Pages + Worker route holds.** The tunnel fallback was not needed. The spike Worker
was deleted at cutover on 2026-08-18.

## Order, and what blocks what

```
E11.0 spike ✔
  ├── E11.1 backup + restore drill      (independent of hosting — do it regardless)
  └── E11.2 Worker port
        └── E11.3 deploy to Pages
              ├── E11.4 custom SMTP + Turnstile
              ├── E11.5 export + delete
              ├── E11.6 disclaimer + privacy note
              ├── E11.7 Sentry + feedback table
              └── E11.8 tests + CI
```

E11.1 and E11.5–E11.8 touch no credentials and can proceed in parallel with the port.

## Owner-only actions

Nothing here can be done for you — they are accounts, credentials, or dashboard settings.

| For | Action |
|---|---|
| E11.1 | Add `SUPABASE_DB_URL` to GitHub Secrets — **session pooler, port 5432** |
| E11.3 | Supabase Auth: Site URL + Redirect URLs (`/**`, not `/*`) |
| E11.4 | Gmail app password *or* Resend key → paste into Supabase, never into chat |
| E11.4 | Turnstile: secret key → Supabase; send only the **site** key (it is public) |

Cloudflare account and `wrangler login`: **done 2026-08-16**, subdomain `portfoliobuilder.workers.dev`.

## Deliberately not doing

Staging environment (two environments is enough at this size), SLOs and error budgets,
supply-chain provenance, performance budgets, an accessibility audit, a support channel (owner
declined), a data-provider migration, and a domain. All real practices; none mechanically needed for
a handful of invited users. Revisit only if a user reports a problem that one of them would have
caught.

## Usage discipline against Yahoo (settled 2026-08-16)

There is **no published rate limit**, and the widely-quoted "360 requests/hour" traces to a single
uncited sentence in a spam-locked GitHub issue. Genuine reports span 40 to ~950 requests — two orders
of magnitude — which is itself evidence that no fixed counter is being enforced. Most reported
"rate limiting" is bot detection, not volume.

Already shipped ahead of this epic:

- **No automatic requests outside the regular session** — a tab left open over a weekend used to make
  ~2,880 requests for data that cannot move. ~81% cut.
- **Crumb validators reject an error body.** `"Edge: Too Many Requests"` is 23 characters with no
  `<`, so it passed validation and was sent as `?crumb=`. Fixed in both `server.py` and
  `yEnsureCrumb` — the Worker port inherits the latter.
- **Concurrency 8 → 4** in both fan-outs (4 is yahoo-finance2's published cap).
- **`QUOTE_TTL` 15 s → 60 s** — below the poll interval it could never serve a hit.

Resulting load: **~500 calls/day, weekdays only**, a sustained 0.017/sec against the ~1/sec
practitioners report as safe. Roughly 60× headroom. Targets to hold: ≤1 req/sec, ≤4 concurrent, JSON
endpoints only, cache the crumb, back off on 429 and never treat an error body as data.
