# E10 — History retention and revert

**Status:** requirements captured 2026-08-15. NOT built. Owner's decisions recorded verbatim below.

## The owner's requirements

> *"I still would like the idea to be able to revert back to a historical version/moment of the
> portfolio. This does not limit to the last edits made, but even earlier changes are fine too."*

> *"We will keep only the last 10 edits the users made. Any earlier edits will be removed/dropped
> from the database. We can safely assume that no one will want to revert to backups 10 edits ago."*

So: **revert-to-any-point stays**, over a **rolling window of the 10 most recent checkpoints**.

---

## E10.1 — Cap the checkpoint history at 10

### Why
Every checkpoint deep-copies the whole state — holdings, themes, membership, watchlist, overrides,
metric config (`snapshotState`). Nothing prunes them, so the document grows without bound. Enough
rebalances and the PATCH body exceeds the request limit: saving then fails **permanently**, with a
generic HTTP error and no diagnosis. That is the failure mode this ticket exists to prevent.

### What to build
On save, keep the 10 most recent checkpoints and drop the rest from `versions[]`.

### The traps — read before writing code

1. **`head` is an INDEX into `versions[]`.** Dropping entries from the front shifts every index.
   `head` must be re-based in the same operation, or undo/redo silently jumps to the wrong
   checkpoint. `canUndo()`/`canRedo()`/`currentVersion()` all read it.
2. **Never prune below `head`.** If the user has undone back to checkpoint 3 of 12, pruning to "the
   last 10" must not discard the entry they are currently sitting on, or the redo future they can
   still reach. Prune relative to `versions.length`, then clamp — and consider not pruning at all
   while `head < versions.length-1` (a fork is in progress).
3. **`totalContributed` and cost basis are carried on the document, not derived from the version
   list**, so dropping old checkpoints does not corrupt them. Verify this holds before relying on it.
4. **The equal-weight benchmark on Overview walks `versions[]`** (`valueHistory`). Truncating history
   shortens that chart — expected, but the chart's note ("N checkpoints") must not claim more than
   it has.
5. **Prune on WRITE, not on read.** A read-side filter would leave the document growing in the
   database, which is the thing being fixed.
6. **One prune point.** `pushVersion` is the only place a checkpoint is added; prune there, so no
   future caller can bypass it.

### Acceptance
- A book with 30 checkpoints prunes to 10 on the next save, `head` still points at the same logical
  checkpoint, and undo/redo walk the retained 10 correctly.
- Reverting to the oldest retained checkpoint restores exactly the state it recorded.
- The document written to the account is measurably smaller; nothing else about it changes.

---

## E10.2 — Undo must not silently discard model edits

### The problem (pre-existing; identical in prod, NOT introduced by E5–E9)
`snapshotState` versions `themes`, `themeTickers` and `watchlist`, and `restoreVersion` overwrites
all three from the snapshot. But `createTheme`, `deleteTheme`, `renameTheme`, `setMembership` and
`addToWatchlist` **do not** create a checkpoint — they only save.

So: create a theme, add its names, watchlist three candidates, then press **Undo** on the last
rebalance → the theme, its membership and the watchlist entries are replaced by the older snapshot
and persisted. The toast says *"Redo available"*, but redo restores the same checkpoint, which also
predates the theme. The work is unrecoverable.

This does **not** conflict with the owner's requirement — reverting to a historical moment is
wanted. The defect is that edits made *since* the last checkpoint vanish without warning.

### Two ways to fix it — decide before building

**Option A — checkpoint structural edits.** Have `createTheme`/`deleteTheme`/`renameTheme`/
`setMembership` call `pushVersion` with a non-trade label ("THEME"). Nothing is ever lost, and undo
walks them like any other step.
*Cost:* more checkpoints, which the E10.1 cap then consumes — a few theme edits could push a real
rebalance out of the retained window. Mitigate by capping trades and structural edits separately, or
by counting only trade checkpoints toward the 10.

**Option B — warn, and keep the current semantics.** Undo/redo/revert tell the user plainly that
themes, membership and the watchlist will also move to that point, and name what will be lost.
*Cost:* the work is still lost if they accept; it just stops being a surprise.

**Recommendation: A, with only trade checkpoints counting toward the retention cap.** It matches the
owner's stated model — *revert to a historical moment of the portfolio* — where "the portfolio"
sensibly includes the themes that defined it. B leaves a known data-loss path open and only labels it.

---

## Not in scope
Server-side retention (a SQL trigger trimming `data->'versions'`) was considered and rejected for now:
the document is read and written whole, so a client-side prune is sufficient, keeps the schema
untouched, and avoids a second place where history semantics live.

---

## Note for the first real-account test (2026-08-16)

The owner will register a **new account** and build from scratch; nothing is carried forward from the
pre-account `portfolio.json` — deliberately, so the first-run path is exercised for real.

**Expect the import prompt on first sign-in.** `portfolio.json` still exists on the machine (27
holdings, 9 checkpoints, $95,000), and the app offers a one-time import whenever the account is
confirmed empty and a local book is present. **Choosing "Start fresh" is the correct answer here** —
it declines the import, marks this account as asked, and leaves the file untouched. The file remains
as a pre-account backup; the app never writes it.

If a genuinely empty first run is wanted without the prompt appearing at all, move `portfolio.json`
aside before starting the server — but there is no need: declining is a supported path and is worth
testing in its own right.
