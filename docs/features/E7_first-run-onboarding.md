# E7 — First-run onboarding

**Status:** built on `dev-newUI`, in testing. Tickets E7.1 (empty start) and E7.2 (guided tour).

## Why

Two problems a new user hit immediately, both reported from a real first-run:

1. **"Start fresh" was not fresh.** The board still showed the five built-in themes — with no stocks
   in them — and the Overview donut showed target weights computed over themes the user had never
   chosen. It read like leftover developer data, because in effect it was.
2. **Nothing told them what to do.** Landing on Overview with five empty cards, the next move
   (create a theme, on a different page) was not discoverable.

## E7.1 — a genuinely empty board

### The cause, and why the fix looks the way it does

`state.themes = null` has always meant **"use the five built-in themes"**, and every existing
portfolio depends on that. "Start fresh" left it null, so the defaults came back.

The tempting fix — make `[]` mean "empty" — was rejected. `themes()` is engine-adjacent and its
`null`/`[]` handling is relied on by live data, including the owner's real book. Instead a fresh
start sets an explicit, persisted flag:

```js
function themes(){
  const t = state.themes;
  if(Array.isArray(t) && t.length) return t;
  if(state.noDefaults) return [];        // the user chose to start from scratch
  return THEMES;
}
```

`noDefaults` is absent from every document written before today, so it reads as `false` and nothing
existing changes. `tickersOf()` gets the same treatment: a fresh start inherits no membership either.

### What else had to change

| Place | Before | After |
|---|---|---|
| `#fundGrid` (Model) | empty grid | "No themes yet" panel — *Create your first theme* / *Use the built-in 5* / *Show me how* |
| `#calcUninit` (Rebalance) | offered to size a book across "the 5 themes" | "Build your themes first", with a button to Model |
| Context bar | "build one on Rebalance" | "start by creating a theme on Model" when there are no themes |
| `1.5/themes().length` | ÷ 0 → `Infinity` on an empty board | `defaultCap()`, guarded |
| Rebalance copy | hardcoded "the 5 themes" / "the 5 names" | reads the actual theme count |

After choosing Start fresh the user is taken **straight to Model** with the guide open, because
that is where a portfolio actually begins.

## E7.2 — the guided tour

Floating bubbles anchored to real controls. One short tour per view:

| View | Steps |
|---|---|
| **Model** | create a theme → add tickers → choose metrics → weight them → bad-data policy → cap → your targets |
| **Overview** | the donut → value over time vs equal weight → return in $/% → live prices by theme |
| **Rebalance** | how much are you adding → full vs cash-only → calculate and review → realign with no new money |
| **Research** | search any listed name → park candidates on the watchlist |
| **History** | every checkpoint → undo / redo / revert, and the git-style fork |

### Design decisions worth keeping

- **The highlight ring is an overlay, not a restyle.** Adding a border or outline to the target
  changes that element's own box and shifts the layout underneath the thing being pointed at.
- **Missing anchors are skipped.** A tour written for a populated board must still read correctly on
  an empty one — several Model controls do not exist until themes do. If no step resolves, the tour
  simply does not open.
- **Seen-state is per account AND per view** (`pb_tour_<uid>_<view>`). A second person signing in on
  the same browser gets their own walkthrough rather than inheriting "already seen" — the same
  reasoning as the per-user offline mirror in E6.
- **Switching views ends the tour.** A bubble pointing at a control that is no longer displayed is
  worse than no bubble.
- **Replayable.** The `?` button in the header re-runs the current view's guide at any time.
- Never opens while the login gate is up, or mid-boot.

## Verified

- Empty board: 0 themes / 0 tickers, donut "No themes yet", stat card `0 / 0`, Model and Rebalance
  empty panels present with working buttons, zero console errors.
- An existing book is untouched: 5 themes, 25 holdings, `noDefaults: false`.
- All five tours run end to end; bubbles stay within the viewport, rings anchor to their targets,
  the last step reads "Done", teardown leaves no `.coach`, `.coach-ring` or `.coach-scrim` behind.
- A seen tour does not auto-reopen; a fresh user's does; switching views ends an open tour.
