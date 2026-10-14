import { Router } from "express";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { uploadMedia } from "../../middleware/upload.js";
import { asyncHandler, notFound, success, paginated, AppError } from "../../lib/errors.js";
import path from "path";
import { unlink } from "fs/promises";
import { env } from "../../config/env.js";

const router = Router();

router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit || "25")));
  const search = (req.query.search || "").trim();
  const offset = (page - 1) * pageSize;

  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(original_name ILIKE $${params.length} OR alt_text ILIKE $${params.length})`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const [{ count }] = await query(`SELECT COUNT(*) AS count FROM media_assets ${where}`, params);

  params.push(pageSize, offset);
  const rows = await query(
    `SELECT * FROM media_assets ${where} ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return paginated(res, rows, parseInt(count), page, pageSize);
}));

router.post(
  "/upload",
  requireAdmin,
  uploadMedia.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError("VALIDATION_ERROR", "No file uploaded", 422);

    const url = `/uploads/media/${req.file.filename}`;
    const [row] = await query(
      `INSERT INTO media_assets (filename, original_name, mime_type, size_bytes, path, url, alt_text, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        req.file.filename, req.file.originalname, req.file.mimetype,
        req.file.size, req.file.path, url,
        req.body.alt_text || "", req.user.id,
      ]
    );
    return success(res, row, 201);
  })
);

router.put("/:id/alt", requireAdmin, asyncHandler(async (req, res) => {
  const { alt_text } = req.body;
  const [row] = await query(
    `UPDATE media_assets SET alt_text = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
    [alt_text || "", req.params.id]
  );
  if (!row) throw notFound("Media asset");
  return success(res, row);
}));

router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const asset = await queryOne(
    `SELECT * FROM media_assets WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]
  );
  if (!asset) throw notFound("Media asset");

  // Soft delete only — don't delete file in case it's still referenced
  await query(`UPDATE media_assets SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
  return success(res, { id: asset.id, deleted: true });
}));

export default router;
