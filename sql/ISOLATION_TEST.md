# E6.7 — proof of isolation (the gate before anyone is invited)

**Rule: no tester receives an invite until every check below passes.** Reading the policies is not
evidence — a policy that looks right can still fail open. These steps exercise the real database with
two real accounts.

Project: `https://uvzxdeiiwswhthfaqhtb.supabase.co`
Publishable key: `sb_publishable_smrzMSuM7plL-NWtHNt2BA_TJP6_lEY` (public by design — safe in client code)

---

## 0. Setup

Create **two** users in the dashboard (Authentication → Users → Add user). Call them **A** and **B**.
Give each a password you can type. Note their user ids.

Then get an access token for each — sign in as each user and capture the `access_token` from the
auth response. Everything below is a plain HTTP call, so `curl` is enough; no SDK required.

```
URL=https://uvzxdeiiwswhthfaqhtb.supabase.co
KEY=sb_publishable_smrzMSuM7plL-NWtHNt2BA_TJP6_lEY
```

---

## 1. Seed a row for each user

As **A** (token `$TA`):
```bash
curl -s -X POST "$URL/rest/v1/portfolios" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TA" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"user_id":"<A_ID>","data":{"marker":"A-secret"},"schema_version":1,"revision":1}'
```
Repeat as **B** with `{"marker":"B-secret"}`.

**PASS:** each insert succeeds and returns the row.

---

## 2. The one that matters — A must not be able to read B

As **A**, ask for everything:
```bash
curl -s "$URL/rest/v1/portfolios?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $TA"
```
**PASS:** exactly ONE row comes back — A's own. `B-secret` must not appear.
**FAIL:** two rows, or any sight of B's marker. Stop; do not invite anyone.

Now ask for B's row *by id*, which is the attack a curious tester would actually try:
```bash
curl -s "$URL/rest/v1/portfolios?user_id=eq.<B_ID>&select=*" -H "apikey: $KEY" -H "Authorization: Bearer $TA"
```
**PASS:** `[]` — an empty array, not an error. RLS filters rather than announcing that the row exists.

---

## 3. A must not be able to WRITE to B

```bash
curl -s -X PATCH "$URL/rest/v1/portfolios?user_id=eq.<B_ID>" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TA" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"data":{"marker":"A-was-here"},"revision":2}'
```
**PASS:** zero rows affected. Then re-read as **B** and confirm the marker is still `B-secret`.

Also try to smuggle a row in under B's id:
```bash
curl -s -X POST "$URL/rest/v1/portfolios" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TA" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<B_ID>","data":{"marker":"forged"},"schema_version":1,"revision":1}'
```
**PASS:** rejected by the insert policy.

---

## 4. Anonymous access is refused outright

With the publishable key but **no** user token:
```bash
curl -s "$URL/rest/v1/portfolios?select=*" -H "apikey: $KEY"
```
**PASS:** no rows and no data. The `anon` role holds no grant on this table, so an unauthenticated
caller cannot even attempt a read. This is the check that catches the `auth.uid()`-is-null trap.

> ✅ **VERIFIED 2026-08-15**, live against the project immediately after `001_portfolios.sql` was applied.
> Anonymous `select` → **HTTP 401** `{"code":"42501", "message":"permission denied for table portfolios"}`.
> Anonymous `insert` → **HTTP 401**, same code. The table exists (the error is *permission denied*, `42501`,
> not *relation does not exist*, `42P01`).
>
> ⚠️ That error carries a Postgres hint reading *"GRANT SELECT ON public.portfolios TO anon;"*. **Never
> follow it** — it is generic advice that would open the table to anonymous callers. The refusal is the
> control working.

---

## 5. Optimistic concurrency actually rejects a stale write

As **A**, note the current `revision` (call it `N`). Write once with the correct base:
```bash
curl -s -X PATCH "$URL/rest/v1/portfolios?user_id=eq.<A_ID>&revision=eq.N" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TA" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"data":{"marker":"A-v2"},"revision":N+1}'
```
**PASS:** one row returned, revision is now `N+1`.

Now replay the *same* stale request again (still filtering on `revision=eq.N`):
**PASS:** ZERO rows — this is the 409-equivalent that stops a second device silently overwriting the
first. The client must reload and tell the user, never merge.

Finally, try to rewind:
```bash
... -d '{"revision": 1}'
```
**PASS:** rejected by the `portfolios_guard` trigger — revision may only move forward.

---

## 6. Deleting the account removes the data

Delete user **A** in the dashboard, then check the table as **B** or via the SQL editor.
**PASS:** A's row is gone (`on delete cascade`). Nothing is orphaned.

---

## Sign-off

| # | Check | Result |
|---|---|---|
| 2 | A cannot read B (list) — only its own row returned | ✅ 2026-08-15 |
| 2 | A cannot read B (by id) — returns `[]`, filtered not errored | ✅ 2026-08-15 |
| 3 | A cannot update B — zero rows, B's data verified unchanged | ✅ 2026-08-15 |
| 3 | A cannot insert as B — **HTTP 403** | ✅ 2026-08-15 |
| 4 | Anonymous read refused — HTTP 401 | ✅ 2026-08-15 |
| 5 | Stale write rejected — zero rows (the 409) | ✅ 2026-08-15 |
| 5 | Revision cannot rewind — `400 revision must increase (have 2, got 1)` | ✅ 2026-08-15 |
| 6 | Account deletion cascades | ✅ 2026-08-15 — `portfolio_rows` 2 → 1 on deleting a user known to hold a row |

**Run 2026-08-15: 12 automated checks, 12 passed, 0 failed.** Executed against the live project with two
real accounts (`test-a@` / `test-b@`), not simulated.

Also verified at the APPLICATION level, not just the API:
- signing in flips the storage adapter `web` → `cloud`; signing out returns it to `web`;
- an account with no row keeps the local portfolio rather than blanking it, and the first save creates
  the row (25 holdings, 3 versions, revision 5 confirmed server-side);
- after A saved a real portfolio, **B still saw zero rows** — isolation holds against real data, not just
  test markers;
- sign-out clears the stored session and the app keeps working entirely on local storage.

Seven of eight ticked. **Check 6 is the only one outstanding**, and it needs a dashboard action:
delete a test user, then confirm their row is gone (`on delete cascade`).

---

## Second application-level run — 2026-08-15, after the sync hardening

The checks above proved the *database* isolates users. These prove the *app* does, which is a
separate claim: RLS can be perfect while the client still shows one account another's data from
memory or from a shared local key. Run through the real UI (gate → sign in → save → sign out),
not by calling the API directly.

| Check | Result |
|---|---|
| A writes marker `MARKERA` through the real save path; server confirms it | ✅ |
| B signs in — sees `[]`, **not** `MARKERA` | ✅ |
| B writes `MARKERB`; A signs back in and still holds `MARKERA`, never sees `MARKERB` | ✅ |
| Sign-out empties `state.portfolio`, `baseRevision`, watchlist, badge | ✅ |
| Each account gets its own `pb_cloud_mirror_<uid>` — two distinct keys | ✅ |
| `pb_portfolio_v1` (the on-device book) byte-identical after the full cycle — 18,871 bytes | ✅ |
| Forced network failure → `savePortfolio()` returns `false`, base unchanged, badge reads *not synced* | ✅ |
| The next save after that failure **succeeds** — no permanent false conflict | ✅ |
| Simulated second device wins a race → its write survives, ours does not clobber it | ✅ |
| The rejected edit is stashed complete (25 holdings) to `pb_conflict_<uid>_<ts>` | ✅ |
| All five views render after the changes; zero console errors | ✅ |
| Real `portfolio.json` untouched — last written 2026-07-13 | ✅ |

Test accounts were left clean (markers and stashes cleared).

---

## Before anyone else is invited — three dashboard actions

These need admin rights on the Supabase project. **I cannot and will not do them for you** — they
are account-level changes on a service in your name.

**1. Check 6 — account deletion cascades.**
Authentication → Users → delete one of the test users, then in the SQL editor run
`select user_id from public.portfolios;` and confirm that user's row is gone. This is the last
box on the gate above.

**2. Custom SMTP — required before any invite.**
The built-in sender is capped at **2 emails per hour** and is explicitly not for production. With
it, a confirmation or reset email will silently fail to arrive and the tester will think the app is
broken. Project Settings → Authentication → SMTP Settings, point it at any provider you already
have. Until this is done, invite nobody.

**3. Invite-only signup.**
Signup is currently **open** (`disable_signup` = false), so anyone who reaches the URL can create an
account. Authentication → Providers → Email → turn off "Allow new users to sign up", then add
testers yourself via Add user. Do this before the URL is shared with anyone.

---

## Check 6 — where it actually stands (2026-08-15)

The owner registered a real account (`ericwzr@outlook.com`) through the app's own gate **with email
confirmation**, then deleted it from the dashboard, and ran:

```sql
select
  (select count(*) from auth.users where email = 'ericwzr@outlook.com') as your_account_still_there,
  (select count(*) from public.portfolios) as portfolio_rows,
  (select count(*) from public.portfolios p
     left join auth.users u on u.id = p.user_id
    where u.id is null) as orphaned_rows;
```

Result: **`0 · 2 · 0`**.

**Proven by this:**
- The account is genuinely gone from `auth.users` — deletion works.
- **Zero orphaned rows**: no portfolio data survives pointing at a deleted user. This is the
  property that actually matters for privacy, and it holds.
- Signup + email confirmation work end to end through the built-in sender.

**NOT proven by this, and worth being honest about:** `portfolio_rows = 2` is exactly the two test
accounts (`test-a`, `test-b`), each of which has a row. So we cannot tell whether the deleted
account ever *had* a row. If it never did, `orphaned_rows = 0` is trivially true rather than
evidence that `on delete cascade` fired.

**CLOSED DEFINITIVELY — 2026-08-15.** The owner ran the decisive version:

1. `select u.email, p.revision, jsonb_array_length(coalesce(p.data->'versions','[]'::jsonb)) as checkpoints
    from public.portfolios p join auth.users u on u.id = p.user_id order by u.email;`
   → returned **`test-a` (revision 19, 3 checkpoints)** and **`test-b` (revision 2, 4 checkpoints)**,
   establishing that `test-b` genuinely held a row.
2. Deleted `test-b@example.com` in Authentication → Users.
3. Re-ran the count → **`portfolio_rows` dropped 2 → 1**, `orphaned_rows` still `0`.

That is `on delete cascade` actually firing on a row known to exist — not a vacuous zero. **Check 6
passes.** The isolation gate is now **8 of 8**.

> ⚠️ **Test-account note:** `test-b@example.com` no longer exists. Any future cross-account test
> (checks 2, 3 and the application-level A/B marker run) needs a second account created again from
> the dashboard — the assistant does not create accounts. `test-a@example.com` / `Test@1234`
> survives and still holds the dev book.

### One related guarantee, already implemented

If an account is deleted while a session is still open on another device, that session's next
request returns 401/403, which converges on `sbApi`'s lock-out: the app clears all account state,
stops its timers, drops that account's offline mirror (after filing any unsaved copy) and returns
to the login page with *"Your session is no longer valid."* It does not carry on unauthenticated.
