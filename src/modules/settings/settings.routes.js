import { Router } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, notFound, success, validation } from "../../lib/errors.js";

const router = Router();
const settingValue = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
]);
const singleUpdateSchema = z.object({ value: settingValue });
const bulkUpdateSchema = z.record(settingValue).superRefine((updates, ctx) => {
  const keys = Object.keys(updates);
  if (!keys.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one setting is required" });
  if (keys.length > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At most 100 settings may be updated at once" });
  for (const key of keys) {
    if (!key.trim() || key.length > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "Setting key must be 1 to 100 characters" });
  }
});

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
  if (req.params.key.length > 100) throw validation([{ field: "key", message: "Setting key cannot exceed 100 characters" }]);
  const parsed = singleUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  const [row] = await query(
    `UPDATE website_settings SET value = $1, updated_at = NOW() WHERE setting_key = $2 RETURNING *`,
    [String(parsed.data.value), req.params.key]
  );
  if (!row) throw notFound("Setting");
  return success(res, row);
}));

router.post("/bulk", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = bulkUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const results = await transaction(async (tx) => {
    const rows = [];
    for (const [key, value] of Object.entries(parsed.data)) {
      const [row] = await tx.query(
        `UPDATE website_settings SET value = $1, updated_at = NOW() WHERE setting_key = $2 RETURNING *`,
        [String(value), key]
      );
      if (!row) throw notFound(`Setting ${key}`);
      rows.push(row);
    }
    return rows;
  });
  return success(res, results);
}));

export default router;
