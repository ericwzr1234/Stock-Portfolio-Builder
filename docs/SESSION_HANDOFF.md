# Session handoff — read this first

**State: E6–E10 are built, tested, and MERGED to `main`/prod (2026-08-16).**
The app in prod is now the account-based one: mandatory login, one Supabase row per user, nothing
about a portfolio stored on the device, no default themes, and a rolling 10-checkpoint history.

**Nobody but the owner should be invited yet** — see *Needs the owner* below. Signup is still open.

---

## What shipped today

| Epic | What it does |
|---|---|
| **E6** | Mandatory login; one Supabase row per user; isolation enforced by database row-level security; optimistic concurrency on a monotonic `revision` |
| **E7** | Genuinely empty first run + a guided tour (coach marks), one per view |
| **E8** | The persistence core rewritten around **one context, one checkpoint**; **no default themes** — every account builds its own |
| **E9** | **Nothing about a portfolio is written to the device.** No mirror, no stash, no cached copy |
| **E10** | **The 10 most recent checkpoints are kept**; older ones are dropped from the database. Undo/revert no longer rewinds the theme list, its membership, or the watchlist |

The **allocation engine is untouched** — verified by extracting each function body and byte-comparing
against `main` at every stage. The only two that differ do so deliberately: `applyRebalance` reports
whether the save actually landed, and `restoreVersion` implements E8/E10.2. The arithmetic is
identical.

---

## The owner's plan for the next session

Register a **new account** and build from scratch. **Nothing is carried forward**, by their decision,
so the first-run path gets exercised for real.

**Expect the import prompt.** `portfolio.json` is still on the machine (27 holdings, 9 checkpoints,
$95,000), and the app offers a one-time import whenever an account is confirmed empty and a local
book is present. **"Start fresh" is the right answer** — it declines, marks the account as asked, and
leaves the file untouched.

**Sign-out → sign-in was confirmed working by the owner (2026-08-15/16).** The assistant does not
enter passwords, so `signedIn()`'s tightened test (`sbValidSession`) was verified here by tracing
every writer of `sbSession` and unit-testing the predicate; the owner exercised the live cycle.

---

## Supabase: the owner's decisions (2026-08-16) — all three deferred, deliberately

**We are not in the testing phase yet, so none of these is a blocker right now.** Owner's calls:

1. **Open signup — accepted for now.** Anyone with the URL can create an account. Revisit before
   inviting anyone.
2. **Custom SMTP — deferred.** Resolves when moving to the paid tier at testing time.
3. **Paid tier — deferred.** The interim plan is to **resume the project manually** whenever it
   pauses (see below).

`E6.7` stays in `integration` as the reminder that these are still outstanding, not because anything
is broken. The isolation gate itself is **8/8** (`sql/ISOLATION_TEST.md`), deletion cascade included.

### Resuming a paused free project

A Free-plan project is paused after **7 days of low activity**, and Supabase emails a warning first.
To bring it back:

1. Open the [Supabase dashboard](https://supabase.com/dashboard).
2. Select the organization, then the paused project.
3. Click **Resume project** and confirm. It comes back with its data and configuration intact.

A paused project stays restorable for **up to 1 year** (backup retention is the limit), so a missed
week is not a problem.

**Simpler than resuming: don't let it pause.** Pausing is triggered by *inactivity*, and "a few
requests a day over the previous week" is enough to avoid it. Opening the app and signing in once a
week is itself that activity — every sign-in hits GoTrue and every load hits PostgREST. So the weekly
habit that keeps it alive is just *using* it, not visiting the dashboard.

**If a resume ever changes the project URL or publishable key** (it should not — the project ref is
preserved), the app hardcodes both at `www/index.html:1563-1564` (`SB_URL`, `SB_KEY`) and they would
need updating there. The publishable key is public by design; the secret key must never appear in the
repo.

---

## Before touching the persistence layer

Read **`docs/features/E6_database_design.md` §16–21**. It records ~130 defects across fourteen review
rounds, each invariant written next to the failure that motivated it. The contract is stated once in
the code as **C1–C5** (`www/index.html`, comment "E8 - the persistence contract").

Three rules earned the hard way, and worth more than the rest of the document:

- **A guard must measure the thing it guards against.** An "identity" counter that also counted token
  refreshes discarded a live portfolio on every stale reload. An "is there anything to keep" test that
  measured holdings-and-checkpoints classified an entire onboarding as nothing.
- **A refusal that has already mutated is not a refusal.** Four separate HIGH findings were a guard
  placed one line below the assignment it existed to prevent — the latest being the danger-zone reset,
  whose assignment was itself what stopped the save's own guard from firing.
- **When you teach the code a new fact, teach every reader of it.** E10.1 made
  `versions()[0]` no longer the initial build. `canUndo()` was taught; `valueHistory()` was not, and
  its cumulative equal-weight reconstruction silently restarted from zero capital — reporting
  fabricated performance numbers on the Overview. Found only by an independent pass.

**`tools/check_syntax.py` is mandatory after any scripted edit.** A one-line comment once swallowed
`renderAll`'s body (it sat on the same line as its opening brace) and blanked the whole page; text
substitution cannot see that, and the checker found it in seconds.

---

## Still open

### Next build work
- **APP2** — rebuild iOS against `docs/V2_WEB_BASELINE.md`. Its §9 lists the sync rules the native
  build must inherit, and flags that iOS needs a **deliberate decision**: V1 is genuinely local-first,
  and a mirror shadowing an account is exactly the hybrid that produced most of E6's defects.
- Weekly Xcode re-run to refresh the free 7-day signing cert.

### Known and accepted, not bugs
- **The value chart shows the last 10 checkpoints only**, because `valueHistory()` derives entirely
  from `versions()`. Preserving a longer chart would need a second history array — more machinery than
  the retention requirement asks for. The equal-weight counterfactual is *re-anchored* at the oldest
  retained checkpoint (it opens holding what the book was really worth, and carries the last recorded
  price per symbol across the trim in `pxSeed`), so the comparison stays internally consistent — but
  it is a window comparison, not since-inception, once a trim has happened.
- **Weight/penalty/metric tweaks are still rewound by undo**, as the revert dialog says. Only the
  theme list, membership and watchlist were carved out (E10.2), because those are a library rather
  than part of a transaction.

## Test accounts
`test-a@example.com` / `Test@1234` — its history now holds throwaway synthetic checkpoints from the
E10 retention tests, so its Overview shows no equal-weight line (those checkpoints record no trades,
hence no prices — honest absence, not a bug). Rebuild it or ignore it.
`test-b@example.com` was **deleted** to prove the deletion cascade, so any future cross-account test
needs a second account created from the dashboard first.

Dev server: `.claude/launch.json` → `portfolio-dev`, port **8766**, `PB_DB=portfolio.dev.json`.
Never test against the real `portfolio.json` (md5 `39FB8991E3BCDEACE4F51460C497F2DB`, unchanged since
2026-07-13 and re-verified after every step today).
