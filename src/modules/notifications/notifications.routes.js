import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireStaff } from "../../middleware/auth.js";
import { asyncHandler, success, notFound, validation } from "../../lib/errors.js";

// The signed-in administrator's own notification bell. Every query is keyed to
// req.user.id, so one account can never read or clear another's alerts.

const router = Router();

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unread: z.enum(["true", "false"]).optional().default("false"),
});

router.get("/", requireStaff, asyncHandler(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const { limit, unread } = parsed.data;

  const [rows, [{ count }]] = await Promise.all([
    query(
      `SELECT id, title, body, link, category, priority, grievance_id, read_at, created_at
       FROM notifications
       WHERE user_id = $1 ${unread === "true" ? "AND read_at IS NULL" : ""}
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    ),
    query(`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [req.user.id]),
  ]);
  return success(res, { items: rows, unread: count });
}));

router.post("/read-all", requireStaff, asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`, [req.user.id]);
  return success(res, { unread: 0 });
}));

router.post("/:id/read", requireStaff, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  const [row] = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, req.user.id]
  );
  if (!row) throw notFound("Notification");
  return success(res, { id: row.id, read: true });
}));

export default router;
