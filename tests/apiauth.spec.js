const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { SUPABASE_URL, b64url, makeKeypair, sign, now, goodClaims, loadWorker, call, workerSource }
  = require("./worker");

/* Every request here goes to the same route; only the token varies. */
const call1 = (worker, token) => call(worker, "https://x.pages.dev/api/quotes?symbols=NVDA", token);

test("a valid session is accepted", async () => {
  const { privateKey, jwk } = makeKeypair();
  const worker = await loadWorker(jwk);
  const res = await call1(worker, sign(privateKey, goodClaims()));
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
    const res = await call1(worker, mk(kp));
    expect(res.status).toBe(401);
  });
}

test("a session with an unexpected role is still ACCEPTED, because the signature is the control", async () => {
  const kp = makeKeypair();
  const worker = await loadWorker(kp.jwk);
  /* Deliberate. Only this project's key can mint a token, so refusing an unfamiliar role would
     risk locking every real user out to buy nothing - and the accept path cannot be tested here
     without an account. anon and service_role are still refused; see the REFUSED table above. */
  const res = await call1(worker, sign(kp.privateKey, goodClaims({ role: "some_future_role" })));
  expect(res.status).not.toBe(401);
});

test("refused: signed with the WRONG key", async () => {
  const real = makeKeypair(), attacker = makeKeypair();
  const worker = await loadWorker(real.jwk);                 // the server knows only the real key
  const res = await call1(worker, sign(attacker.privateKey, goodClaims()));
  expect(res.status).toBe(401);
});

test("refused: a valid token with the payload tampered afterwards", async () => {
  const kp = makeKeypair();
  const worker = await loadWorker(kp.jwk);
  const tok = sign(kp.privateKey, goodClaims());
  const [h, , sig] = tok.split(".");
  const forged = h + "." + b64url(JSON.stringify(goodClaims({ sub: "somebody-else" }))) + "." + sig;
  expect((await call1(worker, forged)).status).toBe(401);
});

test("it fails CLOSED when the key server is unreachable", async () => {
  const kp = makeKeypair();
  const worker = await loadWorker(kp.jwk);
  globalThis.fetch = async () => { throw new Error("jwks down"); };
  /* Failing OPEN here would be the entire vulnerability, so an outage must refuse, not admit. */
  expect((await call1(worker, sign(kp.privateKey, goodClaims()))).status).toBe(401);
});

test("the Worker's project URL still matches the client's", async () => {
  const worker = workerSource();
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
    const res = await call1(worker, tok);
    const body = JSON.parse(await res.text());
    /* I cannot test the ACCEPT path without the owner's account, so the refusal path has to be
       self-explaining: if a genuine sign-in is ever refused, the reason is one look away. */
    expect(body.reason, `for ${want}`).toBe(want);
  }
});

test("a token signed by the wrong key reports a signature failure, not something vaguer", async () => {
  const real = makeKeypair(), attacker = makeKeypair();
  const worker = await loadWorker(real.jwk);
  const res = await call1(worker, sign(attacker.privateKey, goodClaims()));
  expect(JSON.parse(await res.text()).reason).toBe("signature");
});
