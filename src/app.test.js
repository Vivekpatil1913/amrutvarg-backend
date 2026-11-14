// Rate limits, exercised over real HTTP through the real middleware order. The
// database is stubbed, so no Postgres is needed.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Read once when env.js loads, so it has to be set before the app is imported.
process.env.API_RATE_LIMIT = "3";
const { createApp } = await import("./app.js");
const { pool } = await import("./db/pool.js");
const { env } = await import("./config/env.js");

// A new app is a new global limiter, so each test starts with a full allowance.
// The login limiter lives in its module and is shared by the whole file.
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

const signIn = (api, body) =>
  fetch(`${api}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function useUpLimit(api, headers) {
  for (let i = 0; i < 3; i += 1) assert.equal((await browse(api, headers)).status, 404);
}

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

test("successful sign-ins do not use up the attempts", async (t) => {
  const api = await serve(t);
  const password = "correct-password";
  const password_hash = await bcrypt.hash(password, 4);
  t.mock.method(pool, "query", async (sql) => ({
    rows: [/admin_sessions/.test(sql) ? { id: 1 } : { id: 1, email: "a@b.in", is_active: true, password_hash }],
  }));

  for (let i = 0; i < 12; i += 1) {
    assert.equal((await signIn(api, { email: "a@b.in", password })).status, 200);
  }
});

// Runs last: it spends the file's shared login allowance.
test("failed sign-ins are still stopped at ten", async (t) => {
  const api = await serve(t);
  let res;
  let attempts = 0;
  do {
    res = await signIn(api, {});
    attempts += 1;
  } while (res.status === 401 && attempts <= 10);

  assert.equal(res.status, 429);
  assert.match((await res.json()).error.message, /sign-in attempts/);
});
