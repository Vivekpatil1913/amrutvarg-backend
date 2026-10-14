import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { uploadPhoto } from "../../middleware/upload.js";
import {
  asyncHandler, notFound, success, paginated, validation, AppError,
} from "../../lib/errors.js";
import path from "path";
import { env } from "../../config/env.js";

const router = Router();

const FORM_TYPES = ["participant", "organizer", "leader"];
const STATUSES = ["new", "reviewed", "actioned", "archived"];

// ── Public submission endpoints ──────────────────────────────────────────────

router.post("/participants", asyncHandler(async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== "object") throw new AppError("VALIDATION_ERROR", "Invalid form data", 422);

  const [row] = await query(
    `INSERT INTO form_submissions (form_type, data) VALUES ('participant', $1) RETURNING id, submitted_at`,
    [JSON.stringify(data)]
  );
  return success(res, { id: row.id, submitted_at: row.submitted_at }, 201);
}));

router.post("/organizers", asyncHandler(async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== "object") throw new AppError("VALIDATION_ERROR", "Invalid form data", 422);

  const [row] = await query(
    `INSERT INTO form_submissions (form_type, data) VALUES ('organizer', $1) RETURNING id, submitted_at`,
    [JSON.stringify(data)]
  );
  return success(res, { id: row.id, submitted_at: row.submitted_at }, 201);
}));

router.post(
  "/leaders",
  uploadPhoto.single("photo"),
  asyncHandler(async (req, res) => {
    const data = { ...req.body };
    const files = [];

    if (req.file) {
      files.push({
        field: "photo",
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        url: `/uploads/photos/${req.file.filename}`,
      });
    }

    const [row] = await query(
      `INSERT INTO form_submissions (form_type, data, files) VALUES ('leader', $1, $2) RETURNING id, submitted_at`,
      [JSON.stringify(data), JSON.stringify(files)]
    );
    return success(res, { id: row.id, submitted_at: row.submitted_at }, 201);
  })
);

// ── Admin endpoints ──────────────────────────────────────────────────────────

router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit || "25")));
  const formType = req.query.form_type || "";
  const status = req.query.status || "";
  const search = (req.query.search || "").trim();
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const params = [];

  if (formType && FORM_TYPES.includes(formType)) {
    params.push(formType);
    conditions.push(`form_type = $${params.length}`);
  }
  if (status && STATUSES.includes(status)) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`data::text ILIKE $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [{ count }] = await query(`SELECT COUNT(*) AS count FROM form_submissions ${where}`, params);

  params.push(pageSize, offset);
  const rows = await query(
    `SELECT id, form_type, status, notes,
            data->>'name' AS submitter_name,
            submitted_at, updated_at
     FROM form_submissions ${where}
     ORDER BY submitted_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return paginated(res, rows, parseInt(count), page, pageSize);
}));

router.get("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT * FROM form_submissions WHERE id = $1`,
    [req.params.id]
  );
  if (!row) throw notFound("Submission");
  return success(res, row);
}));

router.put("/:id/status", requireAdmin, asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  if (!STATUSES.includes(status)) throw validation([{ field: "status", message: `Must be one of: ${STATUSES.join(", ")}` }]);

  const [row] = await query(
    `UPDATE form_submissions SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status, notes ?? null, req.params.id]
  );
  if (!row) throw notFound("Submission");
  return success(res, row);
}));

export default router;
