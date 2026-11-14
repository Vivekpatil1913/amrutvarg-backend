// Rate limits, exercised over real HTTP through the real middleware order. The
// database is stubbed, so no Postgres is needed.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Read once when env.js loads, so they have to be set before the app is imported.
process.env.API_RATE_LIMIT = "3";
process.env.LOGIN_MAX_ATTEMPTS = "3";
process.env.LOGIN_MAX_ATTEMPTS_PER_IP = "8";
process.env.LOGIN_LOCK_MINUTES = "15";
process.env.TRUST_PROXY = "1";
const { createApp } = await import("./app.js");
const { pool } = await import("./db/pool.js");
const { env } = await import("./config/env.js");

// A new app is a new global limiter, so each test starts with a full allowance.
// The sign-in limiters live in their module and are shared by the whole file,
// so each sign-in test comes from its own client IP (X-Forwarded-For, one
// trusted proxy) and cannot spend another test's allowance.
async function serve(t) {
  const server = createApp().listen(0);
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}/api/v1`;
}

// Goes through the global limiter and ends at the 404 handler, without the database.
const browse = (api, headers) => fetch(`${api}/no-such-route`, { headers });

const signIn = (api, body, ip) =>
  fetch(`${api}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(ip && { "X-Forwarded-For": ip }) },
    body: JSON.stringify(body),
  });

async function useUpLimit(api, headers) {
  for (let i = 0; i < 3; i += 1) assert.equal((await browse(api, headers)).status, 404);
}

// Every email is an active account whose password is PASSWORD.
const PASSWORD = "correct-password";
const password_hash = await bcrypt.hash(PASSWORD, 4);
function stubAccounts(t) {
  t.mock.method(pool, "query", async (sql, params) => ({
    rows: [/admin_sessions/.test(sql) ? { id: 1 } : { id: 1, email: params[0], is_active: true, password_hash }],
  }));
}

const right = (email) => ({ email, password: PASSWORD });
const wrong = (email) => ({ email, password: "wrong-password" });

test("anonymous traffic is refused past the limit", async (t) => {
  const api = await serve(t);
  await useUpLimit(api);

  const res = await browse(api);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error.code, "RATE_LIMITED");
});

test("a forged token does not escape the limit", async (t) => {
  const api = await serve(t);
  const headers = { Authorization: "Bearer not-a-real-token" };
  await useUpLimit(api, headers);

  assert.equal((await browse(api, headers)).status, 429);
});

test("signed-in staff are not counted against the limit", async (t) => {
  const api = await serve(t);
  t.mock.method(pool, "query", async () => ({
    rows: [{ id: 1, user_id: 1, role: "SUPER_ADMIN", is_active: true, expires_at: new Date(Date.now() + 60_000) }],
  }));
  const headers = { Authorization: `Bearer ${jwt.sign({ sid: 1 }, env.jwt.secret)}` };

  for (let i = 0; i < 6; i += 1) assert.equal((await browse(api, headers)).status, 404);
});

test("a used-up limit does not stop anyone signing in", async (t) => {
  const api = await serve(t);
  await useUpLimit(api);
  assert.equal((await browse(api)).status, 429);

  // 401, not 429: the request reached the login route.
  assert.equal((await signIn(api, {})).status, 401);
});

test("successful sign-ins are never limited, however many", async (t) => {
  const api = await serve(t);
  stubAccounts(t);
  const ip = "203.0.113.1";

  // Well past both the per-account (3) and per-IP (8) allowances.
  for (let i = 0; i < 20; i += 1) {
    assert.equal((await signIn(api, right("a@b.in"), ip)).status, 200);
  }
});

test("many accounts can sign in repeatedly from one network", async (t) => {
  const api = await serve(t);
  stubAccounts(t);
  const ip = "203.0.113.2";

  for (let round = 0; round < 4; round += 1) {
    for (const email of ["state@b.in", "vibhag@b.in", "district@b.in", "editor@b.in", "viewer@b.in"]) {
      assert.equal((await signIn(api, right(email), ip)).status, 200);
    }
  }
});

test("wrong passwords pause only that account, and say for how long", async (t) => {
  const api = await serve(t);
  stubAccounts(t);
  const ip = "203.0.113.3";

  for (let i = 0; i < 3; i += 1) assert.equal((await signIn(api, wrong("typo@b.in"), ip)).status, 401);

  const res = await signIn(api, wrong("typo@b.in"), ip);
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get("retry-after")) > 0);
  assert.match((await res.json()).error.message, /sign-in attempts for this account.*try again in \d+ minutes?\./i);

  // Paused even with the right password, or the pause would not stop guessing.
  assert.equal((await signIn(api, right("typo@b.in"), ip)).status, 429);
  // Everyone else on the same network is unaffected, and so is the account
  // when its owner signs in from somewhere else.
  assert.equal((await signIn(api, right("colleague@b.in"), ip)).status, 200);
  assert.equal((await signIn(api, right("typo@b.in"), "203.0.113.30")).status, 200);
});

test("the account check ignores case and spaces in the email", async (t) => {
  const api = await serve(t);
  stubAccounts(t);
  const ip = "203.0.113.4";

  for (const email of ["Case@B.in", " case@b.in", "CASE@b.IN "]) {
    assert.equal((await signIn(api, wrong(email), ip)).status, 401);
  }
  assert.equal((await signIn(api, wrong("case@b.in"), ip)).status, 429);
});

test("a successful sign-in clears that account's failures", async (t) => {
  const api = await serve(t);
  stubAccounts(t);
  const ip = "203.0.113.5";

  // Without the reset the fourth wrong password would be the account's fourth
  // failure and be refused.
  for (let round = 0; round < 3; round += 1) {
    for (let i = 0; i < 2; i += 1) assert.equal((await signIn(api, wrong("me@b.in"), ip)).status, 401);
    assert.equal((await signIn(api, right("me@b.in"), ip)).status, 200);
  }
});

test("server errors do not count as failed attempts", async (t) => {
  const api = await serve(t);
  t.mock.method(pool, "query", async () => {
    throw new Error("database unavailable");
  });
  t.mock.method(console, "error", () => {});
  const ip = "203.0.113.6";

  for (let i = 0; i < 6; i += 1) assert.equal((await signIn(api, right("a@b.in"), ip)).status, 500);
});

test("wrong passwords across many accounts are capped per network", async (t) => {
  const api = await serve(t);
  stubAccounts(t);
  const ip = "203.0.113.7";

  // One wrong password each for eight accounts uses up the per-IP allowance.
  for (let i = 0; i < 8; i += 1) assert.equal((await signIn(api, wrong(`user${i}@b.in`), ip)).status, 401);

  const res = await signIn(api, wrong("user8@b.in"), ip);
  assert.equal(res.status, 429);
  assert.match((await res.json()).error.message, /sign-in attempts from this network/);

  // A different network is unaffected.
  assert.equal((await signIn(api, right("user8@b.in"), "203.0.113.70")).status, 200);
});
