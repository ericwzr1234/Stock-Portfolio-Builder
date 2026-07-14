# Build & run the iOS app (free, private to you)

This wraps the existing web app (`www/`) as a native iOS app with **Capacitor**. No server, no
paid account, no App Store listing — it fetches stock data on-device and stores your portfolio on
the phone. **Do all of this on the Mac.**

---

## 0. One-time prerequisites (this Mac is currently missing both)
1. **Xcode** — free from the Mac App Store (large download, ~10–15 GB). Open it once and accept the
   license; install the iOS platform if prompted. Then in a terminal:
   ```
   xcode-select --install        # command-line tools (if not already)
   sudo xcodebuild -license accept
   ```
2. **Node 18 or newer** — this Mac has Node 10, which is too old for Capacitor 6. Easiest:
   ```
   # install nvm, then:
   nvm install 20 && nvm use 20
   node -v        # should print v20.x
   ```
   (Or download the LTS installer from nodejs.org.)
3. **CocoaPods** — Capacitor uses it for iOS dependencies:
   ```
   sudo gem install cocoapods       # or: brew install cocoapods
   ```

You do **not** need a paid Apple Developer account. A free Apple ID is enough to run on the
simulator and on your own iPhone (see §4).

---

## 1. Install JS dependencies (first time, and after pulling changes)
From the project folder:
```
npm install
```
This creates `node_modules/` (Mac-only build artifact; safe to delete and reinstall).

## 2. Add the iOS project (first time only)
```
npx cap add ios
```
This generates the `ios/` Xcode project from `capacitor.config.json` (`webDir: www`).

## 3. Sync web assets into the iOS app (every time you change `www/`)
```
npx cap sync ios
```
This copies `www/` into the app bundle and installs native plugins. **Run it after every edit to
`www/index.html`, `www/data/*`, or the Capacitor config.**

## 4. Open in Xcode, sign, and run
```
npx cap open ios
```
In Xcode:
1. Select the **App** target → **Signing & Capabilities**.
2. Check **Automatically manage signing**, and for **Team** choose your personal Apple ID
   (add it via Xcode → Settings → Accounts if it's not listed). A free account works.
3. If signing complains about the bundle id, change it to something unique you own, e.g.
   `com.<yourname>.portfoliobuilder` (also update `appId` in `capacitor.config.json` to match,
   then re-run `npx cap sync ios`).
4. Pick a run target at the top:
   - **Simulator** (e.g. "iPhone 15") → press ▶︎. Instant, no signing needed.
   - **Your iPhone** (plug it in, trust the computer, enable Developer Mode on the phone under
     Settings → Privacy & Security) → press ▶︎. The first time, on the phone go to
     **Settings → General → VPN & Device Management** and **trust** your developer certificate.

### The "free" caveat (why it's private to you)
With a **free** Apple ID, an app installed on a real device **expires after ~7 days** — just
re-run it from Xcode (▶︎) to refresh it. It only ever exists on your devices; nobody else can get
it. That satisfies "private to myself, no payment."

### Later, if you want it to last / share privately
Join the **Apple Developer Program ($99/yr)**. Then:
- On-device builds last a year, and
- You can distribute privately via **TestFlight** (invite specific people by email — still not a
  public App Store listing). No code changes needed; just the paid team + an App Store Connect
  record.

---

## How data works on iOS (no server involved)
- **Prices, fundamentals & statements:** fetched directly from Yahoo Finance on the device via the
  `CapacitorHttp` plugin (enabled in `capacitor.config.json`), which bypasses browser CORS. The
  parsing mirrors `server.py` for quotes, statements (`nativeStatements`, E3), search and peers.
  **Open parity gap:** `nativeFundamentals` does not yet return the ~21 extended E2 catalog fields the
  web server does, so the E2 catalog / E3 pulled metrics are blank on-device until it's extended — see
  [`APP_MIGRATION.md`](APP_MIGRATION.md) (this is the main remaining app-dev task).
- **Your portfolio:** by default stored on-device in `localStorage` (key `pb_portfolio_v1`). You can
  instead **sync with your computer over Wi-Fi** so the phone and the web version share one
  `portfolio.json` — see "Sync with the web version" below.
- **Screener universe:** bundled in the app as `www/data/universe.js` (loaded via `<script>` as
  `window.__UNIVERSE`), so it needs no network.

## Sync with the web version (same Wi-Fi) — optional, free, private
Make the iPhone app and the web version share **one** `portfolio.json`:
1. On the computer, start the app (`python3 server.py` or the launcher). The server now **binds to
   your whole network** and prints an **"iPhone app sync"** line, e.g. `http://192.168.1.50:8765`.
2. On the iPhone (same Wi-Fi), open the app → **History** tab → **Data sync** → **Set up sync** →
   type that address → **Connect**. The app immediately adopts your computer's portfolio (your
   existing moves), and every change you make on the phone writes back to the same `portfolio.json`
   the web version reads. It keeps a local mirror, so away from the network it falls back to the
   last-synced copy; reconnect when you're home.
3. The first connection triggers an iOS "find devices on your local network" prompt — tap **Allow**.

Requirements / notes:
- Needs `NSAllowsLocalNetworking` + `NSLocalNetworkUsageDescription` in `ios/App/App/Info.plist`
  (already added). If you ever regenerate the iOS project with `npx cap add ios`, re-add them.
- It's plain HTTP on your LAN (fine at home). The server has no password, so anyone on the same
  Wi-Fi could reach it — use trusted networks.
- The "database" is whichever computer is running the server. Because `portfolio.json` lives in
  OneDrive, it stays consistent across the Mac and Windows laptop — just don't run the server on
  both at once and edit simultaneously.

## Troubleshooting
- **Quotes/fundamentals are blank on device but the UI loads.** The on-device Yahoo path is the
  suspect. Confirm `capacitor.config.json` has `plugins.CapacitorHttp.enabled: true`, then
  `npx cap sync ios` and rebuild. In Xcode's console, look for `yahoo quotes` errors. If Yahoo
  rejects the request, it's usually the crumb — the app re-fetches it automatically; try Refresh.
- **"Could not find module @capacitor/ios".** Run `npm install` first.
- **Pod install fails.** Ensure CocoaPods is installed (`pod --version`), then
  `npx cap sync ios` again.
- **App shows a blank white screen.** You probably edited `www/` without `npx cap sync ios`.
- **Signing error about the bundle id.** Pick a unique `appId` (see §4 step 3).
- **Sync won't connect.** Phone and computer on the same Wi-Fi? Is `server.py` running? Use the exact
  **"iPhone app sync"** address it prints (not `127.0.0.1`). Tap **Allow** on the local-network
  prompt. A Mac firewall, if on, may need to permit incoming connections to Python.
- **Web prices show `seed`/offline on the Mac** (works on Windows). The Mac's python.org Python
  can't verify Yahoo's TLS certificate. Fix once: run **`/Applications/Python 3.xx/Install
  Certificates.command`** (double-click it). This only affects the *web server's* price proxy on the
  Mac — the iPhone app fetches prices itself (unaffected), and sync is unaffected.

## Keeping web and iOS in sync
There is one codebase. Edit `www/index.html` (or run `python3 tools/build_universe.py` to refresh
the universe), test it in the browser via `server.py`, then `npx cap sync ios` and rebuild in
Xcode. No logic is duplicated — only the data layer branches on platform at runtime.
