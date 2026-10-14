import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dir = dirname(fileURLToPath(import.meta.url));

// Manually load .env
try {
  const env = readFileSync(resolve(__dir, "../.env"), "utf-8");
  for (const line of env.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {}

const dbName = process.env.PGDATABASE || "amrutvarg_cms";
const pgConfig = {
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432"),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres123",
};

async function main() {
  // 1. Create database if it doesn't exist
  const adminPool = new pg.Pool({ ...pgConfig, database: "postgres" });
  try {
    const exists = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    if (exists.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✓ Created database: ${dbName}`);
    } else {
      console.log(`✓ Database exists: ${dbName}`);
    }
  } finally {
    await adminPool.end();
  }

  // 2. Apply schema
  const appPool = new pg.Pool({ ...pgConfig, database: dbName });
  try {
    const schema = readFileSync(resolve(__dir, "../src/db/schema.sql"), "utf-8");
    await appPool.query(schema);
    console.log("✓ Schema applied successfully");
  } finally {
    await appPool.end();
  }

  console.log("✓ Migration complete");
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
