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
| 2 | A cannot read B (list) | ☐ |
| 2 | A cannot read B (by id) | ☐ |
| 3 | A cannot update B | ☐ |
| 3 | A cannot insert as B | ☐ |
| 4 | Anonymous read refused | ✅ 2026-08-15 |
| 5 | Stale write rejected | ☐ |
| 5 | Revision cannot rewind | ☐ |
| 6 | Account deletion cascades | ☐ |

All eight ticked → invites may go out. Any box unticked → fix, then run the whole sheet again.
