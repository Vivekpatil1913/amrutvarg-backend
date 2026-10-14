import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually (supports ESM)
try {
  const envFile = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env not found; rely on actual env vars
}

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name, fallback = "") {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: parseInt(optional("PORT", "4000"), 10),
  isDev: optional("NODE_ENV", "development") === "development",

  db: {
    host: optional("PGHOST", "localhost"),
    port: parseInt(optional("PGPORT", "5432"), 10),
    user: optional("PGUSER", "postgres"),
    password: optional("PGPASSWORD", "postgres123"),
    database: optional("PGDATABASE", "amrutvarg_cms"),
  },

  jwt: {
    secret: optional("JWT_SECRET", "dev_secret_replace_in_prod"),
    sessionHours: parseInt(optional("SESSION_HOURS", "8"), 10),
  },

  auth: {
    maxAttempts: parseInt(optional("LOGIN_MAX_ATTEMPTS", "5"), 10),
    lockMinutes: parseInt(optional("LOGIN_LOCK_MINUTES", "15"), 10),
  },

  cors: {
    origins: [
      optional("ADMIN_ORIGIN", "http://localhost:5173"),
      optional("SITE_ORIGIN", "http://localhost:5173"),
    ].filter(Boolean),
  },

  upload: {
    dir: optional("UPLOAD_DIR", "uploads"),
    maxMb: parseInt(optional("MAX_FILE_SIZE_MB", "10"), 10),
  },

  seed: {
    adminEmail: optional("SEED_ADMIN_EMAIL", "admin@amrutvarg.local"),
    adminPassword: optional("SEED_ADMIN_PASSWORD", "Admin@1234"),
    adminName: optional("SEED_ADMIN_NAME", "Admin"),
  },
};
