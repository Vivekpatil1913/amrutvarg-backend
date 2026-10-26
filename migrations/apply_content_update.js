import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import "../src/config/loadEnv.js";

const __dir = dirname(fileURLToPath(import.meta.url));

const dbName = process.env.PGDATABASE || "amrutvarg_cms";
const pgConfig = {
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432"),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres123",
  database: dbName,
};

async function main() {
  const pool = new pg.Pool(pgConfig);
  try {
    const sqlPath = resolve(__dir, "update_client_content_20261026.sql");
    const sql = readFileSync(sqlPath, "utf-8");
    console.log(`Applying client content updates to database "${dbName}"...`);
    await pool.query(sql);
    console.log("✓ Content updates successfully applied to live database!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});

