-- =====================================================================================
-- E11.7 — feedback table
--
-- HOW TO APPLY: paste this whole file into the Supabase dashboard SQL editor and run it.
-- Idempotent: safe to run more than once.
--
-- Same shape of decision as 001: isolation is enforced by the DATABASE, not by the page.
-- The difference is the direction of travel — feedback is WRITE-ONLY from the client.
-- =====================================================================================

create table if not exists public.feedback (
  id          bigserial   primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  app_version text,
  message     text        not null check (length(btrim(message)) between 1 and 4000)
);

comment on table  public.feedback             is 'Free-text feedback. Write-only from the client; read it in the dashboard.';
comment on column public.feedback.app_version is 'The build the reporter was actually on. Without it, "which build?" is unanswerable.';
comment on column public.feedback.user_id     is 'ON DELETE CASCADE: deleting an account removes its feedback too, so E11.5 stays complete.';

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

-- =====================================================================================
-- ROW-LEVEL SECURITY
--
-- FORCE for the same reason as 001: plain ENABLE does not apply to the table owner.
--
-- THERE IS DELIBERATELY NO SELECT POLICY. A user may write feedback and nothing else — they
-- cannot read anyone's, including their own. With no select policy the client also cannot ask
-- PostgREST to return the inserted row, so the app sends Prefer: return=minimal; anything else
-- would fail on a table that is behaving exactly as intended.
-- The owner reads feedback in the Supabase dashboard, which is not subject to these policies.
-- =====================================================================================
alter table public.feedback enable row level security;
alter table public.feedback force  row level security;

drop policy if exists feedback_insert_own on public.feedback;

-- Restricted to `authenticated` so the anonymous role cannot match at all, and auth.uid() is
-- checked for NULL explicitly — with no token auth.uid() is NULL, and `NULL = user_id` is NULL
-- rather than false, which is easy to write into an accidental grant.
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check ( (select auth.uid()) is not null and (select auth.uid()) = user_id );

grant insert on public.feedback to authenticated;
grant usage, select on sequence public.feedback_id_seq to authenticated;
