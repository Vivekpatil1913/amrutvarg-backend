import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, success, paginated, notFound, validation, conflict, AppError, forbidden } from "../../lib/errors.js";
import { ROLES, STAFF_ROLES } from "../../lib/scope.js";
import { audit } from "../../lib/audit.js";

// Administrator accounts and their jurisdictions. State level only: the
// accounts are what every other boundary in the system rests on, so the
// tiers below cannot create or widen them.

const router = Router();
router.use(requireAdmin);

const issuesOf = (error) => error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));

const optionalId = z
  .union([z.coerce.number().int().positive(), z.literal(null), z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v === "" || v === undefined ? null : v));

const base = {
  name: z.string().trim().min(2, "Name must contain at least 2 characters").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255).transform((v) => v.toLowerCase()),
  role: z.enum(STAFF_ROLES),
  vibhag_id: optionalId,
  district_id: optionalId,
  phone: z.string().trim().optional().default("")
    .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number"),
  is_active: z.boolean().optional().default(true),
};

const createSchema = z.object({
  ...base,
  password: z.string().min(8, "Password must contain at least 8 characters").max(128),
});
const updateSchema = z.object({
  ...base,
  password: z.union([z.string().min(8, "Password must contain at least 8 characters").max(128), z.literal("")]).optional().default(""),
});

// Only a Super Admin can create a Super Admin or change one. Without this, any
// state-level account could mint a superadmin and sign in as it.
function assertCanAssign(user, ...roles) {
  if (roles.includes(ROLES.SUPERADMIN) && user.role !== ROLES.SUPERADMIN) {
    throw forbidden("Only a Super Admin can create or change a Super Admin account");
  }
}

// A manager's jurisdiction must match their tier: a division manager names a
// vibhag, a district manager a district (and inherits its vibhag). State roles
// carry neither.
async function resolveJurisdiction(d) {
  if (d.role === ROLES.DIVISION) {
    if (!d.vibhag_id) throw validation([{ field: "vibhag_id", message: "Choose the division this manager is responsible for" }]);
    const v = await queryOne(`SELECT id FROM vibhags WHERE id = $1 AND deleted_at IS NULL`, [d.vibhag_id]);
    if (!v) throw validation([{ field: "vibhag_id", message: "Choose a valid division" }]);
    return { vibhag_id: v.id, district_id: null };
  }
  if (d.role === ROLES.DISTRICT) {
    if (!d.district_id) throw validation([{ field: "district_id", message: "Choose the district this manager is responsible for" }]);
    const dist = await queryOne(`SELECT id, vibhag_id FROM districts WHERE id = $1 AND deleted_at IS NULL`, [d.district_id]);
    if (!dist) throw validation([{ field: "district_id", message: "Choose a valid district" }]);
    return { vibhag_id: dist.vibhag_id, district_id: dist.id };
  }
  return { vibhag_id: null, district_id: null };
}

const SELECT = `SELECT u.id, u.email, u.name, u.role, u.phone, u.is_active, u.vibhag_id, u.district_id,
                       u.created_at, u.updated_at,
                       v.name_mr AS vibhag_mr, v.name_en AS vibhag_en,
                       d.name_mr AS district_mr, d.name_en AS district_en
                FROM admin_users u
                LEFT JOIN vibhags v ON v.id = u.vibhag_id
                LEFT JOIN districts d ON d.id = u.district_id`;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  role: z.union([z.enum(STAFF_ROLES), z.literal("")]).optional().default(""),
  search: z.string().trim().max(100).optional().default(""),
});

router.get("/", asyncHandler(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const { page, limit, role, search } = parsed.data;
  const params = [];
  const conditions = ["TRUE"];
  if (role) { params.push(role); conditions.push(`u.role = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [{ count }] = await query(`SELECT COUNT(*)::int AS count FROM admin_users u ${where}`, params);
  params.push(limit, (page - 1) * limit);
  const rows = await query(
    `${SELECT} ${where}
     ORDER BY CASE u.role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 WHEN 'state_coordinator' THEN 2
                          WHEN 'division_manager' THEN 3 ELSE 4 END, v.name_mr NULLS FIRST, d.name_mr NULLS FIRST, u.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return paginated(res, rows, count, page, limit);
}));

router.post("/", asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const d = parsed.data;
  assertCanAssign(req.user, d.role);
  const scope = await resolveJurisdiction(d);
  const hash = await bcrypt.hash(d.password, 12);
  let row;
  try {
    row = await queryOne(
      `INSERT INTO admin_users (email, name, password_hash, role, vibhag_id, district_id, phone, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [d.email, d.name, hash, d.role, scope.vibhag_id, scope.district_id, d.phone, d.is_active]
    );
  } catch (err) {
    if (err.code === "23505") throw conflict("That email address is already in use", "email");
    throw err;
  }
  await audit(req, "user.create", "admin_user", row.id, { email: d.email, role: d.role, ...scope });
  return success(res, await queryOne(`${SELECT} WHERE u.id = $1`, [row.id]), 201);
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  const existing = await queryOne(`SELECT id, role, is_active, vibhag_id, district_id FROM admin_users WHERE id = $1`, [id]);
  if (!existing) throw notFound("User");
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const d = parsed.data;
  assertCanAssign(req.user, d.role, existing.role);

  // Nobody can lock themselves out by accident.
  if (id === req.user.id && (!d.is_active || d.role !== existing.role)) {
    throw new AppError("VALIDATION_ERROR", "You cannot change your own role or deactivate your own account", 422);
  }
  const scope = await resolveJurisdiction(d);
  const hash = d.password ? await bcrypt.hash(d.password, 12) : null;
  try {
    await query(
      `UPDATE admin_users SET email = $1, name = $2, role = $3, vibhag_id = $4, district_id = $5,
              phone = $6, is_active = $7, password_hash = COALESCE($8, password_hash), updated_at = NOW()
       WHERE id = $9`,
      [d.email, d.name, d.role, scope.vibhag_id, scope.district_id, d.phone, d.is_active, hash, id]
    );
  } catch (err) {
    if (err.code === "23505") throw conflict("That email address is already in use", "email");
    throw err;
  }
  // A deactivated account, or one whose jurisdiction moved, signs in again.
  if (!d.is_active || d.role !== existing.role || scope.vibhag_id !== existing.vibhag_id || scope.district_id !== existing.district_id || hash) {
    await query(`UPDATE admin_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL AND user_id <> $2`, [id, req.user.id]);
  }
  await audit(req, "user.update", "admin_user", id, {
    from: { role: existing.role, vibhag_id: existing.vibhag_id, district_id: existing.district_id, is_active: existing.is_active },
    to: { role: d.role, ...scope, is_active: d.is_active },
    passwordReset: Boolean(hash),
  });
  return success(res, await queryOne(`${SELECT} WHERE u.id = $1`, [id]));
}));

export default router;

// ── Audit trail (read-only) ─────────────────────────────────────────────────

export const auditRouter = Router();
auditRouter.use(requireAdmin);

const auditListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  entity: z.string().trim().max(50).optional().default(""),
  search: z.string().trim().max(100).optional().default(""),
});

auditRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = auditListSchema.safeParse(req.query);
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const { page, limit, entity, search } = parsed.data;
  const params = [];
  const conditions = ["TRUE"];
  if (entity) { params.push(entity); conditions.push(`a.entity = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(a.action ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR a.details::text ILIKE $${params.length})`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [{ count }] = await query(`SELECT COUNT(*)::int AS count FROM audit_logs a LEFT JOIN admin_users u ON u.id = a.user_id ${where}`, params);
  params.push(limit, (page - 1) * limit);
  const rows = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.ip, a.created_at,
            u.name AS user_name, u.email AS user_email, u.role AS user_role
     FROM audit_logs a LEFT JOIN admin_users u ON u.id = a.user_id
     ${where} ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return paginated(res, rows, count, page, limit);
}));
