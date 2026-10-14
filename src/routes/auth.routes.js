import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query, queryOne } from "../db/pool.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { asyncHandler, unauthorized, success, AppError } from "../lib/errors.js";
import { env } from "../config/env.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) throw unauthorized("Invalid credentials");

    const { email, password } = body.data;

    const user = await queryOne(
      `SELECT id, email, name, role, password_hash, is_active FROM admin_users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (!user || !user.is_active) throw unauthorized("Invalid email or password");

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) throw unauthorized("Invalid email or password");

    // Create session
    const expiresAt = new Date(Date.now() + env.jwt.sessionHours * 60 * 60 * 1000);
    const [session] = await query(
      `INSERT INTO admin_sessions (user_id, expires_at) VALUES ($1, $2) RETURNING id`,
      [user.id, expiresAt]
    );

    const token = jwt.sign({ sid: session.id }, env.jwt.secret, {
      expiresIn: `${env.jwt.sessionHours}h`,
    });

    res.cookie("av_admin_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: !env.isDev,
      maxAge: env.jwt.sessionHours * 60 * 60 * 1000,
    });

    return success(res, {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  })
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const token =
      req.cookies?.av_admin_session ||
      req.headers.authorization?.replace(/^Bearer\s+/, "");

    if (token) {
      try {
        const payload = jwt.verify(token, env.jwt.secret);
        await query(
          `UPDATE admin_sessions SET revoked_at = NOW() WHERE id = $1`,
          [payload.sid]
        );
      } catch {}
    }

    res.clearCookie("av_admin_session");
    return success(res, { message: "Logged out" });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    return success(res, {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
    });
  })
);

export default router;
