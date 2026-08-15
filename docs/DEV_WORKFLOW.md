# Dev workflow — git, dev/prod, and the feature pipeline

> **Read this before developing on either machine.** This project is now a **git repo synced via
> GitHub** (not OneDrive). It is developed on two machines — a **Windows laptop** (focus: the web
> app) and a **MacBook** (focus: migrating finished web features to the native iOS app). This doc is
> the agreed setup + process so the two stay in sync cleanly.

Repo: **https://github.com/ericwzr1234/Stock-Portfolio-Builder** (private).

---

## 1. Why git/GitHub, and the OneDrive gotcha (important for the Mac)

We use **GitHub as the single sync mechanism**: each machine `clone`s the repo, then `pull`/`push`.
That gives proper history, branches, and a path to sharing — things OneDrive can't.

**The one hazard to avoid:** do **not** let OneDrive *and* git both sync the same `.git` folder. Two
sync engines fighting over the same files corrupts the repo ("conflict copies" inside `.git`).
**Both machines now work from a clone OUTSIDE OneDrive — this is done, do not move either back.**

| Machine | Working copy |
|---|---|
| **Windows** | `C:\dev\portfolio-builder`  *(moved out of OneDrive 2026-08-08)* |
| **Mac** | `~/Developer/portfolio-builder` |

- **Mac setup:** `cd ~/dev && git clone https://github.com/ericwzr1234/Stock-Portfolio-Builder.git portfolio-builder`
- **Windows:** already at `C:\dev\portfolio-builder`; a **desktop shortcut** points at its
  `Start Portfolio Builder.bat`, so launching is unchanged.

### Why Windows was moved (2026-08-08)
Beyond the `.git` corruption hazard, OneDrive's **Files On-Demand** kept the project's files as
cloud-only placeholders. Any tool that reads them (a recursive `grep`, an editor, a build) forces
OneDrive to re-download each file and Windows raises an *"Automatic file downloads — grep is
downloading…"* notification. A recursive search over `node_modules` (1,575 files) produced a flood of
them. Moving out of OneDrive ends that permanently, and — importantly — **stops `portfolio.json`
(real holdings and cost basis) from being synced to Microsoft's cloud.**

`node_modules/` was also deleted on Windows: it is a **Mac/iOS-only build artifact** (Capacitor), it
is gitignored, and Windows only ever runs `server.py` (Python stdlib). Regenerate it on the Mac with
`npm install`. This took the working copy from 17.9 MB to 4.8 MB.

> **Backup note:** the project is no longer in OneDrive, so it is no longer backed up by it. Code is
> safe on GitHub, but **`portfolio.json` is gitignored and now exists only on this machine** — copy it
> somewhere safe periodically if you care about the version history it holds.

## 2. Branch model
- **`main`** = **prod**: only finished, approved, integrated features. The Mac migrates iOS from here.
- **`dev-newUI`** = where V2 web work is built and tested (E5 the UI overhaul, E6 accounts). This is
  the active work branch.
- **`dev`** = the **frozen V1 archive** (`e5ceb39`), kept because the shipped iOS app was built from
  it. Do not build new web work here; it predates E5/E6.
- **Integration** = merge `dev → main` once a feature is approved (`git checkout main && git merge dev`),
  then push. The Mac `git pull` and runs `npx cap sync ios` to pick up integrated web changes.

## 3. Running the dev server (isolated from real data)
`server.py` reads two env vars so dev testing never touches your real `portfolio.json`:
- `PB_DB` — portfolio file path (default `portfolio.json`). Dev uses **`portfolio.dev.json`**.
- `PB_PORT` — port (default 8765). Dev uses **8766**. (`PB_NO_BROWSER=1` is also supported.)

The Claude **preview** configs live in `.claude/launch.json` (this file is **machine-specific and
git-ignored**, because the Python runtime differs by OS — Windows `py -3`, Mac `python3`). Recreate
it per machine:
```json
{ "version":"0.0.1","configurations":[
  { "name":"portfolio",     "runtimeExecutable":"<py-3|python3>", "runtimeArgs":["server.py"], "port":8765 },
  { "name":"portfolio-dev", "runtimeExecutable":"<py-3|python3>", "runtimeArgs":["server.py"], "port":8766,
    "env":{ "PB_DB":"portfolio.dev.json","PB_PORT":"8766","PB_NO_BROWSER":"1" } }
] }
```
Manual dev run: `PB_DB=portfolio.dev.json PB_PORT=8766 python server.py` → open `http://127.0.0.1:8766/`.

## 4. The feature pipeline (and your approval gates)
Every new feature is one card on the **[project board](DASHBOARD.md)** and moves left→right:

`ideation → design → implementation → testing → refinement → integration → done`

- **ideation** — a half-baked idea; gets fleshed out before moving on.
- **design** — a spec is written in `docs/features/<id>_<name>.md`. **You sign off the design before code.**
- **implementation** — built on `dev`.
- **testing** — demoed on the dev server; **you try it.**
- **refinement** — if not approved, your new instructions → back to implementation (loop).
- **integration** — on your "good", merge `dev → main`, update the feature doc + board, push. (Mac then migrates.)
- **done** — integrated.

**Rule of engagement:** one feature at a time; design sign-off before implementing; your test before
integrating; ask before starting the next feature.

## 5. The project board (visible to both of us)
- **Source of truth:** [`board.json`](board.json). To move a card, edit its `"stage"`.
- **Regenerate the two views** after editing:
  ```
  Windows:  py -3 tools/render_dashboard.py
  Mac:      python3 tools/render_dashboard.py
  ```
  → writes [`DASHBOARD.md`](DASHBOARD.md) (renders on GitHub) and `board.js` (read by the visual
  kanban). Open **`dashboard.html`** in the repo root (double-click) for the kanban view.
- Commit `board.json`, `DASHBOARD.md`, `board.js` together so the views never drift.

## 6. Documenting each feature (so the Mac can migrate it)
Every feature gets `docs/features/<id>_<name>.md` (copy `_TEMPLATE.md`). Keep its **Implementation
notes** (files/functions touched) and **iOS migration notes** current — that's exactly what the Mac
session reads to replicate the feature in the native app.

## 7. Quick reference
```
git checkout dev                 # work here
# ...edit www/index.html, test on the dev server (port 8766)...
git add -A && git commit -m "E1.x: ..."
git push origin dev
# on approval → integrate:
git checkout main && git merge dev && git push origin main
git checkout dev
```
