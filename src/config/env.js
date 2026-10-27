import "./loadEnv.js";

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
    // Video and audio are sized separately from images: a ten-megabyte ceiling
    // is generous for a photograph and useless for an episode. Both are server
    // limits, so raising them does not need a front-end change.
    maxVideoMb: parseInt(optional("MAX_VIDEO_SIZE_MB", "100"), 10),
    maxAudioMb: parseInt(optional("MAX_AUDIO_SIZE_MB", "25"), 10),
  },

  // Where links in notifications, SMS and e-mails point. The admin panel and
  // the public site are the same origin in the default setup.
  links: {
    admin: optional("ADMIN_ORIGIN", "http://localhost:5173"),
    site: optional("SITE_ORIGIN", "http://localhost:5173"),
  },

  // Grievance SLA. Hours are measured from submission.
  sla: {
    sweepMinutes: parseInt(optional("SLA_SWEEP_MINUTES", "15"), 10),
    reminderHours: parseInt(optional("SLA_REMINDER_HOURS", "24"), 10),
    criticalHours: parseInt(optional("SLA_CRITICAL_HOURS", "72"), 10),
    // Public suggestion / complaint submissions per IP per 15 minutes. Raise it
    // where many citizens share one address (a CSC centre, a school network).
    submitLimit: parseInt(optional("GRIEVANCE_RATE_LIMIT", "10"), 10),
  },

  // Outbound SMS and e-mail. Each is a plain JSON webhook so any gateway can
  // sit behind it; left empty, messages are recorded in message_outbox as
  // LOGGED instead of being sent.
  messaging: {
    smsWebhookUrl: optional("SMS_WEBHOOK_URL", ""),
    emailWebhookUrl: optional("EMAIL_WEBHOOK_URL", ""),
    webhookToken: optional("MESSAGING_WEBHOOK_TOKEN", ""),
  },

  seed: {
    adminEmail: optional("SEED_ADMIN_EMAIL", "admin@amrutvarg.local"),
    adminPassword: optional("SEED_ADMIN_PASSWORD", "Admin@1234"),
    adminName: optional("SEED_ADMIN_NAME", "Admin"),
  },
};

// Refuse to start in production with missing or default secrets.
if (env.nodeEnv === "production") {
  const problems = [];
  if (!process.env.JWT_SECRET || env.jwt.secret.length < 32 || /change_in_production|dev_secret/.test(env.jwt.secret))
    problems.push("JWT_SECRET must be set to a random value of at least 32 characters");
  if (!process.env.PGPASSWORD || env.db.password === "postgres123")
    problems.push("PGPASSWORD must be set to the production database password");
  if (problems.length) throw new Error(`Invalid production config:\n  - ${problems.join("\n  - ")}`);
}
