import { pool } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { remindUnacknowledged, escalateCritical } from "./grievances.alerts.js";

// The background sweep: grievance SLA escalation and melawa auto-expiry.
//
// Runs every SLA_SWEEP_MINUTES inside the API process. A Postgres advisory
// lock makes it safe to run more than one API instance — only one of them
// sweeps at a time, and the others skip the round. Each step claims its rows
// with an UPDATE ... RETURNING, so a ticket is escalated once even if a sweep
// is interrupted half-way and rerun.

const LOCK_KEY = 72_026_001;

export async function runSweep({ reminderHours = env.sla.reminderHours, criticalHours = env.sla.criticalHours } = {}) {
  const client = await pool.connect();
  const result = { reminded: 0, escalated: 0, melawaArchived: 0, skipped: false };
  try {
    const { rows: [lock] } = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [LOCK_KEY]);
    if (!lock.ok) return { ...result, skipped: true };
    try {
      // Level 1 — still NEW past the reminder mark: remind the district,
      // copy the division. Repeats once per reminder interval (so at 24h and
      // again at 48h by default) until acknowledged or escalated.
      const { rows: remind } = await client.query(
        `UPDATE grievances SET
           last_reminder_at = NOW(),
           escalation_level = GREATEST(escalation_level, 1),
           l1_escalated_at = COALESCE(l1_escalated_at, NOW()),
           updated_at = NOW()
         WHERE deleted_at IS NULL
           AND status = 'NEW'
           AND created_at <= NOW() - make_interval(hours => $1)
           AND created_at >  NOW() - make_interval(hours => $2)
           AND (last_reminder_at IS NULL OR last_reminder_at <= NOW() - make_interval(hours => $1))
         RETURNING *`,
        [reminderHours, criticalHours]
      );
      for (const g of remind) await remindUnacknowledged(g).catch((e) => console.error("SLA reminder failed:", e.message));
      result.reminded = remind.length;

      // Level 2 — open past the critical mark: escalate to the state.
      const { rows: critical } = await client.query(
        `UPDATE grievances SET
           escalation_level = 2,
           l2_escalated_at = NOW(),
           priority = 'HIGH',
           updated_at = NOW()
         WHERE deleted_at IS NULL
           AND status NOT IN ('RESOLVED', 'CLOSED')
           AND escalation_level < 2
           AND created_at <= NOW() - make_interval(hours => $1)
         RETURNING *`,
        [criticalHours]
      );
      for (const g of critical) await escalateCritical(g).catch((e) => console.error("SLA escalation failed:", e.message));
      result.escalated = critical.length;

      // Melawa auto-expiry — the last day's end time, read as IST, has passed.
      const { rowCount } = await client.query(
        `UPDATE melawa_events SET is_active = FALSE, archived_at = NOW(), updated_at = NOW()
         WHERE is_active = TRUE AND deleted_at IS NULL
           AND ((COALESCE(end_date, event_date) + end_time) AT TIME ZONE 'Asia/Kolkata') <= NOW()`
      );
      result.melawaArchived = rowCount;
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
  return result;
}

export function startSweepWorker() {
  const minutes = Math.max(1, env.sla.sweepMinutes || 15);
  const tick = () =>
    runSweep()
      .then((r) => {
        if (r.reminded || r.escalated || r.melawaArchived) {
          console.log(`✓ Sweep: ${r.reminded} reminded, ${r.escalated} escalated, ${r.melawaArchived} melawa archived`);
        }
      })
      .catch((err) => console.error("Sweep failed:", err.message));
  // First run shortly after start-up, so a restart does not delay overdue
  // escalations by a whole interval.
  const first = setTimeout(tick, 10_000);
  const timer = setInterval(tick, minutes * 60 * 1000);
  first.unref?.();
  timer.unref?.();
  console.log(`✓ SLA & expiry sweep every ${minutes} min`);
  return () => { clearTimeout(first); clearInterval(timer); };
}
