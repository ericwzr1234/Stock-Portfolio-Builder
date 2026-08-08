# E6 — Multi-user platform (centralised, secured, cross-device)

- **Epic:** E6 · Multi-user platform
- **Stage:** ideation — **not being built yet.** This exists to keep Phase 1 from painting us into a corner.
- **Platform:** web + iOS (one account, many devices)

## 1. The roadmap (user's, 2026-08-08)

| Phase | Who | Data | Cost |
|---|---|---|---|
| **1 — now** | Just me, sandbox | local `portfolio.json` / on-device | **free, no API keys** |
| **2 — next big development** | Me + a handful of **invited** friends, to collect feedback | **centralised, secured, per-account**, reachable from web + phone | **still free tier** |
| **3 — later** | Commercial launch, real user base | production data infra | paid APIs / licensed market data — *discuss then* |

**We are in Phase 1.** Nothing in E6 gets built until E5 (web UI) is finished and Phase 2 is explicitly started.

## 2. What sharing exists TODAY (verified in code, not assumed)

Storage is already behind **one seam** — `loadPortfolio()` / `savePortfolio()` — with three implementations:

| Mode | Storage | Notes |
|---|---|---|
| Web | `portfolio.json` via `server.py` | `GET`/`POST /api/portfolio` |
| iOS default | `localStorage["pb_portfolio_v1"]` | fully offline, separate book |
| iOS + **LAN sync** (opt-in) | the **web's own `portfolio.json`** | `useRemote()` → `remoteGetPortfolio` / `remotePutPortfolio` over `CapacitorHttp`; keeps a local mirror as fallback |

So web and iOS *can* already share one book — trades, rebalances and the whole version timeline — but only on the **same Wi-Fi**, with **no account, no password and no encryption**, against a server bound to `0.0.0.0`. Good enough for one person at home; **not** a basis for Phase 2.

## 3. Why we're well positioned

- **Nothing in the UI or the engine touches storage directly.** Every read/write goes through
  `loadPortfolio`/`savePortfolio`; market data goes through the `ds*` entry points. A cloud backend is a
  **fourth adapter behind the same seam**, not a rewrite.
- **The engine is pure** — `computeAllocation`, `planTrades`, `applyThemeCap`, `computedMetrics` take state
  in and return results, with no I/O. It can run client-side or server-side unchanged.
- **A version timeline already exists** (`versions[]` + `head`), which is the right foundation for
  server-side conflict handling.

## 4. The five gaps to close in Phase 2

1. **Identity** — the portfolio is one anonymous blob; nothing keys it to a person. Use a managed identity
   provider; **never hand-roll password storage.**
2. **Authorisation** — `/api/portfolio` currently serves whoever asks. Every read/write must be scoped to
   the authenticated user, enforced **server-side** (never trust a client-supplied user id).
3. **Transport security** — plain HTTP today, permitted on iOS only via a local-network exception.
   Phase 2 needs HTTPS everywhere.
4. **Conflict resolution** — one account editing on phone *and* web. Needs a monotonic `revision` per
   portfolio and optimistic concurrency (reject a write whose base revision is stale, then merge or
   prompt), rather than last-writer-wins clobbering.
5. **Storage shape** — rewriting one whole JSON document per save doesn't survive N users. Move to a row
   per user (a document/JSONB column is fine at this scale).

## 5. Do-now list — cheap, no rework, protects the path

These cost nothing today and make Phase 2 a plug-in rather than surgery:

- [ ] **Keep the storage seam pure.** New UI code (including all of E5) must never call `localStorage`,
      `fetch`, or a file path directly — only `loadPortfolio`/`savePortfolio`/`ds*`. *(E5 invariant.)*
- [ ] **Add `schemaVersion`** to the persisted portfolio, so a future server-side migration is mechanical.
- [ ] **Add `revision` (monotonic) + `updatedAt`** on every save — the hook conflict detection will need.
- [ ] **Keep the engine free of I/O**, so it can move server-side later untouched.
- [ ] **No secrets in the client**, ever — the current design has none, keep it that way.

## 6. Explicit non-goals for Phase 1

No accounts, no login screen, no hosted backend, no database, no paid services, no telemetry, and no
change to the free Yahoo/SEC data path. The LAN-sync feature stays exactly as it is.

## 7. Phase 3 flag — raise before any public launch

Yahoo's undocumented endpoints are fine for personal use. **Redistributing that data to other users in a
product generally is not permitted**, so a commercial launch likely requires a licensed market-data
provider (a real cost). Phase 2's "handful of invited testers" is small and private, but this must be
settled **before** open signup — it shapes the business case more than any technical decision here.

Holding other people's holdings and cost basis also carries real privacy responsibility even at Phase 2
scale: encrypt in transit, keep the tester group explicitly invited, and be clear it's a test build.
