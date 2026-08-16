// E11.8 - tests run against the REAL page, served by the real dev server, with no sign-in.
// Everything under test is a pure function on `state`, so the gate can stay up: no credentials in
// CI, no network beyond localhost, and the artifact under test is the one that ships.

const PORT = 8767;   // not 8765/8766 - a test run must never collide with a dev server you have open

module.exports = {
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: false,          // the engine mutates module-level `state`; parallel pages would race
  reporter: process.env.CI ? "list" : "line",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: process.platform === "win32" ? "py -3 server.py" : "python3 server.py",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      PB_NO_BROWSER: "1",
      PB_PORT: String(PORT),
      // A throwaway database path. Tests never touch portfolio.json, and portfolio.*.json is
      // already gitignored.
      PB_DB: "portfolio.test.json",
    },
  },
};
