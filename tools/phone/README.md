# Phone UI verification harness (APP2)

The engine tests (`tests/engine.spec.js`) deliberately keep the login gate up, because everything
they touch is a pure function. That leaves the **view layer** unverifiable — and the phone rebuild
is almost entirely view layer. These scripts close that gap **without ever handling a password**:
they load the real page from the real dev server, inject a synthetic portfolio into `state` exactly
as the engine tests do, drop the gate with the app's own `showGate(false)`, and measure.

```bash
PB_DB=portfolio.test.json PB_PORT=8768 PB_NO_BROWSER=1 python3 server.py &
NODE_PATH=$PWD/node_modules node tools/phone/shots.js http://127.0.0.1:8768 /tmp/shots run dark
NODE_PATH=$PWD/node_modules node tools/phone/scrub-test.js      # touch-scrub functional check
```

`shots.js` screenshots **every page of every tab** at 402x874 and reports, per page:
`tooWide` (elements wider than the screen), `canPan`, `scrollH`, and `tiny` (zoom-risk fields).

## Three ways this harness lied to me on 2026-08-24, all now fixed

Read these before trusting it, because each one produced a **false pass** on a bug the owner then
found on the device:

1. **It ran signed OUT.** `renderAcctBtn` turns the account button into `● user@example.com` only
   when signed in, and that unbounded string was what overflowed. Signed out it reads "Sign in" and
   the bug cannot appear. The fixture now installs the signed-in label.
2. **It measured after clipping.** It read `documentElement.scrollWidth`, but `body{overflow-x:clip}`
   on native had already clipped the overflow — so the guard masked the very bug it exists to catch.
   It now walks the tree for any element wider than the viewport that is **not** inside a legitimate
   horizontal scroller.
3. **It measured only page 1** of each tab. APP2.2b introduced in-tab paging, and the reported bug
   was on page 2. It now iterates every page.

**It is mutation-tested.** With the `.ctrls` fix stashed, it flags `div.ctrls w=467` on 11 of 11
pages. A gate that cannot fail is worth nothing — the same lesson `check_syntax.py` taught.

## Fidelity limits, so you know what it does NOT prove

- It stubs `window.Capacitor` so `NATIVE` is true and native-only JS runs, but it is **Chromium, not
  WKWebView**. Platform differences are real: `body{overflow-x:hidden}` stopped the pan in Chromium
  while the device still panned. Layout findings transfer; gesture and scroll-chaining behaviour
  must still be confirmed on the simulator or device.
- The portfolio is synthetic. Checkpoints need `id`, `snapshot.totalContributed` and `snapshot.holdings`,
  or the version banner reads `#undefined` and the return chart honestly reports too few points.
- It never signs in, so anything behind a live Supabase session (the Account sheet, save paths) is
  out of scope here.
