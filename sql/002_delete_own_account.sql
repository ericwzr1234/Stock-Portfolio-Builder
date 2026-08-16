-- E11.5 — let a signed-in user delete their own account and everything attached to it.
--
-- WHY A DATABASE FUNCTION. Deleting from auth.users needs privileges the `authenticated` role does
-- not have. The only other way to do it from a browser is Supabase's admin API, which requires the
-- SERVICE ROLE key — a key carrying BYPASSRLS that must never reach a client. So this runs
-- SECURITY DEFINER, and is written so it can only ever delete its own caller:
--
--   * the id comes from auth.uid(), never from an argument, so there is no parameter to tamper
--     with and no way to name someone else's account;
--   * search_path is pinned to '' — without that, a caller can create their own `users` table and
--     shadow auth.users, and the definer's privileges get applied to it instead. That is the
--     standard SECURITY DEFINER trap and it is a privilege-escalation bug, not a style point;
--   * EXECUTE is granted to `authenticated` only, and revoked from public and anon.
--
-- public.portfolios.user_id references auth.users(id) ON DELETE CASCADE, so the portfolio row goes
-- with the user. That cascade is already proven — the isolation test deleted a user known to hold a
-- row and watched portfolio_rows drop 2 → 1 with zero orphans.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
