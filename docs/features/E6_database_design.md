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
