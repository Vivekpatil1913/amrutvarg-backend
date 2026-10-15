import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { unlink } from "fs/promises";
import { query, queryOne } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadPhoto, hasAllowedImageSignature } from "../middleware/upload.js";
import { asyncHandler, unauthorized, success, AppError, validation, conflict } from "../lib/errors.js";
import { env } from "../config/env.js";

const router = Router();
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Please try again later." } },
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must contain at least 2 characters").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255).transform((value) => value.toLowerCase()),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must contain at least 8 characters").max(128),
});

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  avatarUrl: user.avatar_url ?? null,
});

router.post(
  "/login",
  loginLimit,
  asyncHandler(async (req, res) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) throw unauthorized("Invalid credentials");

    const { email, password } = body.data;

    const user = await queryOne(
      `SELECT id, email, name, role, avatar_url, password_hash, is_active FROM admin_users WHERE email = $1`,
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
      user: publicUser(user),
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
      avatarUrl: req.user.avatarUrl ?? null,
    });
  })
);

router.patch(
  "/profile",
  requireAuth,
  uploadPhoto.single("avatar"),
  asyncHandler(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) await unlink(req.file.path).catch(() => {});
      throw validation(parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
    }
    if (req.file && !(await hasAllowedImageSignature(req.file.path, { allowGif: false, expectedMime: req.file.mimetype }))) {
      await unlink(req.file.path).catch(() => {});
      throw new AppError("VALIDATION_ERROR", "Uploaded file content is not a supported image", 422);
    }

    const avatarUrl = req.file ? `/uploads/photos/${req.file.filename}` : null;
    let user;
    try {
      [user] = await query(
        `UPDATE admin_users
         SET name = $1, email = $2, avatar_url = COALESCE($3, avatar_url), updated_at = NOW()
         WHERE id = $4
         RETURNING id, email, name, role, avatar_url`,
        [parsed.data.name, parsed.data.email, avatarUrl, req.user.id]
      );
    } catch (error) {
      if (req.file) await unlink(req.file.path).catch(() => {});
      if (error.code === "23505") throw conflict("That email address is already in use", "email");
      throw error;
    }
    if (!user) throw unauthorized();
    return success(res, publicUser(user));
  })
);

router.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw validation(parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
    }
    const user = await queryOne(`SELECT password_hash FROM admin_users WHERE id = $1`, [req.user.id]);
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.password_hash))) {
      throw new AppError("VALIDATION_ERROR", "Current password is incorrect", 422);
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await query(`UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [passwordHash, req.user.id]);
    return success(res, { message: "Password changed successfully" });
  })
);

export default router;
