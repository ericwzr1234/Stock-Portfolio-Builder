# Session handoff — read this first

**Prod `main` carries E1–E11 partial.** E6–E10 shipped 2026-08-16. E11 (online, for invited users)
is under way: **E11.0, E11.1, E11.5, E11.6, E11.8 are done**; E11.2, E11.3, E11.4, E11.7 remain.

The app is still served from localhost. Nothing is public yet.

---

## The owner's shape decision — everything follows from this

> *"personal use, with a few, limited users on invite-only basis. This will never go public or
> commercial."* — and invite-only means **an unlisted URL where anyone who has it signs up normally**.

Free, non-commercial, forever. That is why there is no ToS/LLC/insurance stack, why the data provider
is not changing, and why the domain is optional. Full reasoning in
`docs/features/E11_online-deployment.md`.

**Standing constraints (2026-08-16):** anything costing money stops for a decision (E11 as scoped is
$0); nothing that creates legal exposure; root causes not patches, in every place the cause lives;
concise code with no abstraction that is not mechanically needed.

---

## Done in E11

| | |
|---|---|
| **E11.0** | Spike: Yahoo works from Cloudflare. 0 failures in 10 runs, 25-symbol batch in 70 ms, `/v8/chart` needs no crumb. Throwaway Worker still live at `pb-yahoo-spike.portfoliobuilder.workers.dev` — **delete at cutover**. |
| **E11.1** | Nightly `pg_dump` → **restored into a throwaway Postgres every run** and asserted. Supabase Free has *zero* backups. Proven: `portfolio rows restored: 1`. |
| **E11.5** | Export ("Download my data") + self-serve deletion via a `SECURITY DEFINER` function. `sql/002_delete_own_account.sql` is **installed**. |
| **E11.6** | Disclaimer + what-we-store, reachable from the gate (needed `.over-gate`, z-index 500 — the gate is 400). |
| **E11.8** | 12 Playwright engine tests + CI, both gates able to fail. **Mutation-tested** against the real E10.1 defect. |

## Next: E11.2, the Worker port

Everything it needs is in place and green. Five steps:

1. Swap the CapacitorHttp transport in `yGet` for `fetch` — **and add the browser User-Agent plus
   manual cookie handling**. Workers have no cookie jar, and Yahoo rejects generic agents.
2. Cache the crumb in Workers KV (the spike refetched it per request — two wasted calls each time).
3. Close the `nativeFundamentals` field gap so it returns the same ~21 fields `server.py` does.
4. **Response-diff harness: Worker vs `server.py`, field by field, same symbols, before cutover.**
   A data-layer rewrite must not go in on inspection alone.
5. **Do not deploy `/api/portfolio`** — unauthenticated read/write of a server-side file.

Then E11.3 (Pages + `robots.txt`/noindex + manifest + Supabase Auth URLs), E11.4 (custom SMTP —
**required**, the built-in mailer only delivers to project team members — plus Turnstile), E11.7
(Sentry + feedback table).

---

## Owner actions outstanding

- **Re-run nothing** — backup and CI are both green and armed.
- **E11.4 will need:** a Gmail app password *or* Resend key → pasted into Supabase, never into chat;
  Turnstile secret → Supabase, site key → me (it is public).
- **`E6.7` stays open** as the reminder that three Supabase items are deferred by choice: open signup
  accepted for now, custom SMTP and paid tier resolve at testing time. Free projects pause after
  7 days idle — resume from the dashboard, though simply *using* the app weekly prevents it.

---

## Rules earned the hard way — worth more than the rest of this file

- **A guard must measure the thing it guards against.** The crumb validator's comment said "no
  spaces" and never tested for them, so `"Edge: Too Many Requests"` (23 chars, no `<`) passed as a
  crumb. `check_syntax.py` only ever printed, so as a CI gate it could not fail. `timelineTrimmed()`
  inferred truncation from id arithmetic instead of recording it.
- **A refusal that has already mutated is not a refusal.** Four separate HIGH findings, the last
  being the danger-zone reset, whose own assignment is what stopped the save guard from firing.
- **When you teach the code a new fact, teach every reader of it.** E10.1 made `versions()[0]` no
  longer the initial build; `canUndo()` learned it and `valueHistory()` did not, so the Overview
  reported a fabricated equal-weight return. Found by an independent pass, not by my testing.
- **A fix applied in one place belongs in every place it lives.** Concurrency capped in `server.py`
  and missed in the JS client. Retention disclosed in three strings and missed on the gate.
  `check_syntax.py` hardcoded one machine's path while its two sibling tools resolved from
  `__file__`.

**`tools/check_syntax.py` after any scripted edit. `npx playwright test` after any engine change.**
Both now exit non-zero when they should.

---

## Test accounts and data

`test-a@example.com` — its history holds throwaway synthetic checkpoints from the E10 tests, so its
Overview shows no equal-weight line (those record no trades, hence no prices — honest absence, not a
bug). **Its session was invalidated late in the session; sign in again to resume cloud testing.**
`test-b` was deleted to prove the cascade.

The real `portfolio.json` has never left the machine — md5 `39FB8991E3BCDEACE4F51460C497F2DB`,
unchanged since 2026-07-13, re-verified after every step.

Dev server: port **8766**, `PB_DB=portfolio.dev.json`. Tests use port **8767** and
`portfolio.test.json` so they can never collide with it.
