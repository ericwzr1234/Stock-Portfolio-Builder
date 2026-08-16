# Session handoff — read this first

**State: E6–E9 are built, tested, and NOT merged.** `main` = `e76dd1b` (E1–E5).
`dev-newUI` = `4628450`, 30 commits ahead. Nothing is lost by stopping here; `main` is untouched, so
the app the owner runs today is exactly what it was.

---

## The one thing blocking the merge

**A review pass over the last batch of fixes.** Commit `4628450` fixed six findings (one HIGH) that a
pre-merge check raised, and *no independent pass has seen those fixes*.

That is not caution for its own sake. Every time this project merged on the author's own verification,
the next pass found defects in the very fixes just applied — fourteen rounds running. The last one was
sharp: while fixing, a one-line comment swallowed `renderAll`'s body (it sat on the same line as its
opening brace) and blanked the entire page. Text substitution cannot see that.

**Do this first:**

1. `py -3 tools/check_syntax.py` — must print `final depth : 0`. Run this after ANY scripted edit.
2. Review `git diff 178fdc4..HEAD -- www/index.html` (the six fixes) for the project's standing failure
   mode: *a fix applied in one place but not every place it belongs*, and *a guard placed after the
   mutation it prevents*.
3. If clean: `git checkout main && git merge dev-newUI && git push origin main`, then move the ten
   `integration` tickets to `done` and re-render the board.

---

## What is being merged

| Epic | What it does |
|---|---|
| **E6** | Mandatory login; one Supabase row per user; isolation enforced by database row-level security; optimistic concurrency on a monotonic `revision` |
| **E7** | Genuinely empty first run + a guided tour (coach marks), one per view |
| **E8** | The persistence core rewritten around **one context, one checkpoint**; **no default themes** — every account builds its own |
| **E9** | **Nothing about a portfolio is written to the device.** No mirror, no stash, no cached copy |

The **engine is untouched** — verified byte-identical to `main` at every stage (48 functions on the
last full audit). E5's UI, the SQL/RLS, and the import flow are unchanged by the last batch.

---

## After the merge — the owner's plan

They register a **new account** and build from scratch. **Nothing is carried forward**, by their
decision, so the first-run path gets exercised for real.

**Expect the import prompt.** `portfolio.json` is still on the machine (27 holdings, 9 checkpoints,
$95,000), and the app offers a one-time import whenever an account is confirmed empty and a local book
is present. **"Start fresh" is the right answer** — it declines, marks the account as asked, and leaves
the file untouched.

---

## Known problems, still open

### Needs the owner (Supabase dashboard), in this order — before ANY tester is invited
1. **Move to a paid tier.** Free projects pause after a week idle; since E9 removed every local copy, a
   paused project means testers see nothing at all rather than a cached portfolio.
2. **Custom SMTP.** The built-in sender is capped at **2 emails/hour**, so invites and password resets
   stall silently.
3. **Invite-only signup.** Currently **open** — the owner's own registration with a real email
   confirmed it. Anyone with the URL can create an account.

The isolation gate itself is **8/8** (`sql/ISOLATION_TEST.md`), including the deletion cascade, which
the owner closed by deleting a user known to hold a row and watching `portfolio_rows` drop 2 → 1.

### Next build work — requirements captured, not started
- **E10.1 — cap history at 10 checkpoints.** Owner: *"we will keep only the last 10 edits… any earlier
  edits will be removed/dropped from the database."* Why it matters: every checkpoint deep-copies the
  whole state and nothing prunes them, so a long-lived book eventually exceeds the request body limit
  and saving fails **permanently** with a generic error. **The trap:** `head` is an *index* into
  `versions[]` — pruning the front silently repoints undo unless `head` is re-based in the same
  operation, and never prune below `head` or mid-fork.
- **E10.2 — undo silently discards theme/membership/watchlist edits** made since the last checkpoint,
  while the toast says "Redo available" and redo cannot bring them back. **Pre-existing — byte-identical
  in `main`, not introduced by E6–E9.** Two options costed in the spec; recommendation is to checkpoint
  structural edits, with only *trade* checkpoints counting toward E10.1's cap.

Both specs: `docs/features/E10_history-retention.md`.

### Parked
- **APP2** — rebuild iOS against `docs/V2_WEB_BASELINE.md`. Its §9 lists the sync rules the native build
  must inherit, and flags that iOS needs a **deliberate decision**: V1 is genuinely local-first, and a
  mirror shadowing an account is exactly the hybrid that produced most of E6's defects.
- Weekly Xcode re-run to refresh the free 7-day signing cert.

---

## Before touching the persistence layer

Read **`docs/features/E6_database_design.md` §16–21**. It records ~130 defects across fourteen review
rounds, each invariant written next to the failure that motivated it. The contract is stated once in
the code as **C1–C5** (`www/index.html`, comment "E8 - the persistence contract").

Two rules earned the hard way, and worth more than the rest of the document:

- **A guard must measure the thing it guards against.** An "identity" counter that also counted token
  refreshes discarded a live portfolio on every stale reload. An "is there anything to keep" test that
  measured holdings-and-checkpoints classified an entire onboarding as nothing.
- **A refusal that has already mutated is not a refusal.** Three separate HIGH findings were a guard
  placed one line below the assignment it existed to prevent.

## Test accounts
`test-a@example.com` / `Test@1234` — holds a copy of the dev book.
`test-b@example.com` was **deleted** to prove the deletion cascade, so any future cross-account test
needs a second account created from the dashboard first.

Dev server: `.claude/launch.json` → `portfolio-dev`, port **8766**, `PB_DB=portfolio.dev.json`.
Never test against the real `portfolio.json` (md5 `39FB8991E3BCDEACE4F51460C497F2DB`, unchanged since
2026-07-13).
