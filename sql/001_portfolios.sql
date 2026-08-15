-- =====================================================================================
-- E6.3 — portfolios table + row-level security
-- Project: Portfolio Builder  ·  Phase 2 (invited testers)
--
-- HOW TO APPLY: paste this whole file into the Supabase dashboard SQL editor and run it.
-- It is idempotent: safe to run more than once.
--
-- WHY IT LOOKS LIKE THIS
--   * Ordinary Postgres only — no vendor types, no proprietary syntax. The whole point is
--     that `pg_dump` can move this anywhere later (see design doc section 13).
--   * ONE ROW PER USER holding the app's existing portfolio.json shape as jsonb. The document
--     is always read and written whole, so this keeps loadPortfolio/savePortfolio semantics
--     identical and does NOT re-express the undo/redo/fork version timeline as rows.
--   * Isolation is enforced by the DATABASE, not by application code. That is the reason a
--     SQL backend was chosen at all.
-- =====================================================================================

create table if not exists public.portfolios (
  user_id        uuid        primary key references auth.users(id) on delete cascade,
  schema_version integer     not null default 1,
  revision       bigint      not null default 1,
  updated_at     timestamptz not null default now(),
  data           jsonb       not null
);

comment on table  public.portfolios              is 'One portfolio document per user. Payload matches the app''s portfolio.json shape.';
comment on column public.portfolios.schema_version is 'Shape of `data`. Bump only on a breaking change; lets a future migration be mechanical.';
comment on column public.portfolios.revision       is 'Monotonic. Optimistic-concurrency token: a writer must state the revision it based its edit on.';
comment on column public.portfolios.updated_at     is 'Server-stamped on every update by the trigger below — never trusted from the client.';


-- =====================================================================================
-- ROW-LEVEL SECURITY
--
-- FORCE is deliberate: plain ENABLE does not apply to the table owner, so a query running
-- as the owner would bypass every policy below. FORCE closes that.
-- =====================================================================================
alter table public.portfolios enable row level security;
alter table public.portfolios force  row level security;

-- Re-runnable: drop before create.
drop policy if exists portfolios_select_own on public.portfolios;
drop policy if exists portfolios_insert_own on public.portfolios;
drop policy if exists portfolios_update_own on public.portfolios;
drop policy if exists portfolios_delete_own on public.portfolios;

-- NOTE ON auth.uid() BEING NULL  ------------------------------------------------------
-- With no access token, auth.uid() returns NULL. In SQL, `NULL = user_id` evaluates to
-- NULL (not false), which is *not* a grant — but it is easy to write a policy where a NULL
-- silently widens the match. Every policy below therefore (a) is restricted to the
-- `authenticated` role, so the anonymous role cannot match at all, and (b) checks
-- `auth.uid() is not null` explicitly. Belt and braces, on purpose: this is the control
-- that stops one tester reading another's holdings.
-- --------------------------------------------------------------------------------------

create policy portfolios_select_own on public.portfolios
  for select to authenticated
  using ( (select auth.uid()) is not null and (select auth.uid()) = user_id );

create policy portfolios_insert_own on public.portfolios
  for insert to authenticated
  with check ( (select auth.uid()) is not null and (select auth.uid()) = user_id );

-- USING decides which existing rows may be updated; WITH CHECK validates the resulting row.
-- Both are required: without WITH CHECK a user could update their own row and reassign
-- user_id to someone else, effectively writing into another account.
create policy portfolios_update_own on public.portfolios
  for update to authenticated
  using      ( (select auth.uid()) is not null and (select auth.uid()) = user_id )
  with check ( (select auth.uid()) is not null and (select auth.uid()) = user_id );

create policy portfolios_delete_own on public.portfolios
  for delete to authenticated
  using ( (select auth.uid()) is not null and (select auth.uid()) = user_id );


-- =====================================================================================
-- PRIVILEGES
-- RLS filters rows; GRANTs decide who may touch the table at all. Give the anonymous role
-- nothing, so an unauthenticated caller holding the (public) publishable key cannot even
-- attempt a read.
-- =====================================================================================
revoke all on public.portfolios from anon;
grant select, insert, update, delete on public.portfolios to authenticated;


-- =====================================================================================
-- SERVER-SIDE INTEGRITY
-- The client computes revision/updatedAt too (see stampPortfolioMeta in www/index.html),
-- but the client is not trusted. This trigger makes the guarantees real:
--   * updated_at is always the server's clock;
--   * revision can only ever move forward — a replayed or stale write cannot rewind it;
--   * user_id is immutable.
-- =====================================================================================
create or replace function public.portfolios_guard()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable';
  end if;

  if new.revision <= old.revision then
    raise exception 'revision must increase (have %, got %)', old.revision, new.revision;
  end if;

  return new;
end;
$$;

drop trigger if exists portfolios_guard_trg on public.portfolios;
create trigger portfolios_guard_trg
  before update on public.portfolios
  for each row execute function public.portfolios_guard();


-- =====================================================================================
-- HOW THE CLIENT WRITES SAFELY (optimistic concurrency, no stored procedure needed)
--
-- PostgREST lets the filter carry the concurrency check, so this stays portable SQL:
--
--   PATCH /rest/v1/portfolios?user_id=eq.<uid>&revision=eq.<base>
--   Prefer: return=representation
--   { "data": {...}, "revision": <base+1>, "schema_version": 1 }
--
--   * rows returned  -> the write won; use the returned revision as the new base.
--   * ZERO rows      -> somebody else wrote in the meantime. This is a 409-equivalent:
--                       reload the server copy and tell the user plainly.
--                       NEVER auto-merge — these are financial records.
-- =====================================================================================
