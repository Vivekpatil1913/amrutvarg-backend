import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireStaff } from "../../middleware/auth.js";
import { asyncHandler, success, paginated, notFound, validation, forbidden } from "../../lib/errors.js";
import { scopeOf, scopeSql } from "../../lib/scope.js";
import { audit } from "../../lib/audit.js";
import { melawaSchema } from "./melawa.schema.js";

const issuesOf = (error) => error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));

// A melawa is live from publication until its last day's end time, read as
// IST. The sweep archives it shortly after; this condition is what makes the
// ticker stop showing it on the minute rather than at the next sweep.
const LIVE = `m.is_active = TRUE AND m.deleted_at IS NULL
  AND ((COALESCE(m.end_date, m.event_date) + m.end_time) AT TIME ZONE 'Asia/Kolkata') > NOW()`;

const SELECT = `SELECT m.*, v.name_mr AS division_mr, v.name_en AS division_en,
                       d.name_mr AS district_mr, d.name_en AS district_en
                FROM melawa_events m
                LEFT JOIN vibhags v ON v.id = m.target_division_id
                LEFT JOIN districts d ON d.id = m.target_district_id`;

// ── Public ──────────────────────────────────────────────────────────────────
//
// GET /api/v1/melawa/active — every live melawa, state-wide first, then by
// date. The ticker is on every page, so the answer is cached in-process for a
// short while and marked cacheable for browsers and proxies; any admin write
// clears the in-process copy.

export const publicRouter = Router();

const CACHE_MS = 30_000;
const cache = new Map();
export const clearMelawaCache = () => cache.clear();

const activeQuery = z.object({
  division_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional().default(""),
  district_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional().default(""),
});

publicRouter.get("/active", async (req, res, next) => {
  try {
    const parsed = activeQuery.safeParse(req.query);
    if (!parsed.success) throw validation(issuesOf(parsed.error));
    const { division_id: divisionId, district_id: districtId } = parsed.data;
    const key = `${divisionId}|${districtId}`;
    const hit = cache.get(key);
    let rows;
    if (hit && hit.expires > Date.now()) {
      rows = hit.rows;
    } else {
      // With a place given, only what applies there: state-wide, that
      // division's, and that district's. Without one, everything live.
      const params = [];
      let where = LIVE;
      if (divisionId || districtId) {
        const parts = ["m.jurisdiction_scope = 'STATE'"];
        // A district melawa also carries its division's id, so the division
        // match is limited to division-level rows — otherwise every district
        // in the division would see its neighbours' melawas.
        if (divisionId) { params.push(divisionId); parts.push(`(m.jurisdiction_scope = 'DIVISION' AND m.target_division_id = $${params.length})`); }
        if (districtId) { params.push(districtId); parts.push(`(m.jurisdiction_scope = 'DISTRICT' AND m.target_district_id = $${params.length})`); }
        where += ` AND (${parts.join(" OR ")})`;
      }
      rows = await query(
        `${SELECT.replace("SELECT m.*", `SELECT m.id, m.title_mr, m.title_en, m.event_date, m.end_date,
                m.start_time, m.end_time, m.venue_mr, m.venue_en, m.maps_url,
                m.jurisdiction_scope, m.target_division_id, m.target_district_id,
                m.highlights_mr, m.highlights_en`)}
         WHERE ${where}
         ORDER BY CASE m.jurisdiction_scope WHEN 'STATE' THEN 0 WHEN 'DIVISION' THEN 1 ELSE 2 END,
                  m.event_date, m.start_time`,
        params
      );
      cache.set(key, { rows, expires: Date.now() + CACHE_MS });
    }
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return success(res, rows);
  } catch (err) {
    next(err);
  }
});

// ── Admin ───────────────────────────────────────────────────────────────────

export const adminRouter = Router();
adminRouter.use(requireStaff);

// Settles where an announcement applies and checks the caller may announce
// there. The division of a district melawa is read from the master rather
// than trusted from the request.
async function resolveTarget(user, d) {
  const scope = scopeOf(user);
  if (d.jurisdiction_scope === "STATE") {
    if (scope.level !== "state") throw forbidden("Only the State Coordinator can publish a state-wide melawa");
    return { target_division_id: null, target_district_id: null };
  }
  if (d.jurisdiction_scope === "DIVISION") {
    const vibhag = await queryOne(`SELECT id FROM vibhags WHERE id = $1 AND deleted_at IS NULL`, [d.target_division_id]);
    if (!vibhag) throw validation([{ field: "target_division_id", message: "Choose a valid division" }]);
    if (scope.level === "district" || scope.level === "none") throw forbidden("A district manager can only announce a district melawa");
    if (scope.level === "division" && vibhag.id !== scope.vibhagId) throw forbidden("That division is outside your jurisdiction");
    return { target_division_id: vibhag.id, target_district_id: null };
  }
  const district = await queryOne(`SELECT id, vibhag_id FROM districts WHERE id = $1 AND deleted_at IS NULL`, [d.target_district_id]);
  if (!district) throw validation([{ field: "target_district_id", message: "Choose a valid district" }]);
  if (scope.level === "none") throw forbidden("Your account has no jurisdiction assigned");
  if (scope.level === "division" && district.vibhag_id !== scope.vibhagId) throw forbidden("That district is outside your division");
  if (scope.level === "district" && district.id !== scope.districtId) throw forbidden("That district is outside your jurisdiction");
  return { target_division_id: district.vibhag_id, target_district_id: district.id };
}

// The melawas a caller may manage: their own jurisdiction's. A division
// manager sees their division's and its districts'; a district manager only
// their district's. State-wide ones are the state's alone.
function manageScope(user, params) {
  const scope = scopeOf(user);
  if (scope.level === "state") return "TRUE";
  if (scope.level === "none") return "FALSE";
  return scopeSql(user, { district: "m.target_district_id", division: "m.target_division_id" }, params);
}

async function loadManageable(req, id) {
  const params = [id];
  const row = await queryOne(`${SELECT} WHERE m.id = $1 AND m.deleted_at IS NULL AND ${manageScope(req.user, params)}`, params);
  if (!row) throw notFound("Melawa");
  return row;
}

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional().default(""),
  state: z.enum(["", "live", "upcoming", "expired", "inactive"]).optional().default(""),
});

adminRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const { page, limit, search, state } = parsed.data;
  const params = [];
  const conditions = ["m.deleted_at IS NULL", manageScope(req.user, params)];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(m.title_mr ILIKE $${params.length} OR m.title_en ILIKE $${params.length} OR m.venue_mr ILIKE $${params.length})`);
  }
  if (state === "live") conditions.push(`(${LIVE})`);
  if (state === "upcoming") conditions.push(`(${LIVE}) AND m.event_date > (NOW() AT TIME ZONE 'Asia/Kolkata')::date`);
  if (state === "expired") conditions.push(`((COALESCE(m.end_date, m.event_date) + m.end_time) AT TIME ZONE 'Asia/Kolkata') <= NOW()`);
  if (state === "inactive") conditions.push(`m.is_active = FALSE`);
  const where = `WHERE ${conditions.join(" AND ")}`;

  const [{ count }] = await query(`SELECT COUNT(*)::int AS count FROM melawa_events m ${where}`, params);
  params.push(limit, (page - 1) * limit);
  const rows = await query(
    `${SELECT.replace("SELECT m.*", `SELECT m.*, (${LIVE}) AS is_live`)} ${where}
     ORDER BY m.event_date DESC, m.start_time
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return paginated(res, rows, count, page, limit);
}));

adminRouter.get("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  return success(res, await loadManageable(req, id));
}));

const COLUMNS = [
  "title_mr", "title_en", "event_date", "end_date", "start_time", "end_time",
  "venue_mr", "venue_en", "maps_url", "jurisdiction_scope", "target_division_id",
  "target_district_id", "highlights_mr", "highlights_en", "is_active",
];

adminRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = melawaSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const d = { ...parsed.data, ...(await resolveTarget(req.user, parsed.data)) };
  const values = COLUMNS.map((c) => d[c]);
  const [row] = await query(
    `INSERT INTO melawa_events (${COLUMNS.join(", ")}, created_by)
     VALUES (${COLUMNS.map((_, i) => `$${i + 1}`).join(", ")}, $${COLUMNS.length + 1}) RETURNING *`,
    [...values, req.user.id]
  );
  clearMelawaCache();
  await audit(req, "melawa.create", "melawa", row.id, { scope: row.jurisdiction_scope, title: row.title_mr });
  return success(res, row, 201);
}));

adminRouter.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  await loadManageable(req, id);
  const parsed = melawaSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const d = { ...parsed.data, ...(await resolveTarget(req.user, parsed.data)) };
  const [row] = await query(
    `UPDATE melawa_events SET ${COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(", ")},
       -- Re-activating an archived melawa (say, after moving its date) brings it back.
       archived_at = CASE WHEN $${COLUMNS.indexOf("is_active") + 1} THEN NULL ELSE archived_at END,
       updated_at = NOW()
     WHERE id = $${COLUMNS.length + 1} RETURNING *`,
    [...COLUMNS.map((c) => d[c]), id]
  );
  clearMelawaCache();
  await audit(req, "melawa.update", "melawa", id, { scope: row.jurisdiction_scope, is_active: row.is_active });
  return success(res, row);
}));

adminRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  await loadManageable(req, id);
  await query(`UPDATE melawa_events SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
  clearMelawaCache();
  await audit(req, "melawa.delete", "melawa", id);
  return success(res, { id, deleted: true });
}));
