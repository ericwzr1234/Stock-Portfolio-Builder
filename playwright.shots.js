// Review screenshots for the E12 lanes. Deliberately NOT part of the test suite: it asserts
// nothing and writes files, which is the opposite of what a test should do.
//   npx playwright test --config playwright.shots.js
const base = require("./playwright.config.js");
module.exports = Object.assign({}, base, { testDir: "./tools", reporter: "line" });
