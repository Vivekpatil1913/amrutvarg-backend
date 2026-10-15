import jwt from "jsonwebtoken";
import { query, queryOne } from "../db/pool.js";
import { env } from "../config/env.js";
import { unauthorized, asyncHandler } from "../lib/errors.js";

export async function attachUser(req, res, next) {
  try {
    const token =
      req.cookies?.av_admin_session ||
      req.headers.authorization?.replace(/^Bearer\s+/, "");

    if (!token) return next();

    const payload = jwt.verify(token, env.jwt.secret);
    const session = await queryOne(
      `SELECT s.id, s.expires_at, u.id AS user_id, u.email, u.name, u.role, u.avatar_url, u.is_active
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
  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    throw unauthorized("Admin access required");
  }
  next();
});
