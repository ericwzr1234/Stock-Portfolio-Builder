# E6 — Accounts & hosted database: the design

- **Epic:** E6 · Multi-user platform · **Stage:** design (nothing built)
- **Prereq:** E5 shipped (V2 web is in prod). Roadmap context: [`E6_multi-user-platform.md`](E6_multi-user-platform.md)
- **Phase:** 2 — *me + a handful of invited friends, free tier.* Not a public launch.

---

## 1. What has to become true

Today the entire app state lives in one local `portfolio.json`. For Phase 2 it must become:

1. **Account-based** — a user registers, logs in, and sees *their* portfolio.
2. **Isolated** — one user can never read or write another's data, enforced by the server, not the client.
3. **Encrypted** — TLS in transit, encrypted at rest.
4. **Durable and central** — reachable from web today and the phone later; the laptop is no longer the database.
5. **Complete** — portfolios, rebalance records, and the full version timeline (including revert) all persist.

Everything else about the app stays as it is.

## 2. The one piece of luck: we only have to replace an adapter

Every read and write already funnels through **`loadPortfolio()` / `savePortfolio()`**, with three
implementations behind it (web file, iOS localStorage, LAN sync). E5 left both functions **byte-identical**
to V1 — verified. The engine (`computeAllocation`, `planTrades`, `applyRebalance`, the version timeline) is
pure and does no I/O.

**So E6 is a fourth adapter plus a login screen. No engine change, no UI rewrite.** That is the single most
important constraint to protect: if a change starts requiring edits inside `computeAllocation`, stop.

## 3. Recommended shape

```
Browser (www/index.html, unchanged UI)
   │  loadPortfolio() / savePortfolio()      ← the existing seam
   ▼
cloudAdapter  ──HTTPS──►  Managed backend
                          ├── Auth  (email + password / magic link, provider-managed)
                          └── Postgres
                               └── portfolios (one row per user, RLS-enforced)
```

**Use a managed backend-as-a-service** (auth + Postgres + row-level security + TLS in one) rather than
hand-rolling a server. Rationale, in order of weight:

1. **Never hand-roll password storage.** Hashing, resets, session rotation, and lockout are exactly where
   solo projects get breached. A provider does this for a living.
2. **Row-level security in the database** means isolation survives a bug in my code. Client-enforced
   filtering does not.
3. **Free tiers comfortably cover "a handful of invited testers."**
4. HTTPS, backups and at-rest encryption come as defaults rather than as work.

**The honest cost:** this ends the project's "zero dependencies, no API keys" character. The client will
carry a *public* anon key (safe by design — it only permits what RLS allows), and there will be a service
running that isn't `python server.py`. Worth stating plainly because it has been a defining constraint.

**Alternative if you'd rather stay self-hosted:** extend `server.py` with sessions + a Postgres/SQLite
backend on a small host. More control and no vendor, but you personally own auth security, TLS certs,
backups and patching. I'd not recommend it for Phase 2.

## 4. Data model — start as a document, normalise only if needed

```sql
create table portfolios (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  schema_version int         not null default 1,
  revision       bigint      not null default 1,   -- monotonic; the concurrency token
  updated_at     timestamptz not null default now(),
  data           jsonb       not null              -- exactly today's portfolio.json shape
);
alter table portfolios enable row level security;
create policy own_row on portfolios
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Why one JSONB document rather than normalised tables.** The existing shape (`holdings`, `versions[]`
with per-version snapshots and trades, `weights`, `metricCfg`, `presets`) is already a coherent aggregate
that is always read and written whole. Storing it as a document means:

- `loadPortfolio`/`savePortfolio` keep their exact semantics → genuinely a drop-in adapter;
- migration is a single insert of the current file;
- the version timeline (undo/redo/fork) keeps working untouched — it is the trickiest logic in the app and
  I do not want to re-express it as rows in the same step that introduces auth.

**Normalise later, and only when a query demands it** — e.g. cross-user analytics, or a trade ledger you
want to query directly. That is a Phase 3 concern, and JSONB can be migrated into tables in place.

**One row per user** for now. If multiple portfolios per user is ever wanted, the key becomes
`(user_id, portfolio_id)` — the adapter is where that would be absorbed.

## 5. Concurrency: the same account on two devices

The real hazard is last-writer-wins silently destroying a rebalance. Use **optimistic concurrency**:

- Every save sends the `revision` it was based on.
- The server updates **only if** the stored revision still matches, and increments it.
- A mismatch returns **409 Conflict**; the client reloads the server copy and tells the user plainly
  ("this account was changed on another device — reloaded"), rather than merging blindly.

```sql
update portfolios
   set data = $new, revision = revision + 1, updated_at = now()
 where user_id = auth.uid() and revision = $base
returning revision;          -- zero rows => conflict
```

Financial records should never be auto-merged. Rejecting a stale write and forcing a reload is the honest
behaviour, and the app's existing checkpoint model makes the reload cheap to explain.

## 6. Encryption — and what "high security" can and cannot mean

| Layer | Phase 2 | Notes |
|---|---|---|
| In transit | **TLS everywhere** | Required by iOS ATS anyway |
| At rest | **Provider-managed encryption** | Standard, recoverable, invisible to the app |
| Access control | **Row-level security** | The actual defence against cross-user leakage |
| Secrets | Only a **public anon key** in the client | Service keys never leave the server |

**Client-side end-to-end encryption** (the server stores ciphertext it cannot read) is the strongest option
and worth naming, but it carries a consequence you must accept deliberately: **forgetting the password means
the data is unrecoverable — no reset is possible** — and the server can no longer compute anything over the
data. For a testing phase with invited friends I recommend **not** doing this, and revisiting it only if the
app ever holds data for people you don't know.

## 7. Migration off `portfolio.json`

1. Add `schemaVersion`, `revision`, `updatedAt` to the saved document **first** (see E6.1) — while still
   local, so the shape is already right before any network is involved.
2. On first login, if the account has no row, offer **"import my local portfolio"**, which uploads the
   current file as-is.
3. Keep writing a **local mirror** after every successful save, exactly as the iOS LAN-sync adapter already
   does. That preserves offline reads and means the cloud is never a single point of failure.
4. Keep `portfolio.json` untouched on disk as the pre-migration backup until you say otherwise.

## 8. Ticket breakdown

| Ticket | Scope | Notes |
|---|---|---|
| **E6.1** | `schemaVersion` + monotonic `revision` + `updatedAt` on save | Local only, no backend. Small, and unblocks everything |
| **E6.2** | Extract a storage-adapter interface behind `loadPortfolio`/`savePortfolio` | Makes the 4th adapter a plug-in; no behaviour change |
| **E6.3** | Choose the provider; stand up project, schema, RLS policies | Includes the free-tier decision |
| **E6.4** | Login / register / logout UI + session handling | First real UI addition since E5 |
| **E6.5** | Cloud adapter: read/write with optimistic concurrency + 409 handling + local mirror | |
| **E6.6** | Import flow + cutover; keep the local file as backup | |
| **E6.7** | Security review: RLS proven with a second account, no secrets in the bundle, TLS enforced | **Gate before inviting anyone** |

**Sequencing note:** E6.1 and E6.2 are worth doing regardless of which provider is chosen — they are pure
forward-compatibility and carry no vendor decision. E6.3 is the first step that needs your input.

## 9. Decisions

### Settled (2026-08-15)
- **Registration: INVITE-ONLY.** Only addresses explicitly allowed may register. No stranger can ever
  create an account, which also keeps the market-data licensing question in personal-use territory
  through Phase 2.
- **Region: US.** Closest to the user and the testers; revisit before any public launch.
- **Account creation is the user's, not the assistant's.** I do not create accounts or sign up for
  services. The user creates the backend project; what reaches the repo is the project URL and the
  **public anon key** only. The service/secret key never leaves the user's hands and is never committed.

### Open
- **Provider choice** — managed backend-as-a-service vs self-hosting `server.py` + Postgres.
  Trade-off analysis in §11. This is the only thing blocking E6.3.

## 10. Explicit non-goals for Phase 2

No public signup, no billing, no password-less-only flows, no cross-user features, no analytics on user
data, no market-data redistribution (still Yahoo-for-personal-use — the licensing question is a **Phase 3**
blocker before any public launch, see [`E6_multi-user-platform.md`](E6_multi-user-platform.md) §7).


---

## 11. Managed vs self-hosted — the detailed comparison

### What you actually have to BUILD

| | Managed backend | Self-hosted `server.py` + Postgres |
|---|---|---|
| Register / login / logout | provided | build it |
| Password hashing | provided | build it (stdlib `hashlib.scrypt` is adequate — but it must be got right) |
| Password **reset** | provided (emails included) | build it **and** solve email delivery |
| Session tokens / expiry / rotation | provided | build it |
| Rate limiting, lockout | provided | build it |
| Per-user isolation | **row-level security, enforced by the database** | a `WHERE user_id = ?` you must never once forget |
| Portfolio schema + adapter | build it | build it |
| Login UI | build it | build it |

### What you have to OPERATE, forever

| | Managed | Self-hosted |
|---|---|---|
| TLS certificates | provided | issue + auto-renew, or the iOS app refuses to connect |
| OS / dependency patching | provided | yours |
| Backups **and a tested restore** | provided | yours |
| Uptime | provided | yours |
| Cost | free tier covers a handful of users | ~$5/month VPS, or a free tier that sleeps |

### The failure mode that actually decides it

**A tester forgets their password.** On managed, they click "forgot password" and get an email — done.
Self-hosted, that flow does not exist until you build it, which means standing up transactional email
(and fighting deliverability). Until then your only options are locking them out or hand-editing the
database. For a test with friends, "I can't get in" is the most likely support ticket by far, and it is
entirely avoidable.

The second one: **a single missed `WHERE user_id = ?` leaks another person's holdings.** Row-level
security makes that a database-enforced impossibility rather than a code-review promise. Given the data
is other people's real positions and cost basis, that difference matters more than the vendor question.

### The "no API keys" objection — smaller than it looks

The anon key is **public by design**; it grants nothing beyond what RLS allows. And the client can talk
to a managed Postgres over plain **REST with `fetch`** — no SDK, no bundler, no `node_modules`. So the
project keeps its zero-dependency, no-build character in the browser; what changes is that a hosted
service exists and a public key sits in the source.

### Lock-in

Moderate and mostly reversible: the data is ordinary Postgres and exports cleanly. The sticky part is
**identities** — migrating auth providers means every tester resets their password once. At five users
that is a non-event.

### Effort

Managed: E6.3–E6.6 in roughly 3–4 focused sessions. Self-hosted: realistically 2–3× that, plus
operations that never end.

### Recommendation

**Managed**, with the client talking REST-over-`fetch` so no dependency enters the browser. Self-hosting
is the right answer when you want no vendor at any cost — but it buys control by taking on precisely the
work (auth edge cases, TLS, backups) that has nothing to do with building a portfolio tool.


---

## 12. Threat model — what "secure" actually has to mean

Security here is not one property; it is eight separate things that can each fail independently. This is
who owns each one under either option.

| # | Threat | Managed | Self-hosted |
|---|---|---|---|
| 1 | **Password storage** — a stolen database reveals passwords | Provider: salted, modern KDF, rotated | You. Python's `hashlib.scrypt` is genuinely adequate, but you own cost parameters, unique salts and constant-time comparison |
| 2 | **Brute force / credential stuffing** | Provider rate-limits and locks out | You must build it, or logins can be guessed indefinitely |
| 3 | **Cross-user leakage** — A reads B's holdings | **Row-level security: the database refuses**, even if the app code is wrong | A `WHERE user_id = ?` in every query. One omission = a silent leak |
| 4 | **Interception in transit** | TLS by default, auto-renewed | You issue and renew certificates. An expired cert is an outage, and iOS will refuse the connection outright |
| 5 | **Data at rest** — disk or backup is obtained | Encrypted by default | You configure volume encryption yourself |
| 6 | **Secret leakage** | Anon key is public *by design*; the service key stays server-side | You hold DB credentials and a session secret; both must stay out of git |
| 7 | **SQL injection** | Parameterised REST + RLS as a second line | You parameterise every query, with no second line |
| 8 | **Patching (CVEs) & backups** | Provider, continuously | You, forever — including a restore you have actually tested |

### The property that matters most

Threat 3 is the one that would actually hurt you, because it exposes *other people's* positions and cost
basis. Under RLS the guarantee is structural: the database will not return another user's row even if my
API code has a bug. Self-hosted, the guarantee is "the developer never once forgot a filter." For a solo
project those are not comparable levels of assurance, and it is the strongest single argument for managed.

### Where MANAGED is dangerous — read this before choosing it

Managed is not automatically safe. The database is internet-facing and the anon key is public, so **the
entire defence rests on RLS being enabled and correct**. The classic, catastrophic mistake is creating a
table and forgetting `enable row level security` — that table is then readable by anyone who has the anon
key, which is everyone. Concretely, the rules for this project are:

1. `alter table … enable row level security;` on **every** table, immediately at creation.
2. Policies scoped to `auth.uid()` for select, insert, update **and** delete.
3. The `service_role` key **never** appears in the client, the repo, or a screenshot.
4. Registration disabled/invite-only, so an attacker cannot self-provision an account and probe.
5. **E6.7 proves it with a second account** — attempt a cross-user read and write and confirm both fail
   *at the database*. Not a code review; an actual test. No tester is invited until that passes.

### Where SELF-HOSTED is dangerous

The server must be reachable by your friends, so it is internet-facing too. That means you own SSH
hardening, a firewall, keeping Postgres off the public interface, OS patching, and certificate renewal —
indefinitely, including during the months you are not thinking about this project. The realistic failure
is not a dramatic breach; it is drift: an unpatched host and an expired certificate six months from now.

### Free, reachable, and secure — pick three

The user's constraint is a **free** service for a handful of testers. That interacts with security more
than it first appears:

- **Managed free tiers** comfortably cover this scale (a few users, a few hundred KB). Typical limits are
  inactivity pausing and short backup retention — irrelevant at this size.
- **Self-hosted "free"** means either a free PaaS tier that sleeps, or the laptop itself. Serving from the
  laptop to friends over the internet requires port-forwarding or a tunnel, which means exposing a home
  network and a machine that also holds `portfolio.json` in the clear. That is a materially worse security
  posture than a managed database, and it is the option most likely to be chosen by accident when
  optimising for "free".
- A properly secured VPS is ~$5/month — i.e. self-hosting *safely* is not actually free.

### What is identical either way

Invite-only registration, TLS-only, no secrets in the repo, collect the minimum (an email address and the
portfolio — no names, no phone numbers), and support account deletion that really removes the row. These
are not vendor features; they are choices, and they apply to both paths.


---

## 13. "Can we host our own SQL database?" — sustainability & scale

Short answer: **yes, it is entirely viable — and it is also not the thing that decides this.** The
measurements below are from the real book, not estimates.

### The actual numbers

| | |
|---|---|
| Heaviest real portfolio document | **62 KB** compact (112 KB pretty-printed) |
| Holdings | 27 |
| Checkpoints | 9, averaging **6.6 KB** each (each stores a full snapshot + its trades) |
| Growth, weekly rebalancing for **10 years** | ~3.6 MB **for that one user** |
| Storage at 500 users | ~32 MB |
| Storage at 5,000 users | ~320 MB |
| Write load at 5,000 users | ~2,100 writes/day ≈ **0.02 writes/sec** |

**This is not a database-scale problem and will not become one.** A single small Postgres instance handles
five thousand users of this app without noticing. Anyone's free tier holds the Phase-2 fleet a thousand
times over. So "will it scale?" should not drive the choice — it is answered either way.

What *does* grow without bound is the per-user checkpoint history, and even that is ~3.6 MB after a decade
of weekly rebalancing. If it ever mattered, the fix is to split `versions[]` into its own table and page
it — which is exactly the normalisation §4 defers until a query demands it.

### Three architectures, not two

The real spectrum is wider than "managed vs self-hosted":

| | Who runs the DB | Who runs auth | Notes |
|---|---|---|---|
| **A. Managed BaaS** | vendor | vendor | Least work. Anon key + RLS is the whole security model |
| **B. Your app server + managed Postgres** | vendor | **you** | You own the API and identity; the database is still someone else's problem. No BaaS lock-in |
| **C. Fully self-hosted** | you | you | Total control, total responsibility, ~$5/mo minimum to do safely |

**B is the genuine middle path** and the natural landing spot if this ever becomes a real product: standard
Postgres you could move anywhere, your own server holding the business logic, and no vendor-specific
runtime. Its cost is that you own authentication — the one area where mistakes are unforgiving.

### The lock-in question, answered precisely

The concern is legitimate, but it is narrower than it feels:

- **The data is not locked in.** The schema in §4 is ordinary Postgres. `pg_dump` moves it anywhere.
- **RLS is not a vendor feature.** Row-level security is standard Postgres and travels with the schema.
- **Identity is the sticky part.** Migrating auth providers means every tester resets their password once —
  a non-event at five users, a real project at five thousand.

So the durable decision is not the vendor; it is **staying on portable primitives**: plain tables, plain
SQL, RLS, and no proprietary runtime (no vendor edge functions, no realtime channels, no vendor-only
client SDK — REST over `fetch` keeps even the browser neutral). Do that and switching later is a weekend,
not a rewrite.

### What would actually make self-hosting the right call — and when

Not scale. The honest triggers are:

1. **Cost inflection** — free tiers stop being free somewhere in the hundreds-to-thousands of users.
2. **Control** — you need something the vendor forbids, or data residency they do not offer.
3. **Capacity** — you (or someone) can commit to patching, certificate renewal and tested restores
   *indefinitely*, not just enthusiastically for the first month.

None of those is true today, and (3) is the one people overestimate about themselves.

### The recommendation this leads to

**Start on A, architect so that B is a weekend's work, and never rule out C.** Concretely, for E6.3:

- plain `portfolios` table, ordinary columns, `jsonb` payload — no vendor types;
- RLS policies written as standard Postgres, checked into the repo as `.sql`;
- the client talks **REST over `fetch`**, so no vendor SDK enters the browser;
- everything behind the storage adapter from E6.2, so the app cannot tell the difference.

That way the vendor is a hosting decision, not an architecture commitment — and the free tier costs
nothing while the user count is small enough that "scalable" is a hypothetical.

### The cost that will actually dominate later

Not hosting. At a few thousand users, hosting is tens of dollars a month. **Licensed market data is the
real bill** (Yahoo's free endpoints are not licensed for redistribution — see
[`E6_multi-user-platform.md`](E6_multi-user-platform.md) §7). Any long-term sustainability plan should be
built around that number, not around Postgres.


---

## 14. Vendor comparison — verified against live pricing pages (2026-08-15)

Four candidates were checked against the vendors' own pricing and docs, then independently re-verified.
Anything that could not be confirmed on a live page is marked UNVERIFIED rather than guessed.

### The four hard requirements
Postgres · **database-enforced** row-level security · built-in auth **with invite-only** · plain `fetch()`
without an SDK.

| Vendor | Postgres | DB-enforced RLS | Auth + invite-only | Plain fetch | Verdict |
|---|---|---|---|---|---|
| **Supabase** | yes | **yes** (native RLS) | yes | yes (PostgREST) | **strong fit** |
| Neon | yes | yes (native RLS) | auth yes, **invite-only NO** | yes (PostgREST-compatible) | possible |
| Nhost | yes | **NO** — Hasura role permissions are app-layer | yes (invite-only strong) | GraphQL, not REST | possible |
| Firebase | **no** — document store | **NO** — proprietary rules DSL | yes | yes | **poor fit** |

Only Supabase satisfies all four. The eliminations follow directly from this project's own premises:
Firebase and Nhost fail the *security* premise (isolation not enforced by the database), and Neon fails
the *settled* invite-only decision. Firebase additionally fails portability — there is no `pg_dump` and
exports are a proprietary format.

### Supabase, verified figures

**Free** — verbatim from supabase.com/pricing: "500 MB database size", "5 GB egress", "50,000 monthly
active users", "1 GB file storage", "Unlimited API requests", "Free projects are paused after 1 week of
inactivity. Limit of 2 active projects." **No managed backups** (verified by omission — backups appear
only from Pro).

**Pro** — "from $25/month" (per organisation, a floor not a ceiling; overages billed beyond the included
allowances): "100,000 monthly active users", "8 GB disk size per project", "250 GB egress", "Daily backups
stored for 7 days". Pausing is removed — verified at the pausing doc: *"Projects under a paid plan cannot
be paused and are not subject to automatic pausing for inactivity."*

**Pausing / restore** — inactivity is judged on *user database activity* over a rolling week; a paused
project is restored by the owner from the dashboard, and there is a **1-year** window to do so. A pause is
downtime, not data loss.

### Two findings that change what we build

**1. Email rate limits will break password reset if ignored.** Verified at the auth-SMTP doc: the built-in
email service is *"set to 2 messages per hour"*, and it is *"provided as best-effort only and intended for
… non-production use cases."* After wiring your own SMTP, *"a low rate-limit of 30 messages per hour is
imposed."* → **Custom SMTP must be configured before any real tester can hit "forgot password"**, which is
the single most likely support event of the whole test. Add it to E6.4.

**2. A naive RLS policy can silently fail open-ended checks.** The RLS docs warn that when no access token
is present `auth.uid()` returns **null**, so a policy comparing against it silently evaluates false rather
than erroring. Policies must therefore check authentication explicitly rather than relying on the null
comparison. → This goes straight into **E6.7**, which must prove isolation with a real second account
rather than by reading the SQL.

### Other Supabase specifics worth knowing
- **No backups on Free** → own a `pg_dump` cadence yourself until Pro.
- **2 active projects** on Free — prod + staging exhausts it.
- REST is genuine PostgREST at `https://<ref>.supabase.co/rest/v1/`, callable with two ordinary headers,
  and the docs explicitly contemplate calling it straight from the browser. The specific **auth** endpoint
  paths were **UNVERIFIED** in research — read them from the project's own API docs before coding.

### Cost conclusion
**$0 today.** The natural moment to pay the **$25/month** is when you invite friends — that is exactly when
"no pausing" and "daily backups" stop being conveniences and start being requirements. Not before.


---

## 15. Provisioned project (E6.3)

| | |
|---|---|
| Vendor | **Supabase** (chosen 2026-08-15 — see §11–§14) |
| Project URL | `https://uvzxdeiiwswhthfaqhtb.supabase.co` |
| Publishable key | `sb_publishable_smrzMSuM7plL-NWtHNt2BA_TJP6_lEY` — **public by design**, safe in client source |
| Secret key | **Never in this repo.** Held by the user only; grants `BYPASSRLS` |
| Region | US |
| Plan | Free (pauses after 1 week idle; no managed backups; 2 active projects) |

### Artefacts
- **`sql/001_portfolios.sql`** — the table, RLS policies, grants and integrity trigger. Idempotent;
  paste into the dashboard SQL editor.
- **`sql/ISOLATION_TEST.md`** — the E6.7 gate: eight checks against two real accounts.

### Decisions baked into the schema, and why
- **`force row level security`**, not merely `enable` — plain ENABLE does not apply to the table owner,
  so an owner-context query would bypass every policy.
- **Every policy is `to authenticated` AND checks `auth.uid() is not null`** — the anonymous role cannot
  match at all, and the documented null-token trap is closed explicitly rather than relied upon.
- **`with check` on UPDATE as well as `using`** — without it a user could update their own row and
  reassign `user_id`, writing into someone else's account.
- **`revoke all … from anon`** — RLS filters rows, grants decide who may touch the table; the anonymous
  role gets nothing.
- **A `before update` trigger** stamps `updated_at` server-side, makes `user_id` immutable and forbids
  `revision` from moving backwards, so those guarantees do not depend on a well-behaved client.
- **Optimistic concurrency needs no stored procedure**: the client PATCHes with
  `?user_id=eq.<uid>&revision=eq.<base>`; zero rows returned *is* the conflict signal.

### Deferred, deliberately
- **Invite-only** — signup is still open. With RLS correct this is not a data-exposure risk (a stranger
  gets their own empty row); the cost is unwanted accounts and burnt email quota. Flip
  *Allow new users to sign up* off before real testers.
- **Custom SMTP** — the built-in sender is 2 emails/hour and vendor-labelled non-production. Required
  before any invite or password-reset round (E6.4).

---

## 16. The sync contract (E6.5, hardened after adversarial review)

The first implementation passed a functional test and still had two defects that would have
destroyed real holdings. Both came from the same mistake: **inferring server state from the
local document.** The rules below are the contract; breaking any of them reintroduces a
data-loss bug that a happy-path test will not catch.

### Rule 1 — `state.baseRevision` is the last revision the SERVER confirmed

Not `document.revision - 1`. The document is incremented locally before the write, so deriving
the base from it silently assumes the previous save landed.

*What went wrong:* one failed save (a dropped connection) left the document one ahead of the
server forever. Every subsequent save then sent a base the server had never reached, so PostgREST
matched zero rows and the app reported **"changed on another device"** on a device that had never
been contended — and offered to reload, discarding the user's work. The failure was permanent:
it could not recover without clearing storage.

`baseRevision` is now assigned in exactly three places, all of them server responses:
the `SELECT` (`cloudLoadPortfolio`), the returned representation of a successful `PATCH`,
and the returned representation of a successful `INSERT`. A failed write never advances it.

Verified: with `fetch` forced to fail, `savePortfolio()` returns `false`, the base is unchanged,
and the *next* save succeeds and advances the base — no false conflict.

### Rule 2 — the cloud mirror never shares a key with the local store

The offline mirror originally wrote to `STORE_KEY` (`pb_portfolio_v1`). On native that key is the
**only** copy of the on-device book. Mirroring an account into it meant signing in could overwrite
a portfolio built over months, and a second account on the same device could be served the first
account's holdings.

The mirror is now per-user: `pb_cloud_mirror_<uid>`. `STORE_KEY` is written only by the local
adapters. Verified: after a full A → sign-out → B → sign-out → A cycle with live writes,
`pb_portfolio_v1` was byte-identical (18,871 bytes) and two separate mirror keys existed.

### Rule 3 — nothing is discarded to make room for a server copy

Before a server copy overwrites the mirror, `stashUnsyncedMirror()` compares revisions and, if the
mirror is ahead, copies it to `pb_unsynced_<uid>_<ts>`. A conflict likewise stashes the rejected
edit to `pb_conflict_<uid>_<ts>` **before** reloading. Financial records are never auto-merged —
but they are never thrown away either.

### Rule 4 — `savePortfolio()` reports whether the write landed

It returns `true`/`false`. Previously it returned `undefined` on every path, so callers fired their
own "Saved" toast over the top of the failure message and the user was told the opposite of the
truth. Failure toasts are also deferred ~400ms so a caller's optimistic toast cannot bury them, and
the wording no longer promises a retry that does not exist.

### Rule 5 — sign-out clears every trace of the account

`clearAccountState()` drops `portfolio`, `baseRevision`, `syncStatus`, `syncError`, `themeTickers`,
`themes`, `watchlist`, `metrics`, `metricCfg`, `overrides`, and the sync badge. Without it, signing
in to a *different, empty* account found a book "already open" and offered to import it — one
person's holdings uploaded into another person's account.

Verified with markers written through the real save path: A holds `MARKERA` and never sees
`MARKERB`; B holds `MARKERB` and never sees `MARKERA`; each keeps its own across repeated switches.

### Rule 6 — only a definitive rejection destroys a session

`sbRefresh()` clears the session on HTTP 400/401 only. Clearing it on *any* error meant a network
blip or a paused free-tier backend signed the owner out — precisely the situation the offline
fallback exists to survive.

### Visible state, not a toast

A `#syncBadge` in the header shows **synced** (with the confirmed revision in its tooltip) or
**not synced** (with the error). "Did my rebalance actually save?" is not a question a
three-second toast can answer.

---

## 17. Second review round — the invariants that were still missing

Section 16 recorded the first set of fixes. A second adversarial review over the same code found
**30 more defects**, including three that could destroy real holdings. The lesson is worth keeping:
every one of them passed a happy-path functional test. Correct behaviour when everything works
tells you almost nothing about a persistence layer.

### The defect that mattered most: the adapter could change under the document

`storageAdapter()` chose its backend fresh on every call, from `signedIn()`. Nothing re-gated the
app when a session died mid-use — a rotated or revoked refresh token, a password change elsewhere,
or the paused free-tier project this design explicitly plans around. So:

1. `sbRefresh()` gets a definitive 401 and nulls the session. The app stays open.
2. `renderSyncBadge()` **hides the badge**, because it hides when signed out — the one visible
   warning disappears at the exact moment it is needed.
3. The next autosave calls `storageAdapter()`, which now returns `web`, and POSTs the *account's*
   portfolio to `/api/portfolio` — one identity-free file shared by the whole deployment. On
   native it writes `pb_portfolio_v1` instead: the device's only copy of a book built over months.
4. `savePortfolio()` returns `true`. Every caller toasts success.

**The invariant now:** a document records where it came from (`state.docSource`) and who it
belongs to (`state.docOwner`), both captured at load time before any `await`. A document loaded
from an account can never be written anywhere else. If the session is gone, the save is refused,
the work is kept under the *owner's* mirror and stash keys, and `lockOut()` returns the app to the
gate. Verified: `portfolio.dev.json` was byte-identical (same MD5, same mtime) after forcing
exactly this sequence.

### `baseRevision` must never be advanced by anything but confirmed content

The conflict handler adopted `e.serverRevision` from the *error object*, before the reload. If
that reload then failed — a two-second Wi-Fi drop is enough — the client held a base for a
revision whose content it had never seen. The next save matched that base and overwrote the other
device's work with a document built on a revision six behind. No conflict, no warning, badge green.

It is now `null` whenever unknown (after any fallback load, and after a failed conflict reload),
and `cloudSavePortfolio` **refuses to write** while it is null: *"this device is not in sync with
your account — reload the page before saving."* Verified: refuses, then saves cleanly after a real
load restores a confirmed base.

### "Kept aside" was a write-only promise

`pb_unsynced_*` and `pb_conflict_*` were written and never read — no reader, no list, no restore,
anywhere in the file. The app told users *"your edit was kept aside"* when the only route back was
devtools. `offerStashRecovery()` is the reader: it lists each kept-aside document with its holding
and checkpoint counts and why it was kept, and offers restore or discard. Stashes dedupe by
content and cap at the 10 most recent, so a mirror sitting ahead of the server does not pile up an
identical copy on every page load.

### Keys were written under `anon`

`cloudMirrorKey()` resolved the uid lazily, at call time. But `sbRefresh()` can null the session
*during* the failing request — so by the time the rescue write ran, `sbUserId()` was `""` and the
copy landed under `pb_cloud_mirror_anon`, which nothing would ever read again. On a shared browser
the next signed-out failure would read it back as *somebody else's* portfolio. The uid is now
always captured before the operation and passed explicitly; a write with no owner is refused.

### The import uploaded a stripped book

`impYes` assigned `state.portfolio` directly, skipping `loadPortfolio`'s hydration — then
`savePortfolio` overwrote the document's config from the module defaults still sitting in `state`.
The account received the holdings and history but lost its themes, theme membership, watchlist,
metric list, per-metric config, presets, overrides, cap, weights and penalty, while the modal
promised *"its full history comes with it."* A legacy file also never got `migrateVersions()`,
which lives in that same hydration — so its history could never migrate afterwards.

That block is now `hydrateFromDocument()`, shared by the normal load, the import, and stash
restore.

### Cross-user rules the database cannot enforce

RLS isolates *accounts*. It cannot isolate a *browser*. Three guards close the rest:

| Guard | Why |
|---|---|
| `pb_local_claim` — the uid that imported or declined this device's book | Without it the second person to sign in on a machine was shown the first person's holdings, checkpoints and contributed dollars, and could upload them into their own account |
| The offer requires `syncStatus==="cloud"` | A cloud read that *failed* is not an empty account. Announcing "this account is empty" over a real book pushed the user toward "Start fresh" |
| `/api/portfolio` is only consulted on a private host | On a shared deployment it carries no user identity at all — it is one file for everybody, never "your" book |

Verified as a truth table: claimed by another account → not offered; account read failed → not
offered; clean and unclaimed → offered; claimed by me → offered.

### Smaller, still real

- **Sign-out left the model behind.** `presets`, `weights`, `penalty`, `cap` and
  `computeFromStatements` survived into the next account and were written into its first save.
- **Themes could never be cleared.** `if(p.themes)` cannot move state back to `null`, which is
  exactly what "restore the defaults" and "delete a theme" persist — so a theme deleted on one
  device was resurrected by the next save from another. (`themes()` treats `[]` and `null`
  identically, so this changed nothing for existing documents.)
- **No in-flight lock.** `savePortfolio` is wired to `change` handlers and to undo/redo, so two
  overlapping saves read the same base and the second was reported as a cross-device conflict —
  manufacturing a destructive reload out of a single-device race. Saves are now serialised.
- **A failed probe read as "no row".** Zero rows from the PATCH plus an errored probe fell through
  to INSERT against a live row; the `user_id` primary key rejects it, but the 409 surfaced as a
  *network* error, so the losing edit was never stashed.
- **`remotePutPortfolio` never checked status.** CapacitorHttp resolves on non-2xx, so the home
  computer could refuse the write while the app reported a successful save.
- **The gate dropped before the data loaded**, so a new user saw the previous user's holdings,
  totals and history — still painted underneath — for the seconds `bootSignedIn` spent on the
  network. The gate now lifts last.
- **The gate was default-hidden in markup** and only raised after an awaited fetch, leaving the
  live app shell exposed until it resolved — and never gating at all if it hung. It is now visible
  in markup and taken down pre-paint only when a stored session exists: the page fails closed.
- **The gate form kept the previous user's email** on a shared machine, kept stale errors, and
  kept `mode` on "signup" so a button reading "Sign in" attempted a registration.
- **`init()` duplicated `bootSignedIn()`** inline and had drifted: reloading the page skipped the
  sync badge, the import offer and the recovery prompt. One boot path now.

---

## 18. Rounds 3–5, and why this layer is not signed off

Sections 16–17 recorded rounds 1–2. Three more rounds followed. The numbers matter more than any
individual defect:

| Round | Findings | Of which were regressions from the previous round's fixes |
|---|---|---|
| 1 | 36 | — |
| 2 | 30 | 3 (incl. two HIGH data-loss) |
| 3 | 19 | 4 |
| 4 | 6 | 2 (one a CRITICAL deadlock) |
| 5 | 3 | 2 |

**Every round has contained defects introduced by the previous round's fix.** That is the single
most important fact about this code, and the reason it is not signed off despite the count falling.

### The regressions worth remembering

- **Round 1's `lockOut()`** called `clearAccountState()`, which nulls `docSource`/`docOwner`/
  `portfolio` — the exact fields the new save guards read. A session dying mid-save walked past the
  guard written for it, and a save queued behind it fabricated a blank document that both guards
  waved through to the identity-free store. The fix turned a race into a *deterministic* failure.
  → Now: `appLocked`/`booting`, flags that do not depend on state the wipe touches, plus `_owner`
  and `_doc` captured at function entry.
- **Round 2 replaced revision-comparison with content-comparison** for deciding what work to keep
  aside. But the mirror holds the last *synced* document, so "differs from the server" is the
  ordinary state after any other device writes. Ordinary two-device use produced a false "unsaved
  work was kept aside" prompt, and restoring it reverted the other device's rebalance.
  → Now: an explicit dirty bit, set only when a save actually failed.
- **Round 2 moved `offerStashRecovery()` out of an `else`** so it always runs. `openImportChoice`
  was synchronous, so the stash prompt overwrote the import modal — making the import offer
  unreachable in exactly the case both were meant to cover.
  → Round 3 made the modal awaited, which…
- **…deadlocked first sign-in permanently.** The gate is opaque at `z-index:400`; a modal renders at
  80. `bootSignedIn()` is awaited by the gate submit *while the gate is still up*, so it waited
  forever on a dialog the user could not see or click.
  → Now: `postSignInPrompts()`, called only after `showGate(false)`.
- **Round 4's snapshot/restore** in `loadPortfolio` captured the snapshot at the *stale* load's
  start, so restoring it wrote the old account's revision over the live one.
  → Now: `cloudLoadPortfolio` writes nothing global; it parks its result in `_cloudMeta` and
  `loadPortfolio` applies it only after the session check passes.
- **Round 4's `dropMirror`** called `preserveDirtyMirror`, which called `stashUnsyncedMirror` inside
  a `try/catch` and discarded the result — but that function does not *throw* on failure, it
  returns the sentinel `"failed"`. So a full localStorage meant the rescue silently did nothing and
  the mirror — the only copy of the unsaved edit — was deleted anyway, by the Sign-out button whose
  own comment promises the opposite.
  → Now: the sentinel is honoured; a mirror whose copy could not be filed survives.

### The lesson, stated plainly

Every one of these passed a happy-path test. What finds them is asking *"what is the state of the
world when this line runs, and who does it belong to?"* — specifically across an `await`, where the
session, the document, and the user can all have changed. The recurring shapes:

1. **State captured before an `await` and used after it** without re-checking that it still applies.
2. **A guard that reads state some other path nulls.**
3. **A rescue store nothing reads back.**
4. **A sentinel return value nobody checks.**
5. **A comment describing an intention the code does not implement.**

### Status

Round 5's three defects are **fixed but not re-verified**. A sixth round must come back with an
explicit converged verdict before this merges to `main`. If it does not, the recommendation is to
stop patching and rewrite `loadPortfolio`/`_savePortfolioInner`/`sbApi` against the invariants in
§16–17, which are now well enough understood to be written first and implemented second — the
opposite of how they were arrived at.

---

## 19. Round 6, and the epoch lesson

| Round | Findings | Regressions from the previous round's fixes |
|---|---|---|
| 1 | 36 | — |
| 2 | 30 | 3 |
| 3 | 19 | 4 |
| 4 | 6 | 2 |
| 5 | 3 | 2 |
| 6 | 3 | 2 |

Round 6's critical finding is the sharpest example of the pattern in the whole epic, and it is worth
keeping as a worked example of how a *correct-sounding* guard goes wrong.

### The bug: a session epoch that counted the wrong thing

Round 4 added `sbEpoch` so that a slow reply belonging to a **previous session** could not lock out,
replay into, or overwrite the **current** one. Round 5 extended the same guard to `loadPortfolio`
via `stale()`. Both were right about the danger. Both were wrong about the measurement:

```js
function sbStoreSession(sess){ sbSession=sess||null; sbEpoch++; }   // bumped on EVERY session write
```

A successful **token refresh** writes the session. Nothing in the file reads `expires_at`, so a
401-then-refresh *is* how an expired access token is handled. Therefore, on the single most common
path in the app — reloading more than an hour after signing in:

1. the portfolio GET 401s (JWT expired),
2. `sbRefresh()` succeeds, bumping the epoch,
3. the retry returns the real document,
4. and `stale()` throws it away, because the epoch changed.

The user, correctly signed in, was shown **"No portfolio yet — start by creating a theme on Model"**
over a live account. Worse, `docSource`/`docOwner` had already been set, so their first click built
a blank document and wrote it into `pb_cloud_mirror_<uid>` with the dirty bit set — destroying the
offline copy and then offering it back as *"Unsaved work was kept aside — 0 holdings"*.

### The fix, and the principle

The counter now increments only when the **user identity** changes:

```js
const _prevUid = (sbSession && sbSession.user && sbSession.user.id) || "";
const _nextUid = (sess && sess.user && sess.user.id) || "";
sbSession = sess || null;
if(_prevUid !== _nextUid) sbEpoch++;      // a refresh keeps you the same person
```

**The principle: a guard must measure the thing it is guarding against.** The danger was *"is this
reply for a different user?"*, and the proxy chosen was *"has the session object been written?"* —
which is true far more often, and true on the healthy path. A guard that fires on the healthy path
is worse than no guard, because it converts an ordinary event into data loss.

Verified against the real path: with a live session and the first portfolios request forced to 401,
the refresh succeeds, the retry returns the row, and the app restores 25 holdings at revision 19
with the epoch unchanged and the mirror intact.

### Also fixed in round 6

- **A successful save overwrote an offline copy that could not be filed.** `loadPortfolio` and
  `dropMirror` both honour `stashUnsyncedMirror`'s `"failed"` sentinel; the save path did not, so
  the next successful save destroyed an offline edit the app had explicitly promised to keep.
- **`_saveChain` is never drained across a sign-out.** A save queued by one user could dequeue
  inside the next user's session and write a blank document into their mirror. Each queued save is
  now bound to the identity that asked for it, and mirror writes re-check it after the await.
- **`pendingStashSig` could never match** (it was compared *after* the save stamps fields the stored
  copy predates), so a restored-and-saved stash was re-offered on every sign-in, repeatedly inviting
  the user to overwrite current data with stale data. It is now signed before stamping.

### Status

**Not converged.** A seventh round must return a clean verdict before this merges. The trend is
real (36 → 30 → 19 → 6 → 3 → 3) but the regression rate has not fallen, and every round has found at
least one defect introduced by the previous round's fix.

---

## 20. Round 7, and a recommendation to stop patching

| Round | Findings | Regressions from the previous round's fixes |
|---|---|---|
| 1 | 36 | — |
| 2 | 30 | 3 |
| 3 | 19 | 4 |
| 4 | 6 | 2 |
| 5 | 3 | 2 |
| 6 | 3 | 2 |
| 7 | 5 | 2 |

**Seven rounds. Seven with regressions.** The finding count fell by 7× and then stopped falling; the
regression rate never fell at all. Round 7's two were both created by round 6's fixes, and round 6's
critical was created by round 5's.

### Round 7's findings

- **HIGH — the rescue that round 6 disabled.** Round 6 added `if(sbEpoch!==_epoch0)` around the
  mirror write so an in-flight save could not resurrect a mirror that sign-out had deleted. But a
  *definitive 401/403* also bumps the epoch, via `sbStoreSession(null)`. So the commonest way to
  lose a session — an expired or revoked refresh token — skipped the rescue write entirely: the
  user's edit went nowhere, while the toast said *"kept on this device only."* Now the work is
  written to the **owner's stash** (whose data it is) without re-creating the plaintext mirror.
- **MEDIUM — one bit doing two jobs.** `mirrorIsDirty` meant both *"this copy is newer than the
  server"* and *"we could not file this copy"*. So an ordinary failed-then-retried save filed its
  own **ancestor** as unsaved work, and restoring that prompt reverted the account to the older
  document. Split into `pb_mirror_dirty_<uid>` and `pb_mirror_unfiled_<uid>`.
- A restored stash is now consumed by the first successful save after it is put on screen (signature
  comparison could only ever match a byte-identical re-save, so the prompt returned forever);
  `nativeSavePortfolio` throws instead of reporting success on a full localStorage; `#resetBtn` no
  longer claims success unconditionally.

### The recommendation

**Stop patching this layer. Rewrite `loadPortfolio`, `_savePortfolioInner` and `sbApi` against the
invariants in §16–19, written first and implemented second.**

The case for it is in the table. Each fix is individually correct and locally reasoned, and each one
lands in a function whose behaviour depends on state that three other functions mutate across
`await` boundaries. The recurring shapes have not changed since §17:

1. State captured before an `await` and used after it without re-checking that it still applies.
2. A guard that reads state some other path nulls.
3. A rescue store nothing reads back.
4. A sentinel return value nobody checks.
5. A comment describing an intention the code does not implement.
6. **(new, round 6–7)** A guard that measures a proxy for the thing it guards against, and therefore
   fires on the healthy path.

What is different now, and why a rewrite is finally the cheaper option: **the invariants are known.**
They were discovered by breaking them seven times, and they are written down. A fresh implementation
can state them as preconditions at the top of each function and check them once, instead of
re-deriving them at each of the fourteen points where these three functions touch shared state.

Scope: roughly 250 lines across three functions. Everything else in E6 — the SQL and RLS (gate 8/8),
the adapter registry, the gate, the import flow, the stash UI — has held up across all seven rounds
and should not be touched.

Until that is done, or until a round returns clean, **this does not merge to `main`.**

---

## 21. E8 and E9 — the rewrite, and deleting the safety net

### The decision to rewrite (§20 recommended it; it was taken)

Seven patch rounds, ~96 defects, and a regression rate that never fell. The rewrite replaced
`loadPortfolio`, `savePortfolio`/`_savePortfolioInner` and the cloud adapter with **one context, one
checkpoint**: every operation captures `pctx()` before its first `await` and passes a single
`ctxCurrent()` gate afterwards. The contract is stated once (C1–C5) and each rule is enforced in one
place, instead of being re-derived at each of the fourteen sites that touch shared state.

**Six audits of the rewrite found 7, 6, 4, 1, 5 and 6 defects.** That is not the clean sweep a
rewrite is supposed to deliver, and it is worth recording why honestly:

- The **core loop held**. From the first audit onward, no pass found an ordering or context defect
  in the capture/checkpoint/revision discipline. That part of the rewrite worked.
- Almost every finding was in the **kept-aside recovery subsystem** — the mirror, two status bits,
  the stash list, the dedupe, the prune, the recovery prompt — or in **guards about it**.

### The lessons that generalise

1. **A guard must measure the thing it guards against.** `sbEpoch` counted *session writes* as a
   proxy for *identity changes*; a token refresh is a session write, so the guard fired on the
   healthiest path in the app and discarded a live portfolio. Later, `docHasContent` measured
   *holdings and checkpoints* as a proxy for *did the user make anything*; under E8 an entire
   onboarding has neither, so real work was classified as nothing.
2. **A refusal that has already mutated is not a refusal.** Three separate HIGH findings were a
   guard placed one line below the assignment it existed to prevent (`#resetBtn`, then
   `_savePortfolioInner`'s document manufacture).
3. **A fix is not done until it is applied at every site that needs it.** Most findings in passes 3
   and 4 were the previous pass's fix present in one place and missing in another. Where possible,
   make it structural instead — `syncStateIntoDocument()` replaced two copies of the same block.
4. **State about state drifts.** `dirty` and `unfiled` were facts about one artefact's relationship
   to another, stored in a third place, with no transaction tying them together.

### E9 — deleting the safety net (owner's decision)

The recovery subsystem existed so that a save which could not reach the server was preserved and
offered back later. It cost five persistent artefacts, eleven functions, and the majority of the
defects in rounds 3–6, several of which could hand a user **stale work that overwrote a good
portfolio**. The owner's call, and the reasoning is sound: *"we will ignore edge cases where people
make adjustments but accidentally dropped offline… That creates too much complexity and it is very
fishy to want to write into someone's local from a web application."*

So C4 was inverted. It now reads: **nothing about a portfolio is written to this device.**

| Behaviour | Now |
|---|---|
| Save cannot reach the account | Not saved. Said plainly. The change stays on screen so it can be retried. |
| Account cannot be read | Reported as unreachable. No cached copy is shown. |
| Another device wrote first | The server's version wins; the edit is **not applied**; said plainly. |
| Anything an earlier version left on a machine | `purgeLegacyLocalCopies()` removes it at boot, on a definitive 401/403, and on sign-out. |

Still written locally, none of it portfolio data: the sign-in session, the light/dark choice, which
page guides have been seen, and the iOS LAN-sync URL. `pb_portfolio_v1` — the pre-account book — is
**read** once for the import and never written on the web path.

**The cost, recorded because it reverses an earlier requirement.** E6.8 required that a valid stored
session keep working against a local copy while the backend was asleep, because the free tier pauses
after a week idle. There is no local copy now, so during a pause the app reports that the account
cannot be reached. That is a deliberate trade: fewer ways to lose data, in exchange for needing the
network to see anything.

### What did NOT change

The engine (25 functions verified byte-identical to prod at every stage), the SQL and RLS (the
isolation gate is 8/8), the login gate, the import flow, and all of E5/E7.
