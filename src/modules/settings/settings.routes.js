import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, notFound, success, validation } from "../../lib/errors.js";

const router = Router();

// ── Public ──────────────────────────────────────────────────────────────────
router.get("/public", asyncHandler(async (req, res) => {
  const rows = await query(`SELECT setting_key, value FROM website_settings ORDER BY group_name, id`);
  const map = {};
  for (const r of rows) map[r.setting_key] = r.value;
  return success(res, map);
}));

// ── Admin ────────────────────────────────────────────────────────────────────
router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  const rows = await query(`SELECT * FROM website_settings ORDER BY group_name, id`);
  return success(res, rows);
}));

router.put("/:key", requireAdmin, asyncHandler(async (req, res) => {
  const { value } = req.body;
  if (value === undefined) throw validation([{ field: "value", message: "Value is required" }]);

  const [row] = await query(
    `UPDATE website_settings SET value = $1, updated_at = NOW() WHERE setting_key = $2 RETURNING *`,
    [String(value), req.params.key]
  );
  if (!row) throw notFound("Setting");
  return success(res, row);
}));

router.post("/bulk", requireAdmin, asyncHandler(async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object") throw validation([{ field: "body", message: "Body must be key-value object" }]);

  const results = [];
  for (const [key, value] of Object.entries(updates)) {
    const [row] = await query(
      `UPDATE website_settings SET value = $1, updated_at = NOW() WHERE setting_key = $2 RETURNING *`,
      [String(value), key]
    );
    if (row) results.push(row);
  }
  return success(res, results);
}));

export default router;
