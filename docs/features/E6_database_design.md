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
