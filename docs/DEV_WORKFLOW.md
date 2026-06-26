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
sync engines fighting over the same files corrupts the repo ("conflict copies" inside `.git`). The
Windows working copy currently still lives under `OneDrive\Desktop\Portfolio Builder`; that's fine
for a single machine, but the **clean end-state is: work from a `git clone` *outside* OneDrive on
both machines.**

- **Mac setup (do this):** clone to a normal path, e.g.
  ```
  cd ~/dev && git clone https://github.com/ericwzr1234/Stock-Portfolio-Builder.git portfolio-builder
  ```
  Work there. **Do not** keep using the OneDrive copy of the project on the Mac — git is the sync now.
- **Windows (eventually):** move the working copy out of OneDrive (e.g. `C:\dev\portfolio-builder`)
  or exclude the folder from OneDrive sync. Until then, commit/push often; `.gitignore` keeps the
  churny dirs (`node_modules/`, `ios/` build output, `portfolio.json`) out so OneDrive isn't thrashing.

## 2. Branch model
- **`main`** = **prod**: only finished, approved, integrated features. The Mac migrates iOS from here.
- **`dev`** = where features are built and tested.
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
