// Computed-style fingerprint run. Not a test: it asserts nothing and writes a file.
//   npx playwright test --config playwright.styleprint.js
const path = require("path");
const base = require("./playwright.config.js");
module.exports = Object.assign({}, base, {
  testDir: path.join(__dirname, "tools"),
  testMatch: "styleprint.spec.js",
  reporter: "line",
});
