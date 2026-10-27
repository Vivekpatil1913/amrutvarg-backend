import { query, queryOne } from "../db/pool.js";
import { forbidden } from "./errors.js";

// Hierarchical access control.
//
//   state     superadmin, admin, state_coordinator   the whole state
//   division  division_manager                       one vibhag and its districts
//   district  district_manager                       one district
//
// `admin` and `superadmin` predate the tiers and keep exactly the access they
// had: they are state-level. A division or district manager whose assignment
// is missing gets the 'none' level and sees nothing, rather than falling back
// to everything — an unassigned account is a configuration mistake, and the
// safe reading of it is "no jurisdiction".

export const ROLES = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  STATE: "state_coordinator",
  DIVISION: "division_manager",
  DISTRICT: "district_manager",
};

export const STATE_ROLES = [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.STATE];
export const STAFF_ROLES = [...STATE_ROLES, ROLES.DIVISION, ROLES.DISTRICT];

export const isStateRole = (role) => STATE_ROLES.includes(role);
export const isStaffRole = (role) => STAFF_ROLES.includes(role);

export function scopeOf(user) {
  if (!user) return { level: "none", vibhagId: null, districtId: null };
  if (isStateRole(user.role)) return { level: "state", vibhagId: null, districtId: null };
  if (user.role === ROLES.DIVISION) {
    return user.vibhagId
      ? { level: "division", vibhagId: user.vibhagId, districtId: null }
      : { level: "none", vibhagId: null, districtId: null };
  }
  if (user.role === ROLES.DISTRICT) {
    return user.districtId
      ? { level: "district", vibhagId: user.vibhagId ?? null, districtId: user.districtId }
      : { level: "none", vibhagId: null, districtId: null };
  }
  return { level: "none", vibhagId: null, districtId: null };
}

/**
 * The WHERE fragment that confines a query to the caller's jurisdiction.
 *
 * `district` is the SQL expression holding the row's district id. `division`
 * is the expression holding its vibhag id, when the row carries one; without
 * it a division is matched through the districts master. Values are pushed
 * onto `params`, so the fragment can be joined with the caller's own
 * conditions. State callers get "TRUE".
 */
export function scopeSql(user, { district, division } = {}, params) {
  const scope = scopeOf(user);
  if (scope.level === "state") return "TRUE";
  if (scope.level === "none") return "FALSE";
  if (scope.level === "district") {
    params.push(scope.districtId);
    return `${district} = $${params.length}`;
  }
  params.push(scope.vibhagId);
  const n = params.length;
  return division
    ? `${division} = $${n}`
    : `${district} IN (SELECT id FROM districts WHERE vibhag_id = $${n})`;
}

// The vibhag a district belongs to, or null for an unknown district.
export async function vibhagOfDistrict(districtId) {
  if (!districtId) return null;
  const row = await queryOne(`SELECT vibhag_id FROM districts WHERE id = $1 AND deleted_at IS NULL`, [districtId]);
  return row?.vibhag_id ?? null;
}

/**
 * Whether a record located at { districtId, divisionId } is inside the
 * caller's jurisdiction. A record with only a division (a divisional melawa)
 * is inside a division manager's scope but outside every district manager's.
 */
export async function canAccess(user, { districtId = null, divisionId = null } = {}) {
  const scope = scopeOf(user);
  if (scope.level === "state") return true;
  if (scope.level === "none") return false;
  if (scope.level === "district") return Boolean(districtId) && Number(districtId) === Number(scope.districtId);
  const vibhag = divisionId ?? (await vibhagOfDistrict(districtId));
  return Boolean(vibhag) && Number(vibhag) === Number(scope.vibhagId);
}

export async function assertInScope(user, location, message = "That record is outside your jurisdiction") {
  if (!(await canAccess(user, location))) throw forbidden(message);
}

// The district ids a caller may see, or null for "all of them". Used where a
// query is easier to write against a list than a joined condition.
export async function scopeDistrictIds(user) {
  const scope = scopeOf(user);
  if (scope.level === "state") return null;
  if (scope.level === "none") return [];
  if (scope.level === "district") return [scope.districtId];
  const rows = await query(`SELECT id FROM districts WHERE vibhag_id = $1 AND deleted_at IS NULL`, [scope.vibhagId]);
  return rows.map((r) => r.id);
}
