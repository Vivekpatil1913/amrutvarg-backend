import { createApp } from "./app.js";
import { checkConnection, pool } from "./db/pool.js";
import { ensureMasters } from "./modules/masters/masters.seed.js";
import { env } from "./config/env.js";
import { startSweepWorker } from "./modules/grievances/sla.worker.js";
import { mkdirSync } from "fs";
import path from "path";

// Ensure upload dirs exist
["photos", "media"].forEach((sub) => {
  mkdirSync(path.join(env.upload.dir, sub), { recursive: true });
});

async function main() {
  await checkConnection();
  await ensureMasters();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`✓ Amrutvarg CMS API running on http://localhost:${env.port}`);
    console.log(`  Admin panel: http://localhost:5173/admin`);
  });
  const stopSweep = startSweepWorker();

  async function shutdown() {
    console.log("\nShutting down gracefully...");
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err.message);
  process.exit(1);
});
