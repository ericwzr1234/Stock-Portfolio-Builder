/* E13.4 - the proxy must answer the app and refuse everybody else.
 *
 * These test verifyUser() from worker/src/index.js directly, in Node, because the Playwright web
 * server is server.py - which deliberately does NOT verify. server.py binds 0.0.0.0 so the iPhone
 * can reach it over the home LAN and is not on the internet; the Worker is the internet-facing
 * surface, so the Worker is where the control belongs. Testing the module means testing the code
 * that actually ships, rather than a re-implementation of it.
 *
 * Signing uses real ES256 keys generated here, with the JWKS fetch stubbed to return the matching
 * public key. That exercises the real crypto path: a token signed by the WRONG key must fail, and
 * it can only fail for the right reason if the right key would have passed.
 */
const { test, expect } = require("@playwright/test");
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

/* Load the Worker with fetch/crypto stubbed so the JWKS lookup returns our test key. */
async function loadWorker(jwk) {
  const src = fs.readFileSync(path.join(__dirname, "..", "worker", "src", "index.js"), "utf8");
  const url = "data:text/javascript;base64," + Buffer.from(src).toString("base64");
  globalThis.fetch = async (u) => {
    if (String(u).includes("jwks.json")) {
      return { ok: true, status: 200, json: async () => ({ keys: [jwk] }) };
    }
    throw new Error("unexpected upstream fetch in this test: " + u);
  };
  globalThis.atob = (b) => Buffer.from(b, "base64").toString("binary");
  const mod = await import(url + "#" + Math.random());   // fresh module, so the JWKS cache is cold
  return mod.default;
}

const call = (worker, token) => worker.fetch({
  url: "https://x.pages.dev/api/quotes?symbols=NVDA",
  headers: { get: (k) => (k.toLowerCase() === "authorization" && token ? "Bearer " + token : null) },
});

test("a valid session is accepted", async () => {
  const { privateKey, jwk } = makeKeypair();
  const worker = await loadWorker(jwk);
  const res = await call(worker, sign(privateKey, goodClaims()));
  /* It gets PAST the gate. Yahoo is unreachable from CI so the upstream fetch throws and the
     handler answers 500 - which is proof the request was authorised, since an unauthorised one
     never reaches upstream at all. */
  expect(res.status).not.toBe(401);
});

const REFUSED = {
  "no Authorization header at all":  () => null,
  "an empty bearer":                 () => "",
  "not a JWT":                       () => "totally-not-a-token",
  "only two segments":               () => "aaa.bbb",
  "alg none":                        (k) => sign(k.privateKey, goodClaims(), { alg: "none" }),
  "alg HS256 instead of ES256":      (k) => sign(k.privateKey, goodClaims(), { alg: "HS256" }),
  "expired an hour ago":             (k) => sign(k.privateKey, goodClaims({ exp: now() - 3600 })),
  "no exp claim":                    (k) => sign(k.privateKey, goodClaims({ exp: undefined })),
  "not yet valid":                   (k) => sign(k.privateKey, goodClaims({ nbf: now() + 3600 })),
  "issued by another project":       (k) => sign(k.privateKey, goodClaims({ iss: "https://evil.supabase.co/auth/v1" })),
  "role anon, not authenticated":    (k) => sign(k.privateKey, goodClaims({ role: "anon" })),
  "role service_role":               (k) => sign(k.privateKey, goodClaims({ role: "service_role" })),
};

for (const [name, mk] of Object.entries(REFUSED)) {
  test(`refused: ${name}`, async () => {
    const kp = makeKeypair();
    const worker = await loadWorker(kp.jwk);
    const res = await call(worker, mk(kp));
    expect(res.status).toBe(401);
  });
}

test("a session with an unexpected role is still ACCEPTED, because the signature is the control", async () => {
  const kp = makeKeypair();
  const worker = await loadWorker(kp.jwk);
  /* Deliberate. Only this project's key can mint a token, so refusing an unfamiliar role would
     risk locking every real user out to buy nothing - and the accept path cannot be tested here
     without an account. anon and service_role are still refused; see the REFUSED table above. */
  const res = await call(worker, sign(kp.privateKey, goodClaims({ role: "some_future_role" })));
  expect(res.status).not.toBe(401);
});

test("refused: signed with the WRONG key", async () => {
  const real = makeKeypair(), attacker = makeKeypair();
  const worker = await loadWorker(real.jwk);                 // the server knows only the real key
  const res = await call(worker, sign(attacker.privateKey, goodClaims()));
  expect(res.status).toBe(401);
});

test("refused: a valid token with the payload tampered afterwards", async () => {
  const kp = makeKeypair();
  const worker = await loadWorker(kp.jwk);
  const tok = sign(kp.privateKey, goodClaims());
  const [h, , sig] = tok.split(".");
  const forged = h + "." + b64url(JSON.stringify(goodClaims({ sub: "somebody-else" }))) + "." + sig;
  expect((await call(worker, forged)).status).toBe(401);
});

test("it fails CLOSED when the key server is unreachable", async () => {
  const kp = makeKeypair();
  const worker = await loadWorker(kp.jwk);
  globalThis.fetch = async () => { throw new Error("jwks down"); };
  /* Failing OPEN here would be the entire vulnerability, so an outage must refuse, not admit. */
  expect((await call(worker, sign(kp.privateKey, goodClaims()))).status).toBe(401);
});

test("the Worker's project URL still matches the client's", async () => {
  const worker = fs.readFileSync(path.join(__dirname, "..", "worker", "src", "index.js"), "utf8");
  /* E13.1 split the client into index.html + app.js, so "the client" is both files now. */
  const client = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8")
               + fs.readFileSync(path.join(__dirname, "..", "www", "app.js"), "utf8");
  const w = /SUPABASE_URL\s*=\s*"([^"]+)"/.exec(worker);
  const c = /SB_URL\s*=\s*"([^"]+)"/.exec(client);
  /* One fact, two readers. If they drift, every signed-in request is refused for the wrong
     reason and the app goes dark with a 401 nobody can explain. */
  expect(w && w[1]).toBe(c && c[1]);
});

test("a refusal says WHICH check refused, so a real sign-in failure is diagnosable", async () => {
  const kp = makeKeypair();
  const worker = await loadWorker(kp.jwk);
  const cases = [
    [null, "no-bearer"],
    ["not-a-jwt", "not-a-jwt"],
    [sign(kp.privateKey, goodClaims({ exp: now() - 3600 })), "expired"],
    [sign(kp.privateKey, goodClaims({ role: "anon" })), "role"],
    [sign(kp.privateKey, goodClaims({ iss: "https://evil.supabase.co/auth/v1" })), "iss"],
  ];
  for (const [tok, want] of cases) {
    const res = await call(worker, tok);
    const body = JSON.parse(await res.text());
    /* I cannot test the ACCEPT path without the owner's account, so the refusal path has to be
       self-explaining: if a genuine sign-in is ever refused, the reason is one look away. */
    expect(body.reason, `for ${want}`).toBe(want);
  }
});

test("a token signed by the wrong key reports a signature failure, not something vaguer", async () => {
  const real = makeKeypair(), attacker = makeKeypair();
  const worker = await loadWorker(real.jwk);
  const res = await call(worker, sign(attacker.privateKey, goodClaims()));
  expect(JSON.parse(await res.text()).reason).toBe("signature");
});
