import { query } from "../../db/pool.js";
import { ROLES, STATE_ROLES } from "../../lib/scope.js";

// Who is responsible for a place, tier by tier. Inactive accounts are left
// out: an alert sent to someone who can no longer sign in reaches nobody.
export async function responsibleFor({ districtId, divisionId }) {
  const [district, division, state] = await Promise.all([
    districtId
      ? query(
          `SELECT id, name, email, phone FROM admin_users
           WHERE is_active = TRUE AND role = $1 AND district_id = $2`,
          [ROLES.DISTRICT, districtId]
        )
      : [],
    divisionId
      ? query(
          `SELECT id, name, email, phone FROM admin_users
           WHERE is_active = TRUE AND role = $1 AND vibhag_id = $2`,
          [ROLES.DIVISION, divisionId]
        )
      : [],
    query(
      `SELECT id, name, email, phone FROM admin_users
       WHERE is_active = TRUE AND role = ANY($1)`,
      [STATE_ROLES]
    ),
  ]);
  return { district, division, state };
}

// One bell entry per recipient. Never throws, for the same reason the audit
// trail does not: the thing being announced has already happened.
export async function notify(users, { title, body = "", link = "", category = "general", priority = "NORMAL", grievanceId = null }) {
  const ids = [...new Set(users.map((u) => (typeof u === "object" ? u.id : u)).filter(Boolean))];
  if (!ids.length) return;
  try {
    await query(
      `INSERT INTO notifications (user_id, title, body, link, category, priority, grievance_id)
       SELECT uid, $2, $3, $4, $5, $6, $7 FROM UNNEST($1::int[]) AS uid`,
      [ids, title, body, link, category, priority, grievanceId]
    );
  } catch (err) {
    console.error("Notification write failed:", err.message);
  }
}
