# <ID> — <Feature title>

- **Epic:** <e.g. E1 · User-Defined Themes>
- **Stage:** ideation | design | implementation | testing | refinement | integration | done
- **Platform:** web (then migrate to iOS) | both
- **Depends on:** <ids, if any>

## 1. Summary
One paragraph: what this feature lets the user do, and why.

## 2. Design
- **Data model:** new/changed `state.*` fields, `portfolio.json` schema, version-snapshot fields.
- **UI:** where it appears, controls, interactions.
- **Algorithm / behaviour:** the logic, formulas, defaults.
- **Edge cases:** empty/invalid input, migration of old data, interaction with existing features.

## 3. Acceptance criteria
- [ ] Concrete, testable statements ("with X, the app does Y").
- [ ] Regression: existing behaviour unchanged where it should be.

## 4. Implementation notes  (kept current — the Mac reads this to migrate)
- Files touched: `www/index.html` (functions: …), `server.py` (…), data files (…).
- Key functions added/changed and what they do.

## 5. Test plan / results
- How it was verified (preview steps, console checks, screenshots). Outcomes.

## 6. iOS migration notes
- What the Mac session must do to replicate in the native app (usually: `npx cap sync ios`; any
  `.native` CSS; any data-layer/`NATIVE` branch; any new persisted field).

## 7. Integration
- Date merged to `main`; commit; anything to watch.
