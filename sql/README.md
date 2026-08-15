# sql/

**Numbered files are migrations. Apply them in order, and never edit one that has already been run.**

| File | What it is |
|---|---|
| `001_portfolios.sql` | The `portfolios` table, RLS policies, grants and integrity trigger. **Applied via the Supabase SQL editor.** |
| `ISOLATION_TEST.md` | Not a migration — the E6.7 gate. Eight checks against two real accounts that must pass before any tester is invited. |

## Rules

1. **Run migrations from the repo, don't author them in the dashboard.** A snippet saved in Supabase is
   a second copy that will drift from this directory. This directory is the source of truth.
2. **Never edit an applied migration.** Once `001` has run it is history. Change the schema with a new
   file (`002_…sql`) that `alter`s what exists.
3. **Keep them idempotent** where practical (`if not exists`, `drop policy if exists`), so a re-run is
   harmless.
4. **Ordinary Postgres only** — no vendor-specific types or syntax, so `pg_dump` can move this anywhere
   (see `docs/features/E6_database_design.md` §13).
5. **No secrets in here.** The publishable key is public by design; the secret key carries `BYPASSRLS`
   and must never enter the repo.

The numeric prefix is deliberately migration-shaped so Supabase's CLI migrations can be adopted later
without renaming anything.
