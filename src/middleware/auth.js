import jwt from "jsonwebtoken";
import { query, queryOne } from "../db/pool.js";
import { env } from "../config/env.js";
import { unauthorized, forbidden, asyncHandler } from "../lib/errors.js";
import { isStateRole, isStaffRole } from "../lib/scope.js";

export async function attachUser(req, res, next) {
  try {
    const token =
      req.cookies?.av_admin_session ||
      req.headers.authorization?.replace(/^Bearer\s+/, "");

    if (!token) return next();

    const payload = jwt.verify(token, env.jwt.secret);
    const session = await queryOne(
      `SELECT s.id, s.expires_at, u.id AS user_id, u.email, u.name, u.role, u.avatar_url, u.is_active,
              u.vibhag_id, u.district_id, u.phone
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.revoked_at IS NULL`,
      [payload.sid]
    );

    if (!session || new Date(session.expires_at) < new Date()) return next();
    if (!session.is_active) return next();

    // Slide expiry
    const newExpiry = new Date(Date.now() + env.jwt.sessionHours * 60 * 60 * 1000);
    await query(`UPDATE admin_sessions SET expires_at = $1 WHERE id = $2`, [
      newExpiry,
      session.id,
    ]);

    req.user = {
      id: session.user_id,
      email: session.email,
      name: session.name,
      role: session.role,
      avatarUrl: session.avatar_url,
      vibhagId: session.vibhag_id,
      districtId: session.district_id,
      phone: session.phone,
    };
  } catch {
    // Invalid token — just skip
  }
  next();
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  if (!req.user) throw unauthorized();
  next();
});

export const requireAdmin = asyncHandler(async (req, _res, next) => {
  if (!req.user) throw unauthorized();
  // Signed in but not state level: a permission problem, not an expired
  // session, so 403 — a 401 sends the admin panel back to the login screen.
  if (!isStateRole(req.user.role)) {
    throw forbidden("State-level access required");
  }
  next();
});

// Any of the three administrative tiers. Routes behind this one must narrow
// what they read and write to the caller's jurisdiction (src/lib/scope.js);
// passing this check says only that the caller is staff, not where.
export const requireStaff = asyncHandler(async (req, _res, next) => {
  if (!req.user) throw unauthorized();
  if (!isStaffRole(req.user.role)) throw forbidden("Staff access required");
  next();
});
