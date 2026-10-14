import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

// Keep DATE (oid 1082) as the plain 'YYYY-MM-DD' string Postgres sends. Parsed
// into a Date it lands on local midnight, which JSON serialises back as UTC and
// shifts the day backwards everywhere ahead of UTC — in IST a date saved as
// 2026-10-20 reads back as 2026-10-19, and drifts another day on every edit.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

export async function checkConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log(`✓ PostgreSQL connected to ${env.db.database}`);
  } finally {
    client.release();
  }
}

export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function queryOne(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] ?? null;
}

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn({
      query: (sql, p) => client.query(sql, p).then((r) => r.rows),
      queryOne: (sql, p) => client.query(sql, p).then((r) => r.rows[0] ?? null),
    });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
