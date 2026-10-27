import { query } from "../db/pool.js";

// Appends one entry to the master audit trail.
//
// Never throws: a failed audit write must not undo the change it describes,
// which has already been committed by the time this runs.
export async function audit(req, action, entity, entityId = null, details = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req?.user?.id ?? null, action, entity, entityId == null ? null : String(entityId), JSON.stringify(details), req?.ip ?? null]
    );
  } catch (err) {
    console.error("Audit write failed:", err.message);
  }
}
