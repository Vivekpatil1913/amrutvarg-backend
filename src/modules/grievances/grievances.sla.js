// SLA clock for grievance tickets. Pure functions only, so the thresholds can
// be tested without a database; the sweep that acts on them lives in
// sla.worker.js.
//
//   OK     inside the window
//   AMBER  approaching the deadline: unacknowledged past the reminder mark,
//          or within the last day before the critical mark
//   RED    overdue: past the critical mark and still open
//   MET    resolved or closed

const DONE = ["RESOLVED", "CLOSED"];
const HOUR = 60 * 60 * 1000;

export function slaState(ticket, { reminderHours = 24, criticalHours = 72 } = {}, now = Date.now()) {
  if (DONE.includes(ticket.status)) return "MET";
  const ageHours = (now - new Date(ticket.created_at).getTime()) / HOUR;
  if (ageHours >= criticalHours) return "RED";
  if (ageHours >= Math.max(criticalHours - 24, reminderHours)) return "AMBER";
  if (ticket.status === "NEW" && ageHours >= reminderHours) return "AMBER";
  return "OK";
}

// The same rule as SQL, so lists can be filtered and counted on it. The hours
// are integers from configuration, never request input, so inlining them is
// safe. `alias` is the grievances table alias in the surrounding query.
export function slaSql({ reminderHours = 24, criticalHours = 72 } = {}, alias = "g") {
  const r = Number.parseInt(reminderHours, 10);
  const c = Number.parseInt(criticalHours, 10);
  const amber = Math.max(c - 24, r);
  const age = `(NOW() - ${alias}.created_at)`;
  return `CASE
    WHEN ${alias}.status IN ('RESOLVED', 'CLOSED') THEN 'MET'
    WHEN ${age} >= INTERVAL '${c} hours' THEN 'RED'
    WHEN ${age} >= INTERVAL '${amber} hours' THEN 'AMBER'
    WHEN ${alias}.status = 'NEW' AND ${age} >= INTERVAL '${r} hours' THEN 'AMBER'
    ELSE 'OK' END`;
}
