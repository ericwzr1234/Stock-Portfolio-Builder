#!/usr/bin/env python3
"""Render the project board from docs/board.json into two synced views:
  - docs/DASHBOARD.md  — GitHub-rendered Markdown (monitor from the web UI / phone)
  - docs/board.js      — `window.__BOARD = {...};` consumed by dashboard.html (local visual kanban)

board.json is the single source of truth. To move a card: edit its "stage" in board.json, then:
    Windows:  py -3 tools/render_dashboard.py
    Mac:      python3 tools/render_dashboard.py
No third-party deps. Idempotent.
"""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "docs", "board.json")
MD = os.path.join(BASE, "docs", "DASHBOARD.md")
JS = os.path.join(BASE, "docs", "board.js")


def main():
    with open(SRC, encoding="utf-8") as f:
        b = json.load(f)
    epics = {e["key"]: e for e in b["epics"]}
    by_stage = {s["key"]: [] for s in b["stages"]}
    for it in b["items"]:
        by_stage.setdefault(it["stage"], []).append(it)

    # ---- board.js (script-loadable; avoids file:// fetch issues, same trick as universe.js) ----
    with open(JS, "w", encoding="utf-8") as f:
        f.write("window.__BOARD = " + json.dumps(b) + ";\n")

    # ---- DASHBOARD.md ----
    L = []
    L.append(f"# {b['project']} — Project Board")
    L.append("")
    L.append(f"_Updated {b.get('updated', '')}. Auto-generated from "
             f"[`board.json`](board.json) by `tools/render_dashboard.py` — edit the JSON, not this "
             f"file. Open [`../dashboard.html`](../dashboard.html) for the visual kanban._")
    L.append("")
    L.append("**Epics:** " + " · ".join(f"`{e['key']}` {e['name']}" for e in b["epics"]))
    L.append("")
    L.append("**Pipeline:** " + " → ".join(s["label"] for s in b["stages"]))
    L.append("")
    L.append("| Stage | Count |")
    L.append("|---|---:|")
    for s in b["stages"]:
        L.append(f"| {s['label']} | {len(by_stage.get(s['key'], []))} |")
    L.append("")
    L.append("---")
    L.append("")
    for s in b["stages"]:
        its = by_stage.get(s["key"], [])
        L.append(f"## {s['label']}  ({len(its)})")
        L.append(f"_{s['desc']}_")
        L.append("")
        if not its:
            L.append("- _(none)_")
        else:
            for it in its:
                ep = epics.get(it.get("epic", ""), {})
                tags = []
                if it.get("depends"):
                    tags.append(f"depends {it['depends']}")
                if it.get("platform"):
                    tags.append(it["platform"])
                tagstr = (" _(" + ", ".join(tags) + ")_") if tags else ""
                spec = ""
                if it.get("spec"):
                    rel = os.path.relpath(it["spec"], "docs").replace(os.sep, "/")
                    spec = f" · [spec]({rel})"
                L.append(f"- **{it['id']}** · _{ep.get('name', it.get('epic', ''))}_ — "
                         f"**{it['title']}**{tagstr}{spec}")
                notes = it.get("notes")
                if isinstance(notes, list):
                    for n in notes:
                        L.append(f"  - {n}")
                elif notes:
                    L.append(f"  <br>{notes}")
        L.append("")
    with open(MD, "w", encoding="utf-8") as f:
        f.write("\n".join(L))

    print(f"Wrote {MD}")
    print(f"Wrote {JS}")
    for s in b["stages"]:
        print(f"  {s['label']:<14} {len(by_stage.get(s['key'], []))}")


if __name__ == "__main__":
    main()
