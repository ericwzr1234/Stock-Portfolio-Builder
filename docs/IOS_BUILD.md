# Build & run the iOS app (free, private to you)

This wraps the existing web app (`www/`) as a native iOS app with **Capacitor**. No server, no
paid account, no App Store listing — it fetches stock data on-device and stores your portfolio on
the phone. **Do all of this on the Mac.**

> **Status (2026-07-15): done, end to end.** The app is built, installed, and running on a real
> **physical iPhone** (iPhone 16 Pro Max, iOS 26.5.2) via Xcode free personal-team signing — live
> on-device Yahoo data (prices + the watchlist table) confirmed loading. Previously it was only
> verified on the simulator; the physical-device path below now works start to finish. The step
> notes below capture the *real* first-install experience (bundle-id, provisioning, keychain and
> Developer-Mode gotchas) so it can be reproduced.

---

## 0. One-time prerequisites (all now installed on this Mac)
The toolchain is in place: **Xcode 26.5**, **Node 24**, **CocoaPods 1.16.2** (Homebrew at
`/opt/homebrew`). If you're setting up a fresh Mac, the pieces are:
1. **Xcode** — free from the Mac App Store (large download, ~10–15 GB). Open it once and accept the
   license; install the iOS platform if prompted. Then in a terminal:
   ```
   xcode-select --install        # command-line tools (if not already)
   sudo xcodebuild -license accept
   ```
2. **Node 18 or newer** — Capacitor 6 needs it (this Mac runs Node 24). If yours is too old:
   ```
   # install nvm, then:
   nvm install 20 && nvm use 20
   node -v        # should print v20.x or newer
   ```
   (Or download the LTS installer from nodejs.org.)
3. **CocoaPods** — Capacitor uses it for iOS dependencies:
   ```
   sudo gem install cocoapods       # or: brew install cocoapods
   ```

**Build from the git clone that lives *outside* OneDrive** — on this Mac that's
`/Users/oujiei/Developer/portfolio-builder`. OneDrive's File Provider intermittently locks the
folder out from under Node / `xcodebuild` / `git`, which breaks builds; the outside-OneDrive clone
avoids it. (See [`DEV_WORKFLOW.md`](DEV_WORKFLOW.md).)

**Export a UTF-8 locale before any `pod install` / `npx cap sync`** or CocoaPods throws a Unicode
`ASCII-8BIT` error:
```
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

You do **not** need a paid Apple Developer account. A free Apple ID is enough to run on the
simulator and on your own iPhone (see §4) — that's how the current on-device build is signed.

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

### 4a. Add your Apple ID (creates the free Personal Team)
In **Xcode → Settings → Accounts**, click **+** → **Apple ID** and sign in. This gives you a free
**"(Personal Team)"** you can pick under **Team** below — no paid Developer Program needed.

### 4b. Signing & Capabilities
1. Select the **App** target → **Signing & Capabilities**.
2. Check **Automatically manage signing**, and for **Team** choose your **(Personal Team)**.
3. **The bundle id must be *globally* unique for a free personal team.** A free team can't register a
   bundle id that any other team already owns. The generic `com.eric.portfoliobuilder` failed with
   **"Communication with Apple failed / No profiles for '…' were found"** — we had to change it to
   `com.ericwzr.portfoliobuilder123453` (and set `appId` in `capacitor.config.json` to match, plus
   `DEVELOPMENT_TEAM` = `5F48K52NKV`). Pick your own unique id, update `capacitor.config.json`, then
   re-run `npx cap sync ios`.

### 4c. Connect the iPhone once so a profile can be generated
Plug the iPhone in (trust the computer if prompted). **A physical device must have been connected at
least once**, or the personal team has nothing to build a provisioning profile for — you'll see
**"Your team has no devices from which to generate a provisioning profile."** Once it's connected
and selected as the run target, Xcode generates the profile automatically.

### 4d. Enable Developer Mode on the phone
iOS 16+ requires it: **Settings → Privacy & Security → Developer Mode → On**, then **restart the
phone** and confirm after reboot.

### 4e. Run — and the two prompts you'll hit
Pick a run target at the top and press ▶︎:
- **Simulator** (e.g. "iPhone 15") → instant, no signing needed.
- **Your iPhone** → the first real build surfaces two prompts:
  - A **macOS keychain** prompt: *"codesign wants to access key Apple Development: …"* → click
    **Always Allow**, entering your **Mac login password** (the macOS user password — **not** your
    Apple ID password).
  - On the phone, first launch is blocked until you **trust the cert**:
    **Settings → General → VPN & Device Management → [your Apple ID] → Trust**.

### 4f. Xcode prompts/warnings to expect
- **"Update to recommended settings"** → **skip it (Cancel).** One of its changes (Enable User Script
  Sandboxing) breaks the Capacitor/CocoaPods build scripts.
- Harmless yellow warnings (not errors): the **WKProcessPool** deprecation and
  **"[CP] Embed Pods Frameworks will run every build."** Ignore them.

### The "free" caveat (why it's private to you)
With a **free** Apple ID, the signing certificate **expires after ~7 days** — just re-run from Xcode
(▶︎) roughly weekly to refresh it. **Re-running is an in-place update: it preserves the app's
on-device data.** Only *deleting the app icon* wipes it. The app only ever exists on your own
devices; nobody else can get it. That satisfies "private to myself, no payment."

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
  parsing mirrors `server.py` for quotes, statements (`nativeStatements`, E3), search and peers. The
  earlier parity gap is now **closed:** `nativeFundamentals` emits the full ~21 extended E2 catalog +
  market fields (mirrors `server.py`'s `_fetch_one_fundamental`), so the E2 catalog / E3 pulled
  metrics populate on-device — see [`APP_MIGRATION.md`](APP_MIGRATION.md). (Watchlist quotes also
  carry 52-week high/low, today's volume and average volume in both data layers.)
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

## Runtime facts (what it does on your phone)
- **Your data lives on-device.** The portfolio (holdings / themes / watchlist / versions / settings)
  persists in the app's private WebKit `localStorage` (key `pb_portfolio_v1`) — not in any cloud.
  **Deleting the app icon wipes it;** an in-place re-run from Xcode does not. LAN sync (above) is the
  optional way to share the computer's `portfolio.json`.
- **No background refresh.** The app fetches data only while it's foregrounded — there are no
  `UIBackgroundModes` / background-fetch plugins, and iOS suspends the webview when the app is
  backgrounded or closed. So no background battery or data use.
- **Free to use.** It reads Yahoo Finance's free public endpoints on-device: no API key, no
  subscription, no server to pay for.
- **Security posture.** It's your own sandboxed code with minimal permissions (only **Local Network**,
  for the optional LAN sync), makes only outbound HTTPS to Yahoo, and loads **no remote code** (it
  runs the bundled `www/`). Developer Mode's only added exposure is *physical access* — an attacker
  would need the unlocked phone and passcode; it opens no remote hole and can't be enabled remotely.

## Troubleshooting
- **Quotes/fundamentals are blank on device but the UI loads.** The on-device Yahoo path is the
  suspect. Confirm `capacitor.config.json` has `plugins.CapacitorHttp.enabled: true`, then
  `npx cap sync ios` and rebuild. In Xcode's console, look for `yahoo quotes` errors. If Yahoo
  rejects the request, it's usually the crumb — the app re-fetches it automatically; try Refresh.
- **"Could not find module @capacitor/ios".** Run `npm install` first.
- **Pod install fails with a Unicode / `ASCII-8BIT` error.** CocoaPods needs a UTF-8 locale — export
  `LANG=en_US.UTF-8` and `LC_ALL=en_US.UTF-8` (see §0) and re-run.
- **Pod install fails otherwise.** Ensure CocoaPods is installed (`pod --version`), then
  `npx cap sync ios` again.
- **App shows a blank white screen.** You probably edited `www/` without `npx cap sync ios`.
- **Signing: "No profiles for '…' were found" / "Communication with Apple failed."** The bundle id
  isn't globally unique for a free personal team — pick a unique `appId` and update
  `capacitor.config.json` (see §4b step 3).
- **"Your team has no devices from which to generate a provisioning profile."** Connect the physical
  iPhone at least once and select it as the run target (see §4c).
- **Sync won't connect.** Phone and computer on the same Wi-Fi? Is `server.py` running? Use the exact
  **"iPhone app sync"** address it prints (not `127.0.0.1`). Tap **Allow** on the local-network
  prompt. A Mac firewall, if on, may need to permit incoming connections to Python.
- **Web prices show `seed`/offline on the Mac** (works on Windows). The Mac's python.org Python
  can't verify Yahoo's TLS certificate. `server.py` now **auto-uses `certifi`** for its trust store,
  so this should fetch live out of the box; if it's still falling back, `pip3 install certifi` (or run
  **`/Applications/Python 3.xx/Install Certificates.command`** once). This only affects the *web
  server's* price proxy on the Mac — the iPhone app fetches prices itself (unaffected), and sync is
  unaffected.

## Keeping web and iOS in sync
There is one codebase. Edit `www/index.html` (or run `python3 tools/build_universe.py` to refresh
the universe), test it in the browser via `server.py`, then `npx cap sync ios` and rebuild in
Xcode. No logic is duplicated — only the data layer branches on platform at runtime.

**Push the latest to the phone (also the ~weekly cert refresh):** from the clone outside OneDrive,
```
git pull
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods locale (see §0)
npx cap sync ios
npx cap open ios      # in Xcode: pick the iPhone, press ▶︎
```
It's an in-place update, so on-device data is preserved.
