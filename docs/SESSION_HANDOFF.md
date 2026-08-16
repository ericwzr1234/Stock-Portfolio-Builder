# Session handoff — read this first

**Prod `main` carries E1–E10 complete, and 10 of 13 E11 tickets.** The app is still served from
localhost; **nothing is public yet**. Remaining in E11: `E11.3` deploy to Pages (hygiene already done in `E11.3a`), `E11.4` custom SMTP,
`E11.7` Sentry + feedback.

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

## Next: E11.3, deploy to Pages

Everything it needs is green. The Worker (`worker/`, deployed as `pb-proxy`) is proven interchangeable
with `server.py`. Steps:

1. Cloudflare Pages project serving `www/`. `/api/*` **must be same-origin** — `api()` uses relative
   paths — so put the Worker's code in Pages Functions rather than gluing two services together.
2. `robots.txt` + `noindex`. The URL is meant to be unlisted; an indexed sign-in page defeats that.
3. Web app manifest + icon, so it opens from the phone home screen with no URL bar. **That is the
   owner's actual demo requirement.**
4. Show the app version in the UI, or the first bug report is unanswerable.
5. **Owner action:** Supabase Auth → Site URL + Redirect URLs as `https://<host>/**` — note the
   *double* asterisk; `/*` does not match nested paths. Keep the localhost entries.
6. Delete the `pb-yahoo-spike` Worker at cutover.

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
so a run can never collide with it. Worker: `pb-proxy.portfoliobuilder.workers.dev`.
