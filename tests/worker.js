/* Loading worker/src/index.js in Node, with real ES256 keys and a stubbed upstream.
 *
 * Shared by apiauth.spec.js and apihistory.spec.js. These test the code that actually ships rather
 * than a re-implementation of it: the Playwright web server is server.py, which deliberately does
 * NOT verify sessions, so the Worker's own gate can only be exercised by importing the Worker.
 *
 * Signing uses real keys generated per test, with the JWKS fetch stubbed to return the matching
 * public key. That exercises the real crypto path - a token signed by the WRONG key must fail, and
 * it can only fail for the right reason if the right key would have passed.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://uvzxdeiiwswhthfaqhtb.supabase.co";

const b64url = (buf) => Buffer.from(buf).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function makeKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  return { privateKey, jwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, kid: "test-kid",
                              alg: "ES256", use: "sig", key_ops: ["verify"] } };
}

function sign(privateKey, claims, header) {
  const h = b64url(JSON.stringify(Object.assign({ alg: "ES256", typ: "JWT", kid: "test-kid" }, header)));
  const p = b64url(JSON.stringify(claims));
  const sig = crypto.sign("sha256", Buffer.from(h + "." + p),
    { key: privateKey, dsaEncoding: "ieee-p1363" });     // JWS ES256 is raw r||s, not DER
  return h + "." + p + "." + b64url(sig);
}

const now = () => Math.floor(Date.now() / 1000);

const goodClaims = (over) => Object.assign({
  sub: "11111111-2222-3333-4444-555555555555",
  iss: SUPABASE_URL + "/auth/v1",
  role: "authenticated",
  exp: now() + 3600,
  iat: now(),
}, over || {});

const workerSource = () =>
  fs.readFileSync(path.join(__dirname, "..", "worker", "src", "index.js"), "utf8");

/* `upstream(url)` answers anything that is not the JWKS lookup. Left undefined, a non-JWKS fetch
   throws - which is what the auth tests want, since reaching upstream at all proves the gate let
   the request through. */
async function loadWorker(jwk, upstream) {
  const url = "data:text/javascript;base64," + Buffer.from(workerSource()).toString("base64");
  globalThis.fetch = async (u) => {
    if (String(u).includes("jwks.json")) {
      return { ok: true, status: 200, json: async () => ({ keys: [jwk] }) };
    }
    if (upstream) return upstream(String(u));
    throw new Error("unexpected upstream fetch in this test: " + u);
  };
  globalThis.atob = (b) => Buffer.from(b, "base64").toString("binary");
  const mod = await import(url + "#" + Math.random());   // fresh module, so every cache is cold
  return mod.default;
}

/* A signed-in GET. `token` undefined means a valid session; null means none at all. */
function call(worker, reqUrl, token) {
  return worker.fetch({
    url: reqUrl,
    headers: { get: (k) => (k.toLowerCase() === "authorization" && token ? "Bearer " + token : null) },
  });
}

module.exports = { SUPABASE_URL, b64url, makeKeypair, sign, now, goodClaims, loadWorker, call,
                   workerSource };
